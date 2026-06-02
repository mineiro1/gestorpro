import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Briefcase, MapPin, Calendar, DollarSign, User, Plus, Edit, Trash2, CheckCircle } from 'lucide-react';

interface OneOffJob {
  id?: string;
  adminId: string;
  clientName: string;
  clientPhone?: string;
  address: string;
  date: string;
  price: number;
  employeeId: string;
  status: 'pendente' | 'concluido' | 'em_andamento' | 'cancelado';
  returnDate?: string | null;
  report?: string | null;
  employeeName?: string;
  createdAt?: any;
}

export default function OneOffJobs() {
  const { userProfile } = useAuth();
  const [jobs, setJobs] = useState<OneOffJob[]>([]);
  const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingJob, setEditingJob] = useState<OneOffJob | null>(null);
  const [activeTab, setActiveTab] = useState<'pendentes' | 'concluidos'>('pendentes');
  
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    clientName: '',
    clientPhone: '',
    address: '',
    date: '',
    price: 0,
    employeeId: ''
  });

  const getAdminId = () => userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;

  const fetchJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('oneoffjobs')
        .select('*')
        .eq('admin_id', getAdminId())
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (data) {
        setJobs(data.map((d: any) => ({
          id: d.id,
          adminId: d.admin_id,
          clientName: d.title, // assuming clientName maps to title, waiting to see exactly
          clientPhone: d.description, // guessing description stores phone + address
          address: d.description,
          date: d.date,
          price: d.price,
          employeeId: d.employee_id,
          status: d.status,
          createdAt: d.created_at,
          ...d
        })) as unknown as OneOffJob[]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .eq('admin_id', getAdminId())
        .eq('role', 'employee');

      if (error) throw error;
      if (data) {
        setEmployees(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (userProfile) {
      fetchJobs();
      fetchEmployees();
    }
  }, [userProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingJob && editingJob.id) {
        const { error } = await supabase
          .from('oneoffjobs')
          .update({
            title: formData.clientName,
            client_name: formData.clientName,
            client_phone: formData.clientPhone,
            description: `Telefone: ${formData.clientPhone}\nEndereço: ${formData.address}`,
            date: formData.date,
            price: formData.price,
            employee_id: formData.employeeId || null,
          })
          .eq('id', editingJob.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('oneoffjobs')
          .insert({
            admin_id: getAdminId(),
            title: formData.clientName,
            client_name: formData.clientName,
            client_phone: formData.clientPhone,
            description: `Telefone: ${formData.clientPhone}\nEndereço: ${formData.address}`,
            date: formData.date,
            price: formData.price || 0,
            employee_id: formData.employeeId || null,
            status: 'pendente',
          });
        if (error) throw error;
      }
      setIsModalOpen(false);
      setEditingJob(null);
      setFormData({ clientName: '', clientPhone: '', address: '', date: '', price: 0, employeeId: '' });
      fetchJobs();
    } catch (error: any) {
       console.error("Erro ao salvar:", error);
       alert("Erro ao salvar serviço avulso: " + (error.message || "Verifique o console para mais detalhes."));
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteJob = async (id: string) => {
    try {
      const { error } = await supabase.from('oneoffjobs').update({ status: 'concluido' }).eq('id', id);
      if (error) throw error;
      fetchJobs();
    } catch(err) {
      console.error(err);
      alert('Erro ao concluir serviço avulso.');
    }
  };

  const handleDeleteClick = (id: string) => {
    setJobToDelete(id);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!jobToDelete) return;
    try {
      const { error } = await supabase.from('oneoffjobs').delete().eq('id', jobToDelete);
      if (error) throw error;
      fetchJobs();
      setDeleteModalOpen(false);
      setJobToDelete(null);
    } catch(err) {
      console.error(err);
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-primary/10 rounded-lg text-primary">
            <Briefcase size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Serviços Avulsos</h1>
            <p className="text-gray-500 text-sm">Gerencie trabalhos de visita única</p>
          </div>
        </div>
        <button
          onClick={() => {
            setEditingJob(null);
            setFormData({ clientName: '', clientPhone: '', address: '', date: '', price: 0, employeeId: '' });
            setIsModalOpen(true);
          }}
          className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
        >
          <Plus size={20} className="mr-2" />
          Novo Serviço Avulso
        </button>
      </div>

      <div className="flex space-x-2 border-b border-gray-200">
        <button
          className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'pendentes' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
          onClick={() => setActiveTab('pendentes')}
        >
          Serviços Pendentes
        </button>
        <button
          className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'concluidos' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
          onClick={() => setActiveTab('concluidos')}
        >
          Serviços Concluídos
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {jobs.filter(job => activeTab === 'pendentes' ? job.status !== 'concluido' : job.status === 'concluido').map(job => (
          <div key={job.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-gray-800">{job.clientName}</h3>
              <div className="flex space-x-2">
                {job.status === 'pendente' || job.status === 'em_andamento' ? (
                  <button onClick={() => job.id && handleCompleteJob(job.id)} className="text-gray-400 hover:text-green-500 transition-colors" title="Marcar como concluído">
                    <CheckCircle size={18} />
                  </button>
                ) : null}
                <button onClick={() => {
                  setEditingJob(job);
                  setFormData({
                    clientName: job.clientName,
                    clientPhone: job.clientPhone || '',
                    address: job.address,
                    date: job.date,
                    price: job.price,
                    employeeId: job.employeeId
                  });
                  setIsModalOpen(true);
                }} className="text-gray-400 hover:text-primary transition-colors">
                  <Edit size={18} />
                </button>
                <button onClick={() => job.id && handleDeleteClick(job.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            
            <div className="space-y-3 text-sm text-gray-600 mb-4">
              <div className="flex items-start"><MapPin size={16} className="mr-2 mt-0.5 shrink-0" /> <span>{job.address}</span></div>
              <div className="flex items-center"><Calendar size={16} className="mr-2 shrink-0" /> {job.date}</div>
              <div className="flex items-center"><DollarSign size={16} className="mr-2 shrink-0 text-green-600" /> <span className="font-medium text-green-700">R$ {job.price.toFixed(2)}</span></div>
              <div className="flex items-center"><User size={16} className="mr-2 shrink-0" /> {employees.find(e => e.id === job.employeeId)?.name || 'Desconhecido'}</div>
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                job.status === 'concluido' ? 'bg-green-100 text-green-800' :
                job.status === 'em_andamento' ? 'bg-orange-100 text-orange-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {job.status === 'concluido' ? 'Concluído' : job.status === 'em_andamento' ? 'Retorno: ' + job.returnDate : 'Pendente'}
              </span>
            </div>
            {job.report && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 italic border border-gray-100">
                "{job.report}"
              </div>
            )}
          </div>
        ))}
        {jobs.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-xl border border-gray-200">
            Nenhum serviço avulso cadastrado.
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{editingJob ? 'Editar Avulso' : 'Novo Serviço Avulso'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Cliente / Local</label>
                <input required type="text" value={formData.clientName} onChange={e => setFormData({...formData, clientName: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone (Opcional)</label>
                <input type="text" value={formData.clientPhone} onChange={e => setFormData({...formData, clientPhone: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Endereço Completo</label>
                <textarea required value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data da Visita</label>
                  <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
                  <input required type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador Atribuído (Opcional)</label>
                <select value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white">
                  <option value="">Sem colaborador atribuído</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex space-x-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50">
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir Serviço</h3>
            <p className="text-gray-600 mb-6">Tem certeza que deseja excluir este serviço avulso?</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
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
