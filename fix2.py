with open('src/pages/ProductsPage.tsx', 'r') as f:
    content = f.read()

import re

# We will just rewrite the handleSendToPartners function
start_idx = content.find('const handleSendToPartners = async () => {')
end_idx = content.find('const closePartnerModal = () => {')

if start_idx != -1 and end_idx != -1:
    old_func = content[start_idx:end_idx]
    
    new_func = """const handleSendToPartners = async () => {
    if (selectedPartners.length === 0) {
      alert('Selecione pelo menos uma loja parceira.');
      return;
    }
    
    if (!lastSentData) return;
    
    const settings = waSettings || userProfile?.whatsappSettings || {};
    const companyName = settings.companyName || 'nossa empresa';
    const partnerStores = settings.partnerStores || [];
    
    const storesToSend = partnerStores.filter((p: any) => selectedPartners.includes(p.phone));
    
    const message = `Olá, aqui é a empresa ${companyName}, enviei para você uma lista de produtos que solicitei ao meu cliente, caso deseje enviar um orçamento para ele(a) estou deixando a lista e o contato dele logo abaixo.\\n\\n` +
      lastSentData.products.map(s => `• ${s.name}: ${s.quantity} ${s.unit}`).join('\\n') +
      `\\n\\nCliente: ${lastSentData.client.name.split(' ')[0]}\\nContato: ${lastSentData.client.phone}`;
      
    // Send to each selected partner
    for (const store of storesToSend) {
      if (!settings.useMetaApi && !settings.useEvolutionApi) {
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
    
    setSupplies(supplies.map(s => ({ ...s, quantity: '' })));
    setSelectedClient(null);
    setShowPartnerModal(false);
    setSelectedPartners([]);
    setLastSentData(null);
    
    if (settings.useMetaApi || settings.useEvolutionApi) {
      alert('Lista enviada para as lojas parceiras com sucesso!');
    }
  };

  """
    content = content[:start_idx] + new_func + content[end_idx:]

with open('src/pages/ProductsPage.tsx', 'w') as f:
    f.write(content)
