import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { MessageCircle, AlertCircle, Clock, History, Settings, X, Play, Calendar, CheckCircle, XCircle } from 'lucide-react';

interface ClientBilling {
  id: string;
  name: string;
  phone: string;
  monthlyFee: number;
  dueDate: string;
  status: 'delayed' | 'upcoming' | 'today';
  extraAmount?: number;
  extraReason?: string;
}

export default function Billing() {
  const { userProfile, isAdmin, isManager } = useAuth();
  const [delayedClients, setDelayedClients] = useState<ClientBilling[]>([]);
  const [todayClients, setTodayClients] = useState<ClientBilling[]>([]);
  const [upcomingClients, setUpcomingClients] = useState<ClientBilling[]>([]);
  const [allClients, setAllClients] = useState<ClientBilling[]>([]);
  const [loading, setLoading] = useState(true);

  // Payment History State
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientPayments, setClientPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'delayed' | 'today' | 'upcoming'>('all');

  // WhatsApp Settings State
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sendingBatch, setSendingBatch] = useState(false);
  const [sendingProgress, setSendingProgress] = useState({ current: 0, total: 0 });
  const [sentClients, setSentClients] = useState<Record<string, 'success'|'error'>>({});
  const [waSettings, setWaSettings] = useState({
    reminderDays: 3,
    reminderMessage: 'Olá {nome}, tudo bem? Passando para lembrar que sua mensalidade no valor de R$ {valor} vence no dia {vencimento}.',
    delayedMessage: 'Olá {nome}, tudo bem? Consta em nosso sistema que a sua mensalidade do dia {vencimento} no valor de R$ {valor} está pendente. Poderia verificá-la, por favor?',
    autoScheduleTime: '09:00',
    useEvolutionApi: false,
    evolutionApiUrl: '',
    evolutionApiKey: '',
    evolutionInstanceName: '',
    useMetaApi: false,
    metaToken: '',
    metaPhoneNumberId: ''
  });

  useEffect(() => {
    if (userProfile?.whatsappSettings) {
      setWaSettings({
        reminderDays: userProfile.whatsappSettings.reminderDays ?? 3,
        reminderMessage: userProfile.whatsappSettings.reminderMessage || 'Olá {nome}, tudo bem? Passando para lembrar que sua mensalidade no valor de R$ {valor} vence no dia {vencimento}.',
        delayedMessage: userProfile.whatsappSettings.delayedMessage || 'Olá {nome}, tudo bem? Consta em nosso sistema que a sua mensalidade do dia {vencimento} no valor de R$ {valor} está pendente. Poderia verificá-la, por favor?',
        autoScheduleTime: userProfile.whatsappSettings.autoScheduleTime || '09:00',
        useEvolutionApi: userProfile.whatsappSettings.useEvolutionApi || false,
        evolutionApiUrl: userProfile.whatsappSettings.evolutionApiUrl || '',
        evolutionApiKey: userProfile.whatsappSettings.evolutionApiKey || '',
        evolutionInstanceName: userProfile.whatsappSettings.evolutionInstanceName || '',
        useMetaApi: userProfile.whatsappSettings.useMetaApi || false,
        metaToken: userProfile.whatsappSettings.metaToken || '',
        metaPhoneNumberId: userProfile.whatsappSettings.metaPhoneNumberId || ''
      });
    }
  }, [userProfile]);

  const saveSettings = async () => {
    if (!userProfile?.uid) return;
    setSavingSettings(true);
    try {
      await updateDoc(doc(db, 'users', userProfile.uid), {
        whatsappSettings: waSettings
      });
      setSettingsModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userProfile.uid}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const processMessageTemplate = (template: string, client: ClientBilling) => {
    const formattedDate = new Date(client.dueDate + 'T12:00:00').toLocaleDateString('pt-BR');
    const totalAmount = client.monthlyFee + (client.extraAmount || 0);

    let message = template
      .replace(/{nome}/g, client.name)
      .replace(/{valor}/g, totalAmount.toFixed(2).replace('.', ','))
      .replace(/{vencimento}/g, formattedDate);

    if (client.extraAmount && client.extraAmount > 0) {
      message += `\n\n*Acréscimo (já incluso no valor total):* R$ ${client.extraAmount.toFixed(2).replace('.', ',')}\n*Motivo:* ${client.extraReason || 'Não especificado'}`;
    }

    return message;
  };

  const sendEvolutionMessage = async (client: ClientBilling, text: string) => {
    if (!waSettings.evolutionApiUrl || !waSettings.evolutionApiKey || !waSettings.evolutionInstanceName) {
      throw new Error("Credenciais da Evolution API incompletas nas configurações.");
    }
    
    const cleanPhone = client.phone.replace(/\D/g, '');
    const number = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    
    // Remove trailing slash if present
    const baseUrl = waSettings.evolutionApiUrl.replace(/\/$/, '');
    const url = `${baseUrl}/message/sendText/${waSettings.evolutionInstanceName}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': waSettings.evolutionApiKey
      },
      body: JSON.stringify({
        number: number,
        text: text,
        textMessage: {
          text: text
        },
        options: {
          delay: 1000,
          presence: "composing"
        }
      })
    });
    
    if (!response.ok) {
      let errDesc = 'Desconhecido';
      try {
        const errData = await response.json();
        errDesc = JSON.stringify(errData);
      } catch(e) {}
      throw new Error(`Erro na Evolution API (${response.status}): ${errDesc}`);
    }
    return await response.json();
  };

  const sendMetaMessage = async (client: ClientBilling, text: string) => {
    if (!waSettings.metaToken || !waSettings.metaPhoneNumberId) {
      throw new Error("Credenciais da API Oficial (Meta) incompletas nas configurações.");
    }
    
    const cleanPhone = client.phone.replace(/\D/g, '');
    const number = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    
    const url = `https://graph.facebook.com/v19.0/${waSettings.metaPhoneNumberId}/messages`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${waSettings.metaToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: number,
        type: "text",
        text: { 
          preview_url: false,
          body: text
        }
      })
    });
    
    if (!response.ok) {
      let errDesc = 'Desconhecido';
      try {
        const errData = await response.json();
        errDesc = errData.error?.message || JSON.stringify(errData);
      } catch(e) {}
      throw new Error(`Erro na API Oficial Meta (${response.status}): ${errDesc}`);
    }
    return await response.json();
  };

  useEffect(() => {
    if (!userProfile?.uid) return;

    const calculateNextDueDateHelper = (currentDateStr: string, baseDueDay: number) => {
      const [yearStr, monthStr] = currentDateStr.split('-');
      let year = parseInt(yearStr, 10);
      let month = parseInt(monthStr, 10);

      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }

      const lastDayOfNewMonth = new Date(year, month, 0).getDate();
      const nextDay = Math.min(baseDueDay, lastDayOfNewMonth);

      const formattedMonth = month.toString().padStart(2, '0');
      const formattedDay = nextDay.toString().padStart(2, '0');

      return `${year}-${formattedMonth}-${formattedDay}`;
    };

    const fetchBillingData = async () => {
      try {
        const adminId = userProfile.role === 'admin' ? userProfile.uid : userProfile.adminId;
        // Fetch Clients
        let clientsQuery = query(collection(db, 'clients'), where('adminId', '==', adminId));
        if (userProfile.role === 'employee') {
          clientsQuery = query(collection(db, 'clients'), where('adminId', '==', adminId), where('employeeId', '==', userProfile.uid));
        }
        const clientsSnap = await getDocs(clientsQuery);
        
        const delayed: ClientBilling[] = [];
        const todayDues: ClientBilling[] = [];
        const upcoming: ClientBilling[] = [];
        const all: ClientBilling[] = [];

        // Today at midnight for accurate date comparison
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        clientsSnap.docs.forEach(doc => {
          const data = doc.data();
          const clientId = doc.id;

          if (!data.dueDate) return;

          all.push({
            id: clientId,
            name: data.name,
            phone: data.phone,
            monthlyFee: data.monthlyFee,
            dueDate: data.dueDate,
            status: 'upcoming',
            extraAmount: data.extraAmount,
            extraReason: data.extraReason
          });

          // Generate multiple missing installments logic
          const baseDay = data.baseDueDay || parseInt(data.dueDate.split('-')[2], 10) || 1;
          let currentDueDateStr = data.dueDate;
          let iterations = 0;
          const maxIterations = 24; // limit to prevent infinite loops (2 years max)

          // Only the CURRENT / FIRST due iteration should get the extraAmount, 
          // because it resets after payment. If it's already delayed, they owe it now.
          let isFirstIteration = true;

          while (iterations < maxIterations) {
            const [year, month, day] = currentDueDateStr.split('-').map(Number);
            const due = new Date(year, month - 1, day);
            due.setHours(0, 0, 0, 0);

            const diffTime = due.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            const clientBillingId = `${clientId}-${currentDueDateStr}`;
            const clientBilling: ClientBilling = {
              id: clientBillingId,
              name: data.name,
              phone: data.phone,
              monthlyFee: data.monthlyFee,
              dueDate: currentDueDateStr,
              status: 'upcoming',
              extraAmount: isFirstIteration ? data.extraAmount : undefined,
              extraReason: isFirstIteration ? data.extraReason : undefined
            };
            isFirstIteration = false;

            if (diffDays < 0) {
              clientBilling.status = 'delayed';
              delayed.push(clientBilling);
              // Calculate next month to see if that is ALSO missed/upcoming
              currentDueDateStr = calculateNextDueDateHelper(currentDueDateStr, baseDay);
            } else if (diffDays === 0) {
              clientBilling.status = 'today';
              todayDues.push(clientBilling);
              break;
            } else if (diffDays > 0 && diffDays <= (userProfile.whatsappSettings?.reminderDays ?? 3)) {
              clientBilling.status = 'upcoming';
              upcoming.push(clientBilling);
              break; // No need to check the month after the upcoming one, as it will be > reminderDays
            } else {
              // Current due date is beyond the reminder window, stop checking
              break;
            }

            iterations++;
          }
        });

        // Sort by due date
        delayed.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        todayDues.sort((a, b) => a.name.localeCompare(b.name));
        upcoming.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        all.sort((a, b) => a.name.localeCompare(b.name));

        setDelayedClients(delayed);
        setTodayClients(todayDues);
        setUpcomingClients(upcoming);
        setAllClients(all);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'billing_data');
      } finally {
        setLoading(false);
      }
    };

    fetchBillingData();
  }, [userProfile]);

  useEffect(() => {
    if (!selectedClientId || !userProfile?.uid) {
      setClientPayments([]);
      return;
    }

    const fetchPayments = async () => {
      setLoadingPayments(true);
      try {
        const adminId = userProfile.role === 'admin' ? userProfile.uid : userProfile.adminId;
        const paymentsQuery = query(
          collection(db, 'payments'),
          where('adminId', '==', adminId),
          where('clientId', '==', selectedClientId)
        );
        const paymentsSnap = await getDocs(paymentsQuery);
        
        const paymentsData = paymentsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Sort by date descending (newest first)
        paymentsData.sort((a: any, b: any) => {
          const dateA = a.date?.toMillis() || 0;
          const dateB = b.date?.toMillis() || 0;
          return dateB - dateA;
        });

        setClientPayments(paymentsData);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'payments');
      } finally {
        setLoadingPayments(false);
      }
    };

    fetchPayments();
  }, [selectedClientId, userProfile]);

  const handleSendWhatsApp = async (client: ClientBilling) => {
    if (!client.phone) {
      alert(`O cliente ${client.name} não possui telefone cadastrado.`);
      return;
    }

    const cleanPhone = client.phone.replace(/\D/g, '');
    const isDelayed = client.status === 'delayed';
    
    const message = isDelayed
      ? processMessageTemplate(waSettings.delayedMessage, client)
      : processMessageTemplate(waSettings.reminderMessage, client);

    if (waSettings.useMetaApi) {
      try {
        await sendMetaMessage(client, message);
        setSentClients(prev => ({ ...prev, [client.id]: 'success' }));
        alert(`Mensagem enviada com sucesso para ${client.name} (via WhatsApp Oficial Meta)!`);
      } catch (error: any) {
        setSentClients(prev => ({ ...prev, [client.id]: 'error' }));
        console.error(error);
        alert(`Falha ao enviar via API Oficial para ${client.name}:\n\n${error.message}\n\nLembre-se: Para enviar textos livres, o cliente precisa ter te enviado uma mensagem nas últimas 24 horas.`);
      }
    } else if (waSettings.useEvolutionApi) {
      try {
        await sendEvolutionMessage(client, message);
        setSentClients(prev => ({ ...prev, [client.id]: 'success' }));
        alert(`Mensagem enviada com sucesso para ${client.name}!`);
      } catch (error: any) {
        setSentClients(prev => ({ ...prev, [client.id]: 'error' }));
        console.error(error);
        alert(`Falha ao enviar mensagem para ${client.name}: ${error.message}`);
      }
    } else {
      import('../lib/whatsapp').then(({ openWhatsApp }) => {
        openWhatsApp(`55${cleanPhone}`, message);
      });
    }
  };

  const processQueue = async (clients: ClientBilling[], silent = false) => {
    if (waSettings.useMetaApi || waSettings.useEvolutionApi) {
      if (waSettings.useEvolutionApi && (!waSettings.evolutionApiUrl || !waSettings.evolutionApiKey || !waSettings.evolutionInstanceName)) {
        if(!silent) alert("Credenciais da Evolution API incompletas nas configurações.");
        return;
      }
      if (waSettings.useMetaApi && (!waSettings.metaToken || !waSettings.metaPhoneNumberId)) {
        if(!silent) alert("Credenciais da API Oficial (Meta) incompletas nas configurações.");
        return;
      }

      const apiName = waSettings.useMetaApi ? "API Oficial do WhatsApp (Meta)" : "Evolution API";
      if (!silent && !confirm(`Deseja enviar ${clients.length} mensagens automaticamente via ${apiName}?`)) return;
      
      setSendingBatch(true);
      setSendingProgress({ current: 0, total: clients.length });
      let successCount = 0;
      let errorCount = 0;
      let lastError = '';
      
      for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        setSendingProgress({ current: i + 1, total: clients.length });
        
        if (!client.phone) {
          errorCount++;
          lastError = 'Telefone ausente';
          setSentClients(prev => ({ ...prev, [client.id]: 'error' }));
          continue;
        }

        const isDelayed = client.status === 'delayed';
        const message = isDelayed
          ? processMessageTemplate(waSettings.delayedMessage, client)
          : processMessageTemplate(waSettings.reminderMessage, client);
          
        try {
          if (waSettings.useMetaApi) {
            await sendMetaMessage(client, message);
          } else {
            await sendEvolutionMessage(client, message);
          }
          successCount++;
          setSentClients(prev => ({ ...prev, [client.id]: 'success' }));
        } catch (e: any) {
          console.error("Erro ao enviar para", client.name, e);
          errorCount++;
          lastError = e?.message || 'Erro desconhecido';
          setSentClients(prev => ({ ...prev, [client.id]: 'error' }));
        }
        
        // Sleep to avoid rate limiting / block
        if (i < clients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      setSendingBatch(false);
      setSendingProgress({ current: 0, total: 0 });
      let alertMsg = `Envio via ${apiName} concluído!\nSucesso: ${successCount}\nErros: ${errorCount}`;
      if (errorCount > 0) {
        alertMsg += `\n\nÚltimo erro: ${lastError}`;
      }
      if(!silent) alert(alertMsg);
    } else {
      if(!silent) alert("Como o WhatsApp Web bloqueia a abertura não autorizada de várias abas, você abrirá a primeira mensagem agora. Após o envio, retorne e clique diretamente no botão 'Lembrar' ou 'Cobrar' do próximo cliente.");
      if(clients.length > 0) {
        handleSendWhatsApp(clients[0]);
      }
    }
  };

  useEffect(() => {
    if (!waSettings.useEvolutionApi && !waSettings.useMetaApi) return;

    const interval = setInterval(() => {
      const now = new Date();
      const currentHourMin = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      if (currentHourMin === waSettings.autoScheduleTime) {
        const lastSentDate = localStorage.getItem('lastAutoSendDate');
        const todayStr = now.toLocaleDateString('pt-BR');

        if (lastSentDate !== todayStr && !sendingBatch) {
          // Process current queue silently
          const list = [...delayedClients, ...todayClients, ...upcomingClients]
            .sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
          
          if (list.length > 0) {
            localStorage.setItem('lastAutoSendDate', todayStr);
            console.log("Auto-schedule init...");
            processQueue(list, true);
          }
        }
      }
    }, 60000); // Check every minute // Remove the alert on automatic

    return () => clearInterval(interval);
  }, [waSettings, delayedClients, todayClients, upcomingClients, sendingBatch]);


  if (loading) {
    return <div className="flex justify-center items-center h-64">Carregando notificações...</div>;
  }

  const getBillingList = () => {
    switch (activeTab) {
      case 'delayed': return delayedClients;
      case 'today': return todayClients;
      case 'upcoming': return upcomingClients;
      default: return [...delayedClients, ...todayClients, ...upcomingClients].sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    }
  };

  const currentList = getBillingList();

  const getStatusBadge = (status: string, dueDateStr: string) => {
    const formattedDate = new Date(dueDateStr + 'T12:00:00').toLocaleDateString('pt-BR');
    if (status === 'delayed') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
          <AlertCircle size={14} className="mr-1" />
          Atrasado ({formattedDate})
        </span>
      );
    }
    if (status === 'today') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
          <Calendar size={14} className="mr-1" />
          Vence Hoje
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
        <Clock size={14} className="mr-1" />
        Vence em {formattedDate}
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Central de Cobranças e Notificações</h1>
          <p className="text-gray-600 mt-1">Gerencie os vencimentos e envie lembretes via WhatsApp.</p>
        </div>
        <div className="flex gap-3 mt-4 sm:mt-0">
          {isAdmin && (
            <button
              onClick={() => setSettingsModalOpen(true)}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center font-medium"
            >
              <Settings size={20} className="mr-2" />
              Configurar Mensagens
            </button>
          )}
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex overflow-x-auto space-x-2 mb-6 pb-2 hide-scrollbar">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-5 py-2.5 rounded-xl font-semibold whitespace-nowrap transition-colors flex items-center ${activeTab === 'all' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
        >
          Todos Pendentes
          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeTab === 'all' ? 'bg-gray-600 text-white' : 'bg-gray-100'}`}>
            {delayedClients.length + todayClients.length + upcomingClients.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('delayed')}
          className={`px-5 py-2.5 rounded-xl font-semibold whitespace-nowrap transition-colors flex items-center ${activeTab === 'delayed' ? 'bg-red-50 border-2 border-red-200 text-red-700' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
        >
          <AlertCircle size={18} className="mr-2" />
          Atrasados
          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === 'delayed' ? 'bg-red-200 text-red-800' : 'bg-gray-100'}`}>
            {delayedClients.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('today')}
          className={`px-5 py-2.5 rounded-xl font-semibold whitespace-nowrap transition-colors flex items-center ${activeTab === 'today' ? 'bg-blue-50 border-2 border-blue-200 text-blue-700' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
        >
          <Calendar size={18} className="mr-2" />
          Hoje
          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === 'today' ? 'bg-blue-200 text-blue-800' : 'bg-gray-100'}`}>
            {todayClients.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`px-5 py-2.5 rounded-xl font-semibold whitespace-nowrap transition-colors flex items-center ${activeTab === 'upcoming' ? 'bg-yellow-50 border-2 border-yellow-200 text-yellow-700' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
        >
          <Clock size={18} className="mr-2" />
          Em Breve
          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === 'upcoming' ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-100'}`}>
            {upcomingClients.length}
          </span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Bulk Action Header */}
        {(isAdmin || isManager) && ((activeTab === 'delayed' && delayedClients.length > 0) || 
         (activeTab === 'today' && todayClients.length > 0) || 
         (activeTab === 'upcoming' && upcomingClients.length > 0)) ? (
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">Ações em Lote:</span>
            <button 
              onClick={() => processQueue(getBillingList())} 
              disabled={sendingBatch}
              className={`flex items-center px-4 py-2 rounded-lg font-medium text-sm transition-colors text-white ${
                sendingBatch ? 'bg-gray-400 cursor-not-allowed' :
                activeTab === 'delayed' ? 'bg-red-600 hover:bg-red-700' : 
                activeTab === 'today' ? 'bg-blue-600 hover:bg-blue-700' : 
                'bg-yellow-500 hover:bg-yellow-600'
              }`}
            >
              <Play size={16} className="mr-2" />
              {sendingBatch ? `Enviando... (${sendingProgress.current}/${sendingProgress.total})` : `Notificar Fila Inteira (${currentList.length})`}
            </button>
          </div>
        ) : null}

        <div className="p-0">
          {currentList.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="bg-gray-50 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">Nenhum cliente para esta categoria.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {currentList.map(client => (
                <li key={client.id} className="p-6 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-bold text-gray-900 text-lg">{client.name}</h3>
                      {getStatusBadge(client.status, client.dueDate)}
                      {sentClients[client.id] === 'success' && (
                        <span className="flex items-center text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full">
                          <CheckCircle size={14} className="mr-1" /> Enviado
                        </span>
                      )}
                      {sentClients[client.id] === 'error' && (
                        <span className="flex items-center text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-full">
                          <XCircle size={14} className="mr-1" /> Falha
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-sm text-gray-500">
                      <span className="font-semibold text-gray-700 font-mono text-base tracking-tight">
                        R$ {(client.monthlyFee + (client.extraAmount || 0)).toFixed(2)}
                      </span>
                      {client.extraAmount && client.extraAmount > 0 && (
                        <span className="text-xs text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full font-medium">
                          + R$ {client.extraAmount.toFixed(2)} Extra
                        </span>
                      )}
                      <span>{client.phone}</span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center">
                    {(isAdmin || isManager) && (
                      <button
                        onClick={() => handleSendWhatsApp(client)}
                        className={`flex items-center px-4 py-2 rounded-lg transition-colors font-semibold shadow-sm border ${
                          client.status === 'delayed' 
                            ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' 
                            : 'bg-[#25D366] text-white border-transparent hover:bg-[#20b858]'
                        }`}
                      >
                        <MessageCircle size={18} className="mr-2" />
                        {client.status === 'delayed' ? 'Cobrar agora' : 'Mandar Lembrete'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Histórico de Pagamentos */}
      <div className="mt-8 bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center">
          <History size={20} className="text-gray-500 mr-2" />
          <div>
            <h2 className="text-lg font-bold text-gray-800">Histórico de Pagamentos</h2>
            <p className="text-sm text-gray-500">Selecione um cliente para ver o histórico completo.</p>
          </div>
        </div>
        
        <div className="p-6">
          <div className="mb-6 max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-2">Selecione o Cliente</label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
            >
              <option value="">-- Selecione um cliente --</option>
              {allClients.map(client => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>

          {selectedClientId && (
            <div>
              {loadingPayments ? (
                <div className="text-gray-500 py-4 flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
                  Carregando histórico...
                </div>
              ) : clientPayments.length === 0 ? (
                <div className="text-gray-500 py-4 bg-gray-50 rounded-lg text-center border border-dashed border-gray-200">
                  Nenhum pagamento registrado para este cliente.
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-100 rounded-lg">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="p-4 font-semibold text-gray-600">Data do Pagamento</th>
                        <th className="p-4 font-semibold text-gray-600">Referência (Mês/Ano)</th>
                        <th className="p-4 font-semibold text-gray-600">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientPayments.map(payment => (
                        <tr key={payment.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="p-4 text-gray-800">
                            {payment.date ? new Date(payment.date.toMillis()).toLocaleDateString('pt-BR', {
                              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            }) : 'N/A'}
                          </td>
                          <td className="p-4 text-gray-600">
                            {(payment.refMonth || payment.month).toString().padStart(2, '0')}/{(payment.refYear || payment.year)}
                          </td>
                          <td className="p-4 text-green-600 font-semibold">
                            R$ {payment.amount?.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {settingsModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 shrink-0">
              <h3 className="text-xl font-bold text-gray-900">Configurações de WhatsApp</h3>
              <button onClick={() => setSettingsModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg text-sm text-blue-800 mb-4">
                <strong>Nota sobre Automação:</strong> O WhatsApp Web bloqueia o envio 100% automático para evitar spam. O sistema irá preencher rapidamente a mensagem em seu WhatsApp, operando de forma "semi-automática".
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Avisar quantos dias antes do vencimento?</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={waSettings.reminderDays}
                  onChange={e => setWaSettings({...waSettings, reminderDays: parseInt(e.target.value) || 3})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Horário de Verificação</label>
                <input
                  type="time"
                  value={waSettings.autoScheduleTime}
                  onChange={e => setWaSettings({...waSettings, autoScheduleTime: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mensagem - Pré venciamento <br/>
                  <span className="text-xs font-normal text-gray-500">Variáveis: {'{nome}'}, {'{valor}'}, {'{vencimento}'}</span>
                </label>
                <textarea
                  rows={3}
                  value={waSettings.reminderMessage}
                  onChange={e => setWaSettings({...waSettings, reminderMessage: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mensagem - Atrasados <br/>
                  <span className="text-xs font-normal text-gray-500">Variáveis: {'{nome}'}, {'{valor}'}, {'{vencimento}'}</span>
                </label>
                <textarea
                  rows={3}
                  value={waSettings.delayedMessage}
                  onChange={e => setWaSettings({...waSettings, delayedMessage: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none text-sm"
                />
              </div>

              {/* API Integration Settings */}
              <div className="pt-4 mt-6 border-t border-gray-100">
                <div className="mb-4">
                  <h4 className="font-bold text-gray-800">Modo de Envio de Mensagens</h4>
                  <p className="text-xs text-gray-500 mb-4">Escolha a tecnologia para enviar as mensagens.</p>
                  
                  <div className="flex flex-col space-y-3">
                    <label className="flex items-start space-x-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                      <input 
                        type="radio" 
                        name="whatsappProvider"
                        value="web"
                        className="mt-1"
                        checked={!waSettings.useEvolutionApi && !waSettings.useMetaApi}
                        onChange={() => setWaSettings({...waSettings, useEvolutionApi: false, useMetaApi: false})}
                      />
                      <div>
                        <span className="block font-semibold text-sm text-gray-800">WhatsApp Web (Padrão)</span>
                        <span className="block text-xs text-gray-500">Abre o WhatsApp no navegador. Gratuito, mas envio manual 1 por 1.</span>
                      </div>
                    </label>

                    <label className="flex items-start space-x-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                      <input 
                        type="radio" 
                        name="whatsappProvider"
                        value="evolution"
                        className="mt-1"
                        checked={waSettings.useEvolutionApi && !waSettings.useMetaApi}
                        onChange={() => setWaSettings({...waSettings, useEvolutionApi: true, useMetaApi: false})}
                      />
                      <div>
                        <span className="block font-semibold text-sm text-gray-800">Evolution API (Alternativo)</span>
                        <span className="block text-xs text-gray-500">Envio em background conectado ao seu celular via QR Code.</span>
                      </div>
                    </label>

                    <label className="flex items-start space-x-3 cursor-pointer p-3 rounded-lg border border-blue-200 bg-blue-50/50 hover:bg-blue-50 transition-colors">
                      <input 
                        type="radio" 
                        name="whatsappProvider"
                        value="meta"
                        className="mt-1"
                        checked={waSettings.useMetaApi}
                        onChange={() => setWaSettings({...waSettings, useEvolutionApi: false, useMetaApi: true})}
                      />
                      <div>
                        <span className="block font-semibold text-sm text-gray-800 text-blue-900">API Oficial Meta (Cloud API)</span>
                        <span className="block text-xs text-gray-600">Conexão oficial via painel Developers Facebook. Ultra seguro, sem risco de banimento.</span>
                      </div>
                    </label>
                  </div>
                </div>

                {waSettings.useEvolutionApi && !waSettings.useMetaApi && (
                  <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200 animate-fade-in">
                    <h5 className="text-sm font-bold text-gray-700">Credenciais Evolution API</h5>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">URL da API (HTTPS OBRIGATÓRIO)</label>
                      <input
                        type="url"
                        placeholder="https://sua-api.com"
                        value={waSettings.evolutionApiUrl}
                        onChange={e => setWaSettings({...waSettings, evolutionApiUrl: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Global API Key</label>
                      <input
                        type="password"
                        placeholder="Sua chave secreta"
                        value={waSettings.evolutionApiKey}
                        onChange={e => setWaSettings({...waSettings, evolutionApiKey: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nome da Instância</label>
                      <input
                        type="text"
                        placeholder="ex: WhatsAppPrincipal"
                        value={waSettings.evolutionInstanceName}
                        onChange={e => setWaSettings({...waSettings, evolutionInstanceName: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none text-sm"
                      />
                    </div>
                  </div>
                )}

                {waSettings.useMetaApi && (
                  <div className="space-y-4 bg-blue-50/50 p-4 rounded-lg border border-blue-100 animate-fade-in">
                    <h5 className="text-sm font-bold text-blue-900">Credenciais Meta Cloud API</h5>
                    <p className="text-xs text-blue-700 mb-2 font-medium">Aviso: Textos livres só chegam se o cliente acionou você nas últimas 24h. Use templates aprovados para o 1º contato (não incluso na demo de texto livre).</p>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Access Token (Temporário ou Permanente)</label>
                      <input
                        type="password"
                        placeholder="EAAIXXX..."
                        value={waSettings.metaToken}
                        onChange={e => setWaSettings({...waSettings, metaToken: e.target.value})}
                        className="w-full px-3 py-2 border border-blue-200 rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">ID do Número de Telefone (Phone Number ID)</label>
                      <input
                        type="text"
                        placeholder="Ex: 1045938493849"
                        value={waSettings.metaPhoneNumberId}
                        onChange={e => setWaSettings({...waSettings, metaPhoneNumberId: e.target.value})}
                        className="w-full px-3 py-2 border border-blue-200 rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end p-6 border-t border-gray-100 shrink-0 space-x-3 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setSettingsModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors bg-white border border-gray-200 shadow-sm"
                disabled={savingSettings}
              >
                Cancelar
              </button>
              <button
                onClick={saveSettings}
                disabled={savingSettings}
                className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-light transition-colors disabled:opacity-50 shadow-sm"
              >
                {savingSettings ? 'Salvando...' : 'Salvar Configurações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sending Batch Overlay */}
      {sendingBatch && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex flex-col items-center justify-center p-4">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary mb-4"></div>
          <p className="text-white text-xl font-bold">Enviando mensagens em background...</p>
          <p className="text-gray-300 mt-2 text-center max-w-md">Por favor, não feche esta janela. O sistema aguarda 2 segundos entre cada envio para evitar o bloqueio do seu número pelo WhatsApp.</p>
        </div>
      )}
    </div>
  );
}
