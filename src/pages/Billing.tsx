import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { openWhatsApp, sendMetaMessage, sendEvolutionMessage, sendAstraCallsMessage, getEffectiveWhatsAppProvider, resolveAdminWhatsAppSettings } from '../lib/whatsapp';
import { formatClientMessageTemplate } from '../lib/messageTemplates';
import { 
  MessageCircle, AlertCircle, Clock, History, Settings, X, Play, MessageSquare, 
  Calendar, CheckCircle, XCircle, DollarSign, RefreshCw, Bell, QrCode, Copy, 
  Check, Send, FileText, Share2 
} from 'lucide-react';

interface ClientBilling {
  id: string;
  name: string;
  phone: string;
  monthlyFee: number;
  dueDate: string;
  status: 'delayed' | 'upcoming' | 'today';
  extraAmount?: number;
  extraReason?: string;
  rawClient?: any;
}

export default function Billing() {
  const { userProfile, isAdmin, isManager } = useAuth();
  const [delayedClients, setDelayedClients] = useState<ClientBilling[]>([]);
  const [todayClients, setTodayClients] = useState<ClientBilling[]>([]);
  const [upcomingClients, setUpcomingClients] = useState<ClientBilling[]>([]);
  const [allClients, setAllClients] = useState<ClientBilling[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Payment History State
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientPayments, setClientPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'delayed' | 'today' | 'upcoming'>('all');

  // Payment Settings & Receipt States
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [clientToPay, setClientToPay] = useState<any>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [sendReceiptOnConfirm, setSendReceiptOnConfirm] = useState(true);
  const [customReceiptMessage, setCustomReceiptMessage] = useState('');
  
  // Historical payment receipt modal
  const [historyReceiptModalOpen, setHistoryReceiptModalOpen] = useState(false);
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState<any>(null);
  const [isSendingHistoryReceipt, setIsSendingHistoryReceipt] = useState(false);
  const [pixCopiedFeedback, setPixCopiedFeedback] = useState(false);
  const [receiptToast, setReceiptToast] = useState<{ text: string; isError?: boolean } | null>(null);

  const [fetchTrigger, setRefreshTrigger] = useState(0);

  // WhatsApp Settings State
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sendingBatch, setSendingBatch] = useState(false);
  const [sendingProgress, setSendingProgress] = useState({ current: 0, total: 0 });
  const [sentClients, setSentClients] = useState<Record<string, 'success'|'error'>>({});
  const [billedClients, setBilledClients] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('gestaopro_billed_clients');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const [waSettings, setWaSettings] = useState({
    companyName: '',
    reminderDays: 3,
    reminderMessage: 'Olá {nome}, tudo bem? Passando para lembrar que sua mensalidade no valor de R$ {valor} vence no dia {vencimento}.',
    delayedMessage: 'Olá {nome}, tudo bem? Consta em nosso sistema que a sua mensalidade do dia {vencimento} no valor de R$ {valor} está pendente. Poderia verificá-la, por favor?',
    reportMessage1: 'Olá,{Primeiro nome do cliente}! 😊 Passando para avisar que já estive aí e fiz a limpeza da sua piscina. 💦✨\nPara acompanhar o serviço executado acesse:\nwww.rspiscinas.app.br/client-panel\nLogin: {telefone de cadastro do cliente}\nSenha: {telefone de cadastro do cliente}',
    reportMessage2: 'Olá,{Primeiro nome do cliente}! 😊 Passando para avisar que já estive aí e fiz a limpeza da sua piscina. 💦✨\nPara acompanhar o serviço executado acesse:\nwww.rspiscinas.app.br/client-panel\nLogin: {telefone de cadastro do cliente}\nSenha: {telefone de cadastro do cliente}',
    receiptMessage: 'Olá {nome}! Confirmamos o recebimento da sua mensalidade referente a {mes} no valor de R$ {valor}. Muito obrigado pela confiança e pontualidade! 💦✨\n\n*Comprovante de Quitação*\n• Cliente: {nome}\n• Valor Pago: R$ {valor}\n• Data: {data_pagamento}\n• Próximo Vencimento: {proximo_vencimento}',
    pixKey: '',
    pixReceiverName: '',
    pixKeyType: 'phone',
    autoAppendPix: true,
    autoScheduleTime: '09:00',
    provider: 'astracalls',
    useAstracalls: true,
    astracallsUrl: 'https://calls.rspiscinas.app.br',
    astracallsApiKey: 'rs_piscinas_segredo_2026',
    astracallsSessionId: '8090cca3add0b8eb3e41efb9eec363e4',
    useEvolutionApi: false,
    evolutionApiUrl: '',
    evolutionApiKey: '',
    evolutionInstanceName: '',
    useMetaApi: false,
    metaToken: '',
    metaPhoneNumberId: '',
    metaServerUrl: ''
  });

  const [testingPush, setTestingPush] = useState(false);
  const [pushStatusMessage, setPushStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const handleTriggerPushBilling = async () => {
    const currentAdminId = userProfile?.role === 'admin' ? userProfile.uid : (userProfile?.adminId || userProfile?.uid);
    if (!currentAdminId) return;
    setTestingPush(true);
    setPushStatusMessage(null);
    try {
      const res = await fetch(`/api/notifications/trigger-due-reminders?adminId=${currentAdminId}`);
      const data = await res.json();
      if (data.success) {
        const { dueTodayCount, overdueCount } = data.summary || {};
        setPushStatusMessage({
          text: `🔔 Lembretes disparados exclusivamente para o seu celular (administrador): ${dueTodayCount || 0} vencendo hoje, ${overdueCount || 0} em atraso.`,
          isError: false
        });
      } else {
        setPushStatusMessage({
          text: `Erro ao disparar: ${data.error || 'Falha ao processar'}`,
          isError: true
        });
      }
    } catch (err: any) {
      setPushStatusMessage({
        text: `Falha na requisição: ${err.message}`,
        isError: true
      });
    } finally {
      setTestingPush(false);
      setTimeout(() => setPushStatusMessage(null), 9000);
    }
  };

  useEffect(() => {
    async function loadSettings() {
      const targetAdmin = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
      const s = await resolveAdminWhatsAppSettings(targetAdmin, userProfile);
      if (s && Object.keys(s).length > 0) {
        const isMeta = s.useMetaApi && s.provider === 'meta';
        const isEvo = s.useEvolutionApi && s.provider === 'evolution';
        const isAstra = s.provider === 'astracalls' || s.useAstracalls || (!isMeta && !isEvo);

        setWaSettings((prev: any) => ({
          ...prev,
          companyName: s.companyName || '',
          reminderDays: s.reminderDays ?? 3,
          reminderMessage: s.reminderMessage || 'Olá {nome}, tudo bem? Passando para lembrar que sua mensalidade no valor de R$ {valor} vence no dia {vencimento}.',
          delayedMessage: s.delayedMessage || 'Olá {nome}, tudo bem? Consta em nosso sistema que a sua mensalidade do dia {vencimento} no valor de R$ {valor} está pendente. Poderia verificá-la, por favor?',
          reportMessage1: (s.reportMessage1 || 'Olá,{Primeiro nome do cliente}! 😊 Passando para avisar que já estive aí e fiz a limpeza da sua piscina. 💦✨\nPara acompanhar o serviço executado acesse:\nwww.rspiscinas.app.br/client-panel\nLogin: {telefone de cadastro do cliente}\nSenha: {telefone de cadastro do cliente}').replace(/https:\/\/www\.rspiscinas\.app\.br\/client-panel/gi, 'www.rspiscinas.app.br/client-panel'),
          reportMessage2: (s.reportMessage2 || 'Olá,{Primeiro nome do cliente}! 😊 Passando para avisar que já estive aí e fiz a limpeza da sua piscina. 💦✨\nPara acompanhar o serviço executado acesse:\nwww.rspiscinas.app.br/client-panel\nLogin: {telefone de cadastro do cliente}\nSenha: {telefone de cadastro do cliente}').replace(/https:\/\/www\.rspiscinas\.app\.br\/client-panel/gi, 'www.rspiscinas.app.br/client-panel'),
          receiptMessage: s.receiptMessage || 'Olá {nome}! Confirmamos o recebimento da sua mensalidade referente a {mes} no valor de R$ {valor}. Muito obrigado pela confiança e pontualidade! 💦✨\n\n*Comprovante de Quitação*\n• Cliente: {nome}\n• Valor Pago: R$ {valor}\n• Data: {data_pagamento}\n• Próximo Vencimento: {proximo_vencimento}',
          pixKey: s.pixKey || '',
          pixReceiverName: s.pixReceiverName || '',
          pixKeyType: s.pixKeyType || 'phone',
          autoAppendPix: s.autoAppendPix !== false,
          autoScheduleTime: s.autoScheduleTime || '09:00',
          provider: isAstra ? 'astracalls' : (isEvo ? 'evolution' : (isMeta ? 'meta' : 'web')),
          useAstracalls: isAstra,
          astracallsUrl: s.astracallsUrl || 'https://calls.rspiscinas.app.br',
          astracallsApiKey: s.astracallsApiKey || 'rs_piscinas_segredo_2026',
          astracallsSessionId: s.astracallsSessionId || '8090cca3add0b8eb3e41efb9eec363e4',
          useEvolutionApi: isEvo,
          evolutionApiUrl: s.evolutionApiUrl || '',
          evolutionApiKey: s.evolutionApiKey || '',
          evolutionInstanceName: s.evolutionInstanceName || '',
          useMetaApi: isMeta,
          metaToken: s.metaToken || '',
          metaPhoneNumberId: s.metaPhoneNumberId || '',
          metaServerUrl: s.metaServerUrl || ''
        }));
      }
    }
    if (userProfile?.uid) {
      loadSettings();
    }
  }, [userProfile]);

  const saveSettings = async () => {
    if (!userProfile?.uid) return;
    setSavingSettings(true);
    try {
      const currentSettings = userProfile.whatsappSettings || {};
      const { error } = await supabase.from('users').update({
        whatsapp_settings: {
          ...currentSettings,
          ...waSettings
        }
      }).eq('id', userProfile.uid);
      if (error) throw error;
      if (userProfile) {
        userProfile.whatsappSettings = {
          ...currentSettings,
          ...waSettings
        };
      }
      setSettingsModalOpen(false);
      setReceiptToast({ text: 'Configurações e Chave PIX salvas com sucesso!' });
      setTimeout(() => setReceiptToast(null), 4000);
    } catch (err: any) {
      console.error(err);
      alert('Erro ao salvar configurações: ' + (err.message || ''));
    } finally {
      setSavingSettings(false);
    }
  };

  const processMessageTemplate = (template: string, client: ClientBilling, settingsOverride?: any) => {
    const activeSettings = settingsOverride || waSettings;
    const currentPixKey = activeSettings.pixKey || (userProfile?.whatsappSettings as any)?.pixKey || '';
    const currentPixReceiver = activeSettings.pixReceiverName || (userProfile?.whatsappSettings as any)?.pixReceiverName || '';
    const shouldAppendPix = activeSettings.autoAppendPix !== false;

    let message = formatClientMessageTemplate(template, client, {
      companyName: activeSettings?.companyName || userProfile?.whatsappSettings?.companyName || 'GestãoPro',
      portalUrl: 'www.rspiscinas.app.br/client-panel',
      pixKey: currentPixKey,
      pixReceiverName: currentPixReceiver
    });

    if (client.extraAmount && client.extraAmount > 0) {
      message += `\n\n*Acréscimo (já incluso no valor total):* R$ ${client.extraAmount.toFixed(2).replace('.', ',')}\n*Motivo:* ${client.extraReason || 'Não especificado'}`;
    }

    // Se o envio automático de PIX estiver ativado e a mensagem ainda não tiver a chave explícita
    if (shouldAppendPix && currentPixKey && !message.includes(currentPixKey)) {
      message += `\n\n*Chave PIX para pagamento:*\n${currentPixKey}${currentPixReceiver ? `\n*Titular:* ${currentPixReceiver}` : ''}`;
    }

    return message;
  };

  // Helper de envio do recibo digital via WhatsApp
  const sendReceiptToClient = async (
    client: { id: string; name: string; phone: string },
    paymentData: { amount: number; paymentDate: string; refMonth: number; refYear: number; nextDueDate?: string },
    customMessage?: string
  ): Promise<boolean> => {
    let currentSettings = waSettings;
    const adminId = userProfile?.role === 'admin' ? userProfile?.uid : userProfile?.adminId;
    const resolved = await resolveAdminWhatsAppSettings(adminId, userProfile);
    if (resolved && Object.keys(resolved).length > 0) {
      currentSettings = { ...waSettings, ...resolved };
    }

    if (!client.phone) {
      alert(`O cliente ${client.name} não possui telefone cadastrado.`);
      return false;
    }

    const cleanPhone = client.phone.replace(/\D/g, '');
    const templateToUse = customMessage || currentSettings.receiptMessage || 
      'Olá {nome}! Confirmamos o recebimento da sua mensalidade referente a {mes} no valor de R$ {valor}. Muito obrigado pela confiança e pontualidade! 💦✨\n\n*Comprovante de Quitação*\n• Cliente: {nome}\n• Valor Pago: R$ {valor}\n• Data: {data_pagamento}\n• Próximo Vencimento: {proximo_vencimento}';

    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const monthFormatted = paymentData.refMonth >= 1 && paymentData.refMonth <= 12
      ? `${monthNames[paymentData.refMonth - 1]}/${paymentData.refYear}`
      : `${paymentData.refMonth}/${paymentData.refYear}`;

    const formattedNextDue = paymentData.nextDueDate 
      ? (paymentData.nextDueDate.includes('-') 
          ? `${paymentData.nextDueDate.split('-')[2]}/${paymentData.nextDueDate.split('-')[1]}/${paymentData.nextDueDate.split('-')[0]}` 
          : paymentData.nextDueDate)
      : '';

    const message = formatClientMessageTemplate(templateToUse, {
      name: client.name,
      phone: client.phone,
      monthlyFee: paymentData.amount,
      monthly_price: paymentData.amount,
      extraAmount: 0,
      paymentDate: paymentData.paymentDate,
      referenceMonth: monthFormatted,
      nextDueDate: formattedNextDue,
      pixKey: currentSettings.pixKey,
      pixReceiverName: currentSettings.pixReceiverName
    }, {
      companyName: currentSettings?.companyName || userProfile?.whatsappSettings?.companyName || 'GestãoPro',
      portalUrl: 'www.rspiscinas.app.br/client-panel',
      referenceMonth: monthFormatted,
      paymentDate: paymentData.paymentDate,
      nextDueDate: formattedNextDue,
      pixKey: currentSettings.pixKey,
      pixReceiverName: currentSettings.pixReceiverName
    });

    const receiptMsgId = `receipt_${client.id}_${paymentData.refYear}_${paymentData.refMonth}_${Date.now()}`;
    const effectiveProvider = getEffectiveWhatsAppProvider(currentSettings);

    if (effectiveProvider === 'manual') {
      openWhatsApp(`55${cleanPhone}`, message);
      setReceiptToast({ text: `WhatsApp aberto com o recibo para ${client.name}.` });
      return true;
    }

    if (effectiveProvider === 'astracalls') {
      try {
        await sendAstraCallsMessage(client.phone, message, currentSettings, receiptMsgId);
        setReceiptToast({ text: `Recibo de pagamento enviado com sucesso para ${client.name} via AstraCalls!` });
        return true;
      } catch (err: any) {
        console.error(err);
        if (confirm(`Falha no AstraCalls (${err.message}).\n\nDeseja abrir o WhatsApp no seu aparelho para enviar o recibo manualmente?`)) {
          openWhatsApp(`55${cleanPhone}`, message);
        }
        return false;
      }
    } else if (effectiveProvider === 'meta') {
      try {
        await sendMetaMessage(client.phone, message, currentSettings, receiptMsgId);
        setReceiptToast({ text: `Recibo de pagamento enviado com sucesso para ${client.name} via WhatsApp Meta!` });
        return true;
      } catch (err: any) {
        console.error(err);
        if (confirm(`Falha na API Meta (${err.message}).\n\nDeseja abrir o WhatsApp no seu aparelho para enviar o recibo manualmente?`)) {
          openWhatsApp(`55${cleanPhone}`, message);
        }
        return false;
      }
    } else if (effectiveProvider === 'evolution') {
      try {
        await sendEvolutionMessage(client.phone, message, currentSettings, receiptMsgId);
        setReceiptToast({ text: `Recibo de pagamento enviado com sucesso para ${client.name} via Evolution API!` });
        return true;
      } catch (err: any) {
        console.error(err);
        if (confirm(`Falha na Evolution API (${err.message}).\n\nDeseja abrir o WhatsApp no seu aparelho para enviar o recibo manualmente?`)) {
          openWhatsApp(`55${cleanPhone}`, message);
        }
        return false;
      }
    } else {
      openWhatsApp(`55${cleanPhone}`, message);
      setReceiptToast({ text: `WhatsApp aberto com o recibo para ${client.name}.` });
      return true;
    }
  };

  // Prévia dinâmica do recibo para o modal de pagamento
  const getReceiptPreviewForCurrentClient = () => {
    if (!clientToPay) return '';
    const totalAmountPaid = Number(clientToPay.monthlyFee || 0) + Number(clientToPay.extraAmount || 0);
    const currentDate = new Date();
    const curMonth = currentDate.getMonth() + 1;
    const curYear = currentDate.getFullYear();
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const monthFormatted = `${monthNames[curMonth - 1]}/${curYear}`;
    const todayFormatted = currentDate.toLocaleDateString('pt-BR');
    
    let nextDueDateFormatted = '';
    if (clientToPay.dueDate) {
      try {
        const baseDay = clientToPay.rawClient?.base_due_day || parseInt(clientToPay.dueDate.split('-')[2], 10) || 1;
        const nd = calculateNextDueDateHelper(clientToPay.dueDate, baseDay);
        const [ny, nm, nday] = nd.split('-');
        nextDueDateFormatted = `${nday}/${nm}/${ny}`;
      } catch(e) {}
    }

    const templateToUse = customReceiptMessage || waSettings.receiptMessage || 
      'Olá {nome}! Confirmamos o recebimento da sua mensalidade referente a {mes} no valor de R$ {valor}. Muito obrigado pela confiança e pontualidade! 💦✨\n\n*Comprovante de Quitação*\n• Cliente: {nome}\n• Valor Pago: R$ {valor}\n• Data: {data_pagamento}\n• Próximo Vencimento: {proximo_vencimento}';

    return formatClientMessageTemplate(templateToUse, {
      name: clientToPay.name,
      phone: clientToPay.phone,
      monthlyFee: totalAmountPaid,
      monthly_price: totalAmountPaid,
      paymentDate: todayFormatted,
      referenceMonth: monthFormatted,
      nextDueDate: nextDueDateFormatted,
      pixKey: waSettings.pixKey,
      pixReceiverName: waSettings.pixReceiverName
    }, {
      companyName: waSettings.companyName || userProfile?.whatsappSettings?.companyName || 'GestãoPro',
      portalUrl: 'www.rspiscinas.app.br/client-panel',
      referenceMonth: monthFormatted,
      paymentDate: todayFormatted,
      nextDueDate: nextDueDateFormatted,
      pixKey: waSettings.pixKey,
      pixReceiverName: waSettings.pixReceiverName
    });
  };

  // Abrir modal de recibo para pagamento do histórico
  const handleOpenReceiptForHistory = (payment: any) => {
    setSelectedPaymentForReceipt(payment);
    setHistoryReceiptModalOpen(true);
  };

  // Copiar chave PIX para a área de transferência com feedback
  const handleCopyPixKey = () => {
    if (!waSettings.pixKey) return;
    navigator.clipboard.writeText(waSettings.pixKey);
    setPixCopiedFeedback(true);
    setTimeout(() => setPixCopiedFeedback(false), 2500);
  };

  
  
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

  const fetchBillingData = useCallback(async (isManual = false) => {
    if (!userProfile?.uid) return;
    if (isManual) setIsRefreshing(true);
    try {
      const adminId = userProfile.role === 'admin' ? userProfile.uid : userProfile.adminId;
      
      let queryBuilder = supabase.from('clients').select('*').eq('admin_id', adminId);
      if (userProfile.role === 'employee') {
        queryBuilder = queryBuilder.eq('employee_id', userProfile.uid);
      }
      
      const { data: clientsData, error } = await queryBuilder;
      if(error) throw error;
      
      const delayed: ClientBilling[] = [];
      const todayDues: ClientBilling[] = [];
      const upcoming: ClientBilling[] = [];
      const all: ClientBilling[] = [];

      // Today at midnight for accurate date comparison
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      clientsData?.forEach(data => {
        const clientId = data.id;

        if (!data.due_date) return;

        all.push({
          id: clientId,
          name: data.name,
          phone: data.phone,
          monthlyFee: data.monthly_price || data.monthlyFee || 0,
          dueDate: data.due_date,
          status: 'upcoming',
          extraAmount: data.extra_amount,
          extraReason: data.extra_reason,
          rawClient: data
        });

        // Generate multiple missing installments logic
        const baseDay = data.base_due_day || parseInt(data.due_date.split('-')[2], 10) || 1;
        let currentDueDateStr = data.due_date;
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
            monthlyFee: data.monthly_price || data.monthlyFee || 0,
            dueDate: currentDueDateStr,
            status: 'upcoming',
            extraAmount: isFirstIteration ? data.extra_amount : undefined,
            extraReason: isFirstIteration ? data.extra_reason : undefined,
            rawClient: data
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
          } else if (diffDays > 0 && diffDays <= (waSettings.reminderDays ?? 3)) {
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
      console.error(error);
    } finally {
      setLoading(false);
      if (isManual) {
        setTimeout(() => setIsRefreshing(false), 400);
      }
    }
  }, [userProfile, waSettings.reminderDays]);

  useEffect(() => {
    fetchBillingData();

    const handleFocus = () => fetchBillingData();
    const handleGlobal = () => fetchBillingData(true);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('app-global-refresh', handleGlobal);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchBillingData();
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('app-global-refresh', handleGlobal);
    };
  }, [fetchBillingData, fetchTrigger]);

  useEffect(() => {
    if (!selectedClientId || !userProfile?.uid) {
      setClientPayments([]);
      return;
    }

    const fetchPayments = async () => {
      setLoadingPayments(true);
      try {
        const adminId = userProfile.role === 'admin' ? userProfile.uid : userProfile.adminId;
        const { data: paymentsData, error } = await supabase
          .from('payments')
          .select('*')
          .eq('admin_id', adminId)
          .eq('client_id', selectedClientId);
        
        if (error) throw error;

        // Sort by date descending (newest first)
        paymentsData?.sort((a: any, b: any) => {
          const dateA = a.paid_date || a.created_at ? new Date(a.paid_date || a.created_at).getTime() : 0;
          const dateB = b.paid_date || b.created_at ? new Date(b.paid_date || b.created_at).getTime() : 0;
          return dateB - dateA;
        });

        setClientPayments(paymentsData || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingPayments(false);
      }
    };

    fetchPayments();
  }, [selectedClientId, userProfile]);

  const handleSendWhatsApp = async (client: ClientBilling) => {
    let currentSettings = waSettings;
    const adminId = userProfile?.role === 'admin' ? userProfile?.uid : userProfile?.adminId;
    const resolved = await resolveAdminWhatsAppSettings(adminId, userProfile);
    if (resolved && Object.keys(resolved).length > 0) {
      currentSettings = { ...waSettings, ...resolved };
    }

    if (!client.phone) {
      alert(`O cliente ${client.name} não possui telefone cadastrado.`);
      return;
    }

    const todayStr = new Date().toLocaleDateString('pt-BR');
    const newBilled = { ...billedClients, [client.id]: todayStr };
    setBilledClients(newBilled);
    localStorage.setItem('gestaopro_billed_clients', JSON.stringify(newBilled));

    const cleanPhone = client.phone.replace(/\D/g, '');
    const isDelayed = client.status === 'delayed';
    
    const message = isDelayed
      ? processMessageTemplate(currentSettings.delayedMessage || waSettings.delayedMessage, client, currentSettings)
      : processMessageTemplate(currentSettings.reminderMessage || waSettings.reminderMessage, client, currentSettings);

    const billingMsgClientId = `billing_${client.id}_${isDelayed ? 'delayed' : 'reminder'}_${new Date().toISOString().slice(0, 10)}`;
    const effectiveProvider = getEffectiveWhatsAppProvider(currentSettings);

    if (effectiveProvider === 'manual') {
      openWhatsApp(`55${cleanPhone}`, message);
      setSentClients(prev => ({ ...prev, [client.id]: 'success' }));
      return;
    }

    if (effectiveProvider === 'astracalls') {
      try {
        await sendAstraCallsMessage(client.phone, message, currentSettings, billingMsgClientId);
        setSentClients(prev => ({ ...prev, [client.id]: 'success' }));
        alert(`Mensagem enviada com sucesso para ${client.name} (via WhatsApp AstraCalls)!`);
      } catch (error: any) {
        setSentClients(prev => ({ ...prev, [client.id]: 'error' }));
        console.error(error);
        if (confirm(`Falha no AstraCalls (${error.message}).\n\nDeseja abrir o WhatsApp no seu aparelho para enviar manualmente?`)) {
          openWhatsApp(`55${cleanPhone}`, message);
        }
      }
    } else if (effectiveProvider === 'meta') {
      try {
        await sendMetaMessage(client.phone, message, currentSettings, billingMsgClientId);
        setSentClients(prev => ({ ...prev, [client.id]: 'success' }));
        alert(`Mensagem enviada com sucesso para ${client.name} (via WhatsApp Oficial Meta)!`);
      } catch (error: any) {
        setSentClients(prev => ({ ...prev, [client.id]: 'error' }));
        console.error(error);
        if (confirm(`Falha na API Meta (${error.message}).\n\nDeseja abrir o WhatsApp no seu aparelho para enviar manualmente?`)) {
          openWhatsApp(`55${cleanPhone}`, message);
        }
      }
    } else if (effectiveProvider === 'evolution') {
      try {
        await sendEvolutionMessage(client.phone, message, currentSettings, billingMsgClientId);
        setSentClients(prev => ({ ...prev, [client.id]: 'success' }));
        alert(`Mensagem enviada com sucesso para ${client.name}!`);
      } catch (error: any) {
        setSentClients(prev => ({ ...prev, [client.id]: 'error' }));
        console.error(error);
        if (confirm(`Falha na Evolution API (${error.message}).\n\nDeseja abrir o WhatsApp no seu aparelho para enviar manualmente?`)) {
          openWhatsApp(`55${cleanPhone}`, message);
        }
      }
    } else {
      openWhatsApp(`55${cleanPhone}`, message);
      setSentClients(prev => ({ ...prev, [client.id]: 'success' }));
    }
  };

  const processQueue = async (clients: ClientBilling[], silent = false) => {
    let currentSettings = waSettings;
    const adminId = userProfile?.role === 'admin' ? userProfile?.uid : userProfile?.adminId;
    const resolved = await resolveAdminWhatsAppSettings(adminId, userProfile);
    if (resolved && Object.keys(resolved).length > 0) {
      currentSettings = { ...waSettings, ...resolved };
    }

    const effectiveProvider = getEffectiveWhatsAppProvider(currentSettings);

    if (effectiveProvider !== 'manual') {
      const apiName = effectiveProvider === 'astracalls' ? "WhatsApp (AstraCalls)" : (effectiveProvider === 'meta' ? "API Oficial (Meta)" : "Evolution API");
      if (!silent && !confirm(`Deseja enviar ${clients.length} mensagens automaticamente via ${apiName}?`)) return;
      
      setSendingBatch(true);
      setSendingProgress({ current: 0, total: clients.length });
      let successCount = 0;
      let errorCount = 0;
      let lastError = '';
      
      const todayStr = new Date().toLocaleDateString('pt-BR');

      for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        setSendingProgress({ current: i + 1, total: clients.length });
        
        // Skip if already billed today
        if (billedClients[client.id] === todayStr) {
          successCount++;
          continue;
        }
        
        if (!client.phone) {
          errorCount++;
          lastError = 'Telefone ausente';
          setSentClients(prev => ({ ...prev, [client.id]: 'error' }));
          continue;
        }

        const isDelayed = client.status === 'delayed';
        const message = isDelayed
          ? processMessageTemplate(currentSettings.delayedMessage || waSettings.delayedMessage, client, currentSettings)
          : processMessageTemplate(currentSettings.reminderMessage || waSettings.reminderMessage, client, currentSettings);
          
        try {
          if (effectiveProvider === 'astracalls') {
            await sendAstraCallsMessage(client.phone, message, currentSettings);
          } else if (effectiveProvider === 'meta') {
            await sendMetaMessage(client.phone, message, currentSettings);
          } else {
            await sendEvolutionMessage(client.phone, message, currentSettings);
          }
          successCount++;
          setSentClients(prev => ({ ...prev, [client.id]: 'success' }));
        } catch (e: any) {
          console.error("Erro ao enviar para", client.name, e);
          errorCount++;
          lastError = e?.message || 'Erro desconhecido';
          setSentClients(prev => ({ ...prev, [client.id]: 'error' }));
        }
        
        if (i < clients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
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

  const handlePaymentClick = (client: ClientBilling) => {
    setClientToPay(client);
    setSendReceiptOnConfirm(true);
    setCustomReceiptMessage('');
    setPaymentModalOpen(true);
  };

  const confirmPayment = async () => {
    if (!clientToPay || !clientToPay.rawClient || !userProfile || isSubmittingPayment) return;
    setIsSubmittingPayment(true);

    try {
      const data = clientToPay.rawClient;
      const currentDate = new Date();
      const previousDueDate = data.due_date || null;

      let refMonth = currentDate.getMonth() + 1;
      let refYear = currentDate.getFullYear();
      if (data.due_date) {
        const due = new Date(data.due_date + 'T12:00:00');
        refMonth = due.getMonth() + 1;
        refYear = due.getFullYear();
      }

      const extraAmt = Number(clientToPay.extraAmount || 0);
      const extraRsn = clientToPay.extraReason || null;
      const totalAmountPaid = Number(clientToPay.monthlyFee || 0) + extraAmt;
      const todayFormatted = new Date().toLocaleDateString('pt-BR');

      let nextDueDateStr = '';
      if (data.due_date) {
        try {
          const baseDay = data.base_due_day || parseInt(data.due_date.split('-')[2], 10) || 1;
          const nextDueDate = calculateNextDueDateHelper(data.due_date, baseDay);
          nextDueDateStr = nextDueDate;
          
          await supabase.from('clients').update({
            due_date: nextDueDate,
            base_due_day: baseDay,
            extra_amount: 0,
            extra_reason: ''
          }).eq('id', data.id);
        } catch (err) {
          console.error("Erro ao atualizar data de vencimento:", err);
        }
      }

      const currentAdminId = userProfile.role === 'admin' ? userProfile.uid : userProfile.adminId;
      const { error: insertError } = await supabase.from('payments').insert({
        admin_id: currentAdminId,
        client_id: data.id,
        amount: totalAmountPaid,
        base_amount: clientToPay.monthlyFee,
        extra_amount: extraAmt,
        extra_reason: extraRsn,
        month: currentDate.getMonth() + 1,
        year: currentDate.getFullYear(),
        ref_month: refMonth,
        ref_year: refYear,
        previous_due_date: previousDueDate,
        status: 'pago',
        paid_date: new Date().toISOString().split('T')[0],
        due_date: clientToPay.dueDate || new Date().toISOString().split('T')[0]
      });
      
      if(insertError) throw new Error(insertError.message);

      // Dispara o recibo/comprovante digital se habilitado
      if (sendReceiptOnConfirm && clientToPay.phone) {
        await sendReceiptToClient(
          { id: data.id, name: clientToPay.name, phone: clientToPay.phone },
          {
            amount: totalAmountPaid,
            paymentDate: todayFormatted,
            refMonth,
            refYear,
            nextDueDate: nextDueDateStr
          },
          customReceiptMessage || undefined
        );
      }

      setPaymentModalOpen(false);
      setClientToPay(null);
      setCustomReceiptMessage('');
      setRefreshTrigger(prev => prev + 1); // trigger refresh
    } catch (err: any) {
      console.error(err);
      alert("Erro ao registrar pagamento: " + (err.message || ''));
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Central de Cobranças e Notificações</h1>
          <p className="text-gray-600 mt-1 text-sm">Gerencie os vencimentos e envie lembretes via WhatsApp.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end flex-wrap">
          <button
            onClick={() => setRefreshTrigger(prev => prev + 1)}
            disabled={isRefreshing}
            className="bg-white border border-gray-200 text-gray-700 px-3.5 py-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-all shadow-sm flex items-center font-medium text-sm disabled:opacity-60 shrink-0"
            title="Atualizar lista de cobranças"
          >
            <RefreshCw size={17} className={`mr-1.5 text-primary ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
          </button>
          {isAdmin && (
            <>
              <button
                onClick={handleTriggerPushBilling}
                disabled={testingPush}
                className="bg-amber-50 border border-amber-200 text-amber-900 px-3.5 py-2 rounded-lg hover:bg-amber-100 active:bg-amber-200 transition-all shadow-sm flex items-center font-medium text-sm disabled:opacity-60 shrink-0"
                title="Disparar no seu celular as notificações de cobrança exclusivas dos seus clientes"
              >
                <Bell size={17} className={`mr-1.5 text-amber-600 ${testingPush ? 'animate-bounce' : ''}`} />
                <span>{testingPush ? 'Disparando...' : 'Testar Push no Celular'}</span>
              </button>
              <button
                onClick={() => setSettingsModalOpen(true)}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center font-medium text-sm"
              >
                <Settings size={18} className="mr-1.5" />
                Configurar Mensagens
              </button>
            </>
          )}
        </div>
      </div>

      {/* Toast Feedback */}
      {receiptToast && (
        <div className={`mb-6 p-4 rounded-xl border flex items-center justify-between shadow-md transition-all ${
          receiptToast.isError 
            ? 'bg-red-50 border-red-200 text-red-800' 
            : 'bg-emerald-50 border-emerald-300 text-emerald-900'
        }`}>
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            {receiptToast.isError ? (
              <AlertCircle size={20} className="text-red-600 shrink-0" />
            ) : (
              <CheckCircle size={20} className="text-emerald-600 shrink-0" />
            )}
            <span>{receiptToast.text}</span>
          </div>
          <button
            onClick={() => setReceiptToast(null)}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Banner / Card de Chave PIX Ativa */}
      {waSettings.pixKey && (
        <div className="mb-6 bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 border border-emerald-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between shadow-md text-white">
          <div className="flex items-center gap-3.5 mb-3 sm:mb-0">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 shrink-0">
              <QrCode size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-bold tracking-wider text-emerald-400">
                  Chave PIX da Empresa
                </span>
                {waSettings.autoAppendPix && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                    Auto-anexar ativo
                  </span>
                )}
              </div>
              <p className="text-sm sm:text-base font-mono font-bold text-white mt-0.5 select-all">
                {waSettings.pixKey}
                {waSettings.pixReceiverName && (
                  <span className="text-xs font-sans font-normal text-emerald-200/80 ml-2">
                    · Titular: {waSettings.pixReceiverName}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleCopyPixKey}
              className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {pixCopiedFeedback ? (
                <>
                  <Check size={14} className="text-emerald-200" />
                  <span>Chave Copiada!</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Copiar Chave PIX</span>
                </>
              )}
            </button>
            {isAdmin && (
              <button
                onClick={() => setSettingsModalOpen(true)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
                title="Configurar Chave PIX"
              >
                Configurar
              </button>
            )}
          </div>
        </div>
      )}

      {pushStatusMessage && (
        <div className={`mb-6 p-4 rounded-xl border flex items-center justify-between transition-all ${pushStatusMessage.isError ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bell size={18} className={pushStatusMessage.isError ? 'text-red-600' : 'text-emerald-600'} />
            <span>{pushStatusMessage.text}</span>
          </div>
          <button
            onClick={() => setPushStatusMessage(null)}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X size={16} />
          </button>
        </div>
      )}

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
                  <div className="shrink-0 flex items-center gap-2">
                    {(isAdmin || isManager) && (
                      <>
                        <button
                          onClick={() => handlePaymentClick(client)}
                          className="flex items-center px-4 py-2 rounded-lg transition-colors font-semibold shadow-sm border bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                          title="Registrar Pagamento"
                        >
                          <DollarSign size={18} />
                        </button>
                                                {(() => {
                          const today = new Date().toLocaleDateString('pt-BR');
                          const alreadyBilled = billedClients[client.id] === today;
                          
                          return (
                            <button
                              onClick={() => handleSendWhatsApp(client)}
                              disabled={alreadyBilled}
                              className={`flex items-center px-4 py-2 rounded-lg transition-colors font-semibold shadow-sm border ${
                                alreadyBilled 
                                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                  : client.status === 'delayed' 
                                    ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 cursor-pointer' 
                                    : 'bg-[#25D366] text-white border-transparent hover:bg-[#20b858] cursor-pointer'
                              }`}
                            >
                              <MessageCircle size={18} className="mr-2" />
                              {alreadyBilled ? 'Enviado Hoje' : (client.status === 'delayed' ? 'Cobrar' : 'Lembrete')}
                            </button>
                          );
                        })()}
                      </>
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
                        <th className="p-4 font-semibold text-gray-600 text-right">Comprovante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientPayments.map(payment => {
                        const dateStr = payment.paid_date || payment.created_at;
                        let displayDateStr = 'N/A';
                        if (dateStr) {
                          const isJustDate = dateStr.length === 10; // e.g. YYYY-MM-DD
                          const d = isJustDate ? new Date(`${dateStr}T12:00:00`) : new Date(dateStr);
                          displayDateStr = d.toLocaleDateString('pt-BR', {
                            day: '2-digit', month: '2-digit', year: 'numeric', 
                            hour: isJustDate ? undefined : '2-digit', 
                            minute: isJustDate ? undefined : '2-digit'
                          });
                        }
                        
                        return (
                        <tr key={payment.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="p-4 text-gray-800">
                            {displayDateStr}
                          </td>
                          <td className="p-4 text-gray-600">
                            {(payment.ref_month || payment.month).toString().padStart(2, '0')}/{(payment.ref_year || payment.year)}
                          </td>
                          <td className="p-4 text-green-600 font-semibold">
                            R$ {payment.amount?.toFixed(2)}
                          </td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => handleOpenReceiptForHistory(payment)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                              title="Enviar Recibo / Comprovante por WhatsApp"
                            >
                              <MessageCircle size={14} className="text-emerald-600" />
                              <span>Recibo WhatsApp</span>
                            </button>
                          </td>
                        </tr>
                        );
                      })}
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

              {/* Seção de Chave PIX */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-emerald-950 flex items-center gap-2 text-sm">
                    <QrCode size={18} className="text-emerald-700" />
                    Chave PIX da Empresa (Copia e Cola Automático)
                  </h4>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                    Cobrança Fácil
                  </span>
                </div>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  A chave cadastrada abaixo será enviada aos clientes nas mensagens de cobrança e lembretes, agilizando o pagamento sem que precisem solicitar a chave separadamente.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Chave PIX (Telefone, CNPJ, CPF, E-mail ou Aleatória)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 67992499469 ou financeiro@rspiscinas.com.br"
                      value={waSettings.pixKey}
                      onChange={e => setWaSettings({...waSettings, pixKey: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Nome do Titular / Beneficiário (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: RS Piscinas Ltda"
                      value={waSettings.pixReceiverName}
                      onChange={e => setWaSettings({...waSettings, pixReceiverName: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm bg-white"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={waSettings.autoAppendPix}
                    onChange={e => setWaSettings({...waSettings, autoAppendPix: e.target.checked})}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-gray-700">
                    Anexar automaticamente a chave PIX no final das mensagens de cobrança e lembretes
                  </span>
                </label>
                <p className="text-[11px] text-gray-500">
                  💡 Dica: Você também pode usar a tag <code className="bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-900 font-bold">{'{pix}'}</code> em qualquer ponto dos seus textos de mensagem.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mensagem - Pré vencimento <br/>
                  <span className="text-xs font-normal text-gray-500">Variáveis: {'{nome}'}, {'{valor}'}, {'{vencimento}'}, {'{pix}'}</span>
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
                  <span className="text-xs font-normal text-gray-500">Variáveis: {'{nome}'}, {'{valor}'}, {'{vencimento}'}, {'{pix}'}</span>
                </label>
                <textarea
                  rows={3}
                  value={waSettings.delayedMessage}
                  onChange={e => setWaSettings({...waSettings, delayedMessage: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none text-sm"
                />
              </div>

              <div>
                <label className="flex justify-between items-center mb-1">
                  <span className="block text-sm font-medium text-gray-700">
                    Mensagem de Recibo / Confirmação de Quitação
                  </span>
                  <span className="text-xs font-normal text-gray-500">
                    Variáveis: {'{nome}'}, {'{valor}'}, {'{mes}'}, {'{data_pagamento}'}, {'{proximo_vencimento}'}
                  </span>
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Enviada automaticamente ao confirmar o pagamento de uma mensalidade (ou sob demanda no histórico).
                </p>
                <textarea
                  rows={4}
                  value={waSettings.receiptMessage}
                  onChange={e => setWaSettings({...waSettings, receiptMessage: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none text-sm"
                />
              </div>

              <div>
                <label className="flex justify-between items-center mb-1">
                  <span className="block text-sm font-medium text-gray-700">Mensagem de Relatório (1º Envio / Padrão)</span>
                  <span className="text-xs font-normal text-gray-500">Variáveis: {'{Primeiro nome do cliente}'}, {'{telefone de cadastro do cliente}'}</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">Enviada quando o cliente não recebeu relatório nos últimos 30 dias.</p>
                <textarea
                  rows={5}
                  value={waSettings.reportMessage1}
                  onChange={e => setWaSettings({...waSettings, reportMessage1: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none text-sm"
                />
              </div>

              <div>
                <label className="flex justify-between items-center mb-1">
                  <span className="block text-sm font-medium text-gray-700">Mensagem de Relatório Curta (Recorrente)</span>
                  <span className="text-xs font-normal text-gray-500">Variáveis: {'{Primeiro nome do cliente}'}, {'{telefone de cadastro do cliente}'}</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">Enviada se o cliente já recebeu o relatório principal (1) nos últimos 30 dias.</p>
                <textarea
                  rows={4}
                  value={waSettings.reportMessage2}
                  onChange={e => setWaSettings({...waSettings, reportMessage2: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none text-sm"
                />
              </div>

              {/* API Integration Settings */}
              <div className="pt-4 mt-6 border-t border-gray-100">
                <div className="mb-4">
                  <h4 className="font-bold text-gray-800">Modo de Envio de Mensagens</h4>
                  <p className="text-xs text-gray-500 mb-4">Escolha a tecnologia para enviar as mensagens.</p>
                  
                  <div className="flex flex-col space-y-3">
                    <label className="flex items-start space-x-3 cursor-pointer p-3 rounded-lg border border-emerald-300 bg-emerald-50/60 hover:bg-emerald-50 transition-colors">
                      <input 
                        type="radio" 
                        name="whatsappProvider"
                        value="astracalls"
                        className="mt-1"
                        checked={waSettings.provider === 'astracalls' || (waSettings.useAstracalls && !waSettings.useEvolutionApi && !waSettings.useMetaApi)}
                        onChange={() => setWaSettings({...waSettings, provider: 'astracalls', useAstracalls: true, useEvolutionApi: false, useMetaApi: false})}
                      />
                      <div>
                        <span className="block font-semibold text-sm text-emerald-900 flex items-center gap-1.5">
                          AstraCalls (Oficial RS Piscinas)
                          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-200 text-emerald-800 rounded font-bold">Ativo</span>
                        </span>
                        <span className="block text-xs text-emerald-700">Envio automático pelo servidor oficial com VoIP e gravação de chamadas.</span>
                      </div>
                    </label>

                    <label className="flex items-start space-x-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                      <input 
                        type="radio" 
                        name="whatsappProvider"
                        value="web"
                        className="mt-1"
                        checked={waSettings.provider === 'web' || (!waSettings.useAstracalls && !waSettings.useEvolutionApi && !waSettings.useMetaApi)}
                        onChange={() => setWaSettings({...waSettings, provider: 'web', useAstracalls: false, useEvolutionApi: false, useMetaApi: false})}
                      />
                      <div>
                        <span className="block font-semibold text-sm text-gray-800">WhatsApp Web (Manual)</span>
                        <span className="block text-xs text-gray-500">Abre o WhatsApp no celular ou navegador.</span>
                      </div>
                    </label>

                    <label className="flex items-start space-x-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                      <input 
                        type="radio" 
                        name="whatsappProvider"
                        value="evolution"
                        className="mt-1"
                        checked={waSettings.provider === 'evolution' || (waSettings.useEvolutionApi && !waSettings.useMetaApi)}
                        onChange={() => setWaSettings({...waSettings, provider: 'evolution', useAstracalls: false, useEvolutionApi: true, useMetaApi: false})}
                      />
                      <div>
                        <span className="block font-semibold text-sm text-gray-800">Evolution API (QR Code)</span>
                        <span className="block text-xs text-gray-500">Envio em background conectado ao seu celular via QR Code.</span>
                      </div>
                    </label>

                    <label className="flex items-start space-x-3 cursor-pointer p-3 rounded-lg border border-purple-200 bg-purple-50/50 hover:bg-purple-50 transition-colors">
                      <input 
                        type="radio" 
                        name="whatsappProvider"
                        value="meta"
                        className="mt-1"
                        checked={waSettings.provider === 'meta' || waSettings.useMetaApi}
                        onChange={() => setWaSettings({...waSettings, provider: 'meta', useAstracalls: false, useEvolutionApi: false, useMetaApi: true})}
                      />
                      <div>
                        <span className="block font-semibold text-sm text-purple-900">API WAME / Meta Cloud API</span>
                        <span className="block text-xs text-gray-600">Conexão via Facebook Developers ou WAME API Oficial.</span>
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
                    
                    <div className="col-span-1 md:col-span-3 mt-4 bg-blue-50 border border-blue-100 p-4 rounded-lg">
                      <h4 className="font-bold text-blue-800 flex items-center mb-2">
                        <MessageSquare size={16} className="mr-2" />
                        Configuração de Webhook (Para Receber Mensagens no Chat)
                      </h4>
                      <p className="text-sm text-blue-700 mb-2">
                        Para que as respostas dos seus clientes apareçam na janela de Chat do sistema, você precisa configurar um Webhook dentro da sua Evolution API.
                      </p>
                      <div className="bg-white p-3 rounded border border-blue-200">
                        <p className="text-xs font-semibold text-gray-500 mb-1">URL DO WEBHOOK:</p>
                        <code className="text-sm text-gray-800 break-all select-all">
                          {window.location.origin}/api/webhook/evolution
                        </code>
                        <p className="text-xs text-gray-500 mt-2"><b>Eventos necessários:</b> messages-upsert</p>
                      </div>
                    </div>
                  </div>
                )}

                {waSettings.useMetaApi && (
                  <div className="space-y-4 bg-blue-50/50 p-4 rounded-lg border border-blue-100 animate-fade-in">
                    <h5 className="text-sm font-bold text-blue-900">Credenciais WAME / Meta API</h5>
                    <p className="text-xs text-blue-700 mb-4 font-medium">Aviso: Textos livres só chegam se o cliente acionou você nas últimas 24h. Use templates aprovados para o 1º contato.</p>
                    
                    <div className="bg-white p-3 rounded border border-blue-200 mb-4">
                      <p className="text-xs font-semibold text-gray-500 mb-1">URL DO WEBHOOK (WAME/META):</p>
                      <code className="text-sm text-gray-800 break-all select-all">
                        {window.location.origin}/api/webhook/wame
                      </code>
                      <p className="text-xs text-gray-500 mt-2"><b>Eventos necessários:</b> messages</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Server URL (Opcional - deixe vazio para oficial)</label>
                      <input
                        type="text"
                        placeholder="https://graph.facebook.com/v19.0 ou https://us.api-wa.me"
                        value={waSettings.metaServerUrl || ''}
                        onChange={e => setWaSettings({...waSettings, metaServerUrl: e.target.value})}
                        className="w-full px-3 py-2 border border-blue-200 rounded-md focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white mb-3"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Access Token (ou Key)</label>
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

      {/* Payment Modal com Emissor de Recibo Digital */}
      {paymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl">
                  <DollarSign size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Registrar Pagamento</h3>
                  <p className="text-xs text-gray-500">Confirmação de baixa e emissão de recibo digital</p>
                </div>
              </div>
              <button
                onClick={() => setPaymentModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Resumo Financeiro da Mensalidade */}
            <div className="my-4 p-4 bg-gray-50 rounded-xl border border-gray-200/80 space-y-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs text-gray-500 block font-medium">Cliente</span>
                  <span className="font-bold text-gray-900 text-base">{clientToPay?.name}</span>
                  <span className="text-xs text-gray-500 block mt-0.5">{clientToPay?.phone || 'Sem telefone'}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-500 block font-medium">Valor Total</span>
                  <span className="font-black text-emerald-600 text-2xl tracking-tight">
                    R$ {((clientToPay?.monthlyFee || 0) + (clientToPay?.extraAmount || 0)).toFixed(2)}
                  </span>
                </div>
              </div>

              {clientToPay?.extraAmount && clientToPay.extraAmount > 0 ? (
                <div className="text-xs text-pink-700 bg-pink-50 p-2.5 rounded-lg border border-pink-200">
                  Mensalidade: R$ {(clientToPay?.monthlyFee || 0).toFixed(2)} + Acréscimo Extra: R$ {clientToPay.extraAmount.toFixed(2)} ({clientToPay.extraReason || 'Não informado'})
                </div>
              ) : null}

              <div className="flex items-center justify-between pt-2.5 border-t border-gray-200/70 text-xs text-gray-600">
                <span>Data do Pagamento: <strong className="text-gray-800">{new Date().toLocaleDateString('pt-BR')}</strong></span>
                <span>Vencimento Original: <strong className="text-gray-800">{clientToPay?.dueDate ? new Date(clientToPay.dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'N/A'}</strong></span>
              </div>
            </div>

            {/* Caixa de Opção: Enviar Recibo de Quitação no WhatsApp */}
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/60 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendReceiptOnConfirm}
                  onChange={e => setSendReceiptOnConfirm(e.target.checked)}
                  className="mt-1 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <div>
                  <span className="font-bold text-sm text-emerald-950 flex items-center gap-1.5">
                    <MessageCircle size={16} className="text-emerald-700" />
                    Enviar Comprovante / Recibo no WhatsApp
                  </span>
                  <span className="text-xs text-emerald-800 block mt-0.5 leading-relaxed">
                    Dispara automaticamente a mensagem profissional de confirmação e agradecimento com os dados da quitação.
                  </span>
                </div>
              </label>

              {sendReceiptOnConfirm && (
                <div className="pt-2 border-t border-emerald-200/80">
                  <span className="text-xs font-semibold text-emerald-900 block mb-1">
                    Prévia do Recibo a ser enviado:
                  </span>
                  <div className="p-3 bg-white rounded-lg border border-emerald-300 text-xs text-gray-800 font-mono whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto shadow-inner">
                    {getReceiptPreviewForCurrentClient()}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setPaymentModalOpen(false)}
                className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors font-semibold text-sm cursor-pointer"
                disabled={isSubmittingPayment}
              >
                Cancelar
              </button>
              <button
                onClick={confirmPayment}
                disabled={isSubmittingPayment}
                className={`px-5 py-2.5 rounded-xl text-white font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer text-sm ${
                  sendReceiptOnConfirm 
                    ? 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700' 
                    : 'bg-green-600 hover:bg-green-700'
                } disabled:opacity-50`}
              >
                {isSubmittingPayment ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : sendReceiptOnConfirm ? (
                  <>
                    <Send size={16} />
                    <span>Confirmar & Enviar Recibo</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Confirmar Pagamento</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reenvio / Visualização de Recibo do Histórico */}
      {historyReceiptModalOpen && selectedPaymentForReceipt && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Comprovante de Quitação</h3>
                  <p className="text-xs text-gray-500">Reenvio de recibo digital para o WhatsApp</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setHistoryReceiptModalOpen(false);
                  setSelectedPaymentForReceipt(null);
                }}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="my-4">
              <span className="text-xs font-semibold text-gray-700 block mb-1">
                Conteúdo do Recibo:
              </span>
              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-800 font-mono whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                {(() => {
                  const client = allClients.find(c => c.id === selectedPaymentForReceipt.client_id) || {
                    id: selectedPaymentForReceipt.client_id,
                    name: 'Cliente',
                    phone: '',
                    dueDate: ''
                  };
                  
                  const amount = selectedPaymentForReceipt.amount || 0;
                  const dateStr = selectedPaymentForReceipt.paid_date || selectedPaymentForReceipt.created_at;
                  let payDateFormatted = new Date().toLocaleDateString('pt-BR');
                  if (dateStr) {
                    const d = dateStr.length === 10 ? new Date(`${dateStr}T12:00:00`) : new Date(dateStr);
                    payDateFormatted = d.toLocaleDateString('pt-BR');
                  }

                  const refM = selectedPaymentForReceipt.ref_month || selectedPaymentForReceipt.month || 1;
                  const refY = selectedPaymentForReceipt.ref_year || selectedPaymentForReceipt.year || new Date().getFullYear();
                  const monthNames = [
                    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
                  ];
                  const monthFormatted = refM >= 1 && refM <= 12 ? `${monthNames[refM - 1]}/${refY}` : `${refM}/${refY}`;

                  const templateToUse = waSettings.receiptMessage || 
                    'Olá {nome}! Confirmamos o recebimento da sua mensalidade referente a {mes} no valor de R$ {valor}. Muito obrigado pela confiança e pontualidade! 💦✨\n\n*Comprovante de Quitação*\n• Cliente: {nome}\n• Valor Pago: R$ {valor}\n• Data: {data_pagamento}\n• Próximo Vencimento: {proximo_vencimento}';

                  return formatClientMessageTemplate(templateToUse, {
                    name: client.name,
                    phone: client.phone,
                    monthlyFee: amount,
                    monthly_price: amount,
                    paymentDate: payDateFormatted,
                    referenceMonth: monthFormatted,
                    nextDueDate: client.dueDate,
                    pixKey: waSettings.pixKey,
                    pixReceiverName: waSettings.pixReceiverName
                  }, {
                    companyName: waSettings.companyName || userProfile?.whatsappSettings?.companyName || 'GestãoPro',
                    portalUrl: 'www.rspiscinas.app.br/client-panel',
                    referenceMonth: monthFormatted,
                    paymentDate: payDateFormatted,
                    nextDueDate: client.dueDate,
                    pixKey: waSettings.pixKey,
                    pixReceiverName: waSettings.pixReceiverName
                  });
                })()}
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-2 border-t border-gray-100">
              <button
                onClick={() => {
                  setHistoryReceiptModalOpen(false);
                  setSelectedPaymentForReceipt(null);
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors font-semibold text-sm cursor-pointer"
                disabled={isSendingHistoryReceipt}
              >
                Fechar
              </button>
              <button
                onClick={async () => {
                  setIsSendingHistoryReceipt(true);
                  try {
                    const client = allClients.find(c => c.id === selectedPaymentForReceipt.client_id) || {
                      id: selectedPaymentForReceipt.client_id,
                      name: 'Cliente',
                      phone: '',
                      dueDate: ''
                    };

                    const dateStr = selectedPaymentForReceipt.paid_date || selectedPaymentForReceipt.created_at;
                    let payDateFormatted = new Date().toLocaleDateString('pt-BR');
                    if (dateStr) {
                      const d = dateStr.length === 10 ? new Date(`${dateStr}T12:00:00`) : new Date(dateStr);
                      payDateFormatted = d.toLocaleDateString('pt-BR');
                    }

                    const refM = selectedPaymentForReceipt.ref_month || selectedPaymentForReceipt.month || 1;
                    const refY = selectedPaymentForReceipt.ref_year || selectedPaymentForReceipt.year || new Date().getFullYear();

                    await sendReceiptToClient(
                      client,
                      {
                        amount: selectedPaymentForReceipt.amount || 0,
                        paymentDate: payDateFormatted,
                        refMonth: refM,
                        refYear: refY,
                        nextDueDate: client.dueDate
                      }
                    );
                    setHistoryReceiptModalOpen(false);
                    setSelectedPaymentForReceipt(null);
                  } catch (err: any) {
                    console.error(err);
                    alert('Erro ao enviar recibo: ' + (err.message || ''));
                  } finally {
                    setIsSendingHistoryReceipt(false);
                  }
                }}
                disabled={isSendingHistoryReceipt}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer text-sm disabled:opacity-50"
              >
                {isSendingHistoryReceipt ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Enviando Recibo...</span>
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    <span>Disparar Recibo no WhatsApp</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
