import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Package, Send, ArrowLeft, Settings, Plus, Trash2, X, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

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

export default function SuppliesForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);
  const [isManaging, setIsManaging] = useState(false);
  const [customProducts, setCustomProducts] = useState<{name: string, defaultUnit: string}[]>([]);
  
  useEffect(() => {
    if (userProfile?.customProducts && userProfile.customProducts.length > 0) {
      setSupplies(userProfile.customProducts.map(p => ({
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
    if (!id || id === 'new') {
      navigate('/clients');
      return;
    }

    const fetchClient = async () => {
      try {
        const clientDoc = await getDoc(doc(db, 'clients', id));
        if (clientDoc.exists()) {
          setClient({ id: clientDoc.id, ...clientDoc.data() });
        } else {
          alert('Cliente não encontrado.');
          navigate('/clients');
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `clients/${id}`);
      } finally {
        setLoading(false);
      }
    };

    fetchClient();
  }, [id, navigate]);

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
      
      await updateDoc(doc(db, 'users', adminId), {
        customProducts: validProducts
      });

      setSupplies(validProducts.map(p => ({
        name: p.name,
        quantity: '',
        unit: p.defaultUnit || 'Un'
      })));
      
      setIsManaging(false);
      alert('Estoque atualizado com sucesso!');
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar estoque.');
    }
  };
  const handleSend = () => {
    if (!client || !client.phone) {
      alert('Cliente não possui telefone cadastrado.');
      return;
    }

    const selected = supplies.filter(s => s.quantity && Number(s.quantity) > 0);
    
    if (selected.length === 0) {
      alert('Selecione pelo menos um produto e informe a quantidade.');
      return;
    }

    let message = `Olá, ${client.name}! verifiquei que será preciso repor os seguintes produtos para a continuidade do tratamento de sua piscina:\n*Lista de Produtos:*\n`;
    
    selected.forEach(s => {
      message += `${s.quantity} ${s.unit} ${s.name}\n`;
    });

    const cleanPhone = client.phone.replace(/\D/g, '');
    const number = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    
    // Check if Evolution or Meta API is configured and enabled in user config
    const settings = userProfile?.whatsappSettings;
    
    if (settings?.useMetaApi && settings.metaToken && settings.metaPhoneNumberId) {
      const sendMeta = async () => {
        try {
          if (!confirm(`Deseja enviar a lista via API Oficial (Meta) para ${client.name}?`)) return;

          const url = `https://graph.facebook.com/v19.0/${settings.metaPhoneNumberId}/messages`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${settings.metaToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: number,
              type: "text",
              text: { preview_url: false, body: message }
            })
          });
          
          if (!response.ok) {
            const err = await response.json();
            throw new Error(`Erro na API (${response.status}): ${err.error?.message || JSON.stringify(err)}`);
          }
          alert('Mensagem de insumos enviada com sucesso (Cloud API)!');
          navigate('/clients');
        } catch (error: any) {
          console.error(error);
          alert(`Falha ao enviar via API Oficial. \n\nLembre-se: Textos livres exigem que o cliente tenha te enviado mensagem nas ultimas 24h.\n\nDetalhe: ${error.message}\n\nAbrindo WhatsApp Web como alternativa.`);
          const encodedMessage = encodeURIComponent(message);
          window.open(`https://wa.me/${number}?text=${encodedMessage}`, '_blank');
        }
      };
      sendMeta();
    }
    else if (settings?.useEvolutionApi && settings.evolutionApiUrl && settings.evolutionApiKey && settings.evolutionInstanceName) {
      const sendEvolution = async () => {
        try {
          const baseUrl = settings.evolutionApiUrl.replace(/\/$/, '');
          const url = `${baseUrl}/message/sendText/${settings.evolutionInstanceName}`;
          
          if (!confirm(`Deseja enviar a lista via Evolution API para ${client.name}?`)) return;

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': settings.evolutionApiKey
            },
            body: JSON.stringify({
              number: number,
              options: { delay: 1000, presence: "composing" },
              textMessage: { text: message }
            })
          });
          
          if (!response.ok) {
            throw new Error(`Erro na API (${response.status})`);
          }
          alert('Mensagem de insumos enviada com sucesso!');
          navigate('/clients');
        } catch (error) {
          console.error(error);
          alert('Falha ao enviar via API. Abrindo WhatsApp Web como alternativa.');
          const encodedMessage = encodeURIComponent(message);
          window.open(`https://wa.me/${number}?text=${encodedMessage}`, '_blank');
        }
      };
      
      sendEvolution();
    } else {
      const encodedMessage = encodeURIComponent(message);
      window.open(`https://wa.me/${number}?text=${encodedMessage}`, '_blank');
    }
  };

  if (loading) {
    return <div className="p-8">Carregando...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="flex items-center mb-6">
        <button onClick={() => navigate('/clients')} className="mr-4 text-gray-500 hover:text-gray-700">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center">
            <Package className="mr-2" /> Insumos para {client?.name}
          </h1>
          <p className="text-gray-600">Selecione os produtos necessários para a piscina deste cliente.</p>
        </div>
        <div className="ml-auto">
          <button 
            onClick={() => setIsManaging(true)}
            className="flex items-center text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg transition-colors"
          >
            <Settings size={16} className="mr-2" />
            Gerenciar Estoque
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="p-3 font-semibold text-gray-600 w-1/2">Produto</th>
                  <th className="p-3 font-semibold text-gray-600 w-1/4">Quantidade</th>
                  <th className="p-3 font-semibold text-gray-600 w-1/4">Unidade de Medida</th>
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
              className="flex items-center px-6 py-3 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 transition-colors shadow-sm"
            >
              <Send size={20} className="mr-2" />
              Enviar Lista via WhatsApp
            </button>
          </div>
        </div>
      </div>

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
