import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Package, Send, Settings, Plus, Trash2, X, Save, Search, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { openWhatsApp, sendEvolutionMessage, sendMetaMessage } from '../lib/whatsapp';

const PREDEFINED_PRODUCTS = [
  'Balde de Cloro 10kg',
  'Sulfato de Aluminio',
  'Barrilha',
  'Bicarbonato',
  'Sulfato de Cobre',
  'Clarificante',
  'Redutor de Ph',
  'Algicida Choque',
  'Algicida Manutenção',
  'Peroxido de Hidrogenio de 5L',
  'Hipoclorito de 5L',
];

const UNITS = ['Un', 'kg', 'Lt', 'Gal'];

type SupplyItem = {
  name: string;
  quantity: string;
  unit: string;
};

export default function ProductsPage() {
  const navigate = useNavigate();
  const { userProfile, isAdmin, isManager } = useAuth();
  
  const [clients, setClients] = useState<any[]>([]);
  const [filteredClients, setFilteredClients] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);
  const [isManaging, setIsManaging] = useState(false);
  const [customProducts, setCustomProducts] = useState<{name: string, defaultUnit: string}[]>([]);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [waSettings, setWaSettings] = useState<any>(null);

  
  useEffect(() => {
    const fetchSettings = async () => {
      const adminId = isAdmin ? userProfile?.uid : userProfile?.adminId;
      if (!adminId) return;
      const { data } = await supabase.from('users').select('whatsapp_settings').eq('id', adminId).single();
      if (data) {
        setWaSettings(data.whatsapp_settings || {});
      }
    };
    if (userProfile) fetchSettings();
  }, [userProfile, isAdmin]);

  useEffect(() => {
    if (userProfile?.customProducts && userProfile.customProducts.length > 0) {
      setSupplies(userProfile.customProducts.map((p: any) => ({
        name: p.name,
        quantity: '',
        unit: p.defaultUnit || 'Un'
      })));
      setCustomProducts(userProfile.customProducts);
    } else {
      const defaultList = PREDEFINED_PRODUCTS.map(p => {
        let defaultUnit = 'Un';
        if (p.includes('Cloro') || p.includes('Un')) defaultUnit = 'Un';
        else if (p.includes('Aluminio') || p.includes('Barrilha') || p.includes('Bicarbonato') || p.includes('Cobre')) defaultUnit = 'kg';
        else if (p.includes('Algicida') || p.includes('Clarificante') || p.includes('Redutor')) defaultUnit = 'Lt';
        else if (p.includes('5L')) defaultUnit = 'Gal';
        
        return {
          name: p,
          quantity: '',
          unit: defaultUnit
        };
      });
      setSupplies(defaultList);
      setCustomProducts(defaultList.map(s => ({name: s.name, defaultUnit: s.unit})));
    }
  }, [userProfile]);

  useEffect(() => {
    if (!userProfile?.uid) return;
    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
    
    const fetchClients = async () => {
      try {
        let queryBuilder = supabase.from('clients').select('*').eq('admin_id', adminId).neq('active', false);
        if (!isAdmin && !isManager) {
          queryBuilder = queryBuilder.eq('employee_id', userProfile.uid);
        }
        
        const { data, error } = await queryBuilder.order('name');
        if (error) throw error;
        
        if (data) {
          setClients(data);
          setFilteredClients(data);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchClients();
  }, [userProfile, isAdmin, isManager]);

  useEffect(() => {
    if (!searchTerm) {
      setFilteredClients(clients);
      return;
    }
    const lower = searchTerm.toLowerCase();
    setFilteredClients(clients.filter(c => c.name?.toLowerCase().includes(lower) || c.phone?.includes(lower)));
  }, [searchTerm, clients]);

  const handleUpdateSupply = (index: number, field: keyof SupplyItem, value: string) => {
    const updated = [...supplies];
    updated[index] = { ...updated[index], [field]: value };
    setSupplies(updated);
  };

  const handleSaveInventory = async () => {
    try {
      const adminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
      if (!adminId) return;
      const validProducts = customProducts.filter(p => p.name.trim() !== '');
      
      const { error } = await supabase.from('users').update({
        custom_products: validProducts
      }).eq('id', adminId);
      
      if(error) throw error;
      setSupplies(validProducts.map(p => ({
        name: p.name,
        quantity: '',
        unit: p.defaultUnit || 'Un'
      })));
      
      setIsManaging(false);
      alert('Inventário atualizado!');
    } catch(err) {
      console.error(err);
      alert('Erro ao salvar inventário.');
    }
  };

  const handleSend = async () => {
    if (!selectedClient) {
      alert('Selecione um cliente primeiro.');
      return;
    }

    const selected = supplies.filter(s => s.quantity && Number(s.quantity) > 0);
    if (selected.length === 0) {
      alert('Preencha a quantidade de pelo menos um insumo.');
      return;
    }

    const number = selectedClient.phone;
    if (!number) {
      alert('O cliente não possui um número de telefone cadastrado.');
      return;
    }

    const message = `Olá *${selectedClient.name}*, estamos precisando de alguns insumos para a manutenção da sua piscina:\n\n` + 
      selected.map(s => `• ${s.name}: ${s.quantity} ${s.unit}`).join('\n') + 
      `\n\nPor favor, providencie assim que possível para não interrompermos o tratamento.`;

    const settings = waSettings || userProfile?.whatsappSettings || {};
    
    // Web WhatsApp natively (synchronous to avoid popup block if no API configured)
    if (!settings.useMetaApi && !settings.useEvolutionApi) {
       openWhatsApp(number, message);
       setSupplies(supplies.map(s => ({ ...s, quantity: '' })));
       setSelectedClient(null);
       return;
    }

    setSendingMessage(true);

    try {
      if (settings.useMetaApi) {
        await sendMetaMessage(number, message, settings);
        alert('Mensagem de insumos enviada com sucesso via Meta API!');
      } else if (settings.useEvolutionApi) {
        await sendEvolutionMessage(number, message, settings);
        alert('Mensagem de insumos enviada com sucesso via Evolution API!');
      }
      setSupplies(supplies.map(s => ({ ...s, quantity: '' })));
      setSelectedClient(null);
    } catch (error: any) {
      console.error(error);
      alert('Falha ao enviar mensagem: ' + error.message);
    } finally {
      setSendingMessage(false);
    }
  };

  if (loading) {
    return <div className="p-8">Carregando...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center">
            <Package className="mr-2" /> Produtos / Insumos
          </h1>
          <p className="text-gray-600">Pesquise o cliente e selecione os produtos necessários.</p>
        </div>
        <div>
          <button 
            onClick={() => setIsManaging(true)}
            className="flex items-center text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg transition-colors"
          >
            <Settings size={16} className="mr-2" />
            Gerenciar Estoque
          </button>
        </div>
      </div>

      {!selectedClient ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Selecionar Cliente</label>
          <div className="relative mb-4">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar cliente por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
            />
          </div>
          
          <div className="max-h-96 overflow-y-auto border border-gray-100 rounded-lg">
            {filteredClients.length > 0 ? (
              filteredClients.map(c => (
                <div 
                  key={c.id} 
                  onClick={() => setSelectedClient(c)}
                  className="p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer flex justify-between items-center transition-colors"
                >
                  <div>
                    <div className="font-medium text-gray-800">{c.name}</div>
                    {(isAdmin || isManager) && <div className="text-sm text-gray-500">{c.phone}</div>}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-gray-500">Nenhum cliente encontrado</div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <div>
              <span className="text-sm text-gray-500 block mb-1">Cliente Selecionado:</span>
              <div className="font-bold text-gray-800 text-lg">{selectedClient.name}</div>
            </div>
            <button 
              onClick={() => setSelectedClient(null)}
              className="text-sm text-primary hover:text-primary-dark underline"
            >
              Trocar Cliente
            </button>
          </div>
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="p-3 font-semibold text-gray-600 w-1/2">Produto</th>
                    <th className="p-3 font-semibold text-gray-600 w-1/4">Quantidade</th>
                    <th className="p-3 font-semibold text-gray-600 w-1/4">Unidade</th>
                  </tr>
                </thead>
                <tbody>
                  {supplies.map((supply, index) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-3 font-medium text-gray-800">{supply.name}</td>
                      <td className="p-3">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="0"
                          className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none"
                          value={supply.quantity}
                          onChange={(e) => handleUpdateSupply(index, 'quantity', e.target.value)}
                        />
                      </td>
                      <td className="p-3">
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none bg-white"
                          value={supply.unit}
                          onChange={(e) => handleUpdateSupply(index, 'unit', e.target.value)}
                        >
                          {UNITS.map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-8 flex justify-end">
              <button
                onClick={handleSend}
                disabled={sendingMessage}
                className="flex items-center px-6 py-3 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 transition-colors shadow-sm disabled:opacity-50"
              >
                <Send size={20} className="mr-2" />
                {sendingMessage ? 'Enviando...' : 'Enviar Lista via WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isManaging && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-gray-800">Gerenciar Produtos</h2>
              <button onClick={() => setIsManaging(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-4">
                {customProducts.map((prod, index) => (
                  <div key={index} className="flex space-x-3 items-center">
                    <input
                      type="text"
                      placeholder="Nome do Produto"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none"
                      value={prod.name}
                      onChange={(e) => {
                        const newProd = [...customProducts];
                        newProd[index].name = e.target.value;
                        setCustomProducts(newProd);
                      }}
                    />
                    <select
                      className="w-24 px-3 py-2 border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none bg-white"
                      value={prod.defaultUnit}
                      onChange={(e) => {
                        const newProd = [...customProducts];
                        newProd[index].defaultUnit = e.target.value;
                        setCustomProducts(newProd);
                      }}
                    >
                      {UNITS.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const newProd = [...customProducts];
                        newProd.splice(index, 1);
                        setCustomProducts(newProd);
                      }}
                      className="p-2 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
                
                <button
                  onClick={() => setCustomProducts([...customProducts, { name: '', defaultUnit: 'Un' }])}
                  className="flex items-center text-primary font-medium hover:text-primary-dark mt-4"
                >
                  <Plus size={18} className="mr-1" /> Adicionar Produto
                </button>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-100 flex justify-end shrink-0 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setIsManaging(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors mr-3"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveInventory}
                className="flex items-center px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark transition-colors"
              >
                <Save size={18} className="mr-2" />
                Salvar Inventário
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
