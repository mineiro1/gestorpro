import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Calendar, CheckCircle, X, Download } from 'lucide-react';

export default function ClientPanel() {
  const { userProfile } = useAuth();
  const [clientData, setClientData] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [employeesMap, setEmployeesMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  useEffect(() => {
    if (!userProfile) return;

    const fetchData = async () => {
      try {
        if (userProfile.clientId || userProfile.role === 'client') {
          // If the profile doesn't have clientId explicitly mapped but is a client we can search by email
          let clientDataResult = null;
          if (userProfile.clientId) {
            const { data: clientRes, error: clientErr } = await supabase.from('clients').select('*').eq('id', userProfile.clientId).single();
            clientDataResult = clientRes;
          } else {
            const cleanedProfilePhone = (userProfile.phone || '').replace(/\D/g, '');
            const { data: clientsData } = await supabase.from('clients').select('*');
            if (clientsData) {
               clientDataResult = clientsData.find(c => {
                 const cleanedClientPhone = (c.phone || '').replace(/\D/g, '');
                 const cleanedClientCpf = (c.cpf_cnpj || '').replace(/\D/g, '');
                 return cleanedClientPhone === cleanedProfilePhone || cleanedClientCpf === cleanedProfilePhone;
               });
            }
          }
          
          if (clientDataResult) {
            const found = { ...clientDataResult, id: clientDataResult.id, dueDate: clientDataResult.due_date, name: clientDataResult.name };
            setClientData(found);
            
            // Get visits history
            const { data: vSnap, error: vErr } = await supabase
               .from('visits')
               .select('*')
               .eq('client_id', found.id)
               .eq('admin_id', found.admin_id || userProfile.adminId)
               .order('date', { ascending: false });
            
            if (vSnap) {
              setVisits(vSnap.map(d => ({...d, date: new Date(d.date), employeeId: d.employee_id})));
            }

            // Get payment history
            const { data: pSnap } = await supabase
               .from('payments')
               .select('*')
               .eq('client_id', found.id)
               .eq('admin_id', found.admin_id || userProfile.adminId)
               .order('created_at', { ascending: false });
               
            if (pSnap) {
              setPayments(pSnap.map(d => ({...d, date: d.paid_date || d.created_at})));
            }

            // Get employees mapping
            const { data: eSnap } = await supabase
              .from('users')
              .select('id, name')
              .eq('admin_id', found.admin_id || userProfile.adminId);
              
            const eMap: Record<string, string> = {};
            if (eSnap) {
              eSnap.forEach(data => {
                eMap[data.id] = data.name || 'Desconhecido';
              });
            }
            setEmployeesMap(eMap);
          }
        }
      } catch(err) {
        console.error(err);
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
                     {v.date ? new Date(v.date).toLocaleString('pt-BR') : 'Data Indisponível'}
                   </div>
                   {v.employeeId && (
                     <div className="text-sm font-medium text-gray-500">
                       Colaborador: {employeesMap[v.employeeId] || 'Desconhecido'}
                     </div>
                   )}
                </div>
                {v.notes && <p className="text-sm text-gray-600 bg-gray-100 p-3 rounded-lg">{v.notes}</p>}
                
                {/* Legacy single photo support */}
                {v.photo_url && (!v.photo_urls || v.photo_urls.length === 0) && (
                  <div className="mt-3">
                    <img 
                      src={v.photo_url} 
                      alt="Foto da visita" 
                      onClick={() => setFullscreenImage(v.photo_url)}
                      className="w-32 h-32 object-cover rounded-lg shadow-sm border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity" 
                    />
                  </div>
                )}
                
                {/* Modern multiple photos support */}
                {v.photo_urls && v.photo_urls.length > 0 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                    {v.photo_urls.map((photo: string, index: number) => (
                       <img 
                         key={index}
                         src={photo} 
                         alt={`Foto da visita ${index}`} 
                         onClick={() => setFullscreenImage(photo)}
                         className="w-32 h-32 object-cover rounded-lg shadow-sm border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity shrink-0" 
                       />
                    ))}
                  </div>
                )}
             </div>
          ))}
          {visits.length === 0 && (
             <p className="p-8 text-center text-gray-500">Nenhuma visita registrada ainda.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50">
           <h2 className="text-xl font-bold text-gray-800">Histórico de Pagamentos</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {payments.map(p => {
             const paymentDateStr = p.date;
             let paymentDate = null;
             if (paymentDateStr) {
               const isJustDate = typeof paymentDateStr === 'string' && paymentDateStr.length === 10;
               paymentDate = isJustDate ? new Date(`${paymentDateStr}T12:00:00`) : new Date(paymentDateStr);
             }
             return (
             <div key={p.id} className="p-4 hover:bg-gray-50 transition-colors flex justify-between items-center">
                 <div>
                    <div className="font-semibold text-gray-800">
                       Mês de Referência: {String(p.ref_month || p.month || (paymentDate ? paymentDate.getMonth() + 1 : '')).padStart(2, '0')}/{p.ref_year || p.year || (paymentDate ? paymentDate.getFullYear() : '')}
                    </div>
                    <div className="text-sm text-gray-500 flex items-center mt-1">
                      <Calendar size={14} className="mr-1" />
                      Pago em: {paymentDate ? paymentDate.toLocaleDateString('pt-BR') : 'Data Indisponível'}
                    </div>
                 </div>
                 <div className="text-right">
                    <div className="text-lg font-bold text-green-600">
                      R$ {Number(p.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                 </div>
             </div>
             )
          })}
          {payments.length === 0 && (
             <p className="p-8 text-center text-gray-500">Nenhum pagamento registrado ainda.</p>
          )}
        </div>
      </div>

      {/* Fullscreen Image Modal */}
      {fullscreenImage && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4">
          <button 
            onClick={() => setFullscreenImage(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 p-2"
          >
            <X size={32} />
          </button>
          <img 
            src={fullscreenImage} 
            alt="Foto em tela cheia" 
            className="max-w-full max-h-[85vh] object-contain"
          />
          <a 
            href={fullscreenImage} 
            download={`visita_${new Date().getTime()}.jpg`}
            className="absolute bottom-8 bg-primary text-white px-6 py-3 rounded-full font-semibold hover:bg-primary-light transition-colors flex items-center"
          >
            <Download size={20} className="mr-2" />
            Baixar Foto
          </a>
        </div>
      )}
    </div>
  );
}
