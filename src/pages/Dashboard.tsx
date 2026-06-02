import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Users, DollarSign, AlertCircle, CheckCircle, Clock, CreditCard, MessageCircle } from 'lucide-react';

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

  useEffect(() => {
    if (!userProfile?.uid) return;

    const fetchStats = async () => {
      try {
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        const currentDay = currentDate.getDate();

        const adminId = userProfile.role === 'admin' ? userProfile.uid : userProfile.adminId;
        // Fetch Clients
        let clientsSnap;
        if (userProfile.role === 'employee') {
          clientsSnap = await supabase.from('clients').select('*').eq('admin_id', adminId).eq('employee_id', userProfile.uid);
        } else {
          clientsSnap = await supabase.from('clients').select('*').eq('admin_id', adminId);
        }
        
        let totalClients = 0;
        let inactiveClients = 0;
        let totalToReceive = 0;
        let actualDelayedClients = 0;
        let pendingThisMonth = 0;
        const clientsNoVisit: any[] = [];
        const totalActiveClientsList: any[] = [];

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 7);

        if (clientsSnap.data) {
          clientsSnap.data.forEach((data: any) => {
            if (data.active === false) {
               inactiveClients++;
               
               let skipCalculations = true;
               if (data.inactivated_at) {
                 const inactiveDate = new Date(data.inactivated_at);
                 if (inactiveDate.getMonth() + 1 === currentMonth && inactiveDate.getFullYear() === currentYear) {
                    // Include in current month's revenue calculations if inactivated this month
                    skipCalculations = false;
                 }
               }
               
               if (skipCalculations) {
                  return; // Skip calculating revenue and visits for clients inactive prior to this month
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
        let receivedThisMonth = 0;
        const currentMonthString = `${currentYear}-${currentMonth.toString().padStart(2, '0')}`;
        let jobsSnap;
        if (userProfile.role === 'employee') {
          jobsSnap = await supabase.from('oneoffjobs').select('*').eq('admin_id', adminId).eq('employee_id', userProfile.uid);
        } else {
          jobsSnap = await supabase.from('oneoffjobs').select('*').eq('admin_id', adminId);
        }

        if (jobsSnap.data) {
          jobsSnap.data.forEach((data: any) => {
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

        // Fetch Payments for current month (Admins only for now or we must adjust rules)
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
                  // Add extra_amount back to totalToReceive since it was cleared from the client profile upon payment
                  totalToReceive += Number(data.extra_amount || 0);
                }
              }
            });
          }
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
      }
    };

    fetchStats();
  }, [userProfile]);

  if (loading) {
    return <div className="flex justify-center items-center h-64">Carregando métricas...</div>;
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const isTrial = userProfile?.role === 'admin' && userProfile?.subscriptionStatus === 'trial';

  const handlePay = async () => {
    try {
      let price = 99.90;
      // You may use settings table here
      const response = await fetch('/api/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Assinatura Mensal - GestãoPro',
          price: price,
          quantity: 1,
          adminId: userProfile?.adminId,
          email: userProfile?.email || 'admin@gestaopro.com'
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
    { title: 'Total de Clientes (Ativos)', value: stats.totalClients, icon: Users, color: 'bg-blue-500' },
    { title: 'Clientes Inativos', value: stats.inactiveClients, icon: Users, color: 'bg-gray-400' },
    { title: 'Valor Total a Receber', value: formatCurrency(stats.totalToReceive), icon: DollarSign, color: 'bg-primary' },
    { title: 'Clientes Atrasados', value: stats.delayedClients, icon: AlertCircle, color: 'bg-red-500' },
    { title: 'Recebido no Mês', value: formatCurrency(stats.receivedThisMonth), icon: CheckCircle, color: 'bg-green-500' },
    { title: 'Pendente no Mês', value: formatCurrency(stats.pendingThisMonth), icon: Clock, color: 'bg-secondary-dark' },
  ];

  return (
    <div>
      {isTrial && (
        <div className="bg-gradient-to-r from-yellow-100 to-yellow-50 border border-yellow-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between shadow-sm mb-6">
          <div className="flex items-center mb-4 sm:mb-0">
            <Clock className="text-yellow-600 mr-3 hidden sm:block" size={24} />
            <div>
              <h3 className="font-bold text-yellow-800">Você está no período de teste (7 dias)</h3>
              <p className="text-sm text-yellow-700">
                Evite a interrupção do serviço. Assine agora e garanta acesso contínuo. Clique no botao contato.
              </p>
            </div>
          </div>
          <button
            onClick={() => window.open('https://wa.me/5567992499469', '_blank')}
            className="w-full sm:w-auto px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center whitespace-nowrap"
          >
            <MessageCircle size={18} className="mr-2" />
            Contato
          </button>
        </div>
      )}

      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-xl shadow-sm p-6 flex items-center">
              <div className={`p-4 rounded-full ${stat.color} text-white mr-4`}>
                <Icon size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {clientsWithoutVisits.length > 0 && (
        <div className="mt-8 bg-red-50 border-l-4 border-red-500 p-6 rounded-r-xl shadow-sm">
          <div className="flex items-center mb-2">
            <AlertCircle className="text-red-500 mr-2" size={24} />
            <h2 className="text-xl font-bold text-red-800">Alerta de Visitas Pendentes</h2>
          </div>
          <p className="text-red-700 font-medium mb-4">
            Você possui {clientsWithoutVisits.length} clientes que não receberam visitas nos últimos 7 dias.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {clientsWithoutVisits.slice(0, 9).map(client => (
              <div key={client.id} className="bg-white p-3 rounded shadow-sm border border-red-100 flex flex-col justify-center">
                <span className="font-bold text-gray-800">{client.name}</span>
                <span className="text-sm text-gray-500">
                  {client.lastVisitDate ? `Última visita: ${new Date(client.lastVisitDate).toLocaleDateString('pt-BR')}` : 'Nenhuma visita registrada'}
                </span>
              </div>
            ))}
          </div>
          {clientsWithoutVisits.length > 9 && (
            <p className="text-sm text-red-600 mt-4 font-semibold italic">... e mais {clientsWithoutVisits.length - 9} clientes.</p>
          )}
        </div>
      )}
    </div>
  );
}
