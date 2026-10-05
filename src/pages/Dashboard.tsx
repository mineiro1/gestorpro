import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Users, DollarSign, AlertCircle, CheckCircle, Clock, CreditCard, MessageCircle, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';

interface DashboardStats {
  totalClients: number;
  inactiveClients: number;
  totalToReceive: number;
  delayedClients: number;
  receivedThisMonth: number;
  pendingThisMonth: number;
}

export default function Dashboard() {
  const { userProfile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    inactiveClients: 0,
    totalToReceive: 0,
    delayedClients: 0,
    receivedThisMonth: 0,
    pendingThisMonth: 0,
  });
  const [clientsWithoutVisits, setClientsWithoutVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showValues, setShowValues] = useState(false);

  const adminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
  const refreshTrigger = useRealtimeUpdates(['clients', 'visits', 'oneoffjobs', 'payments'], 'admin_id', adminId);

  const fetchStats = useCallback(async (isManual = false) => {
    if (!userProfile?.uid) return;
    if (isManual) setIsRefreshing(true);

    try {
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        const currentDay = currentDate.getDate();

        const adminId = userProfile.role === 'admin' ? userProfile.uid : userProfile.adminId;

        // Base variables
        let totalClients = 0;
        let inactiveClients = 0;
        let totalToReceive = 0;
        let actualDelayedClients = 0;
        let pendingThisMonth = 0;
        let receivedThisMonth = 0;
        const clientsNoVisit: any[] = [];
        const totalActiveClientsList: any[] = [];

        const clientsWhoPaidThisMonth = new Set<string>();

        // Fetch Payments for current month (Admins/Managers) FIRST to know who paid
        if (userProfile.role === 'admin' || userProfile.role === 'manager') {
          const paymentsSnap = await supabase.from('payments').select('*').eq('admin_id', adminId);
          if (paymentsSnap.data) {
            paymentsSnap.data.forEach((data: any) => {
              const paymentDate = data.paid_date || data.created_at;
              if (paymentDate) {
                let py, pm;
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
                  totalToReceive += Number(data.extra_amount || 0);
                  clientsWhoPaidThisMonth.add(data.client_id);
                }
              }
            });
          }
        }

        // Fetch Clients
        let clientsSnap;
        if (userProfile.role === 'employee') {
          clientsSnap = await supabase.from('clients').select('*').eq('admin_id', adminId).eq('employee_id', userProfile.uid);
        } else {
          clientsSnap = await supabase.from('clients').select('*').eq('admin_id', adminId);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 7);

        if (clientsSnap.data) {
          clientsSnap.data.forEach((data: any) => {
            if (data.active === false) {
               inactiveClients++;
               
               // Se inativo, só somamos receita/visitas se ele pagou nesse mês específico
               if (!clientsWhoPaidThisMonth.has(data.id)) {
                  return; // Ignora o cliente em inativo para "a receber" se não pagou
               }
            } else {
               totalClients++;
            }
            
            totalToReceive += Number(data.monthly_price || data.monthly_fee || 0) + Number(data.extra_amount || 0);

            if (data.due_date) {
              const [year, month, day] = data.due_date.split('-').map(Number);
              const due = new Date(year, month - 1, day);
              due.setHours(0, 0, 0, 0);

              if (due.getTime() < today.getTime()) {
                actualDelayedClients++;
              }

              // If due date is in the current month or earlier, it's pending
              if (due.getFullYear() < currentYear || (due.getFullYear() === currentYear && due.getMonth() + 1 <= currentMonth)) {
                pendingThisMonth += Number(data.monthly_price || data.monthly_fee || 0) + Number(data.extra_amount || 0);
              }
            }

            // Check if no visit in the last 7 days (will verify with visits table later)
            if (data.active !== false) {
               totalActiveClientsList.push(data);
            }
          });
        }
        
        // Fetch recent visits
        let recentVisitsSnap;
        if (userProfile.role === 'employee') {
          recentVisitsSnap = await supabase.from('visits')
            .select('client_id, date')
            .eq('admin_id', adminId)
            .eq('employee_id', userProfile.uid)
            .gte('date', sevenDaysAgo.toISOString());
        } else {
          recentVisitsSnap = await supabase.from('visits')
            .select('client_id, date')
            .eq('admin_id', adminId)
            .gte('date', sevenDaysAgo.toISOString());
        }
        
        const clientsWithRecentVisits = new Set(recentVisitsSnap.data?.map((v: any) => v.client_id) || []);
        
        totalActiveClientsList.forEach(data => {
           if (!clientsWithRecentVisits.has(data.id)) {
              clientsNoVisit.push({ ...data, lastVisitDate: data.last_visit_date });
           }
        });

        // Fetch One-Off Jobs (Avulsos)
        const currentMonthString = `${currentYear}-${currentMonth.toString().padStart(2, '0')}`;
        let jobsSnap;
        if (userProfile.role === 'employee') {
          jobsSnap = await supabase.from('oneoffjobs').select('*').eq('admin_id', adminId).eq('employee_id', userProfile.uid);
        } else {
          jobsSnap = await supabase.from('oneoffjobs').select('*').eq('admin_id', adminId);
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

            // O valor total a receber diz respeito a todo o valor do mes
            if (isCurrentMonthJob) {
              totalToReceive += Number(data.price || 0);
            }

            // Pendente no mes (inclui atrasados de meses anteriores ou pendentes do atual)
            if (isPendingThisMonth) {
              pendingThisMonth += Number(data.price || 0);
            }

            // Recebido no mes (concluido no mes atual)
            if (data.status === 'concluido' && isCompletedThisMonth) {
              receivedThisMonth += Number(data.price || 0);
            }
          });
        }

        setStats({
          totalClients,
          inactiveClients,
          totalToReceive,
          delayedClients: actualDelayedClients,
          receivedThisMonth,
          pendingThisMonth,
        });

        setClientsWithoutVisits(clientsNoVisit);
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
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchStats();
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchStats, refreshTrigger]);

  if (loading) {
    return <div className="flex justify-center items-center h-64">Carregando métricas...</div>;
  }

  const formatCurrency = (value: number) => {
    if (!showValues) return 'R$ ****';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  
  const isTrial = userProfile?.role === 'admin' && userProfile?.subscriptionStatus === 'trial';

  const isExpiringSoon = () => {
    if (!userProfile?.subscriptionExpiresAt) return false;
    const expiresAt = new Date(userProfile.subscriptionExpiresAt);
    const now = new Date();
    const diffTime = expiresAt.getTime() - now.getTime();
    const diffDays = diffTime / (1000 * 3600 * 24);
    return diffDays <= 1;
  };
  
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return d.toLocaleDateString('pt-BR');
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
        } catch (e) {
          // ignore
        }
        throw new Error(errMsg);
      }
      const data = await response.json();
      if (data.init_point) window.location.href = data.init_point;
    } catch (err: any) {
      console.error(err);
      alert('Houve um problema ao processar o pagamento: ' + err.message + '. Verifique com o SuperAdmin.');
    }
  };

  const statCards = [
    { title: 'Total de Clientes (Ativos)', value: stats.totalClients, icon: Users, bgBadge: 'bg-sky-500/20 text-sky-400 border border-sky-500/30' },
    { title: 'Clientes Inativos', value: stats.inactiveClients, icon: Users, bgBadge: 'bg-slate-800 text-slate-400 border border-slate-700' },
    { title: 'Valor Total a Receber', value: formatCurrency(stats.totalToReceive), icon: DollarSign, bgBadge: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' },
    { title: 'Clientes Atrasados', value: stats.delayedClients, icon: AlertCircle, bgBadge: 'bg-red-500/20 text-red-400 border border-red-500/30' },
    { title: 'Recebido no Mês', value: formatCurrency(stats.receivedThisMonth), icon: CheckCircle, bgBadge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' },
    { title: 'Pendente no Mês', value: formatCurrency(stats.pendingThisMonth), icon: Clock, bgBadge: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' },
  ];

  return (
    <div className="space-y-6">
      
      {userProfile?.role === 'admin' && userProfile?.subscriptionExpiresAt && !isTrial && (
        <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-blue-950 border border-sky-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between shadow-lg">
          <div className="flex items-center mb-4 sm:mb-0">
            <Clock className="text-sky-400 mr-3.5 hidden sm:block shrink-0" size={26} />
            <div>
              <h3 className="font-bold text-white text-base">Assinatura Ativa</h3>
              <p className="text-xs sm:text-sm text-sky-200 mt-0.5">
                Sua mensalidade vence em: <span className="font-bold text-white">{formatDate(userProfile.subscriptionExpiresAt)}</span>
              </p>
            </div>
          </div>
          {isExpiringSoon() && (
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-4 sm:mt-0">
              <button
                onClick={handlePay}
                className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl shadow-md transition-all flex items-center justify-center whitespace-nowrap cursor-pointer"
              >
                <CreditCard size={18} className="mr-2" />
                Renovar Assinatura
              </button>
            </div>
          )}
        </div>
      )}

      {isTrial && (
        <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border border-amber-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between shadow-lg">
          <div className="flex items-center mb-4 sm:mb-0">
            <Clock className="text-amber-400 mr-3.5 hidden sm:block shrink-0" size={26} />
            <div>
              <h3 className="font-bold text-amber-200 text-base">Período de Teste (7 dias)</h3>
              <p className="text-xs sm:text-sm text-amber-300/80 mt-0.5">
                Evite a interrupção do serviço. Assine agora e garanta acesso contínuo.
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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Dashboard</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Visão geral do gerenciamento e atendimentos</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchStats(true)}
            disabled={isRefreshing}
            className="flex items-center justify-center p-2.5 bg-slate-900 hover:bg-slate-800 rounded-xl shadow-sm border border-slate-800 text-slate-300 hover:text-white transition-all text-xs sm:text-sm font-semibold gap-2 px-3.5 disabled:opacity-60 cursor-pointer"
            title="Atualizar dados do Dashboard"
          >
            <RefreshCw size={17} className={`text-sky-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
          </button>
          <button 
            onClick={() => setShowValues(!showValues)}
            className="flex items-center justify-center p-2.5 bg-slate-900 hover:bg-slate-800 rounded-xl shadow-sm border border-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer"
            title={showValues ? "Ocultar valores" : "Mostrar valores"}
          >
            {showValues ? <EyeOff size={19} className="text-slate-400" /> : <Eye size={19} className="text-sky-400" />}
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl shadow-xl p-5 sm:p-6 flex items-center justify-between transition-all duration-200">
              <div className="space-y-1">
                <p className="text-xs sm:text-sm text-slate-400 font-medium">{stat.title}</p>
                <p className="text-xl sm:text-2xl font-black text-white tracking-tight">{stat.value}</p>
              </div>
              <div className={`p-3.5 rounded-2xl ${stat.bgBadge} shadow-sm shrink-0 ml-3`}>
                <Icon size={24} />
              </div>
            </div>
          );
        })}
      </div>

      {clientsWithoutVisits.length > 0 && (
        <div className="bg-red-950/20 border-l-4 border-red-500 border border-red-900/30 p-5 sm:p-6 rounded-r-2xl shadow-xl">
          <div className="flex items-center mb-2">
            <AlertCircle className="text-red-400 mr-2.5 shrink-0" size={22} />
            <h2 className="text-lg sm:text-xl font-bold text-red-200">Alerta de Visitas Pendentes</h2>
          </div>
          <p className="text-xs sm:text-sm text-red-300/80 font-medium mb-4">
            Você possui {clientsWithoutVisits.length} clientes que não receberam visitas nos últimos 7 dias.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {clientsWithoutVisits.slice(0, 9).map(client => (
              <div key={client.id} className="bg-slate-900/90 border border-red-900/40 p-3.5 rounded-xl shadow-sm flex flex-col justify-center">
                <span className="font-bold text-white text-sm truncate">{client.name}</span>
                <span className="text-xs text-slate-400 mt-0.5">
                  {client.lastVisitDate ? `Última visita: ${new Date(client.lastVisitDate).toLocaleDateString('pt-BR')}` : 'Nenhuma visita registrada'}
                </span>
              </div>
            ))}
          </div>
          {clientsWithoutVisits.length > 9 && (
            <p className="text-xs text-red-400 mt-3 font-semibold italic">... e mais {clientsWithoutVisits.length - 9} clientes.</p>
          )}
        </div>
      )}
    </div>
  );
}
