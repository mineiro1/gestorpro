import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp, deleteDoc } from 'firebase/firestore';
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

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('');

  useEffect(() => {
    if (!userProfile?.uid) return;
    
    // We only want Admin or Manager to see ALL visits. Note: Employee could see their own too if needed.
    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;

    // Fetch Clients for mapping
    const clientsQ = query(collection(db, 'clients'), where('adminId', '==', adminId));
    const unsubClients = onSnapshot(clientsQ, (snap) => {
      const cMap: Record<string, any> = {};
      snap.docs.forEach(doc => { cMap[doc.id] = { id: doc.id, ...doc.data() }; });
      setClients(cMap);
    }, (error) => {
      console.error("Clients snapshot error:", error);
    });

    // Fetch Employees for mapping
    const empQ = query(collection(db, 'users'), where('adminId', '==', adminId));
    const unsubEmp = onSnapshot(empQ, (snap) => {
      const eMap: Record<string, any> = {};
      snap.docs.forEach(doc => { eMap[doc.id] = { id: doc.id, ...doc.data() }; });
      setEmployees(eMap);
    }, (error) => {
      console.error("Employees snapshot error:", error);
    });

    // Fetch Visits
    let viQ = query(collection(db, 'visits'), where('adminId', '==', adminId));
    if (!isAdmin && !isManager) {
       viQ = query(collection(db, 'visits'), where('adminId', '==', adminId), where('employeeId', '==', userProfile.uid));
    }
    
    const unsubVisits = onSnapshot(viQ, (snap) => {
      const vData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      vData.sort((a: any, b: any) => (b.date?.toMillis() || 0) - (a.date?.toMillis() || 0));
      setVisits(vData);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => {
      unsubClients();
      unsubEmp();
      unsubVisits();
    };
  }, [userProfile, isAdmin, isManager]);

  const filteredVisits = visits.filter(visit => {
    let keep = true;
    if (startDate) {
      if (visit.date) {
        const vDate = new Date(visit.date.toMillis());
        const start = new Date(startDate + 'T00:00:00');
        if (vDate < start) keep = false;
      }
    }
    if (endDate) {
      if (visit.date) {
        const vDate = new Date(visit.date.toMillis());
        const end = new Date(endDate + 'T23:59:59');
        if (vDate > end) keep = false;
      }
    }
    if (selectedEmployeeFilter && visit.employeeId !== selectedEmployeeFilter) {
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
    const date = new Date(timestamp.toMillis ? timestamp.toMillis() : timestamp);
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
      const visitRef = doc(db, 'visits', editingVisit.id);
      await updateDoc(visitRef, {
         notes: editNotes,
         date: Timestamp.fromDate(new Date(editDate))
      });
      setEditingVisit(null);
    } catch (e: any) {
      console.error(e);
      alert('Erro ao atualizar visita: ' + e.message);
      handleFirestoreError(e, OperationType.UPDATE, `visits/${editingVisit.id}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteVisit = async (visitId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta visita permanentemente?')) return;
    try {
      await deleteDoc(doc(db, 'visits', visitId));
    } catch (e: any) {
      console.error(e);
      alert('Erro ao excluir visita: ' + e.message);
      handleFirestoreError(e, OperationType.DELETE, `visits/${visitId}`);
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
      const clientName = clients[visit.clientId]?.name || 'Cliente Removido';
      const empName = visit.employeeId ? (employees[visit.employeeId]?.name || 'Colaborador') : 'Administrador';
      const dateStr = visit.date ? new Date(visit.date.toMillis()).toLocaleString('pt-BR') : '-';
      
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
                  const clientName = clients[visit.clientId]?.name || 'Cliente Removido';
                  const empName = visit.employeeId ? (employees[visit.employeeId]?.name || 'Colaborador') : 'Administrador';
                  
                  return (
                    <tr key={visit.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                        {visit.date ? new Date(visit.date.toMillis ? visit.date.toMillis() : visit.date).toLocaleString('pt-BR') : '-'}
                      </td>
                      <td className="p-4 font-medium text-gray-800">
                        {clients[visit.clientId] && (isAdmin || isManager) ? (
                          <Link to={`/clients/${visit.clientId}`} className="text-blue-600 hover:underline">
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
                          {visit.photoUrl && (
                            <button 
                              onClick={() => setFullscreenImage(visit.photoUrl)}
                              className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded text-gray-800 transition-colors"
                            >
                              Ver Foto
                            </button>
                          )}
                          {visit.photoUrls && visit.photoUrls.length > 0 && (
                             <button 
                              onClick={() => setFullscreenImage(visit.photoUrls[0])}
                              className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded text-gray-800 transition-colors"
                            >
                              {visit.photoUrls.length} Fotos
                            </button>
                          )}
                          {isAdmin && visit.location && (
                            <button 
                              type="button"
                              onClick={() => openMap({ lat: visit.location.lat, lng: visit.location.lng })}
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
                               onClick={() => handleDeleteVisit(visit.id)}
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
    </div>
  );
}
