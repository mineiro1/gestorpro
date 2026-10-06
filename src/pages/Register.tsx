import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { RS_LOGO_BASE64 } from '../assets/logoBase64';

export default function Register() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let email = phone.trim();
      let cleanPhone = phone.replace(/\D/g, '');
      
      if (!email.includes('@')) {
        if (cleanPhone.length < 10) {
          throw new Error('Telefone inválido.');
        }
        email = `${cleanPhone}@gestaopro.com`;
      } else {
        // Since it's an email, we don't have a phone number, just keep it empty or same as email.
        cleanPhone = '';
      }
      
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            full_name: name,
            role: 'admin',
          }
        }
      });

      if (signUpError) {
        throw signUpError;
      }

      const user = data.user;

      if (!user) {
        throw new Error('Erro ao criar usuário.');
      }

      // Check if user was already created through handle_new_user trigger in Supabase (from schema)
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
        
      const trialExpiry = new Date();
      trialExpiry.setDate(trialExpiry.getDate() + 7); // 7 days trial

      if (existingUser) {
        // Just update missing properties
        await supabase.from('users').update({
          phone: cleanPhone,
          admin_id: user.id,
          subscription_status: 'trial',
          subscription_expires_at: trialExpiry.toISOString(),
          password: password,
        }).eq('id', user.id);
      } else {
        await supabase.from('users').insert({
          id: user.id,
          role: 'admin',
          name,
          phone: cleanPhone,
          email: email,
          admin_id: user.id,
          subscription_status: 'trial',
          subscription_expires_at: trialExpiry.toISOString(),
          password: password,
        });
      }

      navigate('/dashboard');
    } catch (err: any) {
      if (err.message === 'Telefone inválido.') {
        setError(err.message);
      } else if (err.message?.includes('User already registered') || err.message?.includes('unique constraint')) {
        setError('Este telefone ou e-mail já está em uso. Redirecionando para o login...');
        setTimeout(() => {
          navigate('/login', { state: { phone: phone }});
        }, 2000);
      } else if (err.message?.includes('Email not confirmed')) {
        setError('Por favor, desative a confirmação de e-mail no painel do Supabase: Authentication -> Providers -> Email -> Desmarque "Confirm email".');
      } else if (err.message?.includes('Email logins are disabled')) {
        setError('Por favor, ative o provedor de E-mail no painel do Supabase: Authentication -> Providers -> Email -> Enable Email provider.');
      } else if (err.message?.includes('FetchError') || err.message?.includes('Network request failed')) {
        setError('Erro de conexão. Verifique sua internet, desative bloqueadores de anúncios (AdBlock) ou tente em uma aba anônima.');
      } else {
        console.error(err);
        setError(`Erro ao criar conta: Tente novamente. Se o problema persistir, contate o suporte.`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full bg-slate-900/90 backdrop-blur-md rounded-3xl shadow-2xl p-8 sm:p-10 border border-slate-800 relative z-10">
        <div className="text-center mb-8 flex flex-col items-center">
          <Link to="/" className="inline-block transition-transform hover:scale-105">
            <img 
              src={RS_LOGO_BASE64} 
              alt="RS Piscinas Logo" 
              className="w-24 h-24 mb-2 object-contain drop-shadow-lg" 
            />
          </Link>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Criar <span className="text-sky-400">Conta</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">Cadastro de Administrador / Empresa</p>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-900/50 text-red-300 p-3.5 rounded-xl mb-6 text-xs sm:text-sm font-medium flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4 sm:space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Nome Completo
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 outline-none transition-all text-white placeholder-slate-500 bg-slate-950/80 focus:bg-slate-950 text-sm"
              placeholder="Seu nome"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Número de Telefone (WhatsApp)
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 border border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 outline-none transition-all text-white placeholder-slate-500 bg-slate-950/80 focus:bg-slate-950 text-sm"
              placeholder="(67) 99249-9469"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Senha
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 outline-none transition-all text-white placeholder-slate-500 bg-slate-950/80 focus:bg-slate-950 text-sm"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 px-4 rounded-xl font-extrabold transition-all duration-200 shadow-lg shadow-emerald-600/25 hover:shadow-emerald-500/35 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base cursor-pointer mt-2"
          >
            {loading ? 'Criando...' : 'Criar Conta'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <p className="text-xs sm:text-sm text-slate-400">
            Já tem uma conta?{' '}
            <Link to="/login" className="text-sky-400 font-bold hover:underline">
              Fazer Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
