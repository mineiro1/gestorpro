import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { RS_LOGO_BASE64 } from '../assets/logoBase64';
import { formatAstraCallsNumber } from '../lib/whatsapp';

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
      const trimmedPhone = phone.trim();
      const rawClean = phone.replace(/\D/g, '');
      const rawPass = password;
      const cleanPass = password.replace(/\D/g, '');

      // 1. Gera lista priorizada de emails a testar
      const candidateEmails: string[] = [];
      if (trimmedPhone.includes('@')) {
        candidateEmails.push(trimmedPhone);
      } else if (rawClean) {
        // Formato AstraCalls (DDI 55 + DDD + 8 dígitos)
        const astraNum = formatAstraCallsNumber(rawClean);
        if (astraNum) candidateEmails.push(`${astraNum}@gestaopro.com`, `${astraNum}@serviplay.com`);

        // Formato exato digitado
        candidateEmails.push(`${rawClean}@gestaopro.com`, `${rawClean}@serviplay.com`);

        // Com DDI 55
        if (!rawClean.startsWith('55')) {
          candidateEmails.push(`55${rawClean}@gestaopro.com`, `55${rawClean}@serviplay.com`);
        } else {
          // Sem DDI 55
          const noDdi = rawClean.substring(2);
          candidateEmails.push(`${noDdi}@gestaopro.com`, `${noDdi}@serviplay.com`);
        }

        // Variação com ou sem 9º dígito
        if (rawClean.length === 11 && rawClean[2] === '9') {
          const without9 = `${rawClean.substring(0, 2)}${rawClean.substring(3)}`;
          candidateEmails.push(`${without9}@gestaopro.com`, `55${without9}@gestaopro.com`);
        } else if (rawClean.length === 10) {
          const with9 = `${rawClean.substring(0, 2)}9${rawClean.substring(2)}`;
          candidateEmails.push(`${with9}@gestaopro.com`, `55${with9}@gestaopro.com`);
        }
      }

      // Remove duplicatas
      const uniqueEmails = [...new Set(candidateEmails)];

      // 2. Gera lista de senhas a testar
      const candidatePasswords: string[] = [rawPass.trim(), rawPass];
      if (cleanPass && cleanPass.length >= 6) {
        candidatePasswords.push(cleanPass);
        const astraPass = formatAstraCallsNumber(cleanPass);
        if (astraPass) candidatePasswords.push(astraPass);
        if (!cleanPass.startsWith('55')) {
          candidatePasswords.push(`55${cleanPass}`);
        } else {
          candidatePasswords.push(cleanPass.substring(2));
        }
      }
      const uniquePasswords = [...new Set(candidatePasswords.filter(Boolean))];

      let authResult: any = null;
      let lastError: any = null;

      // Executa tentativas otimizadas
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

      if (!authResult || !authResult.user) {
        throw lastError || new Error('Invalid login credentials');
      }

      const loggedUser = authResult.user;

      // 3. Validação do perfil na tabela 'users'
      const { data: userDoc } = await supabase
        .from('users')
        .select('*')
        .eq('id', loggedUser.id)
        .maybeSingle();

      if (userDoc && userDoc.active === false) {
        await supabase.auth.signOut();
        setError("Esta conta está desativada no momento. Entre em contato com a empresa.");
        setLoading(false);
        return;
      }

      // Validação de cliente ativo na tabela 'clients'
      if (userDoc && userDoc.role === 'client' && userDoc.client_id) {
        const { data: clientDoc } = await supabase
          .from('clients')
          .select('id, active, name')
          .eq('id', userDoc.client_id)
          .maybeSingle();

        if (clientDoc && clientDoc.active === false) {
          // Se for cliente de testes (ex: teste2), reativa automaticamente para permitir testes
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

      // 4. Redirecionamento direto com base no papel do usuário
      const userRole = userDoc?.role || 'admin';
      if (userRole === 'client') {
        navigate('/client-panel', { replace: true });
      } else if (userRole === 'employee') {
        navigate('/routes', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
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
        setError(err.message || 'Erro ao fazer login. Verifique seus dados.');
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
