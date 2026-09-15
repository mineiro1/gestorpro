with open('server.ts', 'r') as f:
    content = f.read()

old_block = """      } else if (waSettings?.useMetaApi) {
          // Meta API fallback if they use Meta instead
      }"""

new_block = """      } else if (waSettings?.useMetaApi) {
        if (!waSettings.metaToken) throw new Error("Token Meta obrigatório");
        
        const cleanPhone = clientPhone.replace(/\\D/g, '');
        const number = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
        
        let baseUrl = (waSettings.metaServerUrl || 'https://graph.facebook.com/v19.0').trim().replace(/\\/$/, '');
        if (baseUrl && !baseUrl.startsWith('http')) {
          baseUrl = 'https://' + baseUrl;
        }
        const isWame = baseUrl && !baseUrl.includes('graph.facebook.com');
        
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
        
        const response = await fetch(url, { method: 'POST', headers, body });
        if (!response.ok) {
           const errText = await response.text();
           console.error("Meta/Wame Send Error:", errText);
           return res.status(500).json({ error: "Erro na API Meta/WAME", details: errText });
        }
      }"""

content = content.replace(old_block, new_block)

with open('server.ts', 'w') as f:
    f.write(content)
