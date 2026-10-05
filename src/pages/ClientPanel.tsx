import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Calendar, CheckCircle, X, Download, Star, RefreshCw, Store, Wrench, MessageCircle, Phone } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import { openWhatsApp, normalizePhoneNumber } from '../lib/whatsapp';



const renderNotes = (notes: string) => {
  if (!notes) return null;
  
  // Extract main notes (before any of our inserted sections)
  let mainNotes = notes;
  let tarefas = [];
  let parametros = [];
  let produtos = [];

  const extractSection = (text, header) => {
    const headerStr = `\n\n${header}:\n- `;
    const startIdx = text.indexOf(headerStr);
    if (startIdx === -1) return { extracted: [], remaining: text };
    
    // Find the end of this section
    const endIdx = text.indexOf('\n\n', startIdx + headerStr.length);
    const content = endIdx === -1 ? text.substring(startIdx + headerStr.length) : text.substring(startIdx + headerStr.length, endIdx);
    const remaining = text.substring(0, startIdx) + (endIdx === -1 ? '' : text.substring(endIdx));
    
    return { extracted: content.split('\n- ').filter(Boolean), remaining };
  };

  const prodResult = extractSection(mainNotes, 'Produtos Utilizados');
  produtos = prodResult.extracted;
  mainNotes = prodResult.remaining;

  const paramResult = extractSection(mainNotes, 'Parâmetros da Água');
  parametros = paramResult.extracted;
  mainNotes = paramResult.remaining;

  const tarResult = extractSection(mainNotes, 'Tarefas realizadas');
  tarefas = tarResult.extracted;
  mainNotes = tarResult.remaining;

  if (tarefas.length === 0 && parametros.length === 0 && produtos.length === 0) {
    return <p className="text-xs sm:text-sm text-slate-300 bg-slate-950/70 p-4 rounded-xl border border-slate-800 whitespace-pre-wrap">{notes}</p>;
  }

  return (
    <div className="bg-slate-950/80 rounded-xl border border-slate-800 overflow-hidden shadow-inner mt-2">
      {mainNotes.trim() && (
        <div className="p-3.5 bg-slate-900/90 border-b border-slate-800">
          <p className="text-xs sm:text-sm text-slate-200 whitespace-pre-wrap">{mainNotes.trim()}</p>
        </div>
      )}
      
      {tarefas.length > 0 && (
        <div className="p-3.5 border-b border-slate-800">
          <h4 className="text-[11px] font-bold text-sky-400 uppercase tracking-wider mb-2.5">Serviços Executados</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {tarefas.map((item, idx) => (
              <div key={idx} className="flex items-center space-x-2 text-xs sm:text-sm text-slate-300">
                <CheckCircle size={15} className="text-emerald-400 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {parametros.length > 0 && (
        <div className="p-3.5 border-b border-slate-800">
          <h4 className="text-[11px] font-bold text-sky-400 uppercase tracking-wider mb-2.5">Parâmetros da Água</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {parametros.map((item, idx) => {
              const [label, val] = item.split(': ');
              return (
                <div key={idx} className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                  <span className="block text-[10px] text-slate-400 font-semibold">{label}</span>
                  <span className="block text-xs sm:text-sm font-bold text-sky-300">{val}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {produtos.length > 0 && (
        <div className="p-3.5 bg-slate-900/40">
          <h4 className="text-[11px] font-bold text-sky-400 uppercase tracking-wider mb-2.5">Produtos Utilizados</h4>
          <div className="flex flex-wrap gap-1.5">
            {produtos.map((item, idx) => (
              <span key={idx} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/50">
                {item}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};


export default function ClientPanel() {
  const { userProfile } = useAuth();
  
  const adminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
  const refreshTrigger = useRealtimeUpdates(['clients', 'visits', 'payments'], 'admin_id', adminId);

  const context = useOutletContext<{ availableClients: any[], selectedClientId: string | null }>();
  const availableClients = context?.availableClients || [];
  const selectedClientId = context?.selectedClientId || null;
  
  const [clientData, setClientData] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [employeesMap, setEmployeesMap] = useState<Record<string, string>>({});
  const [partnerStores, setPartnerStores] = useState<any[]>([]);
  const [partnerTechnicians, setPartnerTechnicians] = useState<any[]>([]);
  
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  const loadClientDetails = useCallback(async (isManual = false) => {
    if (!selectedClientId) return;
    if (!clientData && !isManual) setLoadingDetails(true);
    if (isManual) setIsRefreshing(true);
    try {
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

      // Fetch Partner Stores & Technicians from the company's admin
      let pStores: any[] = [];
      let pTechs: any[] = [];
      const targetAdminId = fullClient.admin_id;
      if (targetAdminId) {
        const { data: adminUser } = await supabase
          .from('users')
          .select('whatsapp_settings')
          .eq('id', targetAdminId)
          .maybeSingle();
        if (adminUser?.whatsapp_settings) {
          pStores = adminUser.whatsapp_settings.partnerStores || [];
          pTechs = adminUser.whatsapp_settings.partnerTechnicians || [];
        }
      }
      setPartnerStores(pStores);
      setPartnerTechnicians(pTechs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetails(false);
      if (isManual) {
        setTimeout(() => setIsRefreshing(false), 400);
      }
    }
  }, [selectedClientId, clientData]);

  useEffect(() => {
    loadClientDetails();

    const handleFocus = () => loadClientDetails();
    const handleGlobal = () => loadClientDetails(true);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('app-global-refresh', handleGlobal);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadClientDetails();
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('app-global-refresh', handleGlobal);
    };
  }, [loadClientDetails, refreshTrigger]);

  if (!availableClients || availableClients.length === 0) return <div className="p-8 text-center text-red-500">Dados do cliente não encontrados.</div>;

  const dueDate = clientData?.dueDate ? new Date(clientData.dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'Não definida';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {loadingDetails ? (
        <div className="p-8 text-center text-gray-500">Carregando detalhes do cadastro...</div>
      ) : clientData ? (
        <>
          <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-blue-950 border border-sky-500/40 rounded-2xl shadow-xl p-5 sm:p-6 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black mb-1 text-white">Olá, {(clientData.name || 'Cliente').split(' ')[0]}!</h1>
              <p className="text-xs sm:text-sm text-sky-300">Bem-vindo(a) ao seu painel RS Piscinas.</p>
            </div>
            <button
              onClick={() => loadClientDetails(true)}
              disabled={isRefreshing}
              className="bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-slate-200 px-4 py-2 rounded-xl flex items-center transition-all text-xs sm:text-sm font-bold disabled:opacity-60 shadow-sm cursor-pointer"
              title="Atualizar painel"
            >
              <RefreshCw size={16} className={`mr-2 text-sky-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            <div className="bg-slate-900/90 rounded-2xl shadow-xl p-5 sm:p-6 border border-slate-800 flex items-center">
              <div className="w-12 h-12 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center mr-4 shrink-0">
                <Calendar size={22} />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Vencimento da Mensalidade</p>
                <p className="text-xl sm:text-2xl font-black text-white">{dueDate}</p>
              </div>
            </div>

            <div className="bg-slate-900/90 rounded-2xl shadow-xl p-5 sm:p-6 border border-slate-800 flex items-center">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mr-4 shrink-0">
                <CheckCircle size={22} />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Situação Atual</p>
                <p className="text-lg sm:text-xl font-bold text-emerald-400">Ativo no Sistema</p>
              </div>
            </div>

            <div className="bg-slate-900/90 rounded-2xl shadow-xl p-5 sm:p-6 border border-slate-800 flex items-center">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mr-4 shrink-0">
                <Calendar size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-400 font-medium mb-1">Dias de Visita</p>
                {clientData.visit_days && clientData.visit_days.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {clientData.visit_days.map((day: string, idx: number) => (
                      <span 
                        key={idx} 
                        className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60 shadow-sm"
                      >
                        {day}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-slate-300">A combinar</p>
                )}
              </div>
            </div>
          </div>

          {/* Lojas e Técnicos Parceiros */}
          {(partnerStores.length > 0 || partnerTechnicians.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {partnerStores.length > 0 && (
                <div className="bg-slate-900/90 rounded-2xl shadow-xl border border-slate-800 overflow-hidden flex flex-col">
                  <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center">
                        <Store size={16} />
                      </div>
                      <div>
                        <h2 className="text-base font-black text-white">Lojas Parceiras</h2>
                        <p className="text-[11px] text-slate-400">Produtos e químicos recomendados</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-sky-400 border border-slate-700">
                      {partnerStores.length}
                    </span>
                  </div>
                  <div className="p-4 space-y-3 flex-1">
                    {partnerStores.map((store, idx) => (
                      <div key={idx} className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between hover:border-slate-700 transition-colors">
                        <div className="min-w-0 flex-1 mr-2.5">
                          <h3 className="font-bold text-white text-xs sm:text-sm truncate">{store.name}</h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">{normalizePhoneNumber(store.phone)}</p>
                        </div>
                        <button
                          onClick={() => openWhatsApp(store.phone, `Olá! Sou cliente da RS Piscinas (${clientData?.name || 'Cliente'}) e gostaria de fazer um orçamento de produtos para minha piscina.`)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm shrink-0 cursor-pointer transition-all active:scale-95"
                          title="Falar no WhatsApp"
                        >
                          <MessageCircle size={14} />
                          <span>WhatsApp</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {partnerTechnicians.length > 0 && (
                <div className="bg-slate-900/90 rounded-2xl shadow-xl border border-slate-800 overflow-hidden flex flex-col">
                  <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                        <Wrench size={16} />
                      </div>
                      <div>
                        <h2 className="text-base font-black text-white">Técnicos Parceiros</h2>
                        <p className="text-[11px] text-slate-400">Manutenções e reparos especializados</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700">
                      {partnerTechnicians.length}
                    </span>
                  </div>
                  <div className="p-4 space-y-3 flex-1">
                    {partnerTechnicians.map((tech, idx) => (
                      <div key={idx} className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between hover:border-slate-700 transition-colors">
                        <div className="min-w-0 flex-1 mr-2.5">
                          <h3 className="font-bold text-white text-xs sm:text-sm truncate">{tech.name}</h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">{normalizePhoneNumber(tech.phone)}</p>
                        </div>
                        <button
                          onClick={() => openWhatsApp(tech.phone, `Olá ${tech.name}! Sou cliente da RS Piscinas (${clientData?.name || 'Cliente'}) e gostaria de solicitar uma manutenção técnica na minha piscina.`)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm shrink-0 cursor-pointer transition-all active:scale-95"
                          title="Falar no WhatsApp"
                        >
                          <MessageCircle size={14} />
                          <span>WhatsApp</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-slate-900/90 rounded-2xl shadow-xl border border-slate-800 overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-black text-white">Histórico de Visitas</h2>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-sky-400 border border-slate-700">
                {visits.length} {visits.length === 1 ? 'visita' : 'visitas'}
              </span>
            </div>
            <div className="divide-y divide-slate-800">
              {visits.map(v => (
                <div key={v.id} className="p-4 sm:p-5 hover:bg-slate-800/40 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center text-sky-400 font-bold text-sm">
                      <CheckCircle size={16} className="mr-2 text-emerald-400 shrink-0" />
                      {v.date ? new Date(v.date).toLocaleString('pt-BR') : 'Data Indisponível'}
                    </div>
                    {v.employeeId && (
                      <div className="text-xs font-medium text-slate-400">
                        Técnico: <span className="text-slate-200">{employeesMap[v.employeeId] || 'Desconhecido'}</span>
                      </div>
                    )}
                  </div>
                  {v.notes && renderNotes(v.notes)}
                  
                  {/* Legacy single photo support */}
                  {v.photo_url && (!v.photo_urls || v.photo_urls.length === 0) && (
                    <div className="mt-3">
                      <img 
                        src={v.photo_url} 
                        alt="Foto da visita" 
                        onClick={() => setFullscreenImage(v.photo_url)}
                        className="w-28 h-28 sm:w-36 sm:h-36 object-cover rounded-xl shadow-md border border-slate-700 cursor-pointer hover:opacity-90 transition-opacity" 
                      />
                    </div>
                  )}
                  
                  {/* Modern multiple photos support */}
                  {v.photo_urls && v.photo_urls.length > 0 && (
                    <div className="mt-3 flex gap-2.5 overflow-x-auto pb-2">
                      {v.photo_urls.map((photo: string, index: number) => (
                        <img 
                          key={index}
                          src={photo} 
                          alt={`Foto da visita ${index}`} 
                          onClick={() => setFullscreenImage(photo)}
                          className="w-28 h-28 sm:w-36 sm:h-36 object-cover rounded-xl shadow-md border border-slate-700 cursor-pointer hover:opacity-90 transition-opacity shrink-0" 
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {visits.length === 0 && (
                <p className="p-8 text-center text-slate-400 text-sm">Nenhuma visita registrada ainda.</p>
              )}
            </div>
          </div>

          <div className="bg-slate-900/90 rounded-2xl shadow-xl border border-slate-800 overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-800 bg-slate-900">
              <h2 className="text-lg sm:text-xl font-black text-white">Histórico de Pagamentos</h2>
            </div>
            <div className="divide-y divide-slate-800">
              {payments.map(p => {
                const paymentDateStr = p.date;
                let paymentDate = null;
                if (paymentDateStr) {
                  const isJustDate = typeof paymentDateStr === 'string' && paymentDateStr.length === 10;
                  paymentDate = isJustDate ? new Date(`${paymentDateStr}T12:00:00`) : new Date(paymentDateStr);
                }
                return (
                <div key={p.id} className="p-4 sm:p-5 hover:bg-slate-800/40 transition-colors flex justify-between items-center">
                  <div>
                    <div className="font-bold text-white text-sm sm:text-base">
                      Mês de Referência: {String(p.ref_month || p.month || (paymentDate ? paymentDate.getMonth() + 1 : '')).padStart(2, '0')}/{p.ref_year || p.year || (paymentDate ? paymentDate.getFullYear() : '')}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center mt-1">
                      <Calendar size={13} className="mr-1.5 text-sky-400" />
                      Pago em: {paymentDate ? paymentDate.toLocaleDateString('pt-BR') : 'Data Indisponível'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base sm:text-lg font-black text-emerald-400">
                      R$ {Number(p.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
                )
              })}
              {payments.length === 0 && (
                <p className="p-8 text-center text-slate-400 text-sm">Nenhum pagamento registrado ainda.</p>
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
