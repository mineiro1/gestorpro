import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, deleteDoc, doc, addDoc, updateDoc, serverTimestamp, limit } from 'firebase/firestore';
import { Edit, Trash2, Plus, DollarSign, RotateCcw, Package, Search, MessageCircle, PlusCircle } from 'lucide-react';

export default function Clients() {
  const { userProfile, isAdmin, isManager } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<any>(null);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [clientToPay, setClientToPay] = useState<any>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Undo Payment Modal
  const [paidClients, setPaidClients] = useState<Record<string, any>>({});
  const [undoModalOpen, setUndoModalOpen] = useState(false);
  const [clientToUndo, setClientToUndo] = useState<any>(null);

  // Extra Modal
  const [extraModalOpen, setExtraModalOpen] = useState(false);
  const [clientToExtra, setClientToExtra] = useState<any>(null);
  const [extraAmount, setExtraAmount] = useState('');
  const [extraReason, setExtraReason] = useState('');
  const [isSubmittingExtra, setIsSubmittingExtra] = useState(false);
  const [loadLimit, setLoadLimit] = useState(500);
  const [hasMore, setHasMore] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (!userProfile?.uid) return;

    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
    
    let q = query(collection(db, 'clients'), where('adminId', '==', adminId));
    
    if (!isAdmin && !isManager) {
      q = query(q, where('employeeId', '==', userProfile.uid));
    }
    
    // Only apply limit if there's no search term, to allow local search to work on everything if they search
    if (!searchTerm) {
       q = query(q, limit(loadLimit));
    } else {
       q = query(q, limit(10000));
    }

    const unsubscribeClients = onSnapshot(q, (snapshot) => {
      const clientsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClients(clientsData);
      setHasMore(snapshot.docs.length >= loadLimit);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'clients');
      setLoading(false);
    });

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    const paymentsQuery = query(
      collection(db, 'payments'),
      where('adminId', '==', adminId),
      where('month', '==', currentMonth),
      where('year', '==', currentYear)
    );

    const unsubscribePayments = onSnapshot(paymentsQuery, (snapshot) => {
      const paid: Record<string, any> = {};
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      // Sort by date descending so we store the most recent payment
      docs.sort((a, b) => (b.date?.toMillis() || 0) - (a.date?.toMillis() || 0));
      
      docs.forEach(docData => {
        if (!paid[docData.clientId]) {
          paid[docData.clientId] = docData;
        }
      });
      setPaidClients(paid);
    }, (error) => {
      console.error("Error fetching payments:", error);
    });

    return () => {
      unsubscribeClients();
      unsubscribePayments();
    };
  }, [userProfile, isAdmin, isManager, loadLimit, searchTerm]);

  const handleDeleteClick = (client: any) => {
    setClientToDelete(client);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!clientToDelete) return;
    try {
      await deleteDoc(doc(db, 'clients', clientToDelete.id));
      setDeleteModalOpen(false);
      setClientToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `clients/${clientToDelete.id}`);
    }
  };

  const handlePaymentClick = (client: any) => {
    setClientToPay(client);
    setPaymentModalOpen(true);
  };

  const calculateNextDueDate = (currentDateStr: string, baseDueDay: number) => {
    const [yearStr, monthStr] = currentDateStr.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10);

    // Advance one month
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }

    // Find the last day of the new month
    const lastDayOfNewMonth = new Date(year, month, 0).getDate();

    // The actual day should be the baseDueDay, capped at the last day of the month
    const nextDay = Math.min(baseDueDay, lastDayOfNewMonth);

    // Format back to YYYY-MM-DD
    const formattedMonth = month.toString().padStart(2, '0');
    const formattedDay = nextDay.toString().padStart(2, '0');

    return `${year}-${formattedMonth}-${formattedDay}`;
  };

  const confirmPayment = async () => {
    if (!clientToPay || !userProfile || isSubmittingPayment) return;
    setIsSubmittingPayment(true);

    try {
      const currentDate = new Date();
      const previousDueDate = clientToPay.dueDate || null;

      let refMonth = currentDate.getMonth() + 1;
      let refYear = currentDate.getFullYear();
      if (clientToPay.dueDate) {
        // Extract month and year from the current due date
        const due = new Date(clientToPay.dueDate + 'T12:00:00');
        refMonth = due.getMonth() + 1;
        refYear = due.getFullYear();
      }

      const extraAmt = clientToPay.extraAmount || 0;
      const extraRsn = clientToPay.extraReason || null;
      const totalAmountPaid = clientToPay.monthlyFee + extraAmt;

      await addDoc(collection(db, 'payments'), {
        adminId: userProfile.uid,
        clientId: clientToPay.id,
        amount: totalAmountPaid,
        baseAmount: clientToPay.monthlyFee,
        extraAmount: extraAmt,
        extraReason: extraRsn,
        date: serverTimestamp(),
        month: currentDate.getMonth() + 1,
        year: currentDate.getFullYear(),
        refMonth,
        refYear,
        previousDueDate
      });

      // Update client due date
      if (clientToPay.dueDate) {
        try {
          let currentDueDateStr = clientToPay.dueDate;
          
          // Se por algum motivo a data salva no banco for um timestamp ou objeto Date
          if (typeof currentDueDateStr !== 'string') {
            let d;
            if (currentDueDateStr && typeof currentDueDateStr.toDate === 'function') {
              d = currentDueDateStr.toDate();
            } else {
              d = new Date(currentDueDateStr);
            }
            currentDueDateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
          }

          const baseDay = clientToPay.baseDueDay || parseInt(currentDueDateStr.split('-')[2], 10) || 1;
          const nextDueDate = calculateNextDueDate(currentDueDateStr, baseDay);
          
          await updateDoc(doc(db, 'clients', clientToPay.id), {
            dueDate: nextDueDate,
            baseDueDay: baseDay,
            extraAmount: 0,
            extraReason: ''
          });
        } catch (err) {
          console.error("Erro ao atualizar data de vencimento:", err);
        }
      } else {
        // Just clear extra if no due date
        await updateDoc(doc(db, 'clients', clientToPay.id), {
          extraAmount: 0,
          extraReason: ''
        });
      }

      setPaymentModalOpen(false);
      setClientToPay(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'payments');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleUndoClick = (client: any) => {
    setClientToUndo(client);
    setUndoModalOpen(true);
  };

  const confirmUndo = async () => {
    if (!clientToUndo || !userProfile) return;
    try {
      const payment = paidClients[clientToUndo.id];
      if (payment) {
        await deleteDoc(doc(db, 'payments', payment.id));
        if (payment.previousDueDate) {
          await updateDoc(doc(db, 'clients', clientToUndo.id), {
            dueDate: payment.previousDueDate
          });
        }
      }
      setUndoModalOpen(false);
      setClientToUndo(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `payments/${paidClients[clientToUndo.id]?.id}`);
    }
  };

  const handleExtraClick = (client: any) => {
    setClientToExtra(client);
    setExtraAmount(client.extraAmount ? client.extraAmount.toString() : '');
    setExtraReason(client.extraReason || '');
    setExtraModalOpen(true);
  };

  const confirmExtra = async () => {
    if (!clientToExtra || isSubmittingExtra) return;
    setIsSubmittingExtra(true);
    try {
      await updateDoc(doc(db, 'clients', clientToExtra.id), {
        extraAmount: parseFloat(extraAmount) || 0,
        extraReason: extraReason.trim(),
      });
      setExtraModalOpen(false);
      setClientToExtra(null);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, 'clients');
    } finally {
      setIsSubmittingExtra(false);
    }
  };

  if (loading) return <div>Carregando clientes...</div>;

  const filteredClients = clients.filter(client => 
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (client.phone && client.phone.includes(searchTerm))
  );

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = filteredClients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
        <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
        
        <div className="flex items-center space-x-4 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
            />
          </div>
          {isAdmin && (
            <Link
              to="/clients/new"
              className="bg-primary text-white px-4 py-2 rounded-lg flex items-center hover:bg-primary-light transition-colors whitespace-nowrap"
            >
              <Plus size={20} className="mr-2" />
              Novo Cliente
            </Link>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 font-semibold text-gray-600">Nome</th>
                <th className="p-4 font-semibold text-gray-600">Telefone</th>
                {(isAdmin || isManager) && (
                  <>
                    <th className="p-4 font-semibold text-gray-600">Mensalidade</th>
                    <th className="p-4 font-semibold text-gray-600">Vencimento</th>
                  </>
                )}
                <th className="p-4 font-semibold text-gray-600 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {paginatedClients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500">
                    {clients.length === 0 ? 'Nenhum cliente cadastrado.' : 'Nenhum cliente encontrado na busca.'}
                  </td>
                </tr>
              ) : (
                paginatedClients.map((client) => (
                  <tr key={client.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-4">{client.name}</td>
                    <td className="p-4">{client.phone}</td>
                    {(isAdmin || isManager) && (
                      <>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span>R$ {((client.monthlyFee || 0) + (client.extraAmount || 0)).toFixed(2)}</span>
                          {client.extraAmount && client.extraAmount > 0 && (
                            <span className="text-[10px] text-pink-600 font-semibold bg-pink-50 px-1.5 py-0.5 rounded-full inline-block w-max mt-1">
                              +R$ {client.extraAmount.toFixed(2)} Extra
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        {client.dueDate ? new Date(client.dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'N/A'}
                      </td>
                      </>
                    )}
                    <td className="p-4 flex justify-end space-x-2">
                      {isAdmin && paidClients[client.id] && (
                        <button
                          onClick={() => handleUndoClick(client)}
                          className="p-2 text-orange-600 hover:bg-orange-50 rounded-md transition-colors"
                          title="Desfazer Último Pagamento"
                        >
                          <RotateCcw size={18} />
                        </button>
                      )}
                      
                      {client.phone && (
                        <button
                          onClick={() => {
                            import('../lib/whatsapp').then(({ openWhatsApp }) => {
                              openWhatsApp(`55${client.phone.replace(/\\D/g, '')}`);
                            });
                          }}
                          className="p-2 text-[#25D366] hover:bg-green-50 rounded-md transition-colors"
                          title="Enviar WhatsApp"
                        >
                          <MessageCircle size={18} />
                        </button>
                      )}
                      <Link
                        to={`/clients/${client.id}/supplies`}
                        className="p-2 text-purple-600 hover:bg-purple-50 rounded-md transition-colors"
                        title="Insumos"
                      >
                        <Package size={18} />
                      </Link>
                      {(isAdmin || isManager) && (
                        <>
                          <button
                            onClick={() => handlePaymentClick(client)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-md transition-colors"
                            title="Registrar Pagamento"
                          >
                            <DollarSign size={18} />
                          </button>
                          <button
                            onClick={() => handleExtraClick(client)}
                            className="p-2 text-pink-600 hover:bg-pink-50 rounded-md transition-colors"
                            title="Extra"
                          >
                            <PlusCircle size={18} />
                          </button>
                          <Link
                            to={`/clients/${client.id}`}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            title="Editar"
                          >
                            <Edit size={18} />
                          </Link>
                        </>
                      )}
                      {isAdmin && (
                          <button
                            onClick={() => handleDeleteClick(client)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Excluir"
                          >
                            <Trash2 size={18} />
                          </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {totalPages > 1 && (
          <div className="flex justify-between items-center p-4 border-t border-gray-100 bg-white">
            <span className="text-sm text-gray-500">
              Mostrando de {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, filteredClients.length)} de {filteredClients.length} clientes
            </span>
            <div className="flex space-x-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className={`px-3 py-1 rounded-md text-sm font-medium ${
                  currentPage === 1 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Anterior
              </button>
              
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                // Logic to show pages around current page
                let pageNum = i + 1;
                if (totalPages > 5) {
                  if (currentPage > 3) {
                    pageNum = currentPage - 2 + i;
                  }
                  if (currentPage > totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  }
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 rounded-md text-sm font-medium ${
                      currentPage === pageNum
                        ? 'bg-primary text-white border border-primary'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 rounded-md text-sm font-medium ${
                  currentPage === totalPages 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
        
        {!searchTerm && hasMore && (
           <div className="flex justify-center p-4 bg-gray-50 rounded-b-xl border-t border-gray-100">
             <button
               onClick={() => setLoadLimit(prev => prev + 50)}
               className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm shadow-sm"
             >
               Carregar Mais Clientes do Banco de Dados
             </button>
           </div>
        )}
      </div>

      {/* Delete Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir Cliente</h3>
            <p className="text-gray-600 mb-6">Deseja excluir {clientToDelete?.name}?</p>
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

      {/* Payment Modal */}
      {paymentModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Registrar Pagamento</h3>
            <p className="text-gray-600 mb-6">
              Confirmar pagamento de R$ {((clientToPay?.monthlyFee || 0) + (clientToPay?.extraAmount || 0)).toFixed(2)} para {clientToPay?.name} neste mês?
              {clientToPay?.extraAmount && clientToPay.extraAmount > 0 ? (
                <span className="block mt-2 text-sm text-pink-600 font-medium">
                  Inclui R$ {clientToPay.extraAmount.toFixed(2)} de extra ({clientToPay.extraReason || 'Sem motivo'}).
                </span>
              ) : null}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setPaymentModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmPayment}
                disabled={isSubmittingPayment}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {isSubmittingPayment ? 'Confirmando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Modal */}
      {undoModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Desfazer Pagamento</h3>
            <p className="text-gray-600 mb-6">
              Deseja desfazer o pagamento de {clientToUndo?.name} e retornar o vencimento para a data anterior?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setUndoModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmUndo}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              >
                Sim, desfazer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extra Modal */}
      {extraModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Adicionar Extra</h3>
            <p className="text-sm text-gray-600 mb-4">
              Valor extra que será cobrado na próxima mensalidade vigente de {clientToExtra?.name}.
            </p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor Extra (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={extraAmount}
                  onChange={(e) => setExtraAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
                <input
                  type="text"
                  value={extraReason}
                  onChange={(e) => setExtraReason(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                  placeholder="Ex: Instalação, material, etc."
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setExtraModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmExtra}
                disabled={isSubmittingExtra}
                className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors disabled:opacity-50"
              >
                {isSubmittingExtra ? 'Salvando...' : 'Salvar Extra'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
