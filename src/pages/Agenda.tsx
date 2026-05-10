import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Edit2, Trash2, Plus, X } from 'lucide-react';

export default function Agenda() {
  const { userProfile, isAdmin, isManager } = useAuth();
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentContact, setCurrentContact] = useState<any>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userProfile) return;
    fetchAgenda();
  }, [userProfile]);

  const fetchAgenda = async () => {
    try {
      setLoading(true);
      const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
      const q = query(collection(db, 'agenda_contacts'), where('adminId', '==', adminId));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      data.sort((a, b) => a.name.localeCompare(b.name));
      setContacts(data);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'agenda_contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (contact = null) => {
    if (contact) {
      setCurrentContact(contact);
      setName(contact.name);
      setPhone(contact.phone);
    } else {
      setCurrentContact(null);
      setName('');
      setPhone('');
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentContact(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !userProfile) return;
    
    // Validate phone length (roughly)
    const phoneInfo = phone.replace(/\D/g, '');
    if (phoneInfo.length < 10) {
      alert("Por favor, insira um telefone válido com DDD.");
      return;
    }

    setSaving(true);
    try {
      const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
      
      const contactData = {
        adminId,
        name: name.trim(),
        phone: phone.trim()
      };

      if (currentContact) {
        await updateDoc(doc(db, 'agenda_contacts', currentContact.id), contactData);
      } else {
        await addDoc(collection(db, 'agenda_contacts'), {
          ...contactData,
          createdAt: serverTimestamp()
        });
      }
      
      handleCloseModal();
      fetchAgenda();
    } catch (error) {
      handleFirestoreError(error, currentContact ? OperationType.UPDATE : OperationType.CREATE, 'agenda_contacts');
      alert("Erro ao salvar contato.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contactId: string) => {
    if (!window.confirm("Certeza que deseja excluir este contato?")) return;
    
    try {
      await deleteDoc(doc(db, 'agenda_contacts', contactId));
      fetchAgenda();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'agenda_contacts');
      alert("Erro ao excluir contato.");
    }
  };

  if (!isAdmin && !isManager) return <div className="p-6">Acesso negado.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Agenda de Contatos</h1>
          <p className="text-gray-600">Salve contatos para enviar mensagens em lote (não contam como clientes).</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="mt-4 md:mt-0 bg-primary text-white px-4 py-2 rounded-lg flex items-center hover:bg-primary-dark transition-colors shadow-sm"
        >
          <Plus size={20} className="mr-2" />
          Novo Contato
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Telefone</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {contacts.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                      Nenhum contato salvo na agenda.
                    </td>
                  </tr>
                ) : (
                  contacts.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-semibold text-gray-900">{c.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                        {c.phone}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleOpenModal(c)}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                          title="Editar contato"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Excluir contato"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-800">
                {currentContact ? 'Editar Contato' : 'Novo Contato'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  placeholder="Nome do contato"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone (WhatsApp)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  placeholder="(00) 00000-0000"
                  required
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
