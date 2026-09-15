import re

with open('src/pages/ProductsPage.tsx', 'r') as f:
    content = f.read()

# Add handleSendToPartners
handle_partner = """
  const handleSendToPartners = async () => {
    if (selectedPartners.length === 0) {
      alert('Selecione pelo menos uma loja parceira.');
      return;
    }
    
    if (!lastSentData) return;
    
    const settings = waSettings || userProfile?.whatsappSettings || {};
    const companyName = settings.companyName || 'nossa empresa';
    const partnerStores = settings.partnerStores || [];
    
    const storesToSend = partnerStores.filter((p: any) => selectedPartners.includes(p.phone));
    
    const message = `Olá, aqui é a empresa ${companyName}, enviei para você uma lista de produtos que solicitei ao meu cliente, caso deseje enviar um orçamento para ele(a) estou deixando a lista e o contato dele logo abaixo.\n\n` +
      lastSentData.products.map(s => `• ${s.name}: ${s.quantity} ${s.unit}`).join('\n') +
      `\n\nCliente: ${lastSentData.client.name.split(' ')[0]}\nContato: ${lastSentData.client.phone}`;
      
    // Send to each selected partner
    for (const store of storesToSend) {
      if (!settings.useMetaApi && !settings.useEvolutionApi) {
        // If web native, we need to open window, wait?
        // Opening multiple windows might be blocked. For now, we will open one or use API.
        // If it's multiple, let's open first or just warn them.
        openWhatsApp(store.phone, message);
      } else {
        try {
          if (settings.useMetaApi) {
            await sendMetaMessage(store.phone, message, settings);
          } else if (settings.useEvolutionApi) {
            await sendEvolutionMessage(store.phone, message, settings);
          }
        } catch (err) {
          console.error('Erro ao enviar para loja parceira:', err);
        }
      }
    }
    
    // Clear and close
    setSupplies(supplies.map(s => ({ ...s, quantity: '' })));
    setSelectedClient(null);
    setShowPartnerModal(false);
    setSelectedPartners([]);
    setLastSentData(null);
    
    if (settings.useMetaApi || settings.useEvolutionApi) {
      alert('Lista enviada para as lojas parceiras com sucesso!');
    }
  };

  const closePartnerModal = () => {
    setSupplies(supplies.map(s => ({ ...s, quantity: '' })));
    setSelectedClient(null);
    setShowPartnerModal(false);
    setSelectedPartners([]);
    setLastSentData(null);
  };
"""

content = content.replace("  const handleSend = async () => {", handle_partner + "\n  const handleSend = async () => {")

modal_jsx = """
      {showPartnerModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold text-gray-800">Enviar para Lojas Parceiras?</h2>
              <button onClick={closePartnerModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <p className="text-gray-600 mb-4">
                Deseja enviar a lista de produtos solicitada para suas lojas parceiras cadastradas?
              </p>
              
              <div className="space-y-3">
                {(waSettings?.partnerStores || (userProfile?.whatsappSettings as any)?.partnerStores || []).map((store: any, idx: number) => (
                  <label key={idx} className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary mr-3"
                      checked={selectedPartners.includes(store.phone)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPartners([...selectedPartners, store.phone]);
                        } else {
                          setSelectedPartners(selectedPartners.filter(p => p !== store.phone));
                        }
                      }}
                    />
                    <div>
                      <div className="font-medium text-gray-800">{store.name}</div>
                      <div className="text-sm text-gray-500">{store.phone}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-100 flex justify-between bg-gray-50 shrink-0">
              <button
                onClick={closePartnerModal}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors font-medium"
              >
                Não, obrigado
              </button>
              <button
                onClick={handleSendToPartners}
                disabled={selectedPartners.length === 0}
                className="flex items-center px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                <Send size={18} className="mr-2" />
                Enviar ({selectedPartners.length})
              </button>
            </div>
          </div>
        </div>
      )}
"""

content = content.replace("    </div>\n  );\n}", modal_jsx + "    </div>\n  );\n}")

with open('src/pages/ProductsPage.tsx', 'w') as f:
    f.write(content)
