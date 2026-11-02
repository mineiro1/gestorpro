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
  Filter
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
  const targetAdminId = isAdmin ? userProfile?.uid : (userProfile?.adminId || userProfile?.uid);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'revenues' | 'expenses'>('overview');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [activeContractTotal, setActiveContractTotal] = useState(0);
  const [activeClientsCount, setActiveClientsCount] = useState(0);

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // Preview Modal for Receipts
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Modal de Impressão e Emissão do Relatório Oficial
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const loadReportData = async () => {
    if (!targetAdminId) return;
    setLoading(true);

    try {
      // 1. Carregar Pagamentos de Mensalidades
      const paymentsQuery = supabase
        .from('payments')
        .select('*')
        .eq('admin_id', targetAdminId);

      // 2. Carregar Clientes para cruzar os nomes e meta contratual
      const clientsQuery = supabase
        .from('clients')
        .select('id, name, monthly_price, monthly_fee, active')
        .eq('admin_id', targetAdminId);

      // 3. Carregar Ordens de Serviço Avulsas
      const jobsQuery = supabase
        .from('oneoffjobs')
        .select('*')
        .eq('admin_id', targetAdminId);

      // 4. Carregar Despesas cadastradas
      const expensesPromise = expensesService.getExpenses(targetAdminId);

      const [paymentsRes, clientsRes, jobsRes, loadedExpenses] = await Promise.all([
        paymentsQuery,
        clientsQuery,
        jobsQuery,
        expensesPromise
      ]);

      const clientMap = new Map<string, string>();
      let contractSum = 0;
      let activeCount = 0;

      if (clientsRes.data) {
        clientsRes.data.forEach((c: any) => {
          clientMap.set(c.id, c.name);
          if (c.active !== false) {
            activeCount++;
            contractSum += Number(c.monthly_price ?? c.monthly_fee ?? 0);
          }
        });
      }

      setActiveClientsCount(activeCount);
      setActiveContractTotal(contractSum);
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

  // Histórico comparativo dos últimos 6 meses
  const historyMonths = useMemo(() => {
    const months: { label: string; key: string; revenue: number; expense: number; balance: number }[] = [];
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

      months.push({
        label,
        key,
        revenue: rev,
        expense: exp,
        balance: rev - exp
      });
    }

    return months;
  }, [payments, expenses, selectedMonth]);

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

  const generatePrintableHtml = () => {
    const monthName = getMonthFormattedName().toUpperCase();
    const companyName = userProfile?.whatsappSettings?.companyName || "RS Piscinas";
    const userRoleLabel = userProfile?.role === 'admin' ? 'Administrador' : 'Gestor';
    
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório Financeiro Consolidado - ${monthName} - ${companyName}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 15mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 0; font-size: 11.5px; line-height: 1.4; background: #fff; }
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
      <div class="card-label">Meta Contratual Prevista</div>
      <div class="card-value c-blue">${formatCurrency(activeContractTotal)}</div>
      <div class="c-sub">${activeClientsCount} clientes ativos</div>
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

  const executeDirectPrint = () => {
    try {
      // 1. Tenta impressão via iframe isolado (bypassa sandbox restrictions do iframe pai)
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
      document.body.appendChild(printFrame);

      const frameDoc = printFrame.contentWindow?.document || printFrame.contentDocument;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(generatePrintableHtml());
        frameDoc.close();

        setTimeout(() => {
          try {
            printFrame.contentWindow?.focus();
            printFrame.contentWindow?.print();
          } catch (e) {
            console.warn('iframe print falhou, tentando fallback window.print():', e);
            window.print();
          }
          setTimeout(() => {
            try {
              document.body.removeChild(printFrame);
            } catch {}
          }, 3000);
        }, 400);
      }
    } catch (err) {
      console.warn('Erro ao disparar impressão direta:', err);
      // Fallback
      window.print();
    }
  };

  const handleDownloadPrintHtml = () => {
    const htmlContent = generatePrintableHtml();
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Relatorio_Financeiro_${selectedMonth}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    // Abre a visualização prévia oficial de impressão
    setIsPrintModalOpen(true);
    // E tenta disparar a impressão imediatamente
    executeDirectPrint();
  };

  const handleExportCSV = () => {
    const rows = [
      ['Tipo', 'Data', 'Identificador / Descricao', 'Categoria / Metodo', 'Valor (R$)']
    ];

    monthPayments.forEach(p => {
      rows.push(['RECEITA', p.paid_date, `"${p.client_name}"`, `"${p.type === 'mensalidade' ? 'Mensalidade' : 'Serviço Avulso'}"`, String(p.amount.toFixed(2))]);
    });

    monthExpenses.forEach(e => {
      rows.push(['DESPESA', e.date || '', `"${e.description}"`, `"${e.category || 'Geral'}"`, `-${Number(e.amount).toFixed(2)}`]);
    });

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_financeiro_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header com Alto Contraste */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-600 mb-1">
            <BarChart3 size={16} />
            Controladoria & Inteligência Financeira
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            Relatório Financeiro Mensal
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Consulte receitas recebidas, despesas lançadas e o resultado operacional consolidado de cada mês.
          </p>
        </div>

        {/* Controles de Ação e Filtro de Mês */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-300 shadow-sm">
            <Calendar size={16} className="text-sky-600 shrink-0" />
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-sm font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={loadReportData}
            disabled={loading}
            className="p-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl transition-colors shadow-sm cursor-pointer"
            title="Atualizar dados do relatório"
          >
            <RefreshCw size={18} className={loading ? "animate-spin text-sky-600" : ""} />
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl shadow-sm transition-colors cursor-pointer"
            title="Exportar planilha CSV"
          >
            <Download size={15} />
            <span className="hidden sm:inline">Exportar CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm transition-colors cursor-pointer"
            title="Imprimir relatório"
          >
            <Printer size={15} />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* CARDS PRINCIPAIS: RESUMO EXECUTIVO DO MÊS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Recebido */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Total Recebido (Entradas)</span>
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
              <ArrowUpRight size={18} />
            </span>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-600 tracking-tight">
              {formatCurrency(totalRevenues)}
            </p>
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium mt-1">
              <span>Mensalidades: {formatCurrency(totalMonthlyPlanRevenue)}</span>
              <span>Avulsos: {formatCurrency(totalOneOffRevenue)}</span>
            </div>
          </div>
        </div>

        {/* Total Despesas */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Total Despesas (Saídas)</span>
            <span className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
              <ArrowDownRight size={18} />
            </span>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-rose-600 tracking-tight">
              - {formatCurrency(totalMonthExpenses)}
            </p>
            <p className="text-xs text-slate-500 font-medium mt-1">
              {monthExpenses.length} lançamento{monthExpenses.length !== 1 ? 's' : ''} registrado{monthExpenses.length !== 1 ? 's' : ''} no mês
            </p>
          </div>
        </div>

        {/* Saldo Líquido Operacional */}
        <div className={`border rounded-2xl p-5 shadow-sm flex flex-col justify-between ${
          isProfitable 
            ? 'bg-gradient-to-br from-emerald-50/50 to-white border-emerald-300' 
            : 'bg-gradient-to-br from-rose-50/50 to-white border-rose-300'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Resultado Líquido</span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
              isProfitable ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
            }`}>
              {isProfitable ? 'Superávit / Lucro' : 'Déficit / Atenção'}
            </span>
          </div>
          <div>
            <p className={`text-2xl sm:text-3xl font-black tracking-tight ${
              isProfitable ? 'text-emerald-700' : 'text-rose-700'
            }`}>
              {formatCurrency(netBalance)}
            </p>
            <p className="text-xs text-slate-600 font-semibold mt-1">
              Margem Líquida Operacional: <strong className={isProfitable ? 'text-emerald-700' : 'text-rose-700'}>{profitMargin}%</strong>
            </p>
          </div>
        </div>

        {/* Meta / Carteira Ativa */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Meta Contratual</span>
            <span className="p-2 rounded-xl bg-sky-50 text-sky-600 border border-sky-200">
              <DollarSign size={18} />
            </span>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {formatCurrency(activeContractTotal)}
            </p>
            <p className="text-xs text-slate-500 font-medium mt-1">
              {activeClientsCount} clientes ativos na carteira fixa
            </p>
          </div>
        </div>
      </div>

      {/* NAVEGAÇÃO POR ABAS */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'border-sky-600 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <PieChart size={16} />
            Visão Geral & Indicadores
          </button>

          <button
            onClick={() => setActiveTab('revenues')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'revenues'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ArrowUpRight size={16} />
            Recebimentos ({monthPayments.length})
          </button>

          <button
            onClick={() => setActiveTab('expenses')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'expenses'
                ? 'border-rose-600 text-rose-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Receipt size={16} />
            Despesas ({monthExpenses.length})
          </button>
        </div>
      </div>

      {/* CONTEÚDO DAS ABAS */}

      {/* ABA 1: VISÃO GERAL & GRÁFICO COMPARATIVO */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Gráfico Comparativo dos Últimos 6 Meses */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base font-black text-slate-900">Evolução Mensal: Receitas vs Despesas</h3>
                  <p className="text-xs text-slate-500 font-medium">Comparativo dos últimos 6 meses</p>
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

              {/* Tabela Comparativa Mensal */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase font-bold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Mês</th>
                      <th className="py-2.5 px-3 text-right">Receitas</th>
                      <th className="py-2.5 px-3 text-right">Despesas</th>
                      <th className="py-2.5 px-3 text-right">Saldo Líquido</th>
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
                            isCurrent ? 'bg-sky-50 font-bold' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-3 px-3 font-bold text-slate-900 flex items-center gap-2">
                            {isCurrent && <span className="w-2 h-2 rounded-full bg-sky-600" />}
                            {m.label}
                          </td>
                          <td className="py-3 px-3 text-right font-black text-emerald-600">
                            {formatCurrency(m.revenue)}
                          </td>
                          <td className="py-3 px-3 text-right font-black text-rose-600">
                            - {formatCurrency(m.expense)}
                          </td>
                          <td className={`py-3 px-3 text-right font-black ${
                            isPos ? 'text-emerald-700' : 'text-rose-700'
                          }`}>
                            {formatCurrency(m.balance)}
                          </td>
                          <td className="py-3 px-3 text-center">
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
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 mb-1">Despesas por Categoria</h3>
                <p className="text-xs text-slate-500 font-medium mb-4">Onde o dinheiro foi investido neste mês</p>

                {expensesByCategory.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-6 text-center">
                    Nenhuma despesa registrada para este mês.
                  </p>
                ) : (
                  <div className="space-y-3.5">
                    {expensesByCategory.map(item => (
                      <div key={item.category} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800">{item.category}</span>
                          <span className="font-black text-rose-600">
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

              <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Total de Saídas:</span>
                <span className="text-rose-600 font-black text-sm">{formatCurrency(totalMonthExpenses)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: RECEBIMENTOS DETALHADOS */}
      {activeTab === 'revenues' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por cliente ou método..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 transition-colors"
              />
            </div>
            <div className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
              Total Recebido: {formatCurrency(totalRevenues)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {searchFilteredPayments.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <AlertCircle size={28} className="mx-auto text-slate-400" />
                <h4 className="font-bold text-slate-800 text-sm">Nenhum recebimento registrado</h4>
                <p className="text-xs text-slate-500">Não há pagamentos registrados para este mês selecionado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Data Pagto</th>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4">Tipo</th>
                      <th className="py-3 px-4">Forma de Pagamento</th>
                      <th className="py-3 px-4 text-right">Valor Recebido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {searchFilteredPayments.map((p) => {
                      const displayDate = p.paid_date ? new Date(p.paid_date + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
                      return (
                        <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3.5 px-4 text-xs font-medium text-slate-600 whitespace-nowrap">
                            {displayDate}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            {p.client_name}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              p.type === 'mensalidade' 
                                ? 'bg-sky-50 text-sky-700 border border-sky-200' 
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}>
                              {p.type === 'mensalidade' ? 'Mensalidade Fixa' : 'Serviço Avulso'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">
                            {p.method}
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-emerald-600 whitespace-nowrap">
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
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por descrição ou categoria..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-rose-500 transition-colors"
              />
            </div>
            <div className="text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200">
              Total de Despesas: - {formatCurrency(totalMonthExpenses)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {searchFilteredExpenses.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <Receipt size={28} className="mx-auto text-slate-400" />
                <h4 className="font-bold text-slate-800 text-sm">Nenhuma despesa registrada</h4>
                <p className="text-xs text-slate-500">Não há despesas cadastradas para este mês selecionado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Data</th>
                      <th className="py-3 px-4">Descrição da Despesa</th>
                      <th className="py-3 px-4">Categoria</th>
                      <th className="py-3 px-4 text-center">Comprovante</th>
                      <th className="py-3 px-4 text-right">Valor da Saída</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {searchFilteredExpenses.map((e) => {
                      const displayDate = e.date ? new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
                      return (
                        <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3.5 px-4 text-xs font-medium text-slate-600 whitespace-nowrap">
                            {displayDate}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            {e.description}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              {e.category || 'Geral'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {e.receiptUrl ? (
                              <button
                                type="button"
                                onClick={() => setPreviewImageUrl(e.receiptUrl || null)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                title="Visualizar comprovante"
                              >
                                <Eye size={13} />
                                Ver Foto
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Sem anexo</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-rose-600 whitespace-nowrap">
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
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

      {/* MODAL: Visualização Prévia e Emissão Oficial de Impressão */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl relative flex flex-col max-h-[92vh] overflow-hidden border border-slate-200">
            {/* Header de Ações de Impressão */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-sky-100 border border-sky-200 text-sky-700 flex items-center justify-center">
                  <Printer size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Emissão do Relatório Financeiro</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Mês de referência: <strong className="text-slate-800 uppercase">{getMonthFormattedName()}</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={executeDirectPrint}
                  className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-md shadow-sky-600/20 transition-all cursor-pointer"
                >
                  <Printer size={16} />
                  <span>Imprimir Agora</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPrintHtml}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs"
                  title="Baixar arquivo HTML formatado para abrir em qualquer navegador"
                >
                  <Download size={15} />
                  <span className="hidden sm:inline">Baixar Relatório</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
                  title="Fechar"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Folha Oficial A4 de Prévia Formatada */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100/60">
              <div className="max-w-3xl mx-auto bg-white p-6 sm:p-10 rounded-2xl shadow-md border border-slate-200/80 text-slate-800 space-y-6 text-xs font-sans">
                {/* Cabeçalho da Empresa */}
                <div className="border-b-2 border-sky-600 pb-4 flex flex-col sm:flex-row justify-between items-start gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
                      {userProfile?.whatsappSettings?.companyName || "RS Piscinas"}
                    </h2>
                    <p className="text-xs font-bold text-slate-500 mt-0.5">
                      DEMONSTRATIVO FINANCEIRO CONSOLIDADO · {getMonthFormattedName().toUpperCase()}
                    </p>
                  </div>
                  <div className="text-left sm:text-right text-[11px] text-slate-600 space-y-0.5">
                    <div><strong>Data de Emissão:</strong> {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                    <div><strong>Emitido por:</strong> {userProfile?.name || 'Administração'} ({userProfile?.role === 'admin' ? 'Administrador' : 'Gestor'})</div>
                  </div>
                </div>

                {/* 4 Cards Resumo */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">Total Recebido</span>
                    <span className="text-base font-black text-emerald-600 block mt-0.5">{formatCurrency(totalRevenues)}</span>
                    <span className="text-[10px] text-slate-500">{monthPayments.length} pagamentos</span>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">Total Despesas</span>
                    <span className="text-base font-black text-rose-600 block mt-0.5">- {formatCurrency(totalMonthExpenses)}</span>
                    <span className="text-[10px] text-slate-500">{monthExpenses.length} despesas</span>
                  </div>

                  <div className={`border rounded-xl p-3 ${isProfitable ? 'bg-emerald-50/50 border-emerald-300' : 'bg-rose-50/50 border-rose-300'}`}>
                    <span className="text-[10px] font-bold uppercase text-slate-700 block">Saldo Líquido</span>
                    <span className={`text-base font-black block mt-0.5 ${isProfitable ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formatCurrency(netBalance)}
                    </span>
                    <span className="text-[10px] text-slate-600 font-bold">Margem: {profitMargin}%</span>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">Meta Contratual</span>
                    <span className="text-base font-black text-sky-700 block mt-0.5">{formatCurrency(activeContractTotal)}</span>
                    <span className="text-[10px] text-slate-500">{activeClientsCount} clientes ativos</span>
                  </div>
                </div>

                {/* Seção 1: Receitas */}
                <div>
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                    <h4 className="font-black text-slate-900 uppercase text-xs">
                      1. Recebimentos Confirmados ({monthPayments.length} lançamentos)
                    </h4>
                    <span className="text-xs font-black text-emerald-600">Total: {formatCurrency(totalRevenues)}</span>
                  </div>
                  {monthPayments.length === 0 ? (
                    <p className="text-slate-400 italic py-2">Nenhum recebimento registrado neste mês.</p>
                  ) : (
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-600 uppercase font-bold bg-slate-50">
                          <th className="py-2 px-2.5">Data</th>
                          <th className="py-2 px-2.5">Cliente</th>
                          <th className="py-2 px-2.5">Tipo / Método</th>
                          <th className="py-2 px-2.5 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {monthPayments.map(p => (
                          <tr key={p.id}>
                            <td className="py-1.5 px-2.5 whitespace-nowrap text-slate-600">
                              {p.paid_date ? new Date(p.paid_date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                            </td>
                            <td className="py-1.5 px-2.5 font-bold text-slate-900">{p.client_name}</td>
                            <td className="py-1.5 px-2.5 text-slate-600">
                              {p.type === 'mensalidade' ? 'Mensalidade Fixa' : 'Serviço Avulso'} ({p.method || 'PIX'})
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-black text-emerald-600">
                              + {formatCurrency(p.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Seção 2: Despesas */}
                <div>
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                    <h4 className="font-black text-slate-900 uppercase text-xs">
                      2. Despesas e Gastos da Empresa ({monthExpenses.length} lançamentos)
                    </h4>
                    <span className="text-xs font-black text-rose-600">Total: - {formatCurrency(totalMonthExpenses)}</span>
                  </div>
                  {monthExpenses.length === 0 ? (
                    <p className="text-slate-400 italic py-2">Nenhuma despesa cadastrada neste mês.</p>
                  ) : (
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-600 uppercase font-bold bg-slate-50">
                          <th className="py-2 px-2.5">Data</th>
                          <th className="py-2 px-2.5">O que foi a despesa</th>
                          <th className="py-2 px-2.5">Categoria</th>
                          <th className="py-2 px-2.5 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {monthExpenses.map(e => (
                          <tr key={e.id}>
                            <td className="py-1.5 px-2.5 whitespace-nowrap text-slate-600">
                              {e.date ? new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                            </td>
                            <td className="py-1.5 px-2.5 font-bold text-slate-900">{e.description}</td>
                            <td className="py-1.5 px-2.5 text-slate-600">{e.category || 'Geral'}</td>
                            <td className="py-1.5 px-2.5 text-right font-black text-rose-600">
                              - {formatCurrency(Number(e.amount) || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Rodapé da Folha */}
                <div className="border-t border-slate-200 pt-3 flex justify-between items-center text-[10px] text-slate-400">
                  <span>{userProfile?.whatsappSettings?.companyName || "RS Piscinas"} · Sistema de Gestão</span>
                  <span>Documento Oficial de Prestação de Contas</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
