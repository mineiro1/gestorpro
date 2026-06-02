import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const location = useLocation();
  const [phone, setPhone] = useState(location.state?.phone || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let emailGestao = phone.trim();
      let emailServi = phone.trim();
      let cleanPhone = phone.replace(/\D/g, '');
      
      if (!emailGestao.includes('@')) {
        emailGestao = `${cleanPhone}@gestaopro.com`;
        emailServi = `${cleanPhone}@serviplay.com`;
      } else {
        cleanPhone = '';
      }
      
      let { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: emailGestao,
        password: password.trim(),
      });

      if (signInError && signInError.message.includes('Invalid login credentials') && !phone.includes('@')) {
        // Fallback for users created before app name change
        let fetchFallback = await supabase.auth.signInWithPassword({
          email: emailServi,
          password: password.trim(),
        });
        
        if (fetchFallback.error) {
           // Fallback without trimming the password (if trailing spaces were saved)
           const untrimmedFallbackGestao = await supabase.auth.signInWithPassword({
             email: emailGestao,
             password: password,
           });
           
           if (untrimmedFallbackGestao.error) {
              const untrimmedFallbackServi = await supabase.auth.signInWithPassword({
                email: emailServi,
                password: password,
              });
              
              if (untrimmedFallbackServi.error) {
                 // Third fallback: maybe it's a client using phone with mask as password
                 const cleanedPassword = password.replace(/\D/g, '');
                 if (cleanedPassword.length >= 6) {
                   const clientFallbackGestao = await supabase.auth.signInWithPassword({
                     email: emailGestao,
                     password: cleanedPassword,
                   });
                   
                   if (clientFallbackGestao.error) {
                      const clientFallbackServi = await supabase.auth.signInWithPassword({
                        email: emailServi,
                        password: cleanedPassword,
                      });
                      if (clientFallbackServi.error) {
                        throw fetchFallback.error; // throw original
                      }
                      data = clientFallbackServi.data;
                   } else {
                     data = clientFallbackGestao.data;
                   }
                 } else {
                   throw fetchFallback.error;
                 }
              } else {
                 data = untrimmedFallbackServi.data;
              }
           } else {
             data = untrimmedFallbackGestao.data;
           }
        } else {
           data = fetchFallback.data;
        }
      } else if (signInError) {
        throw signInError;
      }
      
      if (data.user) {
        const { data: userDoc } = await supabase
          .from('users')
          .select('id, active, client_id')
          .eq('id', data.user.id)
          .single();
          
        if (userDoc && userDoc.active === false) {
          await supabase.auth.signOut();
          throw new Error("Esta conta de colaborador/gestor está desativada.");
        }
        
        // Also check if they are a client and client is inactive
        if (userDoc && userDoc.client_id) {
            const { data: clientDoc } = await supabase.from('clients').select('active').eq('id', userDoc.client_id).single();
            if (clientDoc && clientDoc.active === false) {
               await supabase.auth.signOut();
               throw new Error("Sua conta de cliente está inativa. Entre em contato com a empresa.");
            }
        }
          
        const isSuperAdmin = data.user.email === 'servincg@gmail.com';
        
        if (!userDoc) {
          console.warn('User document missing. Recreating for:', data.user.email);
          const trialExpiry = new Date();
          trialExpiry.setDate(trialExpiry.getDate() + 7);
          
          await supabase.from('users').insert({
            id: data.user.id,
            role: 'admin',
            name: isSuperAdmin ? 'Renivaldo Servin dos Santos' : 'Usuário Recuperado',
            phone: cleanPhone,
            email: data.user.email || emailGestao,
            admin_id: data.user.id,
            subscription_status: isSuperAdmin ? 'active' : 'trial',
            subscription_expires_at: isSuperAdmin ? new Date('2099-12-31').toISOString() : trialExpiry.toISOString(),
          });
        }
      }
      
      navigate('/');
    } catch (err: any) {
      if (err.message?.includes('Invalid login credentials')) {
        setError('Telefone ou senha incorretos.');
      } else if (err.message?.includes('Email not confirmed')) {
        setError('Por favor, desative a confirmação de e-mail no painel do Supabase: Authentication -> Providers -> Email -> Desmarque "Confirm email".');
      } else if (err.message?.includes('Email logins are disabled')) {
        setError('Por favor, ative o provedor de E-mail no painel do Supabase: Authentication -> Providers -> Email -> Enable Email provider.');
      } else if (err.message?.includes('FetchError') || err.message?.includes('Network request failed')) {
        setError('Erro de conexão. Verifique sua internet, desative bloqueadores de anúncios (AdBlock) ou tente em uma aba anônima.');
      } else {
        console.error(err);
        setError('Erro ao fazer login. Verifique seus dados.');
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
          <h1 className="text-3xl font-bold text-primary mb-2">GestãoPro</h1>
          <p className="text-gray-500">Faça login para acessar sua conta</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-500 p-3 rounded-md mb-6 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-light transition-colors disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            É um novo Admin?{' '}
            <Link to="/register" className="text-secondary-dark font-semibold hover:underline">
              Criar Conta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
