import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CreditCard, AlertTriangle, LogOut } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function SubscriptionWall() {
  const { userProfile } = useAuth();

  const handleLogout = () => {
    signOut(auth);
  };

  const handlePay = async () => {
    try {
      let price = 99.90;
      try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'platform'));
        if (settingsSnap.exists() && settingsSnap.data().monthlyPrice) {
          price = settingsSnap.data().monthlyPrice;
        }
      } catch (e) {
        console.error('Failed to get price', e);
      }

      const response = await fetch('/api/create-preference', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'Assinatura Mensal - GestãoPro',
          price: price,
          quantity: 1,
          adminId: userProfile?.adminId,
          email: userProfile?.email || 'admin@gestaopro.com'
        })
      });

      if (!response.ok) {
        throw new Error('Falha ao gerar link de pagamento');
      }

      const data = await response.json();
      if (data.init_point) {
        window.location.href = data.init_point;
      }
    } catch (err) {
      console.error(err);
      alert('Aviso: O pagamento no Mercado Pago ainda não está configurado. Como SuperAdmin não inseriu a chave, você precisa atualizar a assinatura manualmente pelo painel do desenvolvedor.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="text-red-500" size={32} />
        </div>
        
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Assinatura Expirada</h1>
        <p className="text-gray-600 mb-6">
          {userProfile?.role === 'admin' 
            ? 'O seu período de utilização (teste grátis ou assinatura) terminou. Renove agora para continuar utilizando o sistema.'
            : 'A assinatura da sua empresa encontra-se inativa. Por favor, contate o seu administrador.'}
        </p>

        {userProfile?.role === 'admin' && (
          <button
            onClick={handlePay}
            className="w-full flex justify-center items-center bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors mb-4"
          >
            <CreditCard className="mr-2" size={20} />
            Renovar Assinatura
          </button>
        )}

        <button
          onClick={handleLogout}
          className="w-full flex justify-center items-center bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
        >
          <LogOut className="mr-2" size={20} />
          Sair
        </button>
      </div>
    </div>
  );
}
