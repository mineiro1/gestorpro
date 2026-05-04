import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore';
import { Calendar, CheckCircle } from 'lucide-react';

export default function ClientPanel() {
  const { userProfile } = useAuth();
  const [clientData, setClientData] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userProfile) return;

    const fetchData = async () => {
      try {
        // userProfile for a client should contain clientId, or we find the client by phone
        // The user was created with role: 'client'. Wait, what is the connection?
        // Let's assume user.uid is NOT the client.id.
        // Usually we set user.phone. So we can query client by phone!
        if (userProfile.clientId) {
          const docRef = doc(db, 'clients', userProfile.clientId);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const found = { id: docSnap.id, ...docSnap.data() };
            setClientData(found);
            
            // Get visits history
            const vQ = query(
               collection(db, 'visits'),
               where('clientId', '==', found.id),
               where('adminId', '==', userProfile.adminId)
            );
            const vSnap = await getDocs(vQ);
            const visitsData = vSnap.docs.map(d => ({id: d.id, ...d.data()})) as any[];
            visitsData.sort((a, b) => (b.date?.toMillis() || 0) - (a.date?.toMillis() || 0));
            setVisits(visitsData);
          }
        }
      } catch(err) {
        handleFirestoreError(err, OperationType.GET, 'client_panel');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [userProfile]);

  if (loading) return <div className="p-8 text-center">Carregando painel...</div>;

  if (!clientData) return <div className="p-8 text-center text-red-500">Dados do cliente não encontrados.</div>;

  const dueDate = clientData.dueDate ? new Date(clientData.dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'Não definida';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gradient-to-r from-primary to-primary-light rounded-xl shadow-lg p-6 text-white flex justify-between items-center">
        <div>
           <h1 className="text-3xl font-bold mb-2">Olá, {clientData.name.split(' ')[0]}!</h1>
           <p className="text-secondary-light">Bem-vindo(a) ao seu painel.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-4">
              <Calendar size={24} />
            </div>
            <div>
               <p className="text-sm text-gray-500 font-medium">Vencimento da Mensalidade</p>
               <p className="text-2xl font-bold text-gray-800">{dueDate}</p>
            </div>
         </div>
         <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center">
            <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mr-4">
               <CheckCircle size={24} />
            </div>
            <div>
               <p className="text-sm text-gray-500 font-medium">Situação Atual</p>
               <p className="text-lg font-bold text-gray-800">No sistema</p>
            </div>
         </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50">
           <h2 className="text-xl font-bold text-gray-800">Histórico de Visitas</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {visits.map(v => (
             <div key={v.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                   <div className="flex items-center text-primary font-semibold">
                     <CheckCircle size={16} className="mr-2" />
                     {v.date ? new Date(v.date.toMillis()).toLocaleString('pt-BR') : 'Data Indisponível'}
                   </div>
                </div>
                {v.notes && <p className="text-sm text-gray-600 bg-gray-100 p-3 rounded-lg">{v.notes}</p>}
                {v.photoUrl && (
                  <div className="mt-3">
                    <img src={v.photoUrl} alt="Foto da visita" className="w-32 h-32 object-cover rounded-lg shadow-sm border border-gray-200" />
                  </div>
                )}
             </div>
          ))}
          {visits.length === 0 && (
             <p className="p-8 text-center text-gray-500">Nenhuma visita registrada ainda.</p>
          )}
        </div>
      </div>
    </div>
  );
}
