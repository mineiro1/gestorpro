import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Calendar, CheckCircle, X, Download } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

export default function ClientPanel() {
  const { userProfile } = useAuth();
  
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  useAutoRefresh(() => setRefreshTrigger(t => t + 1), 30000);

  const { availableClients, selectedClientId } = useOutletContext<{ availableClients: any[], selectedClientId: string | null }>();
  
  const [clientData, setClientData] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [employeesMap, setEmployeesMap] = useState<Record<string, string>>({});
  
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  useEffect(() => {
    const loadClientDetails = async () => {
      if (!selectedClientId) return;
      setLoadingDetails(true);
      try {
        const foundClient = availableClients.find(c => c.id === selectedClientId);
        if (!foundClient) {
           // Fallback if availableClients doesn't have the full object (we only requested id, name, phone, cpf_cnpj in Layout)
           // It's better to fetch the full client here.
           const { data: fullClient } = await supabase.from('clients').select('*').eq('id', selectedClientId).single();
           if (!fullClient) return;
           const mappedClient = { 
            ...fullClient, 
            id: fullClient.id, 
            dueDate: fullClient.due_date, 
            name: fullClient.name 
           };
           setClientData(mappedClient);
           
           // Fetch Visits
           const { data: vSnap } = await supabase
             .from('visits')
             .select('*')
             .eq('client_id', fullClient.id)
             .eq('admin_id', fullClient.admin_id)
             .order('date', { ascending: false });
           
           if (vSnap) {
             setVisits(vSnap.map(d => ({...d, employeeId: d.employee_id})));
           }

           // Fetch Payments
           const { data: pSnap } = await supabase
             .from('payments')
             .select('*')
             .eq('client_id', fullClient.id)
             .eq('admin_id', fullClient.admin_id)
             .order('created_at', { ascending: false });
           
           if (pSnap) {
             setPayments(pSnap.map(d => ({...d, date: d.paid_date || d.created_at})));
           }

           // Get employees mapping
           const { data: eSnap } = await supabase
             .from('users')
             .select('id, name')
             .eq('admin_id', fullClient.admin_id);
           
           const eMap: Record<string, string> = {};
           if (eSnap) {
             eSnap.forEach(data => {
               eMap[data.id] = data.name || 'Desconhecido';
             });
           }
           setEmployeesMap(eMap);
        } else {
           // We only have partial data in availableClients, fetch the rest anyway
           const { data: fullClient } = await supabase.from('clients').select('*').eq('id', selectedClientId).single();
           if (!fullClient) return;
           const mappedClient = { 
            ...fullClient, 
            id: fullClient.id, 
            dueDate: fullClient.due_date, 
            name: fullClient.name 
           };
           setClientData(mappedClient);
           
           // Fetch Visits
           const { data: vSnap } = await supabase
             .from('visits')
             .select('*')
             .eq('client_id', fullClient.id)
             .eq('admin_id', fullClient.admin_id)
             .order('date', { ascending: false });
           
           if (vSnap) {
             setVisits(vSnap.map(d => ({...d, employeeId: d.employee_id})));
           }

           // Fetch Payments
           const { data: pSnap } = await supabase
             .from('payments')
             .select('*')
             .eq('client_id', fullClient.id)
             .eq('admin_id', fullClient.admin_id)
             .order('created_at', { ascending: false });
           
           if (pSnap) {
             setPayments(pSnap.map(d => ({...d, date: d.paid_date || d.created_at})));
           }

           // Get employees mapping
           const { data: eSnap } = await supabase
             .from('users')
             .select('id, name')
             .eq('admin_id', fullClient.admin_id);
           
           const eMap: Record<string, string> = {};
           if (eSnap) {
             eSnap.forEach(data => {
               eMap[data.id] = data.name || 'Desconhecido';
             });
           }
           setEmployeesMap(eMap);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingDetails(false);
      }
    };

    loadClientDetails();
  }, [selectedClientId, availableClients, refreshTrigger]);

  if (!availableClients || availableClients.length === 0) return <div className="p-8 text-center text-red-500">Dados do cliente não encontrados.</div>;

  const dueDate = clientData?.dueDate ? new Date(clientData.dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'Não definida';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {loadingDetails ? (
        <div className="p-8 text-center text-gray-500">Carregando detalhes do cadastro...</div>
      ) : clientData ? (
        <>
          <div className="bg-gradient-to-r from-primary to-primary-light rounded-xl shadow-lg p-6 text-white flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold mb-2">Olá, {(clientData.name || 'Cliente').split(' ')[0]}!</h1>
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
        </>
      ) : (
        <div className="p-8 text-center text-red-500 font-medium">
          <p>Erro ao carregar os dados.</p>
          <p className="text-sm mt-2 text-gray-500">Por favor, atualize a página ou verifique sua conexão.</p>
        </div>
      )}

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
