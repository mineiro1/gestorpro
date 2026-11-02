import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { expensesService, ExpenseItem } from '../lib/expensesService';
import { 
  Receipt, 
  Plus, 
  Trash2, 
  Camera, 
  Image as ImageIcon, 
  Calendar, 
  DollarSign, 
  Tag, 
  FileText, 
  Search, 
  X, 
  Eye, 
  AlertCircle,
  TrendingDown,
  Loader2,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';

const CATEGORIES = [
  'Geral',
  'Combustível',
  'Produtos Químicos',
  'Veículos & Transporte',
  'Equipamentos & Ferramentas',
  'Alimentação',
  'Manutenção',
  'Impostos & Taxas',
  'Outros'
];

export default function ExpensesPage() {
  const { userProfile, isAdmin, isManager } = useAuth();
  const targetAdminId = isAdmin ? userProfile?.uid : (userProfile?.adminId || userProfile?.uid);

  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Modal de Nova Despesa
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('Geral');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  // Modal de Visualização de Comprovante em Tela Cheia
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Modal de Confirmação de Exclusão
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Inputs de arquivo (Galeria e Câmera)
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const loadExpenses = async () => {
    if (!targetAdminId) return;
    setLoading(true);
    try {
      const items = await expensesService.getExpenses(targetAdminId);
      setExpenses(items);
    } catch (err) {
      console.error('Erro ao carregar despesas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();

    // Sincronização automática ao focar ou alternar de tela/aba (ex: voltar para o app no celular)
    const handleFocus = () => loadExpenses();
    window.addEventListener('focus', handleFocus);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadExpenses();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Canal Realtime do Supabase para refletir despesas cadastradas e excluídas em tempo real entre celular e computador
    let channel: any = null;
    if (targetAdminId) {
      channel = supabase.channel(`realtime-expenses-${targetAdminId}`)
        // 1. Escuta eventos de transmissão instantânea (Broadcast) entre dispositivos conectados
        .on('broadcast', { event: 'expense_deleted' }, (payload: any) => {
          const deletedId = payload?.payload?.id || payload?.id;
          if (deletedId) {
            console.log(`[Expenses Realtime] Despesa excluída em outro dispositivo: ${deletedId}`);
            setExpenses(prev => prev.filter(item => item.id !== deletedId));
            expensesService.setLocalCache(
              targetAdminId,
              expensesService.getLocalCache(targetAdminId).filter(e => e.id !== deletedId)
            );
          }
        })
        .on('broadcast', { event: 'expense_saved' }, (payload: any) => {
          const savedItem = payload?.payload || payload;
          if (savedItem && savedItem.id) {
            console.log(`[Expenses Realtime] Nova despesa recebida de outro dispositivo: ${savedItem.id}`);
            setExpenses(prev => {
              const idx = prev.findIndex(item => item.id === savedItem.id);
              let nextList: ExpenseItem[];
              if (idx >= 0) {
                nextList = [...prev];
                nextList[idx] = savedItem;
              } else {
                nextList = [savedItem, ...prev];
              }
              return nextList.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            });
            const currentCache = expensesService.getLocalCache(targetAdminId);
            const cIdx = currentCache.findIndex(e => e.id === savedItem.id);
            if (cIdx >= 0) currentCache[cIdx] = savedItem;
            else currentCache.unshift(savedItem);
            expensesService.setLocalCache(targetAdminId, currentCache);
          }
        })
        // 2. Escuta alterações no nível de tabela do Postgres
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'expenses' 
        }, (payload: any) => {
          if (payload?.eventType === 'DELETE' && payload?.old?.id) {
            const delId = payload.old.id;
            setExpenses(prev => prev.filter(item => item.id !== delId));
            expensesService.setLocalCache(
              targetAdminId,
              expensesService.getLocalCache(targetAdminId).filter(e => e.id !== delId)
            );
          } else {
            loadExpenses();
          }
        })
        .subscribe();
    }

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (channel) supabase.removeChannel(channel);
    };
  }, [targetAdminId]);

  // Manipulador de upload de comprovante (Foto da câmera ou Galeria)
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione uma imagem válida (PNG, JPG, JPEG, WEBP).');
      return;
    }

    setReceiptFile(file);
    const localUrl = URL.createObjectURL(file);
    setReceiptPreview(localUrl);
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      alert('Por favor, informe a descrição da despesa.');
      return;
    }

    const cleanAmount = parseFloat(amount.replace(/\./g, '').replace(',', '.'));
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
      alert('Por favor, informe um valor numérico válido.');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalReceiptUrl: string | null = null;

      // Se houver arquivo de comprovante selecionado, envia para upload
      if (receiptFile) {
        setUploadingReceipt(true);
        finalReceiptUrl = await expensesService.uploadReceipt(receiptFile);
        setUploadingReceipt(false);
      }

      await expensesService.saveExpense({
        adminId: targetAdminId!,
        description: description.trim(),
        amount: cleanAmount,
        date: date || new Date().toISOString().split('T')[0],
        receiptUrl: finalReceiptUrl,
        category
      });

      // Recarrega e fecha modal
      await loadExpenses();
      setIsModalOpen(false);
      resetForm();
    } catch (err) {
      console.error('Erro ao criar despesa:', err);
      alert('Não foi possível salvar a despesa. Tente novamente.');
    } finally {
      setIsSubmitting(false);
      setUploadingReceipt(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!targetAdminId) return;
    try {
      // 1. Atualização otimista imediata da interface
      setExpenses(prev => prev.filter(item => item.id !== id));
      setDeletingId(null);

      // 2. Exclusão em profundidade no banco de dados, servidor e cache
      await expensesService.deleteExpense(id, targetAdminId);
    } catch (err) {
      console.error('Erro ao excluir despesa:', err);
      alert('Erro ao excluir o lançamento.');
      loadExpenses();
    }
  };

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setCategory('Geral');
    setReceiptFile(null);
    setReceiptPreview(null);
  };

  // Filtragem de despesas por mês e busca
  const filteredExpenses = expenses.filter(item => {
    // Filtro por mês
    const itemMonth = item.date ? item.date.substring(0, 7) : item.created_at?.substring(0, 7);
    if (selectedMonth && itemMonth !== selectedMonth) {
      return false;
    }
    // Filtro por busca de texto
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchDesc = item.description?.toLowerCase().includes(term);
      const matchCat = item.category?.toLowerCase().includes(term);
      const matchVal = item.amount?.toString().includes(term);
      return matchDesc || matchCat || matchVal;
    }
    return true;
  });

  // Totais do mês selecionado
  const totalMonthExpenses = filteredExpenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  // Total de hoje
  const todayStr = new Date().toISOString().split('T')[0];
  const totalTodayExpenses = expenses
    .filter(e => e.date === todayStr)
    .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-20 animate-in fade-in duration-300">
      {/* Inputs ocultos para Câmera e Galeria */}
      <input 
        type="file" 
        ref={galleryInputRef} 
        onChange={handleFileSelected} 
        accept="image/*" 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={cameraInputRef} 
        onChange={handleFileSelected} 
        accept="image/*" 
        capture="environment" 
        className="hidden" 
      />

      {/* Header com Alto Contraste */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-600 mb-1">
            <Receipt size={16} />
            Gestão Financeira Empresarial
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            Despesas da Empresa
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Cadastre os gastos da empresa, anexe comprovantes por foto e acompanhe os custos com persistência permanente.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadExpenses}
            disabled={loading}
            className="p-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl transition-colors shadow-sm cursor-pointer"
            title="Atualizar lançamentos"
          >
            <RefreshCw size={18} className={loading ? "animate-spin text-rose-600" : ""} />
          </button>

          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-bold text-sm rounded-xl shadow-md shadow-rose-600/20 transition-all transform active:scale-95 cursor-pointer"
          >
            <Plus size={18} />
            Nova Despesa
          </button>
        </div>
      </div>

      {/* Cards de Resumo com Alto Contraste */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total do Mês */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Total Despesas no Mês</span>
            <span className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
              <TrendingDown size={18} />
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl sm:text-3xl font-black text-rose-600 tracking-tight">
              {formatCurrency(totalMonthExpenses)}
            </p>
            <p className="text-xs text-slate-500 font-medium">
              Soma total das despesas de {new Date(selectedMonth + '-02').toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Despesas de Hoje */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Despesas de Hoje</span>
            <span className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <Calendar size={18} />
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl sm:text-3xl font-black text-amber-600 tracking-tight">
              {formatCurrency(totalTodayExpenses)}
            </p>
            <p className="text-xs text-slate-500 font-medium">
              Lançamentos registrados para o dia de hoje
            </p>
          </div>
        </div>

        {/* Quantidade de Registros */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Comprovantes & Lançamentos</span>
            <span className="p-2 rounded-xl bg-sky-50 text-sky-600 border border-sky-200">
              <FileText size={18} />
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {filteredExpenses.length} <span className="text-sm font-semibold text-slate-500">itens</span>
            </p>
            <p className="text-xs text-slate-500 font-medium">
              {filteredExpenses.filter(e => e.receiptUrl).length} possuem comprovante em anexo
            </p>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca com Fundo Branco e Texto Escuro */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por descrição, valor ou categoria..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-rose-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-bold text-slate-600 shrink-0">Filtrar Mês:</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:bg-white focus:border-rose-500 transition-colors"
          />
        </div>
      </div>

      {/* Lista / Tabela de Lançamentos com Alto Contraste */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center space-y-3">
            <Loader2 size={32} className="animate-spin text-rose-600" />
            <p className="text-sm font-medium text-slate-600">Carregando despesas da empresa...</p>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
              <Receipt size={28} />
            </div>
            <h3 className="text-base font-bold text-slate-800">Nenhuma despesa encontrada</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              {searchTerm 
                ? "Nenhum lançamento corresponde aos termos da pesquisa." 
                : "Não há despesas cadastradas para o mês selecionado. Clique em 'Nova Despesa' para adicionar um gasto."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">O que foi a despesa</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4 text-center">Comprovante</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4 text-center w-24">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map((expense) => {
                  const displayDate = expense.date 
                    ? new Date(expense.date + 'T12:00:00').toLocaleDateString('pt-BR') 
                    : new Date(expense.created_at).toLocaleDateString('pt-BR');

                  return (
                    <tr key={expense.id} className="hover:bg-slate-50 transition-colors group">
                      {/* Data */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-600 font-medium">
                        {displayDate}
                      </td>

                      {/* Descrição */}
                      <td className="py-3.5 px-4 font-bold text-slate-900 max-w-xs md:max-w-md">
                        <span className="block truncate" title={expense.description}>
                          {expense.description}
                        </span>
                      </td>

                      {/* Categoria */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {expense.category || 'Geral'}
                        </span>
                      </td>

                      {/* Foto do Comprovante */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-center">
                        {expense.receiptUrl ? (
                          <button
                            type="button"
                            onClick={() => setPreviewImageUrl(expense.receiptUrl || null)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            title="Visualizar comprovante"
                          >
                            <Eye size={13} />
                            Ver Foto
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Sem foto</span>
                        )}
                      </td>

                      {/* Valor */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-right font-black text-rose-600 text-sm">
                        - {formatCurrency(Number(expense.amount) || 0)}
                      </td>

                      {/* Botão Deletar (Exclusivo por clique) */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-center">
                        <button
                          type="button"
                          onClick={() => setDeletingId(expense.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Excluir este lançamento"
                        >
                          <Trash2 size={16} />
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

      {/* MODAL: Nova Despesa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
                  <Receipt size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Cadastrar Nova Despesa</h3>
                  <p className="text-xs text-slate-500 font-medium">Preencha os detalhes e anexe o comprovante</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateExpense} className="space-y-4 overflow-y-auto pr-1">
              {/* O que foi a despesa */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <FileText size={14} className="text-rose-600" />
                  O que foi a despesa? *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Abastecimento Fiat Strada, 10 baldes de cloro, almoço equipe..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-rose-500 transition-colors"
                />
              </div>

              {/* Valor e Data */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <DollarSign size={14} className="text-emerald-600" />
                    Valor (R$) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="0,00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-black text-emerald-700 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Calendar size={14} className="text-sky-600" />
                    Data da Despesa
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:bg-white focus:border-sky-500 transition-colors"
                  />
                </div>
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Tag size={14} className="text-amber-600" />
                  Categoria do Gasto
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:bg-white focus:border-amber-500 transition-colors cursor-pointer"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Seção Foto do Comprovante (Câmera ou Galeria) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Camera size={14} className="text-sky-600" />
                  Foto do Comprovante (Opcional)
                </label>

                {receiptPreview ? (
                  <div className="relative rounded-2xl overflow-hidden border border-slate-300 bg-slate-50 p-2">
                    <img 
                      src={receiptPreview} 
                      alt="Prévia do Comprovante" 
                      className="w-full h-44 object-cover rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setReceiptFile(null);
                        setReceiptPreview(null);
                      }}
                      className="absolute top-4 right-4 p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-lg transition-transform active:scale-90"
                      title="Remover foto"
                    >
                      <X size={16} />
                    </button>
                    <div className="mt-2 text-center">
                      <span className="text-xs font-bold text-emerald-700 flex items-center justify-center gap-1">
                        <CheckCircle2 size={13} />
                        Foto pronta para envio
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {/* Botão Tirar Foto (Câmera) */}
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-50 hover:bg-sky-50 border-2 border-dashed border-slate-300 hover:border-sky-400 rounded-2xl text-slate-700 hover:text-sky-700 transition-all cursor-pointer group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Camera size={20} />
                      </div>
                      <span className="text-xs font-bold">Tirar Foto</span>
                      <span className="text-[10px] text-slate-500 font-medium">Usar Câmera</span>
                    </button>

                    {/* Botão Escolher da Galeria */}
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-2xl text-slate-700 transition-all cursor-pointer group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <ImageIcon size={20} />
                      </div>
                      <span className="text-xs font-bold">Galeria de Fotos</span>
                      <span className="text-[10px] text-slate-500 font-medium">Do Arquivo</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Botões do Formulário */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-bold text-xs rounded-xl shadow-md shadow-rose-600/20 transition-all transform active:scale-95 disabled:opacity-60 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{uploadingReceipt ? 'Enviando comprovante...' : 'Salvando...'}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Salvar Despesa</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Visualizar Comprovante em Tela Cheia */}
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

      {/* MODAL: Confirmar Exclusão (Garantia de que só apaga por clique intencional) */}
      {deletingId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto mb-3">
              <AlertCircle size={24} />
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-1">Excluir este lançamento?</h3>
            <p className="text-xs text-slate-600 mb-5">
              Esta ação removerá definitivamente esta despesa do histórico da empresa. Não é possível desfazer.
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDeleteExpense(deletingId)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md shadow-red-600/20 transition-all cursor-pointer"
              >
                Sim, Excluir Despesa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
