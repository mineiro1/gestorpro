import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  openWhatsApp, 
  sendMetaMessage, 
  sendEvolutionMessage, 
  sendAstraCallsMessage, 
  getEffectiveWhatsAppProvider, 
  resolveAdminWhatsAppSettings 
} from '../lib/whatsapp';
import { formatClientMessageTemplate } from '../lib/messageTemplates';
import { generateReceiptImageBase64, copyReceiptImageToClipboard } from '../lib/receiptGenerator';
import { 
  Edit, Trash2, Plus, DollarSign, RotateCcw, Package, Search, 
  MessageCircle, PlusCircle, Phone, RefreshCw, X, Send, Check, 
  CheckCircle, AlertCircle 
} from 'lucide-react';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import { useCall } from '../contexts/CallContext';

export default function Clients() {
  const { userProfile, isAdmin, isManager } = useAuth();
  const { startCall } = useCall();
  
  const adminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
  const refreshTrigger = useRealtimeUpdates(['clients', 'payments'], 'admin_id', adminId);

  const [clients, setClients] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<any>(null);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [clientToPay, setClientToPay] = useState<any>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [sendReceiptOnConfirm, setSendReceiptOnConfirm] = useState(true);
  const [customReceiptMessage, setCustomReceiptMessage] = useState('');
  const [receiptToast, setReceiptToast] = useState<{ text: string; isError?: boolean } | null>(null);
  const [waSettings, setWaSettings] = useState<any>({});

  // Undo Payment Modal
  const [paidClients, setPaidClients] = useState<Record<string, any>>({});
  const [undoModalOpen, setUndoModalOpen] = useState(false);
  const [clientToUndo, setClientToUndo] = useState<any>(null);

  // Extra Modal
  const [extraModalOpen, setExtraModalOpen] = useState(false);
  const [clientToExtra, setClientToExtra] = useState<any>(null);
  const [extraAmount, setExtraAmount] = useState('');
  const [extraReason, setExtraReason] = useState('');
  const [isSubmittingExtra, setIsSubmittingExtra] = useState(false);
  const [loadLimit, setLoadLimit] = useState(500);
  const [hasMore, setHasMore] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  const [filterActive, setFilterActive] = useState(true);
  const [hardDeleteModalOpen, setHardDeleteModalOpen] = useState(false);
  const [clientToHardDelete, setClientToHardDelete] = useState<any>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterActive]);

  useEffect(() => {
    async function loadWaSettings() {
      const targetAdmin = isAdmin ? userProfile?.uid : userProfile?.adminId;
      const settings = await resolveAdminWhatsAppSettings(targetAdmin, userProfile);
      if (settings) {
        setWaSettings(settings);
      }
    }
    if (userProfile?.uid) {
      loadWaSettings();
    }
  }, [userProfile, isAdmin]);

  useEffect(() => {
    if (receiptToast) {
      const timer = setTimeout(() => setReceiptToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [receiptToast]);

  const fetchClientsAndPayments = useCallback(async (isManual = false) => {
    if (!userProfile?.uid) return;
    if (isManual) setIsRefreshing(true);

    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
    
    try {
      let queryBuilder = supabase.from('clients').select('*').eq('admin_id', adminId);
      
      if (!isAdmin && !isManager) {
        queryBuilder = queryBuilder.eq('employee_id', userProfile.uid);
      }
      
      if (!searchTerm) {
        queryBuilder = queryBuilder.limit(loadLimit);
      } else {
        queryBuilder = queryBuilder.limit(10000);
      }

      const { data, error } = await queryBuilder;
      if (error) {
        console.error(error);
      } else if (data) {
        const mappedClients = data.map((d: any) => ({
          ...d,
          monthlyFee: d.monthly_price || d.monthlyFee || 0,
          dueDate: d.due_date,
          extraAmount: d.extra_amount || 0,
          extraReason: d.extra_reason || '',
          employeeId: d.employee_id,
          baseDueDay: d.base_due_day,
          active: d.active !== false,
        }));
        setClients(mappedClients);
        setHasMore(data.length >= loadLimit);
      }

      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();

      const { data: payData, error: payError } = await supabase
        .from('payments')
        .select('*')
        .eq('admin_id', adminId)
        .eq('month', currentMonth)
        .eq('year', currentYear)
        .order('created_at', { ascending: false });

      if (payData) {
        const paid: Record<string, any> = {};
        payData.forEach((docData: any) => {
           const mappedDoc = {
             id: docData.id,
             clientId: docData.client_id,
             previousDueDate: docData.previous_due_date,
           };
           if (!paid[mappedDoc.clientId]) {
             paid[mappedDoc.clientId] = mappedDoc;
           }
        });
        setPaidClients(paid);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      if (isManual) {
        setTimeout(() => setIsRefreshing(false), 400);
      }
    }
  }, [userProfile, isAdmin, isManager, loadLimit, searchTerm]);

  useEffect(() => {
    fetchClientsAndPayments();

    const adminId = isAdmin ? userProfile?.uid : userProfile?.adminId;
    if (!adminId) return;

    const clientChannel = supabase.channel('clients-realtime-clients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `admin_id=eq.${adminId}` }, () => fetchClientsAndPayments())
      .subscribe();
      
    const paymentChannel = supabase.channel('clients-realtime-payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `admin_id=eq.${adminId}` }, () => fetchClientsAndPayments())
      .subscribe();

    const handleFocus = () => fetchClientsAndPayments();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchClientsAndPayments();
    });

    return () => {
      supabase.removeChannel(clientChannel);
      supabase.removeChannel(paymentChannel);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchClientsAndPayments, userProfile, isAdmin, refreshTrigger]);

  const handleDeleteClick = (client: any) => {
    setClientToDelete(client);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!clientToDelete) return;
    try {
      const { error } = await supabase.from('clients').update({ 
         active: false,
         inactivated_at: new Date().toISOString()
      }).eq('id', clientToDelete.id);
      if (error) throw error;
      setClients(prev => prev.map(c => c.id === clientToDelete.id ? { ...c, active: false } : c));
      setDeleteModalOpen(false);
      setClientToDelete(null);
    } catch (error) {
      console.error(error);
      alert("Erro ao inativar cliente.");
    }
  };

  const reactivateClient = async (clientId: string) => {
    try {
      const { error } = await supabase.from('clients').update({ 
         active: true,
         inactivated_at: null
      }).eq('id', clientId);
      if (error) throw error;
      setClients(prev => prev.map(c => c.id === clientId ? { ...c, active: true } : c));
    } catch (error) {
      console.error(error);
      alert("Erro ao reativar cliente.");
    }
  };

  const handleHardDeleteClick = (client: any) => {
    setClientToHardDelete(client);
    setHardDeleteModalOpen(true);
  };

  const executeHardDelete = async () => {
    if (!clientToHardDelete) return;
    try {
      // First delete chat messages of this client's sessions
      const { data: sessions } = await supabase.from('chat_sessions').select('id').eq('client_id', clientToHardDelete.id);
      if (sessions && sessions.length > 0) {
         const sessionIds = sessions.map(s => s.id);
         await supabase.from('chat_messages').delete().in('session_id', sessionIds);
         await supabase.from('chat_sessions').delete().in('id', sessionIds);
      }
      await supabase.from('payments').delete().eq('client_id', clientToHardDelete.id);
      await supabase.from('visits').delete().eq('client_id', clientToHardDelete.id);
      await supabase.from('oneoffjobs').delete().eq('client_id', clientToHardDelete.id);
      const { error } = await supabase.from('clients').delete().eq('id', clientToHardDelete.id);
      if (error) throw error;

      setClients(prev => prev.filter(c => c.id !== clientToHardDelete.id));
      setHardDeleteModalOpen(false);
      setClientToHardDelete(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePaymentClick = async (client: any) => {
    setClientToPay(client);
    setSendReceiptOnConfirm(true);
    setCustomReceiptMessage('');
    // Garante as configurações mais recentes do WhatsApp do administrador
    const targetAdmin = isAdmin ? userProfile?.uid : userProfile?.adminId;
    const settings = await resolveAdminWhatsAppSettings(targetAdmin, userProfile);
    if (settings && Object.keys(settings).length > 0) {
      setWaSettings(settings);
    }
    setPaymentModalOpen(true);
  };

  const calculateNextDueDate = (currentDateStr: string, baseDueDay: number) => {
    const [yearStr, monthStr] = currentDateStr.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10);

    // Advance one month
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }

    // Find the last day of the new month
    const lastDayOfNewMonth = new Date(year, month, 0).getDate();

    // The actual day should be the baseDueDay, capped at the last day of the month
    const nextDay = Math.min(baseDueDay, lastDayOfNewMonth);

    // Format back to YYYY-MM-DD
    const formattedMonth = month.toString().padStart(2, '0');
    const formattedDay = nextDay.toString().padStart(2, '0');

    return `${year}-${formattedMonth}-${formattedDay}`;
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
        let currentDueDateStr = clientToPay.dueDate;
        if (typeof currentDueDateStr !== 'string') {
          let d = currentDueDateStr && typeof currentDueDateStr.toDate === 'function' ? currentDueDateStr.toDate() : new Date(currentDueDateStr);
          currentDueDateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
        }
        const baseDay = clientToPay.baseDueDay || clientToPay.base_due_day || parseInt(currentDueDateStr.split('-')[2], 10) || 1;
        const nd = calculateNextDueDate(currentDueDateStr, baseDay);
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

  // Helper de envio do recibo digital via WhatsApp
  const sendReceiptToClient = async (
    client: { id: string; name: string; phone: string },
    paymentData: { amount: number; paymentDate: string; refMonth: number; refYear: number; nextDueDate?: string },
    customMessage?: string
  ): Promise<boolean> => {
    let currentSettings = waSettings;
    const targetAdmin = isAdmin ? userProfile?.uid : userProfile?.adminId;
    const resolved = await resolveAdminWhatsAppSettings(targetAdmin, userProfile);
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

    // 1. Gera a imagem do recibo de pagamento conforme o modelo solicitado
    let receiptImageBase64: string | undefined;
    try {
      receiptImageBase64 = await generateReceiptImageBase64({
        clientName: client.name,
        clientPhone: client.phone,
        amount: paymentData.amount,
        paymentDate: paymentData.paymentDate,
        dueDate: (client as any).dueDate || (client as any).due_date || paymentData.paymentDate,
        companyName: currentSettings?.companyName || userProfile?.whatsappSettings?.companyName || 'RS PISCINA'
      });
    } catch (imgErr) {
      console.warn('[Receipt] Erro ao gerar imagem do recibo:', imgErr);
    }

    const receiptMsgId = `receipt_${client.id}_${paymentData.refYear}_${paymentData.refMonth}_${Date.now()}`;
    const effectiveProvider = getEffectiveWhatsAppProvider(currentSettings);

    if (effectiveProvider === 'astracalls') {
      try {
        await sendAstraCallsMessage(client.phone, message, currentSettings, receiptMsgId, receiptImageBase64, 'image/png');
        setReceiptToast({ text: `Recibo com imagem enviado com sucesso para ${client.name} via AstraCalls!` });
        return true;
      } catch (err: any) {
        console.error(err);
        if (confirm(`Falha no AstraCalls (${err.message}).\n\nDeseja abrir o WhatsApp no seu aparelho para enviar o recibo manualmente?`)) {
          if (receiptImageBase64) copyReceiptImageToClipboard(receiptImageBase64);
          openWhatsApp(`55${cleanPhone}`, message);
        }
        return false;
      }
    } else if (effectiveProvider === 'meta') {
      try {
        await sendMetaMessage(client.phone, message, currentSettings, receiptMsgId, receiptImageBase64, 'image/png');
        setReceiptToast({ text: `Recibo com imagem enviado com sucesso para ${client.name} via WhatsApp Meta!` });
        return true;
      } catch (err: any) {
        console.error(err);
        if (confirm(`Falha na API Meta (${err.message}).\n\nDeseja abrir o WhatsApp no seu aparelho para enviar o recibo manualmente?`)) {
          if (receiptImageBase64) copyReceiptImageToClipboard(receiptImageBase64);
          openWhatsApp(`55${cleanPhone}`, message);
        }
        return false;
      }
    } else if (effectiveProvider === 'evolution') {
      try {
        await sendEvolutionMessage(client.phone, message, currentSettings, receiptMsgId, receiptImageBase64, 'image/png');
        setReceiptToast({ text: `Recibo com imagem enviado com sucesso para ${client.name} via Evolution API!` });
        return true;
      } catch (err: any) {
        console.error(err);
        if (confirm(`Falha na Evolution API (${err.message}).\n\nDeseja abrir o WhatsApp no seu aparelho para enviar o recibo manualmente?`)) {
          if (receiptImageBase64) copyReceiptImageToClipboard(receiptImageBase64);
          openWhatsApp(`55${cleanPhone}`, message);
        }
        return false;
      }
    } else {
      if (receiptImageBase64) {
        copyReceiptImageToClipboard(receiptImageBase64);
      }
      openWhatsApp(`55${cleanPhone}`, message);
      setReceiptToast({ text: `WhatsApp aberto! A imagem do recibo foi copiada para sua área de transferência (basta colar).` });
      return true;
    }
  };

  const confirmPayment = async () => {
    if (!clientToPay || !userProfile || isSubmittingPayment) return;
    setIsSubmittingPayment(true);

    try {
      const currentDate = new Date();
      const previousDueDate = clientToPay.dueDate || null;

      let refMonth = currentDate.getMonth() + 1;
      let refYear = currentDate.getFullYear();
      if (clientToPay.dueDate) {
        // Extract month and year from the current due date
        const due = new Date(clientToPay.dueDate + 'T12:00:00');
        refMonth = due.getMonth() + 1;
        refYear = due.getFullYear();
      }

      const extraAmt = Number(clientToPay.extraAmount || 0);
      const extraRsn = clientToPay.extraReason || null;
      const totalAmountPaid = Number(clientToPay.monthlyFee || 0) + extraAmt;
      const todayFormatted = new Date().toLocaleDateString('pt-BR');

      let nextDueDateStr = '';
      if (clientToPay.dueDate) {
        try {
          let currentDueDateStr = clientToPay.dueDate;
          
          if (typeof currentDueDateStr !== 'string') {
            let d;
            if (currentDueDateStr && typeof currentDueDateStr.toDate === 'function') {
              d = currentDueDateStr.toDate();
            } else {
              d = new Date(currentDueDateStr);
            }
            currentDueDateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
          }

          const baseDay = clientToPay.baseDueDay || clientToPay.base_due_day || parseInt(currentDueDateStr.split('-')[2], 10) || 1;
          const nextDueDate = calculateNextDueDate(currentDueDateStr, baseDay);
          nextDueDateStr = nextDueDate;
          
          await supabase.from('clients').update({
            due_date: nextDueDate,
            base_due_day: baseDay,
            extra_amount: 0,
            extra_reason: ''
          }).eq('id', clientToPay.id);
        } catch (err) {
          console.error("Erro ao atualizar data de vencimento:", err);
        }
      } else {
        await supabase.from('clients').update({
          extra_amount: 0,
          extra_reason: ''
        }).eq('id', clientToPay.id);
      }

      const currentAdminId = userProfile.role === 'admin' ? userProfile.uid : userProfile.adminId;
      const { error: insertError } = await supabase.from('payments').insert({
        admin_id: currentAdminId,
        client_id: clientToPay.id,
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
          { id: clientToPay.id, name: clientToPay.name, phone: clientToPay.phone },
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
      fetchClientsAndPayments(true);
    } catch (error: any) {
      console.error(error);
      alert("Erro ao registrar pagamento: " + (error.message || "Verifique o console."));
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleUndoClick = (client: any) => {
    setClientToUndo(client);
    setUndoModalOpen(true);
  };

  const confirmUndo = async () => {
    if (!clientToUndo || !userProfile) return;
    try {
      const payment = paidClients[clientToUndo.id];
      if (payment) {
        await supabase.from('payments').delete().eq('id', payment.id);
        if (payment.previousDueDate) {
          await supabase.from('clients').update({
            due_date: payment.previousDueDate
          }).eq('id', clientToUndo.id);
        }
      }
      setUndoModalOpen(false);
      setClientToUndo(null);
    } catch (error) {
      console.error(error);
    }
  };

  const handleExtraClick = (client: any) => {
    setClientToExtra(client);
    setExtraAmount(client.extraAmount ? client.extraAmount.toString() : '');
    setExtraReason(client.extraReason || '');
    setExtraModalOpen(true);
  };

  const confirmExtra = async () => {
    if (!clientToExtra || isSubmittingExtra) return;
    setIsSubmittingExtra(true);
    try {
      await supabase.from('clients').update({
        extra_amount: parseFloat(extraAmount) || 0,
        extra_reason: extraReason.trim(),
      }).eq('id', clientToExtra.id);
      setExtraModalOpen(false);
      setClientToExtra(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingExtra(false);
    }
  };

  if (loading) return <div>Carregando clientes...</div>;

  const filteredClients = clients.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) || (client.phone && client.phone.includes(searchTerm));
    const matchesActive = filterActive ? client.active : !client.active;
    return matchesSearch && matchesActive;
  });

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = filteredClients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
        <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
        
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button
            onClick={() => fetchClientsAndPayments(true)}
            disabled={isRefreshing}
            className="flex items-center justify-center bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-all shadow-sm font-medium text-sm shrink-0 disabled:opacity-60"
            title="Atualizar lista de clientes"
          >
            <RefreshCw size={17} className={`mr-1.5 text-primary ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
          </button>

          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors text-sm"
            />
          </div>
          {isAdmin && (
            <Link
              to="/clients/new"
              className="bg-primary text-white px-4 py-2 rounded-lg flex items-center hover:bg-primary-light transition-colors whitespace-nowrap text-sm font-medium shadow-sm"
            >
              <Plus size={18} className="mr-1.5" />
              Novo Cliente
            </Link>
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
            className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex border-b border-gray-200 mb-6">
         <button
            onClick={() => setFilterActive(true)}
            className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors ${filterActive ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
         >
            Ativos
         </button>
         <button
            onClick={() => setFilterActive(false)}
            className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors ${!filterActive ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
         >
            Inativos
         </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 font-bold text-slate-800">Nome</th>
                <th className="p-4 font-bold text-slate-800">Telefone</th>
                {(isAdmin || isManager) && (
                  <>
                    <th className="p-4 font-bold text-slate-800">Mensalidade</th>
                    <th className="p-4 font-bold text-slate-800">Vencimento</th>
                  </>
                )}
                <th className="p-4 font-bold text-slate-800 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="text-slate-900">
              {paginatedClients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-slate-500">
                    {clients.length === 0 ? 'Nenhum cliente cadastrado.' : 'Nenhum cliente encontrado na busca.'}
                  </td>
                </tr>
              ) : (
                paginatedClients.map((client) => (
                  <tr key={client.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-4 font-bold text-slate-900">{client.name}</td>
                    <td className="p-4 text-slate-700 font-medium">{client.phone}</td>
                    {(isAdmin || isManager) && (
                      <>
                      <td className="p-4 font-semibold text-slate-900">
                        <div className="flex flex-col">
                          <span>R$ {((client.monthlyFee || 0) + (client.extraAmount || 0)).toFixed(2)}</span>
                          {client.extraAmount && client.extraAmount > 0 && (
                            <span className="text-[10px] text-pink-700 font-bold bg-pink-50 border border-pink-200 px-1.5 py-0.5 rounded-full inline-block w-max mt-1">
                              +R$ {client.extraAmount.toFixed(2)} Extra
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-slate-700 font-medium">
                        {client.dueDate ? new Date(client.dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'N/A'}
                      </td>
                      </>
                    )}
                    <td className="p-4 flex justify-end space-x-2">
                      {isAdmin && paidClients[client.id] && (
                        <button
                          onClick={() => handleUndoClick(client)}
                          className="p-2 text-orange-600 hover:bg-orange-50 rounded-md transition-colors"
                          title="Desfazer Último Pagamento"
                        >
                          <RotateCcw size={18} />
                        </button>
                      )}
                      
                      <button
                        onClick={() => {
                          startCall({
                            clientId: client.id,
                            clientPhone: client.phone,
                            clientName: client.name,
                            avatarUrl: client.photo_url || client.avatar_url,
                          });
                        }}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                        title="Ligar para o cliente"
                      >
                        <Phone size={18} />
                      </button>

                      {client.phone && (
                        <button
                          onClick={() => {
                            import('../lib/whatsapp').then(({ openWhatsApp }) => {
                              openWhatsApp(`55${client.phone.replace(/\D/g, '')}`);
                            });
                          }}
                          className="p-2 text-[#25D366] hover:bg-green-50 rounded-md transition-colors"
                          title="Enviar WhatsApp"
                        >
                          <MessageCircle size={18} />
                        </button>
                      )}
                      <Link
                        to={`/clients/${client.id}/supplies`}
                        className="p-2 text-purple-600 hover:bg-purple-50 rounded-md transition-colors"
                        title="Insumos"
                      >
                        <Package size={18} />
                      </Link>
                      {(isAdmin || isManager) && client.active && (
                        <>
                          <button
                            onClick={() => handlePaymentClick(client)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-md transition-colors"
                            title="Registrar Pagamento"
                          >
                            <DollarSign size={18} />
                          </button>
                          <button
                            onClick={() => handleExtraClick(client)}
                            className="p-2 text-pink-600 hover:bg-pink-50 rounded-md transition-colors"
                            title="Extra"
                          >
                            <PlusCircle size={18} />
                          </button>
                          <Link
                            to={`/clients/${client.id}`}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            title="Editar"
                          >
                            <Edit size={18} />
                          </Link>
                        </>
                      )}
                      {isAdmin && (
                          client.active ? (
                            <button
                              onClick={() => handleDeleteClick(client)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title="Inativar"
                            >
                              <Trash2 size={18} />
                            </button>
                          ) : (
                            <div className="flex flex-col space-y-2">
                              <button
                                onClick={() => reactivateClient(client.id)}
                                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors font-semibold text-sm"
                                title="Reativar"
                              >
                                Reativar
                              </button>
                              <button
                                onClick={() => handleHardDeleteClick(client)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors font-semibold text-sm whitespace-nowrap"
                                title="Excluir Definitivamente"
                              >
                                Apagar Teste
                              </button>
                            </div>
                          )
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {totalPages > 1 && (
          <div className="flex justify-between items-center p-4 border-t border-gray-100 bg-white">
            <span className="text-sm text-gray-500">
              Mostrando de {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, filteredClients.length)} de {filteredClients.length} clientes
            </span>
            <div className="flex space-x-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className={`px-3 py-1 rounded-md text-sm font-medium ${
                  currentPage === 1 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Anterior
              </button>
              
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                // Logic to show pages around current page
                let pageNum = i + 1;
                if (totalPages > 5) {
                  if (currentPage > 3) {
                    pageNum = currentPage - 2 + i;
                  }
                  if (currentPage > totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  }
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 rounded-md text-sm font-medium ${
                      currentPage === pageNum
                        ? 'bg-primary text-white border border-primary'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 rounded-md text-sm font-medium ${
                  currentPage === totalPages 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
        
        {!searchTerm && hasMore && (
           <div className="flex justify-center p-4 bg-gray-50 rounded-b-xl border-t border-gray-100">
             <button
               onClick={() => setLoadLimit(prev => prev + 50)}
               className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm shadow-sm"
             >
               Carregar Mais Clientes do Banco de Dados
             </button>
           </div>
        )}
      </div>

      {/* Delete Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Inativar Cliente</h3>
            <p className="text-gray-600 mb-6">Deseja inativar {clientToDelete?.name}? Ele não aparecerá mais nas cobranças do dashboard.</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Não
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Sim, inativar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hard Delete Modal */}
      {hardDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir Definitivamente</h3>
            <p className="text-gray-600 mb-6 font-semibold text-red-600">
              Atenção: Isso excluirá PERMANENTEMENTE o cliente {clientToHardDelete?.name}, bem como todas as suas visitas, pagamentos e históricos (ideal para testes). Esta ação não tem volta. Tem certeza?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setHardDeleteModalOpen(false); setClientToHardDelete(null); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={executeHardDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Sim, Excluir Tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Pagamento com Recibo Digital (Padrão Billing) */}
      {paymentModalOpen && clientToPay && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
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
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
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

      {/* Undo Modal */}
      {undoModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Desfazer Pagamento</h3>
            <p className="text-gray-600 mb-6">
              Deseja desfazer o pagamento de {clientToUndo?.name} e retornar o vencimento para a data anterior?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setUndoModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmUndo}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              >
                Sim, desfazer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extra Modal */}
      {extraModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Adicionar Extra</h3>
            <p className="text-sm text-gray-600 mb-4">
              Valor extra que será cobrado na próxima mensalidade vigente de {clientToExtra?.name}.
            </p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor Extra (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={extraAmount}
                  onChange={(e) => setExtraAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
                <input
                  type="text"
                  value={extraReason}
                  onChange={(e) => setExtraReason(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                  placeholder="Ex: Instalação, material, etc."
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setExtraModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmExtra}
                disabled={isSubmittingExtra}
                className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors disabled:opacity-50"
              >
                {isSubmittingExtra ? 'Salvando...' : 'Salvar Extra'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
