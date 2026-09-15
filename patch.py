import re

with open('src/pages/ProductsPage.tsx', 'r') as f:
    content = f.read()

# Add states
content = content.replace(
    "const [waSettings, setWaSettings] = useState<any>(null);",
    """const [waSettings, setWaSettings] = useState<any>(null);
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [lastSentData, setLastSentData] = useState<{ client: any, products: SupplyItem[] } | null>(null);"""
)

# Update handleSend logic
handle_send_old = """    const settings = waSettings || userProfile?.whatsappSettings || {};
    
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
    } catch (error: any) {"""

handle_send_new = """    const settings = waSettings || userProfile?.whatsappSettings || {};
    const partnerStores = settings.partnerStores || [];
    
    setLastSentData({ client: selectedClient, products: selected });
    
    // Web WhatsApp natively (synchronous to avoid popup block if no API configured)
    if (!settings.useMetaApi && !settings.useEvolutionApi) {
       openWhatsApp(number, message);
       if (partnerStores.length > 0) {
         setShowPartnerModal(true);
       } else {
         setSupplies(supplies.map(s => ({ ...s, quantity: '' })));
         setSelectedClient(null);
       }
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
      
      if (partnerStores.length > 0) {
        setShowPartnerModal(true);
      } else {
        setSupplies(supplies.map(s => ({ ...s, quantity: '' })));
        setSelectedClient(null);
      }
    } catch (error: any) {"""

content = content.replace(handle_send_old, handle_send_new)

with open('src/pages/ProductsPage.tsx', 'w') as f:
    f.write(content)
