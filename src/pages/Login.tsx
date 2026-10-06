import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const location = useLocation();
  const [phone, setPhone] = useState(location.state?.phone || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { userProfile, loading: authLoading } = useAuth();

  React.useEffect(() => {
    if (userProfile && !authLoading) {
      navigate('/dashboard');
    }
  }, [userProfile, authLoading, navigate]);

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
      
      navigate('/dashboard');
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
    <div className="min-h-screen bg-slate-950 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full bg-slate-900/90 backdrop-blur-md rounded-3xl shadow-2xl p-8 sm:p-10 border border-slate-800 relative z-10">
        <div className="text-center mb-8 flex flex-col items-center">
          <Link to="/" className="inline-block transition-transform hover:scale-105">
            <img 
              src="https://iili.io/CpIeN6P.png" 
              alt="RS Piscinas Logo" 
              className="w-24 h-24 mb-2 object-contain drop-shadow-lg" 
              onError={(e) => { 
                const target = e.currentTarget;
                if (!target.dataset.fallbackTried) {
                  target.dataset.fallbackTried = 'true';
                  target.src = '/logo.png';
                } else if (target.dataset.fallbackTried === 'true') {
                  target.dataset.fallbackTried = 'done';
                  target.src = '/rs-piscinas-logo.png';
                } else {
                  target.onerror = null;
                  target.style.display = 'none';
                }
              }} 
            />
          </Link>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            RS <span className="text-sky-400">Piscinas</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">Portal do Cliente & Equipe Técnica</p>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-900/50 text-red-300 p-3.5 rounded-xl mb-6 text-xs sm:text-sm font-medium flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Telefone / WhatsApp ou E-mail
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
              Senha de Acesso
            </label>
            <input
              type="password"
              required
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
            {loading ? 'Entrando...' : 'Entrar no Sistema'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <Link to="/" className="text-xs sm:text-sm font-medium text-slate-400 hover:text-sky-400 transition-colors">
            ← Voltar para a página inicial
          </Link>
        </div>
      </div>
    </div>
  );
}
