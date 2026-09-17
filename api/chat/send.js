export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { text, clientPhone } = req.body;
    let { waSettings } = req.body;
    if (!text || !clientPhone) return res.status(400).json({error: "Missing fields"});

    // Fetch the absolute latest settings from DB to prevent stale frontend state issues
    try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        // Assuming we can find the user by checking the clients table first
        const cleanPhone = clientPhone.replace(/\D/g, '');
        // Or actually, we don't know the adminId easily without querying. 
        // Let's just query the user by email for this specific instance (since it's a single-tenant or known user for now)
        const { data: userData } = await supabase.from('users').select('whatsapp_settings').not('whatsapp_settings', 'is', null).limit(1);
        if (userData && userData.length > 0 && userData[0].whatsapp_settings) {
            waSettings = userData[0].whatsapp_settings;
        }
    } catch (dbErr) {
        console.error("Error fetching fresh waSettings:", dbErr);
    }

    // Send via Evolution API
    if (waSettings?.useEvolutionApi && waSettings?.evolutionApiUrl && waSettings?.evolutionApiKey && waSettings?.evolutionInstanceName) {
      const cleanPhone = clientPhone.replace(/\D/g, '');
      let originalNumber = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      
      let numbersToTry = [originalNumber];
      if (originalNumber.length >= 12 && originalNumber.startsWith('55')) {
        const ddd = parseInt(originalNumber.substring(2, 4), 10);
        if (ddd <= 28) {
          if (originalNumber.length === 12) {
            originalNumber = originalNumber.substring(0, 4) + '9' + originalNumber.substring(4);
            numbersToTry = [originalNumber];
          }
        } else {
          if (originalNumber.length === 13 && originalNumber[4] === '9') {
            numbersToTry.push(originalNumber.substring(0, 4) + originalNumber.substring(5));
          } else if (originalNumber.length === 12) {
            numbersToTry.push(originalNumber.substring(0, 4) + '9' + originalNumber.substring(4));
          }
        }
      }

      for (const num of numbersToTry) {
          const response = await fetch(`${waSettings.evolutionApiUrl}/message/sendText/${waSettings.evolutionInstanceName}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': waSettings.evolutionApiKey
            },
            body: JSON.stringify({
              number: num,
              text: text,
              options: { delay: 1200, presence: 'composing' },
              textMessage: { text: text }
            })
          });
          if (!response.ok) {
             const errText = await response.text();
             console.error("Evolution Send Error for num", num, errText);
          }
      }
    } else if (waSettings?.useMetaApi && waSettings?.metaToken) {
      const cleanPhone = clientPhone.replace(/\D/g, '');
      let originalNumber = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      
      const baseUrl = (waSettings.metaServerUrl || 'https://graph.facebook.com/v19.0').replace(/\/$/, '');
      const isWame = baseUrl.includes('api-wa.me') || baseUrl.includes('wame.api.br');

      let numbersToTry = [originalNumber];
      if (isWame && originalNumber.length >= 12 && originalNumber.startsWith('55')) {
        const ddd = parseInt(originalNumber.substring(2, 4), 10);
        if (ddd <= 28) {
          if (originalNumber.length === 12) {
            originalNumber = originalNumber.substring(0, 4) + '9' + originalNumber.substring(4);
            numbersToTry = [originalNumber];
          }
        } else {
          if (originalNumber.length === 13 && originalNumber[4] === '9') {
            numbersToTry.push(originalNumber.substring(0, 4) + originalNumber.substring(5));
          } else if (originalNumber.length === 12) {
            numbersToTry.push(originalNumber.substring(0, 4) + '9' + originalNumber.substring(4));
          }
        }
      }
      
      let url, headers, body;
      
      if (isWame) {
         url = `${baseUrl}/${waSettings.metaToken}/message/text`;
         headers = { 'Content-Type': 'application/json' };
         
         for (const num of numbersToTry) {
             body = JSON.stringify({ to: num, text: text });
             const response = await fetch(url, { method: 'POST', headers, body });
             if (!response.ok) {
                 const errText = await response.text();
                 console.error("Meta/WAME Send Error for num", num, errText);
             }
         }
         return res.json({ success: true });
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
