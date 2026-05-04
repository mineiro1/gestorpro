import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Users, DollarSign, AlertCircle, CheckCircle, Clock, CreditCard } from 'lucide-react';
import EmployeeMap from '../components/EmployeeMap';

interface DashboardStats {
  totalClients: number;
  totalToReceive: number;
  delayedClients: number;
  receivedThisMonth: number;
  pendingThisMonth: number;
}

export default function Dashboard() {
  const { userProfile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
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
        let clientsQuery = query(collection(db, 'clients'), where('adminId', '==', adminId));
        if (userProfile.role === 'employee') {
          clientsQuery = query(collection(db, 'clients'), where('adminId', '==', adminId), where('employeeId', '==', userProfile.uid));
        }
        const clientsSnap = await getDocs(clientsQuery);
        
        let totalClients = 0;
        let totalToReceive = 0;
        let actualDelayedClients = 0;
        let pendingThisMonth = 0;
        const clientsNoVisit: any[] = [];

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 7);

        clientsSnap.docs.forEach(doc => {
          const data = doc.data();
          totalClients++;
          totalToReceive += data.monthlyFee || 0;

          if (data.dueDate) {
            const [year, month, day] = data.dueDate.split('-').map(Number);
            const due = new Date(year, month - 1, day);
            due.setHours(0, 0, 0, 0);

            if (due.getTime() < today.getTime()) {
              actualDelayedClients++;
            }

            // If due date is in the current month or earlier, it's pending
            if (due.getFullYear() < currentYear || (due.getFullYear() === currentYear && due.getMonth() + 1 <= currentMonth)) {
              pendingThisMonth += data.monthlyFee || 0;
            }
          }

          // Check if no visit in the last 7 days
          if (data.lastVisitDate) {
            const lastVisit = data.lastVisitDate.toDate();
            if (lastVisit < sevenDaysAgo) {
              clientsNoVisit.push({ id: doc.id, ...data });
            }
          } else {
            // Client has never been visited (or created before feature added)
            clientsNoVisit.push({ id: doc.id, ...data });
          }
        });

        // Fetch One-Off Jobs (Avulsos)
        let receivedThisMonth = 0;
        const currentMonthString = `${currentYear}-${currentMonth.toString().padStart(2, '0')}`;
        let jobsQuery = query(collection(db, 'oneoffjobs'), where('adminId', '==', adminId));
        if (userProfile.role === 'employee') {
          jobsQuery = query(collection(db, 'oneoffjobs'), where('adminId', '==', adminId), where('employeeId', '==', userProfile.uid));
        }
        const jobsSnap = await getDocs(jobsQuery);

        jobsSnap.docs.forEach(doc => {
          const data = doc.data();
          if (data.status === 'pending' || data.status === 'needs_return') {
            totalToReceive += data.price || 0;
          } else if (data.status === 'completed') {
            if (data.date && data.date.startsWith(currentMonthString)) {
              receivedThisMonth += data.price || 0;
            } else if (data.updatedAt) {
              // Fallback to updatedAt if date format doesn't match
              const dateObj = data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt);
              if (dateObj.getMonth() + 1 === currentMonth && dateObj.getFullYear() === currentYear) {
                receivedThisMonth += data.price || 0;
              }
            }
          }
        });

        // Fetch Payments for current month (Admins only for now or we must adjust rules)
        
        if (userProfile.role === 'admin' || userProfile.role === 'manager') {
          const paymentsQuery = query(
            collection(db, 'payments'),
            where('adminId', '==', adminId),
            where('month', '==', currentMonth),
            where('year', '==', currentYear)
          );
          const paymentsSnap = await getDocs(paymentsQuery);
          
          paymentsSnap.docs.forEach(doc => {
            const data = doc.data();
            receivedThisMonth += data.amount || 0;
          });
        }

        setStats({
          totalClients,
          totalToReceive,
          delayedClients: actualDelayedClients,
          receivedThisMonth,
          pendingThisMonth,
        });

        setClientsWithoutVisits(clientsNoVisit);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'dashboard_stats');
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
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Falha ao gerar link');
      }
      const data = await response.json();
      if (data.init_point) window.location.href = data.init_point;
    } catch (err: any) {
      console.error(err);
      alert('Houve um problema ao processar o pagamento: ' + err.message + '. Verifique com o SuperAdmin.');
    }
  };

  const statCards = [
    { title: 'Total de Clientes', value: stats.totalClients, icon: Users, color: 'bg-blue-500' },
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
              <p className="text-sm text-yellow-700">Evite a interrupção do serviço. Assine agora e garanta acesso contínuo.</p>
            </div>
          </div>
          <button
            onClick={handlePay}
            className="w-full sm:w-auto px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center whitespace-nowrap"
          >
            <CreditCard size={18} className="mr-2" />
            Assinar Agora
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
                  {client.lastVisitDate ? `Última visita: ${client.lastVisitDate.toDate().toLocaleDateString('pt-BR')}` : 'Nenhuma visita registrada'}
                </span>
              </div>
            ))}
          </div>
          {clientsWithoutVisits.length > 9 && (
            <p className="text-sm text-red-600 mt-4 font-semibold italic">... e mais {clientsWithoutVisits.length - 9} clientes.</p>
          )}
        </div>
      )}

      {(userProfile?.role === 'admin' || userProfile?.role === 'manager') && (
        <EmployeeMap />
      )}
    </div>
  );
}
