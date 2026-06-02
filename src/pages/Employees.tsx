import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Edit, Trash2, Plus, MapPin } from 'lucide-react';
import { openMap } from '../lib/maps';

export default function Employees() {
  const { userProfile, isAdmin, isManager } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<any>(null);
  const [filterActive, setFilterActive] = useState(true);
  const [hardDeleteModalOpen, setHardDeleteModalOpen] = useState(false);
  const [employeeToHardDelete, setEmployeeToHardDelete] = useState<any>(null);

  useEffect(() => {
    if (!userProfile?.uid) return;

    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
    
    const fetchEmployees = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('admin_id', adminId)
        .in('role', ['employee', 'manager']);
        
      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }
      if (data) {
        setEmployees(data);
      }
      setLoading(false);
    };

    fetchEmployees();

    const channel = supabase.channel('employees_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `admin_id=eq.${adminId}` }, fetchEmployees)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile]);

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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Colaboradores</h1>
        {isAdmin && (
          <Link
            to="/employees/new"
            className="bg-primary text-white px-4 py-2 rounded-lg flex items-center hover:bg-primary-light transition-colors"
          >
            <Plus size={20} className="mr-2" />
            Novo Colaborador
          </Link>
        )}
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
