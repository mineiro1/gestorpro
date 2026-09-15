export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { text, clientPhone, waSettings } = req.body;
    if (!text || !clientPhone) return res.status(400).json({error: "Missing fields"});

    // Send via Evolution API
    if (waSettings?.useEvolutionApi && waSettings?.evolutionApiUrl && waSettings?.evolutionApiKey && waSettings?.evolutionInstanceName) {
      const cleanPhone = clientPhone.replace(/\D/g, '');
      const response = await fetch(`${waSettings.evolutionApiUrl}/message/sendText/${waSettings.evolutionInstanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': waSettings.evolutionApiKey
        },
        body: JSON.stringify({
          number: `55${cleanPhone}`,
          text: text,
          options: { delay: 1200, presence: 'composing' },
          textMessage: { text: text }
        })
      });
      if (!response.ok) {
         const errText = await response.text();
         console.error("Evolution Send Error:", errText);
      }
    } else if (waSettings?.useMetaApi && waSettings?.metaToken) {
      const cleanPhone = clientPhone.replace(/\D/g, '');
      const number = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      
      const baseUrl = (waSettings.metaServerUrl || 'https://graph.facebook.com/v19.0').replace(/\/$/, '');
      const isWame = baseUrl.includes('api-wa.me') || baseUrl.includes('wame.api.br');
      
      let url, headers, body;
      
      if (isWame) {
         url = `${baseUrl}/${waSettings.metaToken}/message/text`;
         headers = { 'Content-Type': 'application/json' };
         body = JSON.stringify({ to: number, text: text });
      } else {
         const phoneId = waSettings.metaPhoneNumberId ? `/${waSettings.metaPhoneNumberId}` : '';
         url = `${baseUrl}${phoneId}/messages`;
         headers = {
            'Authorization': `Bearer ${waSettings.metaToken}`,
            'Content-Type': 'application/json'
         };
         body = JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: number,
            type: "text",
            text: { preview_url: false, body: text }
         });
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body
      });
      
      if (!response.ok) {
         const errText = await response.text();
         console.error("Meta/WAME Send Error:", errText);
      }
    }
    
    res.json({ success: true });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
