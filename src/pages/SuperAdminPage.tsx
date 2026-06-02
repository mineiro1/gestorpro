import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ShieldAlert, CheckCircle, Clock, XCircle, Search, DollarSign, Save } from 'lucide-react';

export default function SuperAdminPage() {
  const { userProfile } = useAuth();
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [monthlyPrice, setMonthlyPrice] = useState<string>('99.90');
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceMessage, setPriceMessage] = useState({ text: '', type: '' });

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [adminToDelete, setAdminToDelete] = useState<string | null>(null);

  // Protect route
  if (userProfile?.email !== 'servincg@gmail.com') {
    return (
      <div className="p-8 text-center text-red-500">
        Acesso restrito. Apenas o criador do sistema tem acesso a esta página.
      </div>
    );
  }

  useEffect(() => {
    fetchAdmins();
    fetchPlatformSettings();
  }, []);

  const fetchPlatformSettings = async () => {
    try {
      // Create settings table if not exists or just select
      // We assume a simple structure or use LocalStorage / some public table.
      // Let's assume you have a 'settings' table or fetch from supabase
      // For now we simulate:
      const { data } = await supabase.from('settings').select('*').eq('id', 'platform').single();
      if (data && data.monthlyprice) {
         setMonthlyPrice(data.monthlyprice.toString().replace('.', ','));
      }
    } catch (e) {
      console.error('Error fetching settings:', e);
    }
  };

  const handleSavePrice = async () => {
    setSavingPrice(true);
    setPriceMessage({ text: '', type: '' });
    try {
      const numericPrice = parseFloat(monthlyPrice.replace(',', '.'));
      if (isNaN(numericPrice) || numericPrice < 0) {
        setPriceMessage({ text: 'Valor inválido', type: 'error' });
        setSavingPrice(false);
        return;
      }
      
      const { error } = await supabase.from('settings').upsert({ id: 'platform', monthlyprice: numericPrice });
      if (error) {
         throw error;
      }
      
      setPriceMessage({ text: 'Valor da mensalidade atualizado!', type: 'success' });
    } catch (e) {
      console.error('Error saving price:', e);
      setPriceMessage({ text: 'Erro ao salvar', type: 'error' });
    }
    setSavingPrice(false);
    setTimeout(() => setPriceMessage({ text: '', type: '' }), 4000);
  };

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const { data: snap } = await supabase.from('users').select('*').eq('role', 'admin');
      if (snap) {
        const adminData = await Promise.all(snap.map(async (docSnap: any) => {
          // count clients
          const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true }).eq('admin_id', docSnap.id);
          return {
            ...docSnap,
            createdAt: docSnap.created_at,
            subscriptionStatus: docSnap.subscription_status,
            subscriptionExpiresAt: docSnap.subscription_expires_at,
            clientsCount: count || 0
          };
        }));
        
        setAdmins(adminData);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleManualUnlock = async (adminId: string) => {
    setProcessingId(adminId);
    try {
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + 30);
      
      await supabase.from('users').update({
        subscription_status: 'active',
        subscription_expires_at: newExpiry.toISOString()
      }).eq('id', adminId);
      fetchAdmins();
    } catch (e: any) {
      console.error('Update Manual Error Unlock:', e);
      alert('Falha ao desbloquear: ' + (e.message || 'Erro desconhecido.'));
    } finally {
      setProcessingId(null);
    }
  };

  const handleManualBlock = async (adminId: string) => {
    setProcessingId(adminId);
    try {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      
      await supabase.from('users').update({
        subscription_status: 'expired',
        subscription_expires_at: past.toISOString()
      }).eq('id', adminId);
      
      fetchAdmins();
    } catch (e: any) {
      console.error('Update Manual Error Block:', e);
      alert('Falha ao bloquear: ' + (e.message || 'Erro desconhecido.'));
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteAdminClick = (adminId: string) => {
    setAdminToDelete(adminId);
    setDeleteModalOpen(true);
  };

  const confirmDeleteAdmin = async () => {
    if (!adminToDelete) return;
    setProcessingId(adminToDelete);
    try {
      await supabase.from('users').delete().eq('id', adminToDelete);
      fetchAdmins();
      setDeleteModalOpen(false);
      setAdminToDelete(null);
    } catch (e: any) {
       console.error('Delete Admin Error:', e);
       alert('Falha ao excluir admin: ' + (e.message || 'Erro desconhecido.'));
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string, expiry: any) => {
    let isExpired = false;
    if (expiry) {
      const expDate = new Date(expiry);
      isExpired = new Date() > expDate;
    }
    
    if (isExpired || status === 'expired') return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold flex items-center w-fit"><XCircle size={12} className="mr-1"/> Bloqueado/Expirado</span>;
    if (status === 'trial') return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold flex items-center w-fit"><Clock size={12} className="mr-1"/> Teste (7 dias)</span>;
    return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold flex items-center w-fit"><CheckCircle size={12} className="mr-1"/> Ativo</span>;
  };

  const filteredAdmins = admins.filter(a => a.name?.toLowerCase().includes(searchTerm.toLowerCase()) || a.email?.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex items-center mb-8">
        <ShieldAlert className="text-secondary mr-3" size={32} />
        <h1 className="text-3xl font-bold text-gray-800">Painel do Desenvolvedor (SuperAdmin)</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-8 border-t-4 border-secondary">
        <h2 className="text-lg font-bold mb-4 flex items-center">
          <DollarSign className="mr-2 text-primary" size={20} />
          Configurações de Pagamento
        </h2>
        <div className="flex flex-col sm:flex-row items-end gap-4 max-w-sm">
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Valor da Mensalidade (R$)
            </label>
            <input
              type="text"
              value={monthlyPrice}
              onChange={(e) => setMonthlyPrice(e.target.value)}
              placeholder="ex: 99,90"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
            />
          </div>
          <button
            onClick={handleSavePrice}
            disabled={savingPrice}
            className="w-full sm:w-auto px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center whitespace-nowrap disabled:opacity-50"
          >
            <Save size={18} className="mr-2" />
            {savingPrice ? 'Salvando...' : 'Salvar Valor'}
          </button>
        </div>
        {priceMessage.text && (
          <div className={`mt-2 text-sm ${priceMessage.type === 'error' ? 'text-red-500' : 'text-green-500'}`}>
            {priceMessage.text}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-8 border-t-4 border-secondary">
        <h2 className="text-lg font-bold mb-4">Administradores do Sistema</h2>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
          />
        </div>

        {loading ? (
          <p>Carregando...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="p-4 font-medium text-gray-600">ID / Data Cadastro</th>
                  <th className="p-4 font-medium text-gray-600">Cliente (Admin) / Senha</th>
                  <th className="p-4 font-medium text-gray-600">Status</th>
                  <th className="p-4 font-medium text-gray-600">Total Clientes</th>
                  <th className="p-4 font-medium text-gray-600">Ações Manuais</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdmins.map((admin) => (
                  <tr key={admin.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="p-4">
                      <div className="text-xs text-gray-500 mb-1">{admin.id}</div>
                      <div className="text-sm">
                        {admin.createdAt ? new Date(admin.createdAt).toLocaleDateString('pt-BR') : 'N/A'}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="font-semibold">{admin.name}</div>
                      <div className="text-sm text-gray-500">{admin.email} | {admin.phone}</div>
                      {admin.password ? (
                        <div className="text-xs text-gray-500 mt-1">Senha: <span className="font-mono bg-gray-100 px-1 rounded">{admin.password}</span></div>
                      ) : (
                        <div className="text-xs text-gray-400 mt-1 italic">Senha não registrada (antiga)</div>
                      )}
                    </td>
                    <td className="p-4">
                      {getStatusBadge(admin.subscriptionStatus, admin.subscriptionExpiresAt)}
                      <div className="text-xs text-gray-500 mt-1">
                        Expira: {admin.subscriptionExpiresAt ? new Date(admin.subscriptionExpiresAt).toLocaleDateString('pt-BR') : 'Sem data'}
                      </div>
                    </td>
                    <td className="p-4 font-mono">{admin.clientsCount}</td>
                    <td className="p-4 space-x-2">
                      <button
                        onClick={() => handleManualUnlock(admin.id)}
                        disabled={processingId === admin.id}
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        {processingId === admin.id ? 'Aguarde...' : 'Liberar 30d'}
                      </button>
                      <button
                        onClick={() => handleManualBlock(admin.id)}
                        disabled={processingId === admin.id}
                        className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 transition-colors text-sm font-medium disabled:opacity-50 mt-1 sm:mt-0"
                      >
                        Bloquear
                      </button>
                      <button
                        onClick={() => handleDeleteAdminClick(admin.id)}
                        disabled={processingId === admin.id}
                        className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors text-sm font-medium disabled:opacity-50 mt-1 sm:mt-0"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir Administrador</h3>
            <p className="text-gray-600 mb-6">Tem certeza que deseja excluir permanentemente este administrador? Isso revogará o acesso dele imediatamente.</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={processingId !== null}
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteAdmin}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                disabled={processingId !== null}
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
