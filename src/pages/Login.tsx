import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

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
      
      try {
        await signInWithEmailAndPassword(auth, emailGestao, password);
      } catch (err: any) {
        if ((err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials' || err.message?.includes('invalid-credential')) && !phone.includes('@')) {
          // Fallback para usuários criados antes da mudança de nome do app
          await signInWithEmailAndPassword(auth, emailServi, password);
        } else {
          throw err;
        }
      }
      
      if (auth.currentUser) {
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        const isSuperAdmin = auth.currentUser.email === 'servincg@gmail.com';
        
        if (!userDoc.exists()) {
          console.warn('User document missing. Recreating for:', auth.currentUser.email);
          const trialExpiry = new Date();
          trialExpiry.setDate(trialExpiry.getDate() + 7);
          
          try {
            await setDoc(userDocRef, {
              uid: auth.currentUser.uid,
              role: 'admin',
              name: isSuperAdmin ? 'Renivaldo Servin dos Santos' : 'Usuário Recuperado',
              phone: cleanPhone,
              email: auth.currentUser.email || emailGestao,
              adminId: auth.currentUser.uid,
              createdAt: serverTimestamp(),
              subscriptionStatus: isSuperAdmin ? 'active' : 'trial',
              subscriptionExpiresAt: isSuperAdmin ? Timestamp.fromDate(new Date('2099-12-31')) : Timestamp.fromDate(trialExpiry),
            });
          } catch (firestoreError) {
            handleFirestoreError(firestoreError, OperationType.CREATE, `users/${auth.currentUser.uid}`);
          }
        } else if (isSuperAdmin) {
           // Ensure super admin retains correct info
           try {
             await setDoc(userDocRef, {
               ...userDoc.data(),
               name: 'Renivaldo Servin dos Santos',
               subscriptionStatus: 'active',
               subscriptionExpiresAt: Timestamp.fromDate(new Date('2099-12-31')),
             });
           } catch (e) {
             console.error('Error updating super admin info', e);
           }
        }
      }
      
      navigate('/');
    } catch (err: any) {
      if (err.code !== 'auth/invalid-credential' && err.code !== 'auth/invalid-login-credentials' && !err.message?.includes('invalid-credential')) {
        console.error(err);
      }
      if (err.code === 'auth/operation-not-allowed') {
        setError('Autenticação por E-mail/Senha não está ativada no Firebase.');
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials' || err.message?.includes('invalid-credential') || err.message?.includes('wrong-password') || err.message?.includes('user-not-found')) {
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
