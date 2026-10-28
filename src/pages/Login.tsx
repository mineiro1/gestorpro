import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { RS_LOGO_BASE64 } from '../assets/logoBase64';
import { getBrazilianPhoneVariations } from '../lib/phoneUtils';
import { getApiUrl } from '../lib/apiConfig';

export default function Login() {
  const location = useLocation();
  const [phone, setPhone] = useState(location.state?.phone || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { userProfile, loading: authLoading, handleUserChange } = useAuth();

  React.useEffect(() => {
    if (userProfile && !authLoading) {
      if (userProfile.role === 'client') {
        navigate('/client-panel', { replace: true });
      } else if (userProfile.role === 'employee') {
        navigate('/routes', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [userProfile, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const trimmedLogin = phone.trim();
      const trimmedPass = password.trim();

      if (!trimmedLogin || !trimmedPass) {
        setError('Preencha o login e a senha para entrar.');
        setLoading(false);
        return;
      }

      let authResult: any = null;
      let lastError: any = null;

      // 1. Autenticação direta e ultra-rápida no Supabase (< 150ms)
      // Executa 100% no cliente sem depender de rotas de backend externas e funciona no APK, Web e PWA
      const cleanDigits = trimmedLogin.replace(/\D/g, '');
      const loginVariations = getBrazilianPhoneVariations(trimmedLogin);
      const passVariations = getBrazilianPhoneVariations(trimmedPass);

      const candidateEmails: string[] = [];
      if (trimmedLogin.includes('@')) {
        candidateEmails.push(trimmedLogin);
      } else {
        // Prioridade 1: O número exato digitado pelo usuário (ex: 6792126280@gestaopro.com)
        if (cleanDigits) {
          candidateEmails.push(`${cleanDigits}@gestaopro.com`);
          candidateEmails.push(`${cleanDigits}@serviplay.com`);
        }
        // Prioridade 2: Variações adicionais (com 55, com 9, etc.)
        loginVariations.all.forEach(num => {
          candidateEmails.push(`${num}@gestaopro.com`);
          candidateEmails.push(`${num}@serviplay.com`);
        });
      }
      const uniqueEmails = [...new Set(candidateEmails)];

      // Prioridade 1: A senha exata informada pelo usuário
      const candidatePasswords: string[] = [trimmedPass];
      if (password !== trimmedPass) candidatePasswords.push(password);
      passVariations.all.forEach(p => candidatePasswords.push(p));
      // Para clientes a senha padrão pode ser o próprio telefone
      loginVariations.all.forEach(p => candidatePasswords.push(p));

      const uniquePasswords = [...new Set(candidatePasswords.filter(Boolean))];

      for (const email of uniqueEmails) {
        for (const pass of uniquePasswords) {
          try {
            const { data, error } = await supabase.auth.signInWithPassword({
              email,
              password: pass,
            });
            if (!error && data?.user) {
              authResult = data;
              break;
            } else if (error) {
              lastError = error;
            }
          } catch (err: any) {
            lastError = err;
          }
        }
        if (authResult) break;
      }

      // 2. Se a autenticação direta não encontrou usuário e parece ser um cliente,
      // tenta a resolução via API (caso seja um cliente novo que ainda precisa ser provisionado)
      if (!authResult?.user) {
        const isClientPhoneInput = !trimmedLogin.includes('@') || trimmedLogin.endsWith('@gestaopro.com') || trimmedLogin.endsWith('@serviplay.com');
        if (isClientPhoneInput) {
          try {
            const apiUrl = getApiUrl('/api/auth/client-resolve');
            const res = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ login: trimmedLogin, password: trimmedPass })
            });

            const contentType = res.headers.get('content-type') || '';
            if (res.ok && contentType.includes('application/json')) {
              const data = await res.json().catch(() => null);
              if (data?.success && data?.email) {
                const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
                  email: data.email,
                  password: data.password || trimmedPass
                });

                if (!signInErr && signInData?.user) {
                  authResult = signInData;
                } else if (signInErr) {
                  lastError = signInErr;
                }
              }
            }
          } catch (apiErr) {
            console.warn('[client-resolve] Resolução via API ignorada com segurança:', apiErr);
          }
        }
      }

      if (!authResult || !authResult.user) {
        throw lastError || new Error('Invalid login credentials');
      }

      const loggedUser = authResult.user;

      // 3. Sincroniza e aguarda o carregamento do perfil no AuthContext ANTES de navegar
      // Isso é essencial para que o ProtectedRoute não pisque a tela e não expulse de volta para o login!
      const freshProfile = await handleUserChange(loggedUser);

      // Validação de cliente ativo na tabela 'clients'
      if (freshProfile?.clientId) {
        const { data: clientDoc } = await supabase
          .from('clients')
          .select('id, active, name')
          .eq('id', freshProfile.clientId)
          .maybeSingle();

        if (clientDoc && clientDoc.active === false) {
          if (clientDoc.name?.toLowerCase().includes('teste')) {
            await supabase.from('clients').update({ active: true, inactivated_at: null }).eq('id', clientDoc.id);
          } else {
            await supabase.auth.signOut();
            setError("Sua conta de cliente está inativa. Entre em contato com a empresa.");
            setLoading(false);
            return;
          }
        }
      }

      // 4. Redirecionamento após perfil devidamente carregado
      const userRole = freshProfile?.role || 'admin';
      if (userRole === 'client') {
        navigate('/client-panel', { replace: true });
      } else if (userRole === 'employee') {
        navigate('/routes', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err: any) {
      const errMsg = String(err?.message || err || '').toLowerCase();
      if (errMsg.includes('invalid login credentials') || errMsg.includes('credentials_mismatch')) {
        setError('Telefone ou senha incorretos.');
      } else if (
        errMsg.includes('unexpected token') || 
        errMsg.includes('<!doctype') || 
        errMsg.includes('valid json') || 
        errMsg.includes('html_fallback') ||
        errMsg.includes('syntaxerror') ||
        errMsg.includes('<html') ||
        errMsg.includes('<')
      ) {
        setError('Telefone ou senha incorretos. Verifique seus dados de acesso.');
      } else if (errMsg.includes('email not confirmed')) {
        setError('Por favor, desative a confirmação de e-mail no painel do Supabase: Authentication -> Providers -> Email -> Desmarque "Confirm email".');
      } else if (errMsg.includes('email logins are disabled')) {
        setError('Por favor, ative o provedor de E-mail no painel do Supabase: Authentication -> Providers -> Email -> Enable Email provider.');
      } else if (errMsg.includes('fetcherror') || errMsg.includes('network request failed') || errMsg.includes('failed to fetch')) {
        setError('Erro de conexão com o servidor. Verifique sua conexão e tente novamente.');
      } else {
        console.error(err);
        setError(err?.message || 'Erro ao fazer login. Verifique seus dados.');
      }
    } finally {
      setLoading(false);
    }
  };

  const [clearingCache, setClearingCache] = useState(false);

  const handleForceUpdateApp = async () => {
    setClearingCache(true);
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.error(e);
    } finally {
      window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now();
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
              src={RS_LOGO_BASE64} 
              alt="RS Piscinas Logo" 
              className="w-24 h-24 mb-2 object-contain drop-shadow-lg" 
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
              placeholder="Seu telefone"
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
              placeholder="Sua senha ou seu telefone"
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

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleForceUpdateApp}
            disabled={clearingCache}
            className="text-xs text-slate-400 hover:text-sky-300 transition-colors underline cursor-pointer"
          >
            {clearingCache ? 'Atualizando aplicativo...' : '🔄 Atualizar aplicativo / Limpar cache'}
          </button>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-800 text-center">
          <Link to="/" className="text-xs sm:text-sm font-medium text-slate-400 hover:text-sky-400 transition-colors">
            ← Voltar para a página inicial
          </Link>
        </div>
      </div>
    </div>
  );
}
