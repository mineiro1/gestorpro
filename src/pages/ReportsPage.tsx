import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { expensesService, ExpenseItem } from '../lib/expensesService';
import { 
  BarChart3, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownRight, 
  Receipt, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  Printer, 
  RefreshCw, 
  FileText, 
  Eye, 
  X,
  PieChart,
  Briefcase,
  Layers,
  Search,
  Filter,
  Share2,
  ExternalLink,
  MessageCircle,
  ArrowLeft
} from 'lucide-react';

interface PaymentItem {
  id: string;
  client_id?: string;
  client_name?: string;
  amount: number;
  paid_date: string;
  method?: string;
  type: 'mensalidade' | 'avulso';
  notes?: string;
}

export default function ReportsPage() {
  const { userProfile, isAdmin, isManager } = useAuth();

  const getEffectiveAdminId = () => {
    if (isAdmin && userProfile?.uid) return userProfile.uid;
    if (userProfile?.adminId) return userProfile.adminId;
    if (userProfile?.uid) return userProfile.uid;
    try {
      const cached = localStorage.getItem('cachedUserProfile');
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.role === 'admin' ? parsed.uid : (parsed.adminId || parsed.uid);
      }
    } catch {}
    return '698dfcdd-7c91-4df5-aaee-eae9e67f15ae';
  };

  const targetAdminId = getEffectiveAdminId();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'revenues' | 'expenses'>('overview');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [allClients, setAllClients] = useState<any[]>([]);

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // Preview Modal for Receipts
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Modal de Impressão e Emissão do Relatório Oficial
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadReportData = async () => {
    const adminId = getEffectiveAdminId();
    if (!adminId) return;
    setLoading(true);

    try {
      // 1. Carregar Pagamentos de Mensalidades
      const paymentsQuery = supabase
        .from('payments')
        .select('*')
        .eq('admin_id', adminId);

      // 2. Carregar Clientes com todas as datas e histórico para apurar meta da época
      const clientsQuery = supabase
        .from('clients')
        .select('*')
        .eq('admin_id', adminId);

      // 3. Carregar Ordens de Serviço Avulsas
      const jobsQuery = supabase
        .from('oneoffjobs')
        .select('*')
        .eq('admin_id', adminId);

      // 4. Carregar Despesas cadastradas
      const expensesPromise = expensesService.getExpenses(adminId);

      const [paymentsRes, clientsRes, jobsRes, loadedExpenses] = await Promise.all([
        paymentsQuery,
        clientsQuery,
        jobsQuery,
        expensesPromise
      ]);

      const clientMap = new Map<string, string>();

      if (clientsRes.data) {
        setAllClients(clientsRes.data);
        clientsRes.data.forEach((c: any) => {
          clientMap.set(c.id, c.name);
        });
      }

      setExpenses(loadedExpenses);

      // Monta lista de recebimentos (mensalidades + avulsos)
      const unifiedPayments: PaymentItem[] = [];

      if (paymentsRes.data) {
        paymentsRes.data.forEach((p: any) => {
          const rawDate = p.paid_date || p.created_at;
          unifiedPayments.push({
            id: p.id || String(Math.random()),
            client_id: p.client_id,
            client_name: p.client_name || clientMap.get(p.client_id) || 'Cliente Cadastrado',
            amount: Number(p.amount) || 0,
            paid_date: rawDate ? rawDate.split('T')[0] : '',
            method: p.method || p.payment_method || 'PIX',
            type: 'mensalidade',
            notes: p.notes || p.description
          });
        });
      }

      if (jobsRes.data) {
        jobsRes.data.forEach((job: any) => {
          const isPaid = job.payment_status === 'paid' || job.status === 'completed';
          const jobDate = job.paid_at || job.completed_at || job.scheduled_date || job.created_at;
          if (isPaid && Number(job.price || job.total_price || 0) > 0) {
            unifiedPayments.push({
              id: `job_${job.id}`,
              client_id: job.client_id,
              client_name: job.client_name || clientMap.get(job.client_id) || 'Serviço Avulso',
              amount: Number(job.price || job.total_price || 0),
              paid_date: jobDate ? jobDate.split('T')[0] : '',
              method: job.payment_method || 'PIX / Dinheiro',
              type: 'avulso',
              notes: job.title || job.description || 'Serviço Avulso'
            });
          }
        });
      }

      setPayments(unifiedPayments);
    } catch (err) {
      console.error('Erro ao carregar dados do relatório financeiro:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, [targetAdminId]);

  // Filtragem dos pagamentos do mês selecionado
  const monthPayments = useMemo(() => {
    return payments.filter(p => {
      if (!p.paid_date) return false;
      return p.paid_date.startsWith(selectedMonth);
    });
  }, [payments, selectedMonth]);

  // Filtragem das despesas do mês selecionado
  const monthExpenses = useMemo(() => {
    return expenses.filter(e => {
      const expDate = e.date || (e.created_at ? e.created_at.split('T')[0] : '');
      return expDate.startsWith(selectedMonth);
    });
  }, [expenses, selectedMonth]);

  // Totais do Mês Selecionado
  const totalRevenues = useMemo(() => {
    return monthPayments.reduce((acc, curr) => acc + curr.amount, 0);
  }, [monthPayments]);

  const totalMonthlyPlanRevenue = useMemo(() => {
    return monthPayments.filter(p => p.type === 'mensalidade').reduce((acc, curr) => acc + curr.amount, 0);
  }, [monthPayments]);

  const totalOneOffRevenue = useMemo(() => {
    return monthPayments.filter(p => p.type === 'avulso').reduce((acc, curr) => acc + curr.amount, 0);
  }, [monthPayments]);

  const totalMonthExpenses = useMemo(() => {
    return monthExpenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [monthExpenses]);

  // Saldo Líquido Operacional
  const netBalance = totalRevenues - totalMonthExpenses;
  const isProfitable = netBalance >= 0;
  const profitMargin = totalRevenues > 0 ? ((netBalance / totalRevenues) * 100).toFixed(1) : '0';

  // Despesas agrupadas por Categoria
  const expensesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    monthExpenses.forEach(exp => {
      const cat = exp.category || 'Geral';
      map.set(cat, (map.get(cat) || 0) + (Number(exp.amount) || 0));
    });

    const list = Array.from(map.entries()).map(([category, amount]) => ({
      category,
      amount,
      percentage: totalMonthExpenses > 0 ? (amount / totalMonthExpenses) * 100 : 0
    }));

    return list.sort((a, b) => b.amount - a.amount);
  }, [monthExpenses, totalMonthExpenses]);

  const currentMonthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // Função utilitária para verificar se um cliente estava ATIVO ou com CONTRATO VIGENTE em um determinado mês (YYYY-MM)
  const isClientActiveInMonth = (client: any, targetMonthKey: string) => {
    // 1. Data de criação/início: o cliente precisa já ter sido cadastrado até aquele mês
    const rawCreatedAt = client.created_at || client.start_date;
    if (rawCreatedAt) {
      const createdMonthKey = String(rawCreatedAt).substring(0, 7);
      if (createdMonthKey > targetMonthKey) {
        return false; // Não existia ainda nessa época
      }
    }

    // 2. Se o cliente efetuou pagamento no mês em questão:
    // Exemplo: o cliente pagou a mensalidade do mês e só depois foi inativado.
    // Como ele pagou no mês, o contrato dele estava vigente e recebido naquele período, devendo compor a meta!
    const hasPaymentInMonth = payments.some(
      p => p.client_id === client.id && p.paid_date && p.paid_date.startsWith(targetMonthKey)
    );
    if (hasPaymentInMonth) {
      return true;
    }

    // 3. Se o cliente NÃO pagou no mês consultado:
    const isCurrentlyInactive = client.active === false || client.status === 'inactive' || client.status === 'inativo';

    // Se a consulta for para o mês atual ou futuro e ele não pagou e está inativo hoje, não é ativo
    if (targetMonthKey >= currentMonthKey) {
      return !isCurrentlyInactive;
    }

    // Se a consulta for para um mês passado e ele não pagou no mês:
    if (isCurrentlyInactive) {
      const rawInact = client.inactivated_at;
      if (rawInact) {
        const inactMonthKey = String(rawInact).substring(0, 7);
        // Se a inativação ocorreu no próprio mês consultado ou antes dele e ele não pagou, NÃO era ativo
        if (inactMonthKey <= targetMonthKey) {
          return false;
        }
        // Se a inativação ocorreu somente em mês posterior e ainda não tinha sido inativado naquele mês, estava ativo
        return true;
      }
      // Se está inativo hoje e não há data de inativação registrada e não pagou no mês: não ativo
      return false;
    }

    // Cliente está ativo hoje e já havia sido cadastrado na época
    return true;
  };

  // Meta Contratual Dinâmica e Contagem de Clientes Ativos NA ÉPOCA (no mês selecionado)
  const monthContractStats = useMemo(() => {
    let count = 0;
    let totalTarget = 0;
    const countedClientIds = new Set<string>();

    allClients.forEach((client: any) => {
      if (!isClientActiveInMonth(client, selectedMonth)) {
        return;
      }

      countedClientIds.add(client.id);
      let price = Number(client.monthly_price ?? client.monthly_fee ?? 0);

      // Se o valor do contrato estiver zerado mas o cliente pagou mensalidade no mês, recupera pelo valor do pagamento
      if (price <= 0) {
        const pay = payments.find(
          p => p.client_id === client.id && p.paid_date && p.paid_date.startsWith(selectedMonth)
        );
        if (pay && pay.amount > 0) {
          price = pay.amount;
        }
      }

      count++;
      totalTarget += price;
    });

    // Garante que se houver algum pagamento de mensalidade de cliente no mês que não está no cadastro, também seja considerado
    payments.forEach(p => {
      if (p.paid_date && p.paid_date.startsWith(selectedMonth) && p.type === 'mensalidade') {
        if (p.client_id && !countedClientIds.has(p.client_id)) {
          countedClientIds.add(p.client_id);
          count++;
          totalTarget += p.amount;
        }
      }
    });

    return {
      activeCount: count,
      contractTarget: totalTarget
    };
  }, [allClients, payments, selectedMonth, currentMonthKey]);

  // Histórico comparativo dos últimos 6 meses com cálculo de meta histórica para cada mês
  const historyMonths = useMemo(() => {
    const months: { label: string; key: string; revenue: number; expense: number; balance: number; target: number; activeClients: number }[] = [];
    const [selYear, selMonth] = selectedMonth.split('-').map(Number);

    for (let i = 5; i >= 0; i--) {
      const d = new Date(selYear, selMonth - 1 - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase();

      const rev = payments
        .filter(p => p.paid_date && p.paid_date.startsWith(key))
        .reduce((sum, p) => sum + p.amount, 0);

      const exp = expenses
        .filter(e => {
          const dStr = e.date || (e.created_at ? e.created_at.split('T')[0] : '');
          return dStr && dStr.startsWith(key);
        })
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      let hCount = 0;
      let hTarget = 0;
      const hCountedIds = new Set<string>();

      allClients.forEach((client: any) => {
        if (!isClientActiveInMonth(client, key)) {
          return;
        }
        hCountedIds.add(client.id);
        let price = Number(client.monthly_price ?? client.monthly_fee ?? 0);
        if (price <= 0) {
          const pay = payments.find(p => p.client_id === client.id && p.paid_date && p.paid_date.startsWith(key));
          if (pay && pay.amount > 0) {
            price = pay.amount;
          }
        }
        hCount++;
        hTarget += price;
      });

      payments.forEach(p => {
        if (p.paid_date && p.paid_date.startsWith(key) && p.type === 'mensalidade') {
          if (p.client_id && !hCountedIds.has(p.client_id)) {
            hCountedIds.add(p.client_id);
            hCount++;
            hTarget += p.amount;
          }
        }
      });

      months.push({
        label,
        key,
        revenue: rev,
        expense: exp,
        balance: rev - exp,
        target: hTarget,
        activeClients: hCount
      });
    }

    return months;
  }, [payments, expenses, allClients, selectedMonth, currentMonthKey]);

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const getMonthFormattedName = () => {
    try {
      const [year, month] = selectedMonth.split('-');
      const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      return date.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    } catch {
      return selectedMonth;
    }
  };

  // HTML Oficial de Impressão (A4 Executivo)
  const generatePrintableHtml = () => {
    const monthName = getMonthFormattedName().toUpperCase();
    const companyName = userProfile?.whatsappSettings?.companyName || "RS Piscinas";
    const userRoleLabel = userProfile?.role === 'admin' ? 'Administrador' : 'Gestor';
    
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório Financeiro - ${monthName} - ${companyName}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 15mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; color: #1e293b; margin: 0; padding: 16px; font-size: 11.5px; line-height: 1.4; background: #fff; }
    .header { border-bottom: 2.5px solid #0284c7; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 20px; font-weight: 900; color: #0f172a; margin: 0; text-transform: uppercase; letter-spacing: -0.5px; }
    .subtitle { font-size: 12px; color: #64748b; font-weight: bold; margin-top: 3px; }
    .meta-box { text-align: right; font-size: 11px; color: #475569; }
    .meta-box strong { color: #0f172a; }
    
    .cards-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .card { border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #f8fafc; }
    .card-label { font-size: 9.5px; text-transform: uppercase; font-weight: 800; color: #64748b; margin-bottom: 3px; }
    .card-value { font-size: 16px; font-weight: 900; }
    .c-green { color: #16a34a; }
    .c-red { color: #dc2626; }
    .c-blue { color: #0284c7; }
    .c-sub { font-size: 9.5px; color: #64748b; margin-top: 2px; }

    .section-title { font-size: 13px; font-weight: 900; color: #0f172a; margin: 18px 0 6px 0; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 4px; display: flex; justify-content: space-between; align-items: center; }
    .section-badge { font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; color: #475569; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
    th { background: #f1f5f9; text-align: left; padding: 6px 8px; font-weight: 800; color: #1e293b; border-bottom: 1.5px solid #cbd5e1; font-size: 10px; text-transform: uppercase; }
    td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; color: #334155; }
    tr:nth-child(even) td { background: #f8fafc; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    
    .cat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 15px; }
    .cat-item { border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 8px; background: #fafafa; }
    .cat-name { font-size: 10px; font-weight: bold; color: #475569; }
    .cat-val { font-size: 12px; font-weight: 900; color: #dc2626; }

    .footer { margin-top: 30px; border-top: 1px solid #cbd5e1; padding-top: 10px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
    
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">${companyName}</h1>
      <div class="subtitle">DEMONSTRATIVO FINANCEIRO CONSOLIDADO · ${monthName}</div>
    </div>
    <div class="meta-box">
      <div><strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      <div><strong>Emitido por:</strong> ${userProfile?.name || 'Administração'} (${userRoleLabel})</div>
    </div>
  </div>

  <div class="cards-row">
    <div class="card">
      <div class="card-label">Total Recebido (Entradas)</div>
      <div class="card-value c-green">${formatCurrency(totalRevenues)}</div>
      <div class="c-sub">${monthPayments.length} pagamentos confirmados</div>
    </div>
    <div class="card">
      <div class="card-label">Total Despesas (Saídas)</div>
      <div class="card-value c-red">- ${formatCurrency(totalMonthExpenses)}</div>
      <div class="c-sub">${monthExpenses.length} comprovantes lançados</div>
    </div>
    <div class="card">
      <div class="card-label">Resultado Operacional</div>
      <div class="card-value ${isProfitable ? 'c-green' : 'c-red'}">${formatCurrency(netBalance)}</div>
      <div class="c-sub">Margem Líquida: ${profitMargin}%</div>
    </div>
    <div class="card">
      <div class="card-label">Meta da Época (${monthName})</div>
      <div class="card-value c-blue">${formatCurrency(monthContractStats.contractTarget)}</div>
      <div class="c-sub">${monthContractStats.activeCount} clientes ativos na época</div>
    </div>
  </div>

  <div class="section-title">
    <span>1. Entradas e Recebimentos (${monthPayments.length} lançamentos)</span>
    <span class="section-badge">Total: ${formatCurrency(totalRevenues)}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 15%;">Data Pagto</th>
        <th style="width: 45%;">Cliente</th>
        <th style="width: 20%;">Tipo / Forma</th>
        <th style="width: 20%;" class="text-right">Valor Recebido</th>
      </tr>
    </thead>
    <tbody>
      ${monthPayments.length === 0 ? '<tr><td colspan="4" class="text-center" style="padding:15px; color:#94a3b8;">Nenhum recebimento registrado neste mês.</td></tr>' : 
        monthPayments.map(p => `
          <tr>
            <td>${p.paid_date ? new Date(p.paid_date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
            <td><strong>${p.client_name || '-'}</strong></td>
            <td>${p.type === 'mensalidade' ? 'Mensalidade' : 'Serviço Avulso'} (${p.method || 'PIX'})</td>
            <td class="text-right c-green"><strong>+ ${formatCurrency(p.amount)}</strong></td>
          </tr>
        `).join('')
      }
    </tbody>
  </table>

  <div class="section-title">
    <span>2. Saídas e Despesas Operacionais (${monthExpenses.length} lançamentos)</span>
    <span class="section-badge">Total: - ${formatCurrency(totalMonthExpenses)}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 15%;">Data</th>
        <th style="width: 45%;">Descrição do Gasto</th>
        <th style="width: 20%;">Categoria</th>
        <th style="width: 20%;" class="text-right">Valor da Saída</th>
      </tr>
    </thead>
    <tbody>
      ${monthExpenses.length === 0 ? '<tr><td colspan="4" class="text-center" style="padding:15px; color:#94a3b8;">Nenhuma despesa cadastrada neste mês.</td></tr>' : 
        monthExpenses.map(e => `
          <tr>
            <td>${e.date ? new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
            <td><strong>${e.description}</strong></td>
            <td>${e.category || 'Geral'}</td>
            <td class="text-right c-red"><strong>- ${formatCurrency(Number(e.amount) || 0)}</strong></td>
          </tr>
        `).join('')
      }
    </tbody>
  </table>

  ${expensesByCategory.length > 0 ? `
    <div class="section-title">
      <span>3. Distribuição de Custos por Categoria</span>
    </div>
    <div class="cat-grid">
      ${expensesByCategory.map(c => `
        <div class="cat-item">
          <div class="cat-name">${c.category} (${c.percentage.toFixed(0)}%)</div>
          <div class="cat-val">${formatCurrency(c.amount)}</div>
        </div>
      `).join('')}
    </div>
  ` : ''}

  <div class="footer">
    <div><strong>${companyName}</strong> · Sistema de Gestão Empresarial</div>
    <div>Documento oficial impresso em ${new Date().toLocaleDateString('pt-BR')}</div>
  </div>
</body>
</html>`;
  };

  // Disparo de Impressão Direta (Compatível com Desktop e Mobile sem abrir páginas em branco)
  const executeDirectPrint = () => {
    try {
      const htmlContent = generatePrintableHtml();

      // Usa frame oculto para abrir a janela nativa de impressão/salvar PDF do sistema
      const existingFrame = document.getElementById('print-report-iframe');
      if (existingFrame) existingFrame.remove();

      const printFrame = document.createElement('iframe');
      printFrame.id = 'print-report-iframe';
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      printFrame.style.visibility = 'hidden';
      document.body.appendChild(printFrame);

      const frameDoc = printFrame.contentWindow?.document || printFrame.contentDocument;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(htmlContent);
        frameDoc.close();

        setTimeout(() => {
          try {
            printFrame.contentWindow?.focus();
            printFrame.contentWindow?.print();
          } catch (e) {
            console.warn('Iframe print bloqueado por sandbox, executando window.print:', e);
            window.print();
          }
          setTimeout(() => {
            try {
              document.body.removeChild(printFrame);
            } catch {}
          }, 30000);
        }, 400);
      } else {
        window.print();
      }
    } catch (err) {
      console.warn('Fallback para window.print:', err);
      window.print();
    }
  };

  // Download do arquivo HTML do relatório (Sem cancelamento prematuro de blob)
  const handleDownloadPrintHtml = () => {
    try {
      const htmlContent = generatePrintableHtml();
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Relatorio_Financeiro_${selectedMonth}.html`);
      document.body.appendChild(link);
      link.click();
      showToast('Download do relatório iniciado com sucesso!');
      setTimeout(() => {
        try {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } catch {}
      }, 30000);
    } catch (err) {
      console.error('Erro ao baixar relatório:', err);
      alert('Não foi possível iniciar o download. Tente novamente.');
    }
  };

  // Compartilhar Resumo Formatado no WhatsApp
  const handleShareWhatsApp = () => {
    const monthName = getMonthFormattedName().toUpperCase();
    const company = userProfile?.whatsappSettings?.companyName || "RS Piscinas";
    
    const message = `📊 *${company} - RELATÓRIO FINANCEIRO (${monthName})*\n\n` +
      `💰 *Total Recebido (Entradas):* ${formatCurrency(totalRevenues)}\n` +
      `   • Mensalidades: ${formatCurrency(totalMonthlyPlanRevenue)}\n` +
      `   • Serviços Avulsos: ${formatCurrency(totalOneOffRevenue)}\n\n` +
      `🔻 *Total Despesas (Saídas):* - ${formatCurrency(totalMonthExpenses)} (${monthExpenses.length} lançamentos)\n\n` +
      `📈 *Resultado Líquido:* ${formatCurrency(netBalance)} (${isProfitable ? 'Lucro' : 'Déficit'} - Margem: ${profitMargin}%)\n\n` +
      `🎯 *Meta Contratual da Época:* ${formatCurrency(monthContractStats.contractTarget)} (${monthContractStats.activeCount} clientes ativos em ${monthName})\n\n` +
      `📅 _Emitido em ${new Date().toLocaleDateString('pt-BR')} via Sistema de Gestão RS Piscinas_`;

    const encoded = encodeURIComponent(message);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  const handlePrint = () => {
    setIsPrintModalOpen(true);
  };

  const handleExportCSV = () => {
    try {
      const rows = [
        ['Tipo', 'Data', 'Identificador / Descricao', 'Categoria / Metodo', 'Valor (R$)']
      ];

      monthPayments.forEach(p => {
        rows.push(['RECEITA', p.paid_date, `"${(p.client_name || '').replace(/"/g, '""')}"`, `"${p.type === 'mensalidade' ? 'Mensalidade' : 'Serviço Avulso'}"`, String(p.amount.toFixed(2))]);
      });

      monthExpenses.forEach(e => {
        rows.push(['DESPESA', e.date || '', `"${(e.description || '').replace(/"/g, '""')}"`, `"${e.category || 'Geral'}"`, `-${Number(e.amount).toFixed(2)}`]);
      });

      const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(rows.map(e => e.join(";")).join("\n"));
      const link = document.createElement("a");
      link.setAttribute("href", csvContent);
      link.setAttribute("download", `relatorio_financeiro_${selectedMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      showToast('Planilha CSV exportada com sucesso!');
      setTimeout(() => {
        try {
          document.body.removeChild(link);
        } catch {}
      }, 5000);
    } catch (err) {
      console.error('Erro ao exportar CSV:', err);
    }
  };

  // Filtragem de busca nas abas de receitas e despesas
  const searchFilteredPayments = useMemo(() => {
    if (!searchTerm.trim()) return monthPayments;
    const term = searchTerm.toLowerCase();
    return monthPayments.filter(p => 
      p.client_name?.toLowerCase().includes(term) ||
      p.method?.toLowerCase().includes(term) ||
      p.amount.toString().includes(term)
    );
  }, [monthPayments, searchTerm]);

  const searchFilteredExpenses = useMemo(() => {
    if (!searchTerm.trim()) return monthExpenses;
    const term = searchTerm.toLowerCase();
    return monthExpenses.filter(e => 
      e.description?.toLowerCase().includes(term) ||
      e.category?.toLowerCase().includes(term) ||
      e.amount?.toString().includes(term)
    );
  }, [monthExpenses, searchTerm]);

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 pb-24 overflow-x-hidden animate-in fade-in duration-300">
      
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-[110] bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-slate-700 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header com Alto Contraste e Responsividade Mobile */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-600 mb-1">
            <BarChart3 size={15} />
            Controladoria & Inteligência Financeira
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Relatório Financeiro Mensal
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Consulte receitas recebidas, despesas lançadas e o resultado operacional consolidado.
          </p>
        </div>

        {/* Linha de Controles Mobile-First */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Seletor de Mês e Atualizar */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex-1 sm:flex-none flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-300 shadow-xs">
              <Calendar size={16} className="text-sky-600 shrink-0" />
              <input 
                type="month" 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-xs sm:text-sm font-bold text-slate-800 bg-transparent focus:outline-none w-full cursor-pointer"
              />
            </div>

            <button
              onClick={loadReportData}
              disabled={loading}
              className="p-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl transition-colors shadow-xs cursor-pointer shrink-0"
              title="Atualizar dados do relatório"
            >
              <RefreshCw size={17} className={loading ? "animate-spin text-sky-600" : ""} />
            </button>
          </div>

          {/* Botões de Ação Principais com Alinhamento Perfeito no Celular */}
          <div className="grid grid-cols-3 sm:flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              title="Abrir prévia e imprimir relatório"
            >
              <Printer size={15} />
              <span>Imprimir</span>
            </button>

            <button
              onClick={handleShareWhatsApp}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              title="Compartilhar resumo financeiro no WhatsApp"
            >
              <MessageCircle size={15} />
              <span>WhatsApp</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              title="Exportar planilha CSV"
            >
              <Download size={15} />
              <span>CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* CARDS PRINCIPAIS: RESUMO EXECUTIVO DO MÊS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Recebido */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Total Recebido</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
              <ArrowUpRight size={16} />
            </span>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-600 tracking-tight">
              {formatCurrency(totalRevenues)}
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-[11px] text-slate-500 font-medium mt-1">
              <span>Mensalidades: {formatCurrency(totalMonthlyPlanRevenue)}</span>
              <span>Avulsos: {formatCurrency(totalOneOffRevenue)}</span>
            </div>
          </div>
        </div>

        {/* Total Despesas */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Total Despesas</span>
            <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-200">
              <ArrowDownRight size={16} />
            </span>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-rose-600 tracking-tight">
              - {formatCurrency(totalMonthExpenses)}
            </p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              {monthExpenses.length} lançamento{monthExpenses.length !== 1 ? 's' : ''} registrado{monthExpenses.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Saldo Líquido Operacional */}
        <div className={`border rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between ${
          isProfitable 
            ? 'bg-gradient-to-br from-emerald-50/50 to-white border-emerald-300' 
            : 'bg-gradient-to-br from-rose-50/50 to-white border-rose-300'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Resultado Líquido</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
              isProfitable ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
            }`}>
              {isProfitable ? 'Lucro' : 'Déficit'}
            </span>
          </div>
          <div>
            <p className={`text-2xl sm:text-3xl font-black tracking-tight ${
              isProfitable ? 'text-emerald-700' : 'text-rose-700'
            }`}>
              {formatCurrency(netBalance)}
            </p>
            <p className="text-[11px] text-slate-600 font-semibold mt-1">
              Margem Líquida: <strong className={isProfitable ? 'text-emerald-700' : 'text-rose-700'}>{profitMargin}%</strong>
            </p>
          </div>
        </div>

        {/* Meta / Carteira Ativa da Época Selecionada */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Meta da Época</span>
            <span className="p-1.5 rounded-lg bg-sky-50 text-sky-600 border border-sky-200">
              <DollarSign size={16} />
            </span>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {formatCurrency(monthContractStats.contractTarget)}
            </p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              {monthContractStats.activeCount} clientes ativos na época ({getMonthFormattedName()})
            </p>
          </div>
        </div>
      </div>

      {/* NAVEGAÇÃO POR ABAS 100% RESPONSIVA (SEM TRANSBORDAMENTO) */}
      <div className="bg-slate-200/80 p-1 rounded-2xl flex items-center gap-1 w-full overflow-hidden">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2 px-1 sm:px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
            activeTab === 'overview'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
          }`}
        >
          <PieChart size={14} className={activeTab === 'overview' ? 'text-sky-600' : 'text-slate-500'} />
          <span className="truncate">Visão Geral</span>
        </button>

        <button
          onClick={() => setActiveTab('revenues')}
          className={`flex-1 py-2 px-1 sm:px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
            activeTab === 'revenues'
              ? 'bg-white text-emerald-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
          }`}
        >
          <ArrowUpRight size={14} className={activeTab === 'revenues' ? 'text-emerald-600' : 'text-slate-500'} />
          <span className="truncate">Receitas ({monthPayments.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex-1 py-2 px-1 sm:px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
            activeTab === 'expenses'
              ? 'bg-white text-rose-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
          }`}
        >
          <Receipt size={14} className={activeTab === 'expenses' ? 'text-rose-600' : 'text-slate-500'} />
          <span className="truncate">Despesas ({monthExpenses.length})</span>
        </button>
      </div>

      {/* CONTEÚDO DAS ABAS */}

      {/* ABA 1: VISÃO GERAL & GRÁFICO COMPARATIVO */}
      {activeTab === 'overview' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
            {/* Gráfico / Tabela Comparativa dos Últimos 6 Meses */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">Evolução: Receitas vs Despesas</h3>
                  <p className="text-xs text-slate-500 font-medium">Comparativo mensal dos últimos 6 meses</p>
                </div>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-emerald-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    Receitas
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    Despesas
                  </span>
                </div>
              </div>

              {/* Tabela Comparativa com Rolagem Suave */}
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Mês</th>
                      <th className="py-2.5 px-3 text-right">Receitas</th>
                      <th className="py-2.5 px-3 text-right">Despesas</th>
                      <th className="py-2.5 px-3 text-right">Saldo</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyMonths.map((m) => {
                      const isPos = m.balance >= 0;
                      const isCurrent = m.key === selectedMonth;
                      return (
                        <tr 
                          key={m.key} 
                          onClick={() => setSelectedMonth(m.key)}
                          className={`cursor-pointer transition-colors ${
                            isCurrent ? 'bg-sky-50/80 font-bold' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                            <span className="flex items-center gap-1.5">
                              {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-sky-600 shrink-0" />}
                              {m.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-emerald-600 whitespace-nowrap">
                            {formatCurrency(m.revenue)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-rose-600 whitespace-nowrap">
                            - {formatCurrency(m.expense)}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-black whitespace-nowrap ${
                            isPos ? 'text-emerald-700' : 'text-rose-700'
                          }`}>
                            {formatCurrency(m.balance)}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isPos ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {isPos ? 'Lucro' : 'Déficit'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Distribuição de Despesas por Categoria */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 mb-0.5">Despesas por Categoria</h3>
                <p className="text-xs text-slate-500 font-medium mb-4">Onde o dinheiro foi investido no período</p>

                {expensesByCategory.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-6 text-center">
                    Nenhuma despesa registrada para este mês.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {expensesByCategory.map(item => (
                      <div key={item.category} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800 truncate mr-2">{item.category}</span>
                          <span className="font-black text-rose-600 shrink-0">
                            {formatCurrency(item.amount)} ({item.percentage.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div 
                            style={{ width: `${item.percentage}%` }}
                            className="bg-rose-500 h-full rounded-full transition-all duration-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Total de Saídas:</span>
                <span className="text-rose-600 font-black text-sm">{formatCurrency(totalMonthExpenses)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: RECEBIMENTOS DETALHADOS */}
      {activeTab === 'revenues' && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por cliente ou método..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 transition-colors"
              />
            </div>
            <div className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 text-center sm:text-right shrink-0">
              Total Recebido: {formatCurrency(totalRevenues)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            {searchFilteredPayments.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <AlertCircle size={28} className="mx-auto text-slate-400" />
                <h4 className="font-bold text-slate-800 text-sm">Nenhum recebimento registrado</h4>
                <p className="text-xs text-slate-500">Não há pagamentos registrados para o mês selecionado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm text-slate-700">
                  <thead className="bg-slate-50 text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Data</th>
                      <th className="py-2.5 px-3">Cliente</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3">Forma</th>
                      <th className="py-2.5 px-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {searchFilteredPayments.map((p) => {
                      const displayDate = p.paid_date ? new Date(p.paid_date + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
                      return (
                        <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">
                            {displayDate}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 max-w-[150px] sm:max-w-none truncate">
                            {p.client_name}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              p.type === 'mensalidade' 
                                ? 'bg-sky-50 text-sky-700 border border-sky-200' 
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}>
                              {p.type === 'mensalidade' ? 'Mensalidade' : 'Avulso'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">
                            {p.method}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-emerald-600 whitespace-nowrap">
                            + {formatCurrency(p.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA 3: DESPESAS DETALHADAS */}
      {activeTab === 'expenses' && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por descrição ou categoria..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-rose-500 transition-colors"
              />
            </div>
            <div className="text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200 text-center sm:text-right shrink-0">
              Total de Despesas: - {formatCurrency(totalMonthExpenses)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            {searchFilteredExpenses.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Receipt size={28} className="mx-auto text-slate-400" />
                <h4 className="font-bold text-slate-800 text-sm">Nenhuma despesa registrada</h4>
                <p className="text-xs text-slate-500">Não há despesas cadastradas para o mês selecionado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm text-slate-700">
                  <thead className="bg-slate-50 text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Data</th>
                      <th className="py-2.5 px-3">Descrição da Despesa</th>
                      <th className="py-2.5 px-3">Categoria</th>
                      <th className="py-2.5 px-3 text-center">Comprovante</th>
                      <th className="py-2.5 px-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {searchFilteredExpenses.map((e) => {
                      const displayDate = e.date ? new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
                      return (
                        <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">
                            {displayDate}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 max-w-[140px] sm:max-w-none truncate">
                            {e.description}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              {e.category || 'Geral'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {e.receiptUrl ? (
                              <button
                                type="button"
                                onClick={() => setPreviewImageUrl(e.receiptUrl || null)}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                                title="Visualizar comprovante"
                              >
                                <Eye size={12} />
                                Foto
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Sem foto</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-rose-600 whitespace-nowrap">
                            - {formatCurrency(Number(e.amount) || 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Visualizar Comprovante */}
      {previewImageUrl && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-4 shadow-2xl relative flex flex-col">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-200">
              <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Receipt size={16} className="text-rose-600" />
                Comprovante Anexado
              </span>
              <button
                type="button"
                onClick={() => setPreviewImageUrl(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center p-2 bg-slate-50 rounded-2xl overflow-hidden max-h-[75vh]">
              <img 
                src={previewImageUrl} 
                alt="Comprovante" 
                className="max-h-[70vh] w-auto max-w-full object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Visualização Prévia e Emissão Oficial de Impressão (Mobile-First) */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full h-full sm:h-auto sm:max-h-[92vh] sm:rounded-3xl sm:max-w-4xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            {/* Header de Ações com Botões Grandes no Celular */}
            <div className="p-3.5 sm:p-5 border-b border-slate-200 bg-slate-50/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-sky-100 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0">
                    <Printer size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900">Emissão do Relatório Financeiro</h3>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Mês: <strong className="text-slate-800 uppercase">{getMonthFormattedName()}</strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                  title="Voltar ao sistema"
                >
                  <ArrowLeft size={16} />
                  <span>Voltar</span>
                </button>
              </div>

              {/* Botões de Ação na barra de impressão */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={executeDirectPrint}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <Printer size={15} />
                  <span>Imprimir / PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPrintHtml}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs"
                >
                  <Download size={15} />
                  <span>Baixar HTML</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs"
                >
                  <MessageCircle size={15} />
                  <span className="hidden sm:inline">WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="hidden sm:flex p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
                  title="Fechar"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Folha Oficial A4 de Prévia Formatada */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-8 bg-slate-100/70">
              <div className="max-w-3xl mx-auto bg-white p-4 sm:p-10 rounded-2xl shadow-xs border border-slate-200/80 text-slate-800 space-y-5 text-xs font-sans">
                {/* Cabeçalho da Empresa */}
                <div className="border-b-2 border-sky-600 pb-3 flex flex-col sm:flex-row justify-between items-start gap-2">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">
                      {userProfile?.whatsappSettings?.companyName || "RS Piscinas"}
                    </h2>
                    <p className="text-[11px] sm:text-xs font-bold text-slate-500 mt-0.5">
                      DEMONSTRATIVO FINANCEIRO CONSOLIDADO · {getMonthFormattedName().toUpperCase()}
                    </p>
                  </div>
                  <div className="text-left sm:text-right text-[10px] sm:text-[11px] text-slate-600 space-y-0.5">
                    <div><strong>Emissão:</strong> {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                    <div><strong>Responsável:</strong> {userProfile?.name || 'Administração'} ({userProfile?.role === 'admin' ? 'Administrador' : 'Gestor'})</div>
                  </div>
                </div>

                {/* 4 Cards Resumo na Folha */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50">
                    <span className="text-[9px] font-bold uppercase text-slate-500 block">Total Recebido</span>
                    <span className="text-sm sm:text-base font-black text-emerald-600 block mt-0.5">{formatCurrency(totalRevenues)}</span>
                    <span className="text-[9px] text-slate-500">{monthPayments.length} pagamentos</span>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50">
                    <span className="text-[9px] font-bold uppercase text-slate-500 block">Total Despesas</span>
                    <span className="text-sm sm:text-base font-black text-rose-600 block mt-0.5">- {formatCurrency(totalMonthExpenses)}</span>
                    <span className="text-[9px] text-slate-500">{monthExpenses.length} despesas</span>
                  </div>

                  <div className={`border rounded-xl p-2.5 ${isProfitable ? 'bg-emerald-50/50 border-emerald-300' : 'bg-rose-50/50 border-rose-300'}`}>
                    <span className="text-[9px] font-bold uppercase text-slate-700 block">Saldo Líquido</span>
                    <span className={`text-sm sm:text-base font-black block mt-0.5 ${isProfitable ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formatCurrency(netBalance)}
                    </span>
                    <span className="text-[9px] text-slate-600 font-bold">Margem: {profitMargin}%</span>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50">
                    <span className="text-[9px] font-bold uppercase text-slate-500 block">Meta da Época</span>
                    <span className="text-sm sm:text-base font-black text-sky-700 block mt-0.5">{formatCurrency(monthContractStats.contractTarget)}</span>
                    <span className="text-[9px] text-slate-500">{monthContractStats.activeCount} clientes ativos</span>
                  </div>
                </div>

                {/* Seção 1: Receitas */}
                <div>
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2">
                    <h4 className="font-black text-slate-900 uppercase text-xs">
                      1. Recebimentos Confirmados ({monthPayments.length})
                    </h4>
                    <span className="text-xs font-black text-emerald-600">Total: {formatCurrency(totalRevenues)}</span>
                  </div>
                  {monthPayments.length === 0 ? (
                    <p className="text-slate-400 italic py-2">Nenhum recebimento registrado neste mês.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-600 uppercase font-bold bg-slate-50">
                            <th className="py-1.5 px-2">Data</th>
                            <th className="py-1.5 px-2">Cliente</th>
                            <th className="py-1.5 px-2">Tipo / Método</th>
                            <th className="py-1.5 px-2 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {monthPayments.map(p => (
                            <tr key={p.id}>
                              <td className="py-1.5 px-2 whitespace-nowrap text-slate-600">
                                {p.paid_date ? new Date(p.paid_date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                              </td>
                              <td className="py-1.5 px-2 font-bold text-slate-900">{p.client_name}</td>
                              <td className="py-1.5 px-2 text-slate-600 whitespace-nowrap">
                                {p.type === 'mensalidade' ? 'Mensalidade' : 'Avulso'} ({p.method || 'PIX'})
                              </td>
                              <td className="py-1.5 px-2 text-right font-black text-emerald-600 whitespace-nowrap">
                                + {formatCurrency(p.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Seção 2: Despesas */}
                <div>
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2">
                    <h4 className="font-black text-slate-900 uppercase text-xs">
                      2. Despesas da Empresa ({monthExpenses.length})
                    </h4>
                    <span className="text-xs font-black text-rose-600">Total: - {formatCurrency(totalMonthExpenses)}</span>
                  </div>
                  {monthExpenses.length === 0 ? (
                    <p className="text-slate-400 italic py-2">Nenhuma despesa cadastrada neste mês.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-600 uppercase font-bold bg-slate-50">
                            <th className="py-1.5 px-2">Data</th>
                            <th className="py-1.5 px-2">Descrição</th>
                            <th className="py-1.5 px-2">Categoria</th>
                            <th className="py-1.5 px-2 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {monthExpenses.map(e => (
                            <tr key={e.id}>
                              <td className="py-1.5 px-2 whitespace-nowrap text-slate-600">
                                {e.date ? new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                              </td>
                              <td className="py-1.5 px-2 font-bold text-slate-900">{e.description}</td>
                              <td className="py-1.5 px-2 text-slate-600 whitespace-nowrap">{e.category || 'Geral'}</td>
                              <td className="py-1.5 px-2 text-right font-black text-rose-600 whitespace-nowrap">
                                - {formatCurrency(Number(e.amount) || 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Rodapé da Folha */}
                <div className="border-t border-slate-200 pt-3 flex justify-between items-center text-[10px] text-slate-400">
                  <span>{userProfile?.whatsappSettings?.companyName || "RS Piscinas"} · Gestão Financeira</span>
                  <span>Documento Oficial de Prestação de Contas</span>
                </div>
              </div>
            </div>

            {/* Barra Inferior Fixa com Botão Voltar e Ações */}
            <div className="p-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 transition-colors cursor-pointer"
              >
                <ArrowLeft size={16} />
                <span>Voltar ao Sistema</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={executeDirectPrint}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Printer size={15} />
                  <span>Imprimir / Salvar PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPrintHtml}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Download size={15} />
                  <span>Baixar Arquivo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
