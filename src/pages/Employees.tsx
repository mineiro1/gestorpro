import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Edit, Trash2, Plus, MapPin, RefreshCw } from 'lucide-react';
import { openMap } from '../lib/maps';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';

export default function Employees() {
  const { userProfile, isAdmin, isManager } = useAuth();
  
  const adminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
  const refreshTrigger = useRealtimeUpdates(['users'], 'admin_id', adminId);

  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<any>(null);
  const [filterActive, setFilterActive] = useState(true);
  const [hardDeleteModalOpen, setHardDeleteModalOpen] = useState(false);
  const [employeeToHardDelete, setEmployeeToHardDelete] = useState<any>(null);

  const fetchEmployees = useCallback(async (isManual = false) => {
    if (!userProfile?.uid) return;
    if (isManual) setIsRefreshing(true);

    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('admin_id', adminId)
        .in('role', ['employee', 'manager']);
        
      if (error) {
        console.error(error);
        return;
      }
      if (data) {
        setEmployees(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      if (isManual) {
        setTimeout(() => setIsRefreshing(false), 400);
      }
    }
  }, [userProfile, isAdmin]);

  useEffect(() => {
    fetchEmployees();

    const adminId = isAdmin ? userProfile?.uid : userProfile?.adminId;
    if (!adminId) return;

    const channel = supabase.channel('employees_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `admin_id=eq.${adminId}` }, () => fetchEmployees())
      .subscribe();

    const handleFocus = () => fetchEmployees();
    const handleGlobal = () => fetchEmployees(true);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('app-global-refresh', handleGlobal);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchEmployees();
    });

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('app-global-refresh', handleGlobal);
    };
  }, [userProfile, refreshTrigger, fetchEmployees, isAdmin]);

  const handleDeleteClick = (employee: any) => {
    setEmployeeToDelete(employee);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!employeeToDelete || !userProfile) return;
    try {
      const { error } = await supabase.from('users').update({ active: false }).eq('id', employeeToDelete.id);
      if (error) throw error;
      
      setEmployees(prev => prev.map(e => e.id === employeeToDelete.id ? { ...e, active: false } : e));
      setDeleteModalOpen(false);
      setEmployeeToDelete(null);
    } catch (error) {
      console.error(error);
      alert("Erro ao inativar colaborador.");
    }
  };

  const reactivateEmployee = async (employeeId: string) => {
    try {
      const { error } = await supabase.from('users').update({ active: true }).eq('id', employeeId);
      if (error) throw error;
      setEmployees(prev => prev.map(e => e.id === employeeId ? { ...e, active: true } : e));
    } catch (err) {
       console.error(err);
       alert("Erro ao reativar colaborador.");
    }
  };

  const handleHardDeleteClick = (employee: any) => {
    setEmployeeToHardDelete(employee);
    setHardDeleteModalOpen(true);
  };

  const executeHardDelete = async () => {
    if (!employeeToHardDelete) return;
    try {
      // Cleanup sessions
      await supabase.from('chat_sessions').update({ employee_id: null }).eq('employee_id', employeeToHardDelete.id);
      const empVisits = await supabase.from('visits').select('id').eq('employee_id', employeeToHardDelete.id);
      if (empVisits.data && empVisits.data.length > 0) {
          await supabase.from('chat_sessions').update({ visit_id: null }).in('visit_id', empVisits.data.map(v => v.id));
      }
      await supabase.from('visits').delete().eq('employee_id', employeeToHardDelete.id);
      await supabase.from('oneoffjobs').delete().eq('employee_id', employeeToHardDelete.id);
      await supabase.from('clients').update({ employee_id: null }).eq('employee_id', employeeToHardDelete.id);
      
      const { error } = await supabase.from('users').delete().eq('id', employeeToHardDelete.id);
      if (error) throw error;
      
      setEmployees(prev => prev.filter(e => e.id !== employeeToHardDelete.id));
      setHardDeleteModalOpen(false);
      setEmployeeToHardDelete(null);
    } catch (err) {
       console.error(err);
    }
  };

  if (loading) return <div>Carregando colaboradores...</div>;

  const filteredEmployees = employees.filter(emp => filterActive ? emp.active !== false : emp.active === false);

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Colaboradores</h1>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <button
            onClick={() => fetchEmployees(true)}
            disabled={isRefreshing}
            className="flex items-center justify-center bg-white border border-gray-200 text-gray-700 px-3.5 py-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-all shadow-sm font-medium text-sm shrink-0 disabled:opacity-60"
            title="Atualizar lista de colaboradores"
          >
            <RefreshCw size={17} className={`mr-1.5 text-primary ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
          </button>
          {isAdmin && (
            <Link
              to="/employees/new"
              className="bg-primary text-white px-4 py-2 rounded-lg flex items-center hover:bg-primary-light transition-colors text-sm font-medium shadow-sm whitespace-nowrap"
            >
              <Plus size={18} className="mr-1.5" />
              Novo Colaborador
            </Link>
          )}
        </div>
      </div>

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
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 font-semibold text-gray-600">Nome</th>
                <th className="p-4 font-semibold text-gray-600">Telefone</th>
                <th className="p-4 font-semibold text-gray-600 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-gray-500">
                    {employees.length === 0 ? 'Nenhum colaborador cadastrado.' : 'Nenhum colaborador encontrado.'}
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((employee) => (
                  <tr key={employee.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-4">{employee.name} {employee.role === 'manager' && '(Gestor)'}</td>
                    <td className="p-4">{employee.phone}</td>
                    <td className="p-4 flex justify-end space-x-2">
                      {employee.last_location && (
                        <button
                          onClick={() => {
                            let lat, lng;
                            if (typeof employee.last_location === 'object' && employee.last_location !== null) {
                                lat = employee.last_location.lat;
                                lng = employee.last_location.lng;
                            } else if (typeof employee.last_location === 'string') {
                                try {
                                  const parsed = JSON.parse(employee.last_location);
                                  if (parsed && parsed.lat) {
                                      lat = parsed.lat;
                                      lng = parsed.lng;
                                  } else {
                                      const parts = employee.last_location.split(',');
                                      if (parts.length >= 2) {
                                        lat = parseFloat(parts[0]);
                                        lng = parseFloat(parts[1]);
                                      }
                                  }
                                } catch (e) {
                                    const parts = employee.last_location.split(',');
                                    if (parts.length >= 2) {
                                      lat = parseFloat(parts[0]);
                                      lng = parseFloat(parts[1]);
                                    }
                                }
                            }
                            if(lat && lng) {
                                openMap({ lat, lng });
                            }
                          }}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-md transition-colors"
                          title="Ver Localização Atual"
                        >
                          <MapPin size={18} />
                        </button>
                      )}
                      {isAdmin && (
                        <>
                          <Link
                            to={`/employees/${employee.id}`}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          >
                            <Edit size={18} />
                          </Link>
                          {employee.active !== false ? (
                            <button
                              onClick={() => handleDeleteClick(employee)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title="Inativar"
                            >
                              <Trash2 size={18} />
                            </button>
                          ) : (
                            <div className="flex flex-col space-y-2">
                              <button
                                onClick={() => reactivateEmployee(employee.id)}
                                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors font-semibold text-sm"
                              >
                                Reativar
                              </button>
                              <button
                                onClick={() => handleHardDeleteClick(employee)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors font-semibold text-sm whitespace-nowrap"
                                title="Excluir Definitivamente"
                              >
                                Apagar Teste
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Inativar Colaborador</h3>
            <p className="text-gray-600 mb-6">Deseja inativar {employeeToDelete?.name}? Ele perderá acesso ao sistema imediatamente.</p>
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
              Atenção: Isso excluirá PERMANENTEMENTE {employeeToHardDelete?.name} e os seus vínculos (ideal para testes). Esta ação não tem volta. Tem certeza?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setHardDeleteModalOpen(false); setEmployeeToHardDelete(null); }}
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
    </div>
  );
}
