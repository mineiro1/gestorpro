import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

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

      navigate('/');
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
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8 flex flex-col items-center">
          <img src="/logo.png" alt="GestãoPro Logo" className="w-16 h-16 mb-4 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <h1 className="text-3xl font-bold text-primary mb-2">Criar Conta</h1>
          <p className="text-gray-500">Cadastre-se como Administrador</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-500 p-3 rounded-md mb-6 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome Completo
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
              placeholder="Seu nome"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Número de Telefone (WhatsApp)
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
              placeholder="(11) 99999-9999"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Senha
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-secondary-dark text-white py-3 rounded-lg font-semibold hover:bg-secondary transition-colors disabled:opacity-50 mt-2"
          >
            {loading ? 'Criando...' : 'Criar Conta'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Já tem uma conta?{' '}
            <Link to="/login" className="text-primary font-semibold hover:underline">
              Fazer Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
