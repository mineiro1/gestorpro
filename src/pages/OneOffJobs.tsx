import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  Briefcase, 
  MapPin, 
  Calendar, 
  DollarSign, 
  User, 
  Plus, 
  Edit, 
  Trash2, 
  CheckCircle, 
  RefreshCw,
  Search,
  Phone,
  MessageCircle,
  ExternalLink,
  RotateCcw,
  Clock,
  Filter,
  Camera
} from 'lucide-react';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import { notifyAdminAttendanceFinished } from '../lib/pushNotifications';

interface OneOffJob {
  id: string;
  adminId: string;
  clientName: string;
  clientPhone: string;
  address: string;
  date: string;
  price: number;
  employeeId: string | null;
  status: 'pendente' | 'concluido' | 'em_andamento' | 'cancelado';
  returnDate?: string | null;
  report?: string | null;
  employeeName?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Utilitário para extrair endereço limpo de descrições antigas ou estruturadas
 */
function parseAddressFromDescription(description: string | null | undefined): string {
  if (!description) return '';
  const trimmed = description.trim();
  if (trimmed.includes('Endereço:')) {
    const parts = trimmed.split('Endereço:');
    return parts[parts.length - 1].trim();
  }
  return trimmed;
}

/**
 * Utilitário para extrair telefone limpo de descrições antigas ou do campo direto
 */
function parsePhone(phone: string | null | undefined, description: string | null | undefined): string {
  if (phone && phone.trim() && phone !== '00000000000' && !phone.startsWith('Telefone:')) {
    return phone.trim();
  }
  if (!description) return '';
  if (description.includes('Telefone:')) {
    const after = description.split('Telefone:')[1] || '';
    const phonePart = after.split('Endereço:')[0]?.split('\n')[0]?.trim() || '';
    return phonePart.replace(/[^0-9]/g, '');
  }
  return '';
}

/**
 * Formata data ISO ou YYYY-MM-DD para exibição amigável brasileira (DD/MM/AAAA)
 */
function formatDateDisplay(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Sem data';
  try {
    const cleanDate = dateStr.slice(0, 10);
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return new Date(dateStr).toLocaleDateString('pt-BR');
  } catch {
    return dateStr;
  }
}

/**
 * Normaliza data para o formato de input HTML type="date" (YYYY-MM-DD)
 */
function normalizeDateForInput(dateStr: string | null | undefined): string {
  if (!dateStr) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return dateStr.slice(0, 10);
}

/**
 * Extrai URLs de imagens do relatório do atendimento para exibição de miniaturas
 */
function extractPhotoUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex) || [];
  return matches.filter(url => 
    url.includes('/chat-media/') || 
    url.includes('supabase.co/storage') || 
    /\.(jpeg|jpg|png|webp|gif)(\?.*)?$/i.test(url)
  );
}

export default function OneOffJobs() {
  const { userProfile, isAdmin, isManager } = useAuth();
  
  const targetAdminId = isAdmin ? userProfile?.uid : (userProfile?.adminId || userProfile?.uid);
  const refreshTrigger = useRealtimeUpdates(['oneoffjobs'], 'admin_id', targetAdminId);

  const [jobs, setJobs] = useState<OneOffJob[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; role?: string }[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingJob, setEditingJob] = useState<OneOffJob | null>(null);
  const [activeTab, setActiveTab] = useState<'pendentes' | 'concluidos'>('pendentes');
  
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('');

  // Formulário
  const [formData, setFormData] = useState({
    clientName: '',
    clientPhone: '',
    address: '',
    date: normalizeDateForInput(null),
    price: '',
    employeeId: ''
  });

  const fetchJobs = useCallback(async (isManual = false) => {
    if (!targetAdminId) return;
    if (isManual) setIsRefreshing(true);
    try {
      const { data, error } = await supabase
        .from('oneoffjobs')
        .select('*')
        .eq('admin_id', targetAdminId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (data) {
        // Ignora ordenações internas do sistema de rotas (system_route_order_*)
        const validJobs = data.filter((d: any) => 
          !d.client_name?.startsWith('system_route_order') && 
          !d.title?.startsWith('system_route_order')
        );

        const mappedJobs: OneOffJob[] = validJobs.map((d: any) => {
          const clientName = d.client_name || d.title || 'Cliente Sem Nome';
          const clientPhone = parsePhone(d.client_phone, d.description);
          const address = parseAddressFromDescription(d.description);

          return {
            id: d.id,
            adminId: d.admin_id,
            clientName,
            clientPhone,
            address,
            date: d.date || '',
            price: typeof d.price === 'number' ? d.price : parseFloat(d.price) || 0,
            employeeId: d.employee_id || null,
            status: d.status || 'pendente',
            returnDate: d.return_date,
            report: d.report,
            createdAt: d.created_at,
            updatedAt: d.updated_at,
          };
        });

        setJobs(mappedJobs);
      }
    } catch (err) {
      console.error('[OneOffJobs] Erro ao carregar serviços avulsos:', err);
    } finally {
      if (isManual) {
        setTimeout(() => setIsRefreshing(false), 300);
      }
    }
  }, [targetAdminId]);

  const fetchEmployees = useCallback(async () => {
    if (!targetAdminId) return;
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, role')
        .or(`admin_id.eq.${targetAdminId},id.eq.${targetAdminId}`)
        .in('role', ['admin', 'manager', 'employee']);

      if (error) throw error;
      if (data) {
        setEmployees(data);
      }
    } catch (err) {
      console.error('[OneOffJobs] Erro ao carregar colaboradores:', err);
    }
  }, [targetAdminId]);

  useEffect(() => {
    fetchJobs();
    fetchEmployees();

    const handleFocus = () => {
      fetchJobs();
      fetchEmployees();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchJobs, fetchEmployees, refreshTrigger]);

  // Manipulação de Abertura do Modal de Criação / Edição
  const handleOpenCreateModal = () => {
    setEditingJob(null);
    setFormData({
      clientName: '',
      clientPhone: '',
      address: '',
      date: normalizeDateForInput(null),
      price: '',
      employeeId: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (job: OneOffJob) => {
    setEditingJob(job);
    setFormData({
      clientName: job.clientName,
      clientPhone: job.clientPhone,
      address: job.address,
      date: normalizeDateForInput(job.date),
      price: job.price > 0 ? String(job.price) : '',
      employeeId: job.employeeId || ''
    });
    setIsModalOpen(true);
  };

  // Submissão do Formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientName.trim() || !formData.address.trim() || !formData.date) {
      alert('Por favor, preencha o nome do cliente, o endereço e a data do serviço.');
      return;
    }

    setLoading(true);
    const parsedPrice = parseFloat(formData.price) || 0;
    const cleanPhone = formData.clientPhone.replace(/[^0-9]/g, '');

    const payload = {
      admin_id: targetAdminId,
      title: formData.clientName.trim(),
      client_name: formData.clientName.trim(),
      client_phone: cleanPhone || null,
      description: formData.address.trim(), // Salva o endereço de forma limpa
      date: formData.date,
      price: parsedPrice,
      employee_id: formData.employeeId || null,
    };

    try {
      if (editingJob && editingJob.id) {
        const { error } = await supabase
          .from('oneoffjobs')
          .update({
            ...payload,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingJob.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('oneoffjobs')
          .insert({
            ...payload,
            status: 'pendente',
            created_at: new Date().toISOString()
          });

        if (error) throw error;
      }

      setIsModalOpen(false);
      setEditingJob(null);
      await fetchJobs();
    } catch (error: any) {
      console.error('[OneOffJobs] Erro ao salvar serviço:', error);
      alert('Erro ao salvar serviço avulso: ' + (error.message || 'Verifique sua conexão.'));
    } finally {
      setLoading(false);
    }
  };

  // Ações de Status
  const handleToggleStatus = async (job: OneOffJob, newStatus: 'pendente' | 'concluido') => {
    try {
      const { error } = await supabase
        .from('oneoffjobs')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);

      if (error) throw error;
      await fetchJobs();

      // Notifica o administrador via push caso o status seja concluído
      if (newStatus === 'concluido' && targetAdminId) {
        notifyAdminAttendanceFinished({
          adminId: targetAdminId,
          employeeId: job.employeeId || userProfile?.uid || targetAdminId,
          clientId: job.id,
          visitId: job.id,
          clientName: job.clientName,
          type: 'job'
        }).catch((e) => console.warn('[Push] Erro ao notificar conclusão de avulso:', e));
      }
    } catch (err: any) {
      console.error('[OneOffJobs] Erro ao atualizar status:', err);
      alert('Falha ao atualizar o status do serviço.');
    }
  };

  // Exclusão
  const handleDeleteClick = (id: string) => {
    setJobToDelete(id);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!jobToDelete) return;
    try {
      const { error } = await supabase.from('oneoffjobs').delete().eq('id', jobToDelete);
      if (error) throw error;
      await fetchJobs();
      setDeleteModalOpen(false);
      setJobToDelete(null);
    } catch (err: any) {
      console.error('[OneOffJobs] Erro ao excluir:', err);
      alert('Não foi possível excluir o serviço avulso.');
    }
  };

  // Abertura de Navegação no Google Maps
  const handleOpenMap = (address: string) => {
    if (!address) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // WhatsApp
  const handleOpenWhatsApp = (phone: string, clientName: string) => {
    const clean = phone.replace(/[^0-9]/g, '');
    if (!clean) return;
    const fullPhone = clean.length <= 11 ? `55${clean}` : clean;
    const msg = encodeURIComponent(`Olá ${clientName}, tudo bem? Sou da RS Piscinas referente ao serviço agendado.`);
    window.open(`https://api.whatsapp.com/send?phone=${fullPhone}&text=${msg}`, '_blank', 'noopener,noreferrer');
  };

  // Filtragem dos serviços na interface
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      // Filtro da aba
      const isConcluido = job.status === 'concluido';
      if (activeTab === 'pendentes' && isConcluido) return false;
      if (activeTab === 'concluidos' && !isConcluido) return false;

      // Filtro de colaborador
      if (selectedEmployeeFilter && job.employeeId !== selectedEmployeeFilter) {
        return false;
      }

      // Filtro de busca textual
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchName = job.clientName.toLowerCase().includes(query);
        const matchAddress = job.address.toLowerCase().includes(query);
        const matchPhone = job.clientPhone.includes(query);
        if (!matchName && !matchAddress && !matchPhone) return false;
      }

      return true;
    });
  }, [jobs, activeTab, selectedEmployeeFilter, searchTerm]);

  // Contadores para as abas
  const pendentesCount = useMemo(() => jobs.filter(j => j.status !== 'concluido').length, [jobs]);
  const concluidosCount = useMemo(() => jobs.filter(j => j.status === 'concluido').length, [jobs]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Briefcase size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Serviços Avulsos</h1>
            <p className="text-slate-500 text-sm">Gerencie ordens de serviço pontuais e visitas avulsas</p>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
          <button
            onClick={() => {
              fetchJobs(true);
              fetchEmployees();
            }}
            disabled={isRefreshing}
            className="flex items-center justify-center bg-white border border-slate-200 text-slate-700 px-3.5 py-2 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-all shadow-sm font-medium text-sm shrink-0 disabled:opacity-60"
            title="Atualizar lista de avulsos"
          >
            <RefreshCw size={17} className={`mr-1.5 text-blue-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors text-sm font-semibold shadow-sm whitespace-nowrap"
          >
            <Plus size={18} className="mr-1.5" />
            Novo Serviço Avulso
          </button>
        </div>
      </div>

      {/* Abas e Filtros de Pesquisa */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-3">
          {/* Abas */}
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('pendentes')}
              className={`pb-2 px-4 text-sm font-semibold transition-all border-b-2 flex items-center gap-2 ${
                activeTab === 'pendentes'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Pendentes / Em Rota</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                activeTab === 'pendentes' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
              }`}>
                {pendentesCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('concluidos')}
              className={`pb-2 px-4 text-sm font-semibold transition-all border-b-2 flex items-center gap-2 ${
                activeTab === 'concluidos'
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Concluídos</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                activeTab === 'concluidos' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
              }`}>
                {concluidosCount}
              </span>
            </button>
          </div>

          {/* Filtro por Colaborador */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Filter size={16} className="text-slate-400 shrink-0" />
            <select
              value={selectedEmployeeFilter}
              onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-full md:w-56"
            >
              <option value="">Todos os colaboradores</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.role === 'admin' ? '(Admin)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Campo de Busca Rápida */}
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar serviço por cliente, endereço ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Grid de Serviços Avulsos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredJobs.map((job) => {
          const assignedEmployee = employees.find((e) => e.id === job.employeeId);
          const isFinished = job.status === 'concluido';
          const isOngoing = job.status === 'em_andamento';

          return (
            <div
              key={job.id}
              className={`bg-white rounded-2xl p-6 shadow-sm border transition-all flex flex-col justify-between ${
                isFinished 
                  ? 'border-emerald-200 bg-emerald-50/10' 
                  : isOngoing 
                    ? 'border-amber-200 bg-amber-50/10' 
                    : 'border-slate-200 hover:shadow-md'
              }`}
            >
              <div>
                {/* Cabeçalho do Card */}
                <div className="flex justify-between items-start mb-3 gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 leading-snug">{job.clientName}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        isFinished 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : isOngoing 
                            ? 'bg-amber-100 text-amber-800' 
                            : 'bg-blue-100 text-blue-800'
                      }`}>
                        {isFinished ? 'Concluído' : isOngoing ? 'Em Atendimento' : 'Pendente'}
                      </span>

                      {job.returnDate && (
                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          Retorno: {formatDateDisplay(job.returnDate)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ações Rápidas */}
                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      onClick={() => handleToggleStatus(job, isFinished ? 'pendente' : 'concluido')}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isFinished
                          ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                          : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                      }`}
                      title={isFinished ? 'Reabrir serviço como pendente' : 'Marcar serviço como concluído'}
                    >
                      {isFinished ? <RotateCcw size={18} /> : <CheckCircle size={18} />}
                    </button>

                    <button
                      onClick={() => handleOpenEditModal(job)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar serviço avulso"
                    >
                      <Edit size={18} />
                    </button>

                    <button
                      onClick={() => handleDeleteClick(job.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir serviço avulso"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Detalhes do Serviço */}
                <div className="space-y-2.5 text-sm text-slate-600 my-4 border-t border-slate-100 pt-3">
                  {/* Endereço com botão de rota no Google Maps */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start text-xs leading-relaxed text-slate-700">
                      <MapPin size={15} className="mr-1.5 mt-0.5 text-red-500 shrink-0" />
                      <span>{job.address || 'Endereço não informado'}</span>
                    </div>
                    {job.address && (
                      <button
                        onClick={() => handleOpenMap(job.address)}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 shrink-0 bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100 transition-colors"
                        title="Abrir no Google Maps / Waze"
                      >
                        <ExternalLink size={11} /> Mapa
                      </button>
                    )}
                  </div>

                  {/* Telefone com atalho do WhatsApp */}
                  {job.clientPhone && (
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center text-slate-700">
                        <Phone size={14} className="mr-1.5 text-slate-400 shrink-0" />
                        <span>{job.clientPhone}</span>
                      </div>
                      <button
                        onClick={() => handleOpenWhatsApp(job.clientPhone, job.clientName)}
                        className="text-[11px] text-emerald-700 hover:text-emerald-900 font-semibold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded hover:bg-emerald-100 transition-colors"
                        title="Enviar mensagem no WhatsApp"
                      >
                        <MessageCircle size={12} /> WhatsApp
                      </button>
                    </div>
                  )}

                  {/* Data da Visita */}
                  <div className="flex items-center text-xs text-slate-700">
                    <Calendar size={14} className="mr-1.5 text-blue-500 shrink-0" />
                    <span>Data Prevista: <strong>{formatDateDisplay(job.date)}</strong></span>
                  </div>

                  {/* Valor Cobrado */}
                  <div className="flex items-center text-xs text-slate-700">
                    <DollarSign size={14} className="mr-1.5 text-emerald-600 shrink-0" />
                    <span>Valor: <strong className="text-emerald-700 text-sm">R$ {job.price.toFixed(2)}</strong></span>
                  </div>

                  {/* Colaborador Responsável */}
                  <div className="flex items-center text-xs text-slate-700">
                    <User size={14} className="mr-1.5 text-purple-500 shrink-0" />
                    <span>Técnico: <strong>{assignedEmployee ? assignedEmployee.name : 'Sem colaborador atribuído'}</strong></span>
                  </div>
                </div>

                {/* Relatório Técnico da Conclusão */}
                {job.report && (
                  <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-700 space-y-2">
                    <div className="flex items-center gap-1 font-semibold text-slate-800">
                      <Clock size={12} className="text-emerald-600" />
                      <span>Relatório do Atendimento:</span>
                    </div>
                    <p className="whitespace-pre-line text-slate-600 italic">"{job.report}"</p>
                    
                    {/* Galeria de Fotos da Piscina Anexadas pelo Técnico */}
                    {(() => {
                      const photos = extractPhotoUrls(job.report);
                      if (photos.length === 0) return null;
                      return (
                        <div className="pt-2 border-t border-slate-200/60">
                          <p className="font-semibold text-slate-700 text-[11px] mb-1.5 flex items-center gap-1">
                            <Camera size={12} className="text-blue-600" /> Fotos da Piscina ({photos.length}):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {photos.map((photoUrl, pIdx) => (
                              <a
                                key={pIdx}
                                href={photoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group relative block w-14 h-14 rounded-lg overflow-hidden border border-slate-200 hover:border-blue-500 shadow-sm transition-all"
                                title="Clique para abrir e ampliar a foto da piscina"
                              >
                                <img
                                  src={photoUrl}
                                  alt={`Foto ${pIdx + 1}`}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                  loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px]">
                                  <ExternalLink size={12} />
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Rodapé do Card com Data de Registro */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 mt-2">
                <span>Criado em: {formatDateDisplay(job.createdAt)}</span>
                {isFinished && (
                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle size={12} /> Concluído
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {filteredJobs.length === 0 && (
          <div className="col-span-full py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
            <Briefcase size={40} className="mx-auto text-slate-300 mb-3" />
            <h4 className="text-base font-bold text-slate-700">Nenhum serviço avulso encontrado</h4>
            <p className="text-xs text-slate-400 mt-1">
              {searchTerm || selectedEmployeeFilter
                ? 'Nenhum resultado corresponde aos filtros aplicados.'
                : activeTab === 'pendentes'
                  ? 'Todos os serviços avulsos foram concluídos!'
                  : 'Nenhum serviço avulso concluído até o momento.'}
            </p>
          </div>
        )}
      </div>

      {/* Modal de Criação / Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800">
                {editingJob ? 'Editar Serviço Avulso' : 'Novo Serviço Avulso'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Cliente / Identificação do Local *
                </label>
                <input
                  required
                  type="text"
                  placeholder="Ex: João da Silva ou Condomínio Damha Casa 4"
                  value={formData.clientName}
                  onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Telefone / WhatsApp (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 67999999999"
                  value={formData.clientPhone}
                  onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Endereço Completo do Serviço *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Ex: Rua das Flores, 123 - Bairro Jardim, Campo Grande - MS"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Data da Visita *
                  </label>
                  <input
                    required
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Valor Cobrado (R$) *
                  </label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Colaborador Responsável pela Execução
                </label>
                <select
                  value={formData.employeeId}
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white"
                >
                  <option value="">Sem colaborador atribuído (Aparece para todos na data)</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} {emp.role === 'admin' ? '(Administrador)' : emp.role === 'manager' ? '(Gestor)' : '(Colaborador)'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex space-x-3 pt-4 border-t border-slate-100 mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 shadow-sm"
                >
                  {loading ? 'Salvando...' : editingJob ? 'Salvar Alterações' : 'Criar Serviço'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Excluir Serviço Avulso</h3>
            <p className="text-sm text-slate-600 mb-6">
              Tem certeza de que deseja excluir permanentemente este serviço avulso? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors shadow-sm"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
