import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Package, Send, ArrowLeft } from 'lucide-react';
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
  
  const [supplies, setSupplies] = useState<SupplyItem[]>(
    PREDEFINED_PRODUCTS.map(p => {
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
    })
  );

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
    </div>
  );
}
