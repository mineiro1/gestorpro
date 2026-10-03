import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Edit2, Trash2, Plus, X, MessageCircle, RefreshCw } from 'lucide-react';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import { ChatModal } from '../components/ChatModal';

export default function Agenda() {
  const { userProfile, isAdmin, isManager } = useAuth();
  
  const adminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
  const refreshTrigger = useRealtimeUpdates(['agenda_contacts'], 'admin_id', adminId);

  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentContact, setCurrentContact] = useState<any>(null);
  
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<string | null>(null);

  // Chat Modal State
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [activeChatContact, setActiveChatContact] = useState<any | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAgenda = useCallback(async (isManual = false) => {
    if (!userProfile) return;
    if (isManual) setIsRefreshing(true);
    try {
      if (contacts.length === 0 && !isManual) setLoading(true);
      const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
      const { data, error } = await supabase.from('agenda_contacts').select('*').eq('admin_id', adminId).order('name', { ascending: true });
      if (error) throw error;
      if (data) {
        setContacts(data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      if (isManual) {
        setTimeout(() => setIsRefreshing(false), 400);
      }
    }
  }, [userProfile, isAdmin]);

  useEffect(() => {
    fetchAgenda();

    const handleFocus = () => fetchAgenda();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchAgenda();
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchAgenda, refreshTrigger]);

  const handleOpenChat = (contact: any) => {
    const currentAdminId = isAdmin ? userProfile?.uid : (userProfile?.adminId || userProfile?.uid);
    setActiveChatContact({
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      admin_id: currentAdminId,
      employee_id: userProfile?.role === 'employee' ? userProfile?.uid : currentAdminId,
      type: 'agenda'
    });
    setChatModalOpen(true);
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
        admin_id: adminId,
        name: name.trim(),
        phone: phone.trim()
      };

      if (currentContact) {
        const { error } = await supabase.from('agenda_contacts').update(contactData).eq('id', currentContact.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('agenda_contacts').insert(contactData);
        if (error) throw error;
      }
      
      handleCloseModal();
      fetchAgenda();
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar contato.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (contactId: string) => {
    setContactToDelete(contactId);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!contactToDelete) return;
    try {
      const { error } = await supabase.from('agenda_contacts').delete().eq('id', contactToDelete);
      if (error) throw error;
      fetchAgenda();
      setDeleteModalOpen(false);
      setContactToDelete(null);
    } catch (error) {
      console.error(error);
      alert("Erro ao excluir contato.");
    }
  };

  if (!isAdmin && !isManager) return <div className="p-6">Acesso negado.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Agenda de Contatos</h1>
          <p className="text-gray-600 text-sm">Salve contatos para enviar mensagens em lote (não contam como clientes).</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={() => fetchAgenda(true)}
            disabled={isRefreshing}
            className="bg-white border border-gray-200 text-gray-700 px-3.5 py-2 rounded-lg flex items-center hover:bg-gray-50 active:bg-gray-100 transition-all shadow-sm text-sm font-medium disabled:opacity-60 shrink-0"
            title="Atualizar agenda de contatos"
          >
            <RefreshCw size={17} className={`mr-1.5 text-primary ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="bg-primary text-white px-4 py-2 rounded-lg flex items-center hover:bg-primary-dark transition-colors shadow-sm text-sm font-medium shrink-0"
          >
            <Plus size={18} className="mr-1.5" />
            Novo Contato
          </button>
        </div>
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
                          onClick={() => handleOpenChat(c)}
                          className="text-emerald-600 hover:text-emerald-800 mr-4 inline-flex items-center gap-1 font-semibold"
                          title="Abrir Chat com o contato"
                        >
                          <MessageCircle size={18} />
                          <span className="hidden sm:inline">Chat</span>
                        </button>
                        <button
                          onClick={() => handleOpenModal(c)}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                          title="Editar contato"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(c.id)}
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

      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir Contato</h3>
            <p className="text-gray-600 mb-6">Tem certeza que deseja excluir este contato da agenda?</p>
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

      {/* Chat Modal for Agenda Contact */}
      {chatModalOpen && activeChatContact && (
        <ChatModal
          isOpen={chatModalOpen}
          onClose={() => {
            setChatModalOpen(false);
            setActiveChatContact(null);
          }}
          client={activeChatContact}
        />
      )}
    </div>
  );
}
