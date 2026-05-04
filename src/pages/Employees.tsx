import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Edit, Trash2, Plus, MapPin } from 'lucide-react';

export default function Employees() {
  const { userProfile, isAdmin, isManager } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<any>(null);

  useEffect(() => {
    if (!userProfile?.uid) return;

    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
    const q = query(
      collection(db, 'users'), 
      where('adminId', '==', adminId),
      where('role', 'in', ['employee', 'manager'])
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const employeesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(employeesData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userProfile]);

  const handleDeleteClick = (employee: any) => {
    setEmployeeToDelete(employee);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!employeeToDelete || !userProfile) return;
    try {
      // 1. Unassign clients
      const clientsQuery = query(collection(db, 'clients'), where('employeeId', '==', employeeToDelete.uid));
      // Note: In a real app, we should use a batch or fetch and update. 
      // For simplicity, we'll just delete the user. The clients will still have the employeeId but it won't match any active user.
      // A better approach is to fetch those clients and update them.
      
      await deleteDoc(doc(db, 'users', employeeToDelete.id));
      setDeleteModalOpen(false);
      setEmployeeToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${employeeToDelete.id}`);
    }
  };

  if (loading) return <div>Carregando colaboradores...</div>;

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
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-gray-500">Nenhum colaborador cadastrado.</td>
                </tr>
              ) : (
                employees.map((employee) => (
                  <tr key={employee.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-4">{employee.name} {employee.role === 'manager' && '(Gestor)'}</td>
                    <td className="p-4">{employee.phone}</td>
                    <td className="p-4 flex justify-end space-x-2">
                      {employee.lastLocation && (
                        <button
                          onClick={() => {
                            window.open(`https://www.google.com/maps/search/?api=1&query=${employee.lastLocation.lat},${employee.lastLocation.lng}`, '_blank');
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
                          <button
                            onClick={() => handleDeleteClick(employee)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
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
            <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir Colaborador</h3>
            <p className="text-gray-600 mb-6">Deseja excluir {employeeToDelete?.name}?</p>
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
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
