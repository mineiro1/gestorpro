import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { History, MapPin, X, Download, Filter, Edit, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { openMap } from '../lib/maps';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function VisitsHistory() {
  const { userProfile, isAdmin, isManager } = useAuth();
  const [visits, setVisits] = useState<any[]>([]);
  const [clients, setClients] = useState<Record<string, any>>({});
  const [employees, setEmployees] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [visitToDelete, setVisitToDelete] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('');

  useEffect(() => {
    if (!userProfile?.uid) return;
    
    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;

    const fetchData = async () => {
      // Fetch Clients
      const { data: clientsData, error: clientsErr } = await supabase.from('clients').select('*').eq('admin_id', adminId);
      if (clientsData) {
        const cMap: Record<string, any> = {};
        clientsData.forEach(doc => { cMap[doc.id] = { id: doc.id, ...doc }; });
        setClients(cMap);
      }

      // Fetch Employees
      const { data: usersData, error: usersErr } = await supabase.from('users').select('*').eq('admin_id', adminId);
      if (usersData) {
        const eMap: Record<string, any> = {};
        usersData.forEach(doc => { eMap[doc.id] = { id: doc.id, ...doc }; });
        setEmployees(eMap);
      }

      // Fetch Visits
      let queryBuilder = supabase.from('visits').select('*').eq('admin_id', adminId).order('date', { ascending: false });
      if (!isAdmin && !isManager) {
         queryBuilder = queryBuilder.eq('employee_id', userProfile.uid);
      }
      
      const { data: visitsData, error: visitsErr } = await queryBuilder;
      if (visitsData) {
        setVisits(visitsData);
      }
      setLoading(false);
    };

    fetchData();

    const channel = supabase.channel('visits-history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits', filter: `admin_id=eq.${adminId}` }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile, isAdmin, isManager]);

  const filteredVisits = visits.filter(visit => {
    let keep = true;
    if (startDate) {
      if (visit.date) {
        const vDate = new Date(visit.date);
        const [year, month, day] = startDate.split('-').map(Number);
        const start = new Date(year, month - 1, day, 0, 0, 0);
        if (vDate < start) keep = false;
      }
    }
    if (endDate) {
      if (visit.date) {
        const vDate = new Date(visit.date);
        const [year, month, day] = endDate.split('-').map(Number);
        const end = new Date(year, month - 1, day, 23, 59, 59, 999);
        if (vDate > end) keep = false;
      }
    }
    if (selectedEmployeeFilter && visit.employee_id !== selectedEmployeeFilter) {
      keep = false;
    }
    return keep;
  });

  // Edit Modal State
  const [editingVisit, setEditingVisit] = useState<any | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  const formatDateTimeLocal = (timestamp: any) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const tzoffset = date.getTimezoneOffset() * 60000; // offset in milliseconds
    const localISOTime = (new Date(date.getTime() - tzoffset)).toISOString().slice(0, 16);
    return localISOTime;
  };

  const handleEditClick = (visit: any) => {
    setEditingVisit(visit);
    setEditNotes(visit.notes || '');
    setEditDate(formatDateTimeLocal(visit.date));
  };

  const handeSaveEdit = async () => {
    if (!editingVisit) return;
    setIsUpdating(true);
    try {
      const { error } = await supabase.from('visits').update({
         notes: editNotes,
         date: new Date(editDate).toISOString()
      }).eq('id', editingVisit.id);
      
      if (error) throw error;
      setEditingVisit(null);
    } catch (e: any) {
      console.error(e);
      alert('Erro ao atualizar visita: ' + e.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteVisitClick = (visitId: string) => {
    setVisitToDelete(visitId);
    setDeleteModalOpen(true);
  };

  const confirmDeleteVisit = async () => {
    if (!visitToDelete) return;
    try {
      const { error } = await supabase.from('visits').delete().eq('id', visitToDelete);
      if (error) throw error;
      setDeleteModalOpen(false);
      setVisitToDelete(null);
    } catch (e: any) {
      console.error(e);
      alert('Erro ao excluir visita: ' + e.message);
    }
  };

  const handleGenerateReport = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Relatório de Visitas', 14, 22);
    
    doc.setFontSize(10);
    let subtitle = '';
    if (startDate || endDate) {
      subtitle += `Período: ${startDate ? startDate.split('-').reverse().join('/') : 'Início'} até ${endDate ? endDate.split('-').reverse().join('/') : 'Hoje'} `;
    }
    if (selectedEmployeeFilter) {
       subtitle += ` | Colaborador: ${employees[selectedEmployeeFilter]?.name || 'N/A'}`;
    }
    if (subtitle) {
      doc.text(subtitle, 14, 30);
    }
    
    const tableData = filteredVisits.map(visit => {
      const clientName = clients[visit.client_id]?.name || 'Cliente Removido';
      const empName = visit.employee_id ? (employees[visit.employee_id]?.name || 'Colaborador') : 'Administrador';
      const dateStr = visit.date ? new Date(visit.date).toLocaleString('pt-BR') : '-';
      
      return [
        dateStr,
        clientName,
        empName,
        visit.notes || ''
      ];
    });

    autoTable(doc, {
      startY: subtitle ? 35 : 30,
      head: [['Data/Hora', 'Cliente', 'Colaborador', 'Observações']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] }, // This uses bg-primary approximately
      styles: { fontSize: 9 }
    });

    doc.save('relatorio_visitas.pdf');
  };

  if (loading) {
    return <div className="p-8">Carregando histórico...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center">
          <History className="text-primary mr-3" size={32} />
          <h1 className="text-3xl font-bold text-gray-800">Histórico Geral de Visitas</h1>
        </div>
        
        <button
          onClick={handleGenerateReport}
          className="flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shrink-0"
        >
          <Download size={18} className="mr-2" />
          Gerar Relatório (PDF)
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8 flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 w-full">
          <label className="block text-sm font-medium text-gray-700 mb-1">Data Inicial</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
          />
        </div>
        <div className="flex-1 w-full">
          <label className="block text-sm font-medium text-gray-700 mb-1">Data Final</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
          />
        </div>
        
        {(isAdmin || isManager) && (
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador</label>
            <select
              value={selectedEmployeeFilter}
              onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none bg-white"
            >
              <option value="">Todos</option>
              {Object.values(employees).map((emp: any) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {filteredVisits.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Nenhuma visita encontrada para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-700 text-sm border-b border-gray-200">
                  <th className="p-4 font-semibold">Data/Hora</th>
                  <th className="p-4 font-semibold">Cliente</th>
                  <th className="p-4 font-semibold">Colaborador</th>
                  <th className="p-4 font-semibold">Observações</th>
                  <th className="p-4 font-semibold">Anexos</th>
                  {(isAdmin || isManager) && <th className="p-4 font-semibold text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {filteredVisits.map((visit) => {
                  const clientName = clients[visit.client_id]?.name || 'Cliente Removido';
                  const empName = visit.employee_id ? (employees[visit.employee_id]?.name || 'Colaborador') : 'Administrador';
                  
                  return (
                    <tr key={visit.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                        {visit.date ? new Date(visit.date).toLocaleString('pt-BR') : '-'}
                      </td>
                      <td className="p-4 font-medium text-gray-800">
                        {clients[visit.client_id] && (isAdmin || isManager) ? (
                          <Link to={`/clients/${visit.client_id}`} className="text-blue-600 hover:underline">
                            {clientName}
                          </Link>
                        ) : clientName}
                      </td>
                      <td className="p-4 text-sm text-gray-600">
                        {empName}
                      </td>
                      <td className="p-4 text-sm text-gray-700 max-w-sm truncate" title={visit.notes}>
                        {visit.notes}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          {visit.photo_url && (!visit.photo_urls || visit.photo_urls.length === 0) && (
                            <button 
                              onClick={() => setFullscreenImage(visit.photo_url)}
                              className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded text-gray-800 transition-colors"
                            >
                              Ver Foto
                            </button>
                          )}
                          {visit.photo_urls && visit.photo_urls.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                               {visit.photo_urls.map((photo: string, index: number) => (
                                 <button
                                   key={index}
                                   onClick={() => setFullscreenImage(photo)}
                                   className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded text-gray-800 transition-colors"
                                 >
                                   Foto {index + 1}
                                 </button>
                               ))}
                            </div>
                          )}
                          {isAdmin && visit.location && (
                            <button 
                              type="button"
                              onClick={() => {
                                let lat, lng;
                                if (typeof visit.location === 'object') {
                                    lat = visit.location.lat;
                                    lng = visit.location.lng;
                                } else if (typeof visit.location === 'string') {
                                    const parts = visit.location.split(',');
                                    lat = parseFloat(parts[0]);
                                    lng = parseFloat(parts[1]);
                                }
                                if(lat && lng) openMap({ lat, lng });
                              }}
                              className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 flex items-center transition-colors border-none"
                            >
                              <MapPin size={12} className="mr-1" /> Mapa
                            </button>
                          )}
                        </div>
                      </td>
                      {(isAdmin || isManager) && (
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-2">
                             <button
                               onClick={() => handleEditClick(visit)}
                               className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition-colors"
                               title="Editar Visita"
                             >
                               <Edit size={18} />
                             </button>
                             <button
                               onClick={() => handleDeleteVisitClick(visit.id)}
                               className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-50 transition-colors"
                               title="Excluir Visita"
                             >
                               <Trash2 size={18} />
                             </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {fullscreenImage && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4">
          <button 
            onClick={() => setFullscreenImage(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 p-2"
          >
            <X size={32} />
          </button>
          <img 
            src={fullscreenImage} 
            alt="Foto" 
            className="max-w-full max-h-[85vh] object-contain"
          />
        </div>
      )}

      {editingVisit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Editar Visita</h3>
            
            <div className="mb-4">
               <label className="block text-sm font-medium text-gray-700 mb-1">Data e Hora</label>
               <input
                 type="datetime-local"
                 value={editDate}
                 onChange={e => setEditDate(e.target.value)}
                 className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none"
               />
            </div>

            <div className="mb-6">
               <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
               <textarea
                 value={editNotes}
                 onChange={e => setEditNotes(e.target.value)}
                 rows={4}
                 className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none resize-none"
               ></textarea>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEditingVisit(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium border border-gray-300"
              >
                Cancelar
              </button>
              <button
                onClick={handeSaveEdit}
                disabled={isUpdating}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium disabled:opacity-50"
              >
                {isUpdating ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir Visita</h3>
            <p className="text-gray-600 mb-6">Tem certeza que deseja excluir esta visita permanentemente?</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteVisit}
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
