import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import { 
  Users, DollarSign, AlertCircle, CheckCircle, Clock, CreditCard, 
  MessageCircle, Eye, EyeOff, RefreshCw, Send, Calendar, TrendingUp, 
  ShieldCheck, ArrowRight, Check, Sparkles, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  openWhatsApp, 
  sendMetaMessage, 
  sendEvolutionMessage, 
  sendAstraCallsMessage, 
  getEffectiveWhatsAppProvider 
} from '../lib/whatsapp';
import { formatClientMessageTemplate } from '../lib/messageTemplates';

interface DashboardStats {
  totalClients: number;
  inactiveClients: number;
  totalToReceive: number;
  delayedClients: number;
  delayedTotalAmount: number;
  receivedThisMonth: number;
  pendingThisMonth: number;
  totalActiveContracts: number;
  ticketMedio: number;
  taxaRecebimento: number;
}

interface UpcomingClient {
  id: string;
  name: string;
  phone: string;
  monthlyPrice: number;
  extraAmount?: number;
  extraReason?: string;
  dueDate: string;
  diffDays: number;
  rawClient?: any;
}

export default function Dashboard() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    inactiveClients: 0,
    totalToReceive: 0,
    delayedClients: 0,
    delayedTotalAmount: 0,
    receivedThisMonth: 0,
    pendingThisMonth: 0,
    totalActiveContracts: 0,
    ticketMedio: 0,
    taxaRecebimento: 0,
  });

  const [upcomingClients3to5, setUpcomingClients3to5] = useState<UpcomingClient[]>([]);
  const [upcomingClientsNext7, setUpcomingClientsNext7] = useState<UpcomingClient[]>([]);
  const [upcomingTab, setUpcomingTab] = useState<'3to5' | '7days'>('3to5');

  const [clientsWithoutVisits, setClientsWithoutVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Privacy toggle (show/hide financial values)
  const [showValues, setShowValues] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('gestaopro_dashboard_show_values');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleShowValues = () => {
    setShowValues(prev => {
      const next = !prev;
      try {
        localStorage.setItem('gestaopro_dashboard_show_values', String(next));
      } catch {}
      return next;
    });
  };

  // Sent reminders tracking (persisted to localStorage)
  const [sentReminders, setSentReminders] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('gestaopro_billed_clients');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const adminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
  const refreshTrigger = useRealtimeUpdates(['clients', 'visits', 'oneoffjobs', 'payments'], 'admin_id', adminId);

  // Fetch all stats & indicators
  const fetchStats = useCallback(async (isManual = false) => {
    if (!userProfile?.uid) return;
    if (isManual) setIsRefreshing(true);

    try {
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();
      const currentAdminId = userProfile.role === 'admin' ? userProfile.uid : userProfile.adminId;

      let totalClients = 0;
      let inactiveClients = 0;
      let totalToReceive = 0;
      let actualDelayedClients = 0;
      let delayedTotalAmount = 0;
      let pendingThisMonth = 0;
      let receivedThisMonth = 0;
      let totalActiveContracts = 0;

      const clientsNoVisit: any[] = [];
      const totalActiveClientsList: any[] = [];
      const clientsWhoPaidThisMonth = new Set<string>();

      // 1. Fetch Payments for current month
      const paymentsSnap = await supabase
        .from('payments')
        .select('*')
        .eq('admin_id', currentAdminId);

      if (paymentsSnap.data) {
        paymentsSnap.data.forEach((data: any) => {
          const paymentDate = data.paid_date || data.created_at;
          if (paymentDate) {
            let py: number, pm: number;
            if (typeof paymentDate === 'string' && paymentDate.includes('-')) {
              const parts = paymentDate.split('T')[0].split('-');
              py = parseInt(parts[0], 10);
              pm = parseInt(parts[1], 10);
            } else {
              const dateObj = new Date(paymentDate);
              py = dateObj.getFullYear();
              pm = dateObj.getMonth() + 1;
            }

            if (pm === currentMonth && py === currentYear) {
              receivedThisMonth += Number(data.amount || 0);
              clientsWhoPaidThisMonth.add(data.client_id);
            }
          }
        });
      }

      // 2. Fetch Clients
      let clientsSnap;
      if (userProfile.role === 'employee') {
        clientsSnap = await supabase
          .from('clients')
          .select('*')
          .eq('admin_id', currentAdminId)
          .eq('employee_id', userProfile.uid);
      } else {
        clientsSnap = await supabase
          .from('clients')
          .select('*')
          .eq('admin_id', currentAdminId);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(today.getDate() - 7);

      const list3to5: UpcomingClient[] = [];
      const listNext7: UpcomingClient[] = [];

      if (clientsSnap.data) {
        clientsSnap.data.forEach((data: any) => {
          const clientPrice = Number(data.monthly_price || data.monthly_fee || 0);
          const extraPrice = Number(data.extra_amount || 0);
          const fullPrice = clientPrice + extraPrice;

          if (data.active === false) {
            inactiveClients++;
            // Se inativo, só somamos para o mês se ele pagou
            if (!clientsWhoPaidThisMonth.has(data.id)) {
              return;
            }
          } else {
            totalClients++;
            totalActiveContracts += clientPrice;
            totalActiveClientsList.push(data);
          }

          totalToReceive += fullPrice;

          if (data.due_date) {
            const [year, month, day] = data.due_date.split('-').map(Number);
            const due = new Date(year, month - 1, day);
            due.setHours(0, 0, 0, 0);

            const diffTime = due.getTime() - today.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            // Atrasados
            if (due.getTime() < today.getTime()) {
              if (!clientsWhoPaidThisMonth.has(data.id)) {
                actualDelayedClients++;
                delayedTotalAmount += fullPrice;
              }
            }

            // Pendente neste mês
            if (due.getFullYear() < currentYear || (due.getFullYear() === currentYear && due.getMonth() + 1 <= currentMonth)) {
              if (!clientsWhoPaidThisMonth.has(data.id)) {
                pendingThisMonth += fullPrice;
              }
            }

            // Próximos Vencimentos (somente se ainda não pagou no mês atual e estiver ativo)
            if (data.active !== false && !clientsWhoPaidThisMonth.has(data.id)) {
              const upcomingItem: UpcomingClient = {
                id: data.id,
                name: data.name,
                phone: data.phone || '',
                monthlyPrice: clientPrice,
                extraAmount: extraPrice > 0 ? extraPrice : undefined,
                extraReason: data.extra_reason || undefined,
                dueDate: data.due_date,
                diffDays,
                rawClient: data
              };

              // Janela de 3 a 5 dias
              if (diffDays >= 3 && diffDays <= 5) {
                list3to5.push(upcomingItem);
              }

              // Janela dos próximos 7 dias (de hoje a +7 dias)
              if (diffDays >= 0 && diffDays <= 7) {
                listNext7.push(upcomingItem);
              }
            }
          }
        });
      }

      // Ordena vencimentos pela data mais próxima
      list3to5.sort((a, b) => a.diffDays - b.diffDays);
      listNext7.sort((a, b) => a.diffDays - b.diffDays);
      setUpcomingClients3to5(list3to5);
      setUpcomingClientsNext7(listNext7);

      // 3. Fetch Recent Visits
      let recentVisitsSnap;
      if (userProfile.role === 'employee') {
        recentVisitsSnap = await supabase
          .from('visits')
          .select('client_id, date')
          .eq('admin_id', currentAdminId)
          .eq('employee_id', userProfile.uid)
          .gte('date', sevenDaysAgo.toISOString());
      } else {
        recentVisitsSnap = await supabase
          .from('visits')
          .select('client_id, date')
          .eq('admin_id', currentAdminId)
          .gte('date', sevenDaysAgo.toISOString());
      }

      const clientsWithRecentVisits = new Set(recentVisitsSnap.data?.map((v: any) => v.client_id) || []);

      totalActiveClientsList.forEach(data => {
        if (!clientsWithRecentVisits.has(data.id)) {
          clientsNoVisit.push({ ...data, lastVisitDate: data.last_visit_date });
        }
      });
      setClientsWithoutVisits(clientsNoVisit);

      // 4. Fetch One-Off Jobs (Serviços Avulsos do mês)
      let jobsSnap;
      if (userProfile.role === 'employee') {
        jobsSnap = await supabase
          .from('oneoffjobs')
          .select('*')
          .eq('admin_id', currentAdminId)
          .eq('employee_id', userProfile.uid);
      } else {
        jobsSnap = await supabase
          .from('oneoffjobs')
          .select('*')
          .eq('admin_id', currentAdminId);
      }

      if (jobsSnap.data) {
        jobsSnap.data.forEach((data: any) => {
          if (data.client_name === 'system_route_order' || data.title === 'system_route_order') return;
          let isCurrentMonthJob = false;
          let isPendingThisMonth = false;
          let isCompletedThisMonth = false;

          if (data.date) {
            const [year, month] = data.date.split('-').map(Number);
            if (year === currentYear && month === currentMonth) {
              isCurrentMonthJob = true;
            }
            if (year < currentYear || (year === currentYear && month <= currentMonth)) {
              if (data.status === 'pendente' || data.status === 'em_andamento') {
                isPendingThisMonth = true;
              }
            }
          } else if (data.created_at) {
            const dateObj = new Date(data.created_at);
            if (dateObj.getFullYear() === currentYear && dateObj.getMonth() + 1 === currentMonth) {
              isCurrentMonthJob = true;
            }
            if (dateObj.getFullYear() < currentYear || (dateObj.getFullYear() === currentYear && dateObj.getMonth() + 1 <= currentMonth)) {
              if (data.status === 'pendente' || data.status === 'em_andamento') {
                isPendingThisMonth = true;
              }
            }
          }

          if (data.status === 'concluido') {
            let checkDate: Date;
            if (data.updated_at) {
              checkDate = new Date(data.updated_at);
            } else if (data.date) {
              const [y, m, d] = data.date.split('-').map(Number);
              checkDate = new Date(y, m - 1, d || 1);
            } else {
              checkDate = new Date(data.created_at);
            }
            if (checkDate.getFullYear() === currentYear && checkDate.getMonth() + 1 === currentMonth) {
              isCompletedThisMonth = true;
            }
          }

          if (isCurrentMonthJob) {
            totalToReceive += Number(data.price || 0);
          }
          if (isPendingThisMonth) {
            pendingThisMonth += Number(data.price || 0);
          }
          if (data.status === 'concluido' && isCompletedThisMonth) {
            receivedThisMonth += Number(data.price || 0);
          }
        });
      }

      // Calculations:
      const ticketMedio = totalClients > 0 ? (totalActiveContracts / totalClients) : 0;
      const taxaRecebimento = totalToReceive > 0 ? Math.min(100, Math.round((receivedThisMonth / totalToReceive) * 100)) : 0;

      setStats({
        totalClients,
        inactiveClients,
        totalToReceive,
        delayedClients: actualDelayedClients,
        delayedTotalAmount,
        receivedThisMonth,
        pendingThisMonth,
        totalActiveContracts,
        ticketMedio,
        taxaRecebimento,
      });

      setLastUpdated(new Date());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      if (isManual) {
        setTimeout(() => setIsRefreshing(false), 400);
      }
    }
  }, [userProfile]);

  useEffect(() => {
    fetchStats();

    const handleFocus = () => fetchStats();
    const handleGlobal = () => fetchStats(true);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('app-global-refresh', handleGlobal);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchStats();
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('app-global-refresh', handleGlobal);
    };
  }, [fetchStats, refreshTrigger]);

  // Currency Formatter
  const formatCurrency = (value: number) => {
    if (!showValues) return 'R$ ****';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDateBR = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  // Envio de lembrete preventivo (WhatsApp AstraCalls / Meta / Evolution / Web)
  const handleSendPreventiveReminder = async (client: UpcomingClient) => {
    try {
      setSendingReminderId(client.id);

      let currentSettings: any = userProfile?.whatsappSettings || {};
      const currentAdminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
      if (currentAdminId) {
        try {
          const { data } = await supabase.from('users').select('whatsapp_settings').eq('id', currentAdminId).single();
          if (data && data.whatsapp_settings) {
            currentSettings = { ...currentSettings, ...data.whatsapp_settings };
          }
        } catch (e) {
          // ignore
        }
      }

      if (!client.phone) {
        alert(`O cliente ${client.name} não possui telefone cadastrado.`);
        return;
      }

      const todayStr = new Date().toLocaleDateString('pt-BR');
      const updatedReminders = { ...sentReminders, [client.id]: todayStr };
      setSentReminders(updatedReminders);
      try {
        localStorage.setItem('gestaopro_billed_clients', JSON.stringify(updatedReminders));
      } catch (e) {}

      const cleanPhone = client.phone.replace(/\D/g, '');
      const reminderTemplate = currentSettings.reminderMessage || 
        'Olá {nome}, tudo bem? Passando para lembrar que sua mensalidade no valor de R$ {valor} vence no dia {vencimento}. Qualquer dúvida estamos à disposição!';

      const fullTotal = client.monthlyPrice + (client.extraAmount || 0);

      const currentPixKey = currentSettings.pixKey || (userProfile?.whatsappSettings as any)?.pixKey || '';
      const currentPixReceiver = currentSettings.pixReceiverName || (userProfile?.whatsappSettings as any)?.pixReceiverName || '';
      const shouldAppendPix = currentSettings.autoAppendPix !== false;

      let message = formatClientMessageTemplate(reminderTemplate, {
        name: client.name,
        phone: client.phone,
        monthly_price: fullTotal,
        monthlyFee: fullTotal,
        due_date: client.dueDate,
        dueDate: client.dueDate,
        extraAmount: client.extraAmount,
        extra_amount: client.extraAmount,
        extraReason: client.extraReason,
        extra_reason: client.extraReason,
        pixKey: currentPixKey,
        pixReceiverName: currentPixReceiver
      }, {
        companyName: currentSettings?.companyName || userProfile?.whatsappSettings?.companyName || 'RS Piscinas',
        portalUrl: 'www.rspiscinas.app.br/client-panel',
        pixKey: currentPixKey,
        pixReceiverName: currentPixReceiver
      });

      if (shouldAppendPix && currentPixKey && !message.includes(currentPixKey)) {
        message += `\n\n*Chave PIX para pagamento:*\n${currentPixKey}${currentPixReceiver ? `\n*Titular:* ${currentPixReceiver}` : ''}`;
      }

      const billingMsgClientId = `preventive_${client.id}_${client.dueDate}_${new Date().toISOString().slice(0, 10)}`;
      const effectiveProvider = getEffectiveWhatsAppProvider(currentSettings);

      if (effectiveProvider === 'manual') {
        openWhatsApp(`55${cleanPhone}`, message);
        setFeedbackMessage({ text: `WhatsApp aberto para envio a ${client.name}.` });
      } else if (effectiveProvider === 'astracalls') {
        try {
          await sendAstraCallsMessage(client.phone, message, currentSettings, billingMsgClientId);
          setFeedbackMessage({ text: `Lembrete preventivo enviado com sucesso para ${client.name} via AstraCalls!` });
        } catch (err: any) {
          console.error(err);
          if (confirm(`Falha no AstraCalls (${err.message}). Deseja abrir o WhatsApp no aparelho para enviar manualmente?`)) {
            openWhatsApp(`55${cleanPhone}`, message);
          }
        }
      } else if (effectiveProvider === 'meta') {
        try {
          await sendMetaMessage(client.phone, message, currentSettings, billingMsgClientId);
          setFeedbackMessage({ text: `Lembrete preventivo enviado via WhatsApp Oficial Meta para ${client.name}!` });
        } catch (err: any) {
          console.error(err);
          if (confirm(`Falha na Meta API (${err.message}). Deseja abrir o WhatsApp no aparelho para enviar manualmente?`)) {
            openWhatsApp(`55${cleanPhone}`, message);
          }
        }
      } else if (effectiveProvider === 'evolution') {
        try {
          await sendEvolutionMessage(client.phone, message, currentSettings, billingMsgClientId);
          setFeedbackMessage({ text: `Lembrete preventivo enviado via Evolution para ${client.name}!` });
        } catch (err: any) {
          console.error(err);
          if (confirm(`Falha na Evolution API (${err.message}). Deseja abrir o WhatsApp no aparelho para enviar manualmente?`)) {
            openWhatsApp(`55${cleanPhone}`, message);
          }
        }
      } else {
        openWhatsApp(`55${cleanPhone}`, message);
        setFeedbackMessage({ text: `WhatsApp aberto para envio a ${client.name}.` });
      }
    } catch (e: any) {
      console.error(e);
      alert('Erro ao enviar lembrete: ' + (e.message || ''));
    } finally {
      setSendingReminderId(null);
      setTimeout(() => setFeedbackMessage(null), 5000);
    }
  };

  // Trial & Subscription checks
  const isTrial = userProfile?.role === 'admin' && userProfile?.subscriptionStatus === 'trial';
  const isExpiringSoon = () => {
    if (!userProfile?.subscriptionExpiresAt) return false;
    const expiresAt = new Date(userProfile.subscriptionExpiresAt);
    const now = new Date();
    const diffTime = expiresAt.getTime() - now.getTime();
    const diffDays = diffTime / (1000 * 3600 * 24);
    return diffDays <= 1;
  };

  const handlePay = async () => {
    try {
      let price = 99.90;
      try {
        const { data } = await supabase.from('settings').select('*').eq('id', 'platform').single();
        if (data && data.monthlyprice) {
          price = data.monthlyprice;
        }
      } catch (e) {
        console.error('Failed to get price', e);
      }
      const response = await fetch('/api/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Assinatura Mensal - GestãoPro',
          price: price,
          quantity: 1,
          adminId: userProfile?.role === 'admin' ? userProfile?.uid : userProfile?.adminId,
          email: userProfile?.email || 'admin@gestaopro.com',
          origin: window.location.origin
        })
      });

      if (!response.ok) {
        let errMsg = 'Falha ao gerar link';
        try {
          const text = await response.text();
          try {
            const errData = JSON.parse(text);
            errMsg = errData.error || errData.message || errMsg;
          } catch(e) {
            errMsg = `Erro no servidor (${response.status}): ${text.substring(0, 50)}`;
          }
        } catch (e) {}
        throw new Error(errMsg);
      }
      const data = await response.json();
      if (data.init_point) window.location.href = data.init_point;
    } catch (err: any) {
      console.error(err);
      alert('Houve um problema ao processar o pagamento: ' + err.message + '. Verifique com o administrador.');
    }
  };

  // SVG circular gauge math
  const circleRadius = 40;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const circleStrokeOffset = circleCircumference - (Math.min(100, Math.max(0, stats.taxaRecebimento)) / 100) * circleCircumference;

  // Active upcoming list based on tab
  const activeUpcomingList = upcomingTab === '3to5' ? upcomingClients3to5 : upcomingClientsNext7;

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-80 space-y-4">
        <RefreshCw size={36} className="text-sky-500 animate-spin" />
        <p className="text-sm font-medium text-slate-400">Carregando indicadores de inteligência...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">

      {/* Feedback Toast */}
      <AnimatePresence>
        {feedbackMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-2xl border flex items-center gap-3 max-w-md ${
              feedbackMessage.isError
                ? 'bg-red-950/95 border-red-500/50 text-red-200'
                : 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
            }`}
          >
            {feedbackMessage.isError ? <AlertCircle size={20} className="shrink-0" /> : <CheckCircle size={20} className="shrink-0 text-emerald-400" />}
            <span className="text-sm font-medium">{feedbackMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subscription Active Banner */}
      {userProfile?.role === 'admin' && userProfile?.subscriptionExpiresAt && !isTrial && (
        <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-blue-950 border border-sky-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between shadow-lg">
          <div className="flex items-center mb-4 sm:mb-0">
            <Clock className="text-sky-400 mr-3.5 hidden sm:block shrink-0" size={26} />
            <div>
              <h3 className="font-bold text-white text-base">Assinatura Ativa</h3>
              <p className="text-xs sm:text-sm text-sky-200 mt-0.5">
                Sua mensalidade vence em: <span className="font-bold text-white">{formatDateBR(userProfile.subscriptionExpiresAt.split('T')[0])}</span>
              </p>
            </div>
          </div>
          {isExpiringSoon() && (
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-4 sm:mt-0">
              <button
                onClick={handlePay}
                className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl shadow-md transition-all flex items-center justify-center whitespace-nowrap cursor-pointer text-sm"
              >
                <CreditCard size={18} className="mr-2" />
                Renovar Assinatura
              </button>
            </div>
          )}
        </div>
      )}

      {/* Trial Banner */}
      {isTrial && (
        <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border border-amber-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between shadow-lg">
          <div className="flex items-center mb-4 sm:mb-0">
            <Clock className="text-amber-400 mr-3.5 hidden sm:block shrink-0" size={26} />
            <div>
              <h3 className="font-bold text-amber-200 text-base">Período de Teste (7 dias)</h3>
              <p className="text-xs sm:text-sm text-amber-300/80 mt-0.5">
                Evite a interrupção do serviço. Assine agora e garanta acesso contínuo às rotas e relatórios.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-4 sm:mt-0">
            <button
              onClick={() => window.open('https://wa.me/5567992499469', '_blank')}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 font-bold rounded-xl shadow-sm transition-all flex items-center justify-center whitespace-nowrap cursor-pointer text-sm"
            >
              <MessageCircle size={18} className="mr-2" />
              Contato
            </button>
            <button
              onClick={handlePay}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-md transition-all flex items-center justify-center whitespace-nowrap cursor-pointer text-sm"
            >
              <CreditCard size={18} className="mr-2" />
              Assinar Agora
            </button>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            Dashboard
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
              Gestão Inteligente
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Inteligência financeira, taxa de adimplência e controle de piscinas
            <span className="hidden md:inline text-slate-400"> · Atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Privacy Eye Toggle */}
          <button 
            onClick={toggleShowValues}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-xl shadow-sm border border-slate-200 transition-all text-xs font-semibold cursor-pointer"
            title={showValues ? "Ocultar valores financeiros (Modo Privacidade)" : "Mostrar valores financeiros"}
          >
            {showValues ? (
              <>
                <EyeOff size={16} className="text-slate-500" />
                <span className="hidden sm:inline">Ocultar Cifras</span>
              </>
            ) : (
              <>
                <Eye size={16} className="text-sky-600" />
                <span className="hidden sm:inline">Exibir Cifras</span>
              </>
            )}
          </button>

          {/* Quick Refresh */}
          <button
            onClick={() => fetchStats(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-xl shadow-sm border border-slate-200 transition-all text-xs font-semibold disabled:opacity-60 cursor-pointer"
            title="Atualizar dados agora"
          >
            <RefreshCw size={16} className={`text-sky-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
          </button>

          {/* Direct Billing Link */}
          <button
            onClick={() => navigate('/billing')}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-sm transition-all text-xs font-semibold cursor-pointer"
          >
            <DollarSign size={16} className="text-emerald-400" />
            <span>Financeiro</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          HERO ROW: TERMÔMETRO FINANCEIRO & TICKET MÉDIO POR PISCINA
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* 1. HERO CARD: Termômetro Financeiro e Taxa de Adimplência (8 cols on desktop) */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-5 sm:p-6 text-white relative overflow-hidden">
          {/* Subtle Ambient Glow */}
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header of Termômetro */}
          <div className="flex items-start justify-between mb-6 relative z-10">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-400 mb-1">
                <Sparkles size={14} />
                Termômetro Financeiro do Mês
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Taxa de Recebimento & Eficiência
              </h2>
            </div>

            <div className="text-right">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                stats.taxaRecebimento >= 80 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : stats.taxaRecebimento >= 50
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {stats.taxaRecebimento >= 80 ? 'Ritmo Excelente' : stats.taxaRecebimento >= 50 ? 'Meta em Andamento' : 'Acompanhamento'}
              </span>
            </div>
          </div>

          {/* Main Visual Display: Circular Gauge + Metrics Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center relative z-10">
            
            {/* Circular Gauge Meter (md: 4 cols) */}
            <div className="md:col-span-4 flex flex-col items-center justify-center p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background Track */}
                  <circle
                    cx="50"
                    cy="50"
                    r={circleRadius}
                    className="text-slate-800"
                    strokeWidth="9"
                    stroke="currentColor"
                    fill="transparent"
                  />
                  {/* Foreground Animated Value */}
                  <circle
                    cx="50"
                    cy="50"
                    r={circleRadius}
                    strokeWidth="9"
                    strokeDasharray={circleCircumference}
                    strokeDashoffset={circleStrokeOffset}
                    strokeLinecap="round"
                    stroke="url(#dashboardProgressGradient)"
                    fill="transparent"
                    className="transition-all duration-1000 ease-out"
                  />
                  <defs>
                    <linearGradient id="dashboardProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Inner Gauge Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-black text-white tracking-tight">
                    {stats.taxaRecebimento}%
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 -mt-0.5">
                    Recebido
                  </span>
                </div>
              </div>

              <p className="text-xs text-center text-slate-400 mt-2 font-medium">
                {stats.taxaRecebimento}% da meta arrecadada
              </p>
            </div>

            {/* Metrics Breakdown (md: 8 cols) */}
            <div className="md:col-span-8 space-y-4">
              
              {/* Top Banner Numbers */}
              <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/80">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-400">Progresso da Meta Mensal</span>
                  <span className="text-xs font-bold text-emerald-400">
                    {formatCurrency(stats.receivedThisMonth)} de {formatCurrency(stats.totalToReceive)}
                  </span>
                </div>

                {/* Visual Multi-Segment Progress Bar */}
                <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden flex">
                  {/* Received Segment */}
                  <div 
                    style={{ width: `${stats.taxaRecebimento}%` }}
                    className="bg-gradient-to-r from-sky-400 to-emerald-400 h-full transition-all duration-1000 ease-out"
                    title={`Recebido: ${formatCurrency(stats.receivedThisMonth)}`}
                  />
                  {/* Pending Segment */}
                  <div 
                    style={{ width: `${stats.totalToReceive > 0 ? Math.round((stats.pendingThisMonth / stats.totalToReceive) * 100) : 0}%` }}
                    className="bg-amber-400/80 h-full transition-all duration-1000 ease-out"
                    title={`Pendente: ${formatCurrency(stats.pendingThisMonth)}`}
                  />
                  {/* Delayed Segment */}
                  <div 
                    style={{ width: `${stats.totalToReceive > 0 ? Math.round((stats.delayedTotalAmount / stats.totalToReceive) * 100) : 0}%` }}
                    className="bg-red-500/80 h-full transition-all duration-1000 ease-out"
                    title={`Atrasado: ${formatCurrency(stats.delayedTotalAmount)}`}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Recebido ({stats.taxaRecebimento}%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Pendente
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    Atrasados
                  </span>
                </div>
              </div>

              {/* Sub-Cards Row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/60">
                  <span className="text-[11px] text-slate-400 block font-medium">Já Recebido</span>
                  <span className="text-base sm:text-lg font-black text-emerald-400 tracking-tight">
                    {formatCurrency(stats.receivedThisMonth)}
                  </span>
                </div>

                <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/60">
                  <span className="text-[11px] text-slate-400 block font-medium">A Receber no Mês</span>
                  <span className="text-base sm:text-lg font-black text-amber-400 tracking-tight">
                    {formatCurrency(stats.pendingThisMonth)}
                  </span>
                </div>

                <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/60 col-span-2 sm:col-span-1">
                  <span className="text-[11px] text-slate-400 block font-medium">Em Atraso ({stats.delayedClients})</span>
                  <span className={`text-base sm:text-lg font-black tracking-tight ${stats.delayedClients > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                    {formatCurrency(stats.delayedTotalAmount)}
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* 2. CARD: Ticket Médio por Piscina (4 cols on desktop) */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-5 sm:p-6 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute right-0 top-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <TrendingUp size={15} />
                Inteligência de Tabela
              </span>
              <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                <DollarSign size={18} />
              </span>
            </div>

            <p className="text-xs text-slate-400 font-medium">Ticket Médio por Piscina</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                {formatCurrency(stats.ticketMedio)}
              </span>
              <span className="text-xs font-semibold text-slate-400">/ mês</span>
            </div>

            <div className="mt-5 space-y-2.5 pt-4 border-t border-slate-800/80 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Piscinas / Clientes Ativos</span>
                <span className="font-bold text-white">{stats.totalClients} piscinas</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Contratos Ativos Recorrentes</span>
                <span className="font-bold text-sky-400">{formatCurrency(stats.totalActiveContracts)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Clientes Pausados / Inativos</span>
                <span className="font-semibold text-slate-400">{stats.inactiveClients} clientes</span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-800/80 bg-slate-950/40 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 p-4 rounded-b-2xl">
            <p className="text-[11px] leading-relaxed text-slate-400">
              <span className="font-semibold text-slate-300">💡 Parâmetro de Reajuste:</span> Média calculada sobre as mensalidades ativas. Excelente termômetro para recalibrar novas propostas e aplicar reposição de custos químicos.
            </p>
          </div>
        </div>

      </div>

      {/* =========================================================================
          SECTION: PRÓXIMOS VENCIMENTOS DA SEMANA (3 A 5 DIAS)
          ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Calendar className="text-sky-600" size={20} />
                Próximos Vencimentos da Semana
              </h2>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800">
                {activeUpcomingList.length} clientes
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Envie lembretes preventivos antes do vencimento para garantir alta taxa de recebimento
            </p>
          </div>

          {/* Tab selector for window filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto border border-slate-200">
            <button
              onClick={() => setUpcomingTab('3to5')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                upcomingTab === '3to5'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Janela 3 a 5 dias ({upcomingClients3to5.length})
            </button>
            <button
              onClick={() => setUpcomingTab('7days')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                upcomingTab === '7days'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Próximos 7 dias ({upcomingClientsNext7.length})
            </button>
          </div>
        </div>

        {/* List of Upcoming Clients */}
        {activeUpcomingList.length === 0 ? (
          <div className="py-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <ShieldCheck size={36} className="text-emerald-500 mx-auto mb-2 opacity-80" />
            <p className="text-sm font-bold text-slate-800">Nenhum vencimento pendente na janela selecionada</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Todos os clientes deste período já quitaram suas mensalidades ou os vencimentos estão fora do intervalo de 3 a 5 dias.
            </p>
            <button
              onClick={() => navigate('/billing')}
              className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:text-sky-700 cursor-pointer"
            >
              Ver todas as cobranças no Financeiro <ArrowRight size={14} />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeUpcomingList.map((client) => {
              const isSentToday = sentReminders[client.id] === new Date().toLocaleDateString('pt-BR');
              const isSending = sendingReminderId === client.id;
              const totalDue = client.monthlyPrice + (client.extraAmount || 0);

              return (
                <div 
                  key={client.id}
                  className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/70 hover:bg-white transition-all shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 text-sm truncate" title={client.name}>
                          {client.name}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {client.phone ? client.phone.replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, '+$1 ($2) $3-$4') : 'Sem telefone'}
                        </p>
                      </div>

                      {/* Due Countdown Badge */}
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                        client.diffDays <= 3
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-sky-100 text-sky-800 border border-sky-200'
                      }`}>
                        {client.diffDays === 0 ? 'Vence Hoje' : `Em ${client.diffDays} dias`}
                      </span>
                    </div>

                    {/* Due Date & Amount */}
                    <div className="mt-3 flex items-baseline justify-between pt-2.5 border-t border-slate-200/80 text-xs">
                      <span className="text-slate-500">
                        Vencimento: <strong className="text-slate-700">{formatDateBR(client.dueDate)}</strong>
                      </span>
                      <span className="font-black text-slate-900 text-sm">
                        {formatCurrency(totalDue)}
                      </span>
                    </div>

                    {client.extraAmount && client.extraAmount > 0 && (
                      <p className="text-[11px] text-amber-700 mt-1 italic">
                        + R$ {client.extraAmount.toFixed(2).replace('.', ',')} ({client.extraReason || 'Serviço extra'})
                      </p>
                    )}
                  </div>

                  {/* Action Button: Enviar Lembrete Preventivo */}
                  <div className="mt-3.5 pt-2.5 border-t border-slate-200/60 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleSendPreventiveReminder(client)}
                      disabled={isSending}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        isSentToday
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                      }`}
                      title={isSentToday ? "Lembrete já disparado hoje. Clique para reenviar se desejar." : "Enviar lembrete amigável antes do vencimento"}
                    >
                      {isSending ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>Enviando...</span>
                        </>
                      ) : isSentToday ? (
                        <>
                          <Check size={14} className="text-emerald-700" />
                          <span>Lembrete Enviado</span>
                        </>
                      ) : (
                        <>
                          <Send size={13} />
                          <span>Enviar Lembrete</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => navigate('/billing')}
                      className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                      title="Ver histórico no financeiro"
                    >
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer CTA */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>O lembrete preventivo utiliza o modelo configurado em Configurações de WhatsApp.</span>
          <button
            onClick={() => navigate('/billing')}
            className="font-bold text-sky-600 hover:text-sky-700 hover:underline flex items-center gap-1 cursor-pointer"
          >
            Abrir Painel Financeiro Completo <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {/* =========================================================================
          OPERATIONAL ALERT: CLIENTES SEM VISITA HÁ MAIS DE 7 DIAS
          ========================================================================= */}
      {clientsWithoutVisits.length > 0 && (
        <div className="bg-red-50 border border-red-200 p-5 sm:p-6 rounded-2xl shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 text-red-600 rounded-xl mr-3 shrink-0">
                <AlertCircle size={22} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-red-950 flex items-center gap-2">
                  Alerta Operacional: {clientsWithoutVisits.length} piscinas sem visita nos últimos 7 dias
                </h2>
                <p className="text-xs text-red-700 mt-0.5">
                  Piscinas ativas que demandam atenção na rota para manutenção de parâmetros químicos e filtragem
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/routes')}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer self-start sm:self-auto"
            >
              Ver Rotas de Hoje <ArrowRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {clientsWithoutVisits.slice(0, 9).map(client => (
              <div 
                key={client.id} 
                onClick={() => navigate('/routes')}
                className="bg-white border border-red-200/80 p-3.5 rounded-xl shadow-xs flex flex-col justify-center hover:border-red-400 transition-colors cursor-pointer group"
              >
                <span className="font-bold text-slate-900 text-sm truncate group-hover:text-red-700 transition-colors">
                  {client.name}
                </span>
                <span className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <Clock size={12} className="text-slate-400" />
                  {client.lastVisitDate 
                    ? `Última visita: ${new Date(client.lastVisitDate).toLocaleDateString('pt-BR')}` 
                    : 'Nenhuma visita registrada recente'}
                </span>
              </div>
            ))}
          </div>

          {clientsWithoutVisits.length > 9 && (
            <p className="text-xs text-red-700 mt-3 font-semibold italic">
              ... e mais {clientsWithoutVisits.length - 9} clientes necessitando de visita nesta semana.
            </p>
          )}
        </div>
      )}

      {/* =========================================================================
          QUICK STATS SUMMARY CARDS (CLEAN & NON-CLUTTERED)
          ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Total Piscinas Ativas</span>
            <Users size={16} className="text-sky-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 tracking-tight">{stats.totalClients}</p>
          <p className="text-[11px] text-slate-400 mt-1">{stats.inactiveClients} inativos/pausados</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Previsão Total do Mês</span>
            <DollarSign size={16} className="text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 tracking-tight">{formatCurrency(stats.totalToReceive)}</p>
          <p className="text-[11px] text-slate-400 mt-1">Mensalidades + Avulsos</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Faturas em Atraso</span>
            <AlertTriangle size={16} className="text-red-600" />
          </div>
          <p className={`text-2xl font-black tracking-tight ${stats.delayedClients > 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {stats.delayedClients}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {stats.delayedClients > 0 ? `${formatCurrency(stats.delayedTotalAmount)} a cobrar` : 'Zero inadimplência'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Adimplência do Período</span>
            <ShieldCheck size={16} className="text-sky-600" />
          </div>
          <p className="text-2xl font-black text-emerald-600 tracking-tight">{stats.taxaRecebimento}%</p>
          <p className="text-[11px] text-slate-400 mt-1">Eficiência de cobrança</p>
        </div>

      </div>

    </div>
  );
}
