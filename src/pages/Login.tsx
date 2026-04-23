import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Format phone to a pseudo-email for Firebase Auth
      const cleanPhone = phone.replace(/\D/g, '');
      const emailGestao = `${cleanPhone}@gestaopro.com`;
      
      try {
        await signInWithEmailAndPassword(auth, emailGestao, password);
      } catch (err: any) {
        if (err.code === 'auth/invalid-credential') {
          // Fallback para usuários criados antes da mudança de nome do app
          const emailServi = `${cleanPhone}@serviplay.com`;
          await signInWithEmailAndPassword(auth, emailServi, password);
        } else {
          throw err;
        }
      }
      
      navigate('/');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('Autenticação por E-mail/Senha não está ativada no Firebase.');
      } else if (err.code === 'auth/invalid-credential') {
        setError('Telefone ou senha incorretos.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Erro de conexão. Verifique sua internet, desative bloqueadores de anúncios (AdBlock) ou tente em uma aba anônima.');
      } else {
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
              Número de Telefone
            </label>
            <input
              type="tel"
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
