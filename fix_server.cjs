const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// Find the start of the Wame webhook
const wameStart = content.indexOf('app.post("/api/webhook/wame", async (req, res) => {');
const syncPaymentStart = content.indexOf('app.all("/api/sync-payment"');

if (wameStart !== -1 && syncPaymentStart !== -1) {
    const pre = content.substring(0, wameStart);
    const post = content.substring(syncPaymentStart);
    
    const correctWebhooks = `app.post("/api/webhook/wame", async (req, res) => {
    try {
      console.log("Wame/Meta Webhook Received:", JSON.stringify(req.body));
      try {
         await supabaseAdmin.from('chat_messages').insert({
            session_id: 'e867ca9f-d11f-4bb5-8bc6-96e1455fd260',
            sender_type: 'client',
            content: "WEBHOOK_PAYLOAD: " + JSON.stringify(req.body).substring(0, 500)
         });
      } catch(e) {}
      const body = req.body;
      let phone = "";
      let content = "";
      let mediaUrl = "";
      
      if ((body.object === "whatsapp_business_account" || body.object === "wame") && body.entry && body.entry[0].changes) {
         const value = body.entry[0].changes[0].value;
         if (value.messages && value.messages.length > 0) {
            const msg = value.messages[0];
            phone = msg.from;
            if (msg.type === "text" && msg.text) {
               content = msg.text.body;
            } else if (msg.type === "audio") {
               content = "🎵 Mensagem de Áudio";
            } else if (msg.type === "image") {
               content = "📷 Imagem";
            }
         } else {
            return res.status(200).send("EVENT_RECEIVED");
         }
      } else if (body.phone && body.message) {
          phone = body.phone;
          content = body.message;
      } else if (body.contact && body.message) {
          phone = body.contact;
          content = body.message;
      } else if (body.from && body.body) {
          phone = body.from;
          content = body.body;
      }
      
      if (!phone || !content) return res.status(200).send("EVENT_RECEIVED");
      phone = phone.replace(/\\D/g, '');
      
      const { data: clients, error: clientsErr } = await supabaseAdmin.from('clients').select('id, phone, local_phone, admin_id, employee_id');
      const matchedClient = clients?.find(c => {
         const cp = (c.phone || '').replace(/\\D/g, '');
         const lp = (c.local_phone || '').replace(/\\D/g, '');
         if (!cp && !lp) return false;
         const getCore = (num) => num.length >= 8 ? num.slice(-8) : num;
         const webhookCore = getCore(phone);
         let matchPhone = false;
         if (cp.length > 5) matchPhone = cp.includes(phone) || phone.includes(cp) || getCore(cp) === webhookCore;
         let matchLocal = false;
         if (lp.length > 5) matchLocal = lp.includes(phone) || phone.includes(lp) || getCore(lp) === webhookCore;
         return matchPhone || matchLocal;
      });
      
      if (!matchedClient) return res.status(200).send("EVENT_RECEIVED");

      const { data: sessions } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('client_id', matchedClient.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
        
      if (!sessions || sessions.length === 0) {
         return res.status(200).send("EVENT_RECEIVED");
      }
      
      let activeSession = sessions[0];
      const createdTime = new Date(activeSession.created_at).getTime();
      const now = new Date().getTime();
      if (now - createdTime > 30 * 60 * 1000) {
         await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
         return res.status(200).send("EVENT_RECEIVED");
      }

      await supabaseAdmin.from('chat_messages').insert({
         session_id: activeSession.id,
         sender_type: 'client',
         content: content,
         media_url: mediaUrl
      });
      
      return res.status(200).send("EVENT_RECEIVED");
    } catch(e) {
      console.error("Webhook Error:", e);
      return res.status(500).send("Error");
    }
  });

  app.post("/api/webhook/evolution", async (req, res) => {
    try {
      console.log("Evolution Webhook Received:", JSON.stringify(req.body));
      const body = req.body;
      const msgData = body.data || body;
      
      if (!msgData || !msgData.key || !msgData.message) return res.status(200).send("OK");
      if (msgData.key.fromMe) return res.status(200).send("OK");

      let remoteJid = msgData.key.remoteJid || "";
      if (!remoteJid) return res.status(200).send("OK");
      
      let phone = remoteJid.split('@')[0].replace('55', '');
      
      let content = "";
      if (msgData.message.conversation) content = msgData.message.conversation;
      else if (msgData.message.extendedTextMessage) content = msgData.message.extendedTextMessage.text;
      
      let mediaUrl = "";
      if (msgData.message.audioMessage) content = "🎵 Mensagem de Áudio";
      else if (msgData.message.imageMessage) content = "📷 Imagem";

      if (!content && !mediaUrl) return res.status(200).send("OK");

      const { data: clients } = await supabaseAdmin.from('clients').select('id, phone, local_phone, admin_id, employee_id');
      if (!clients) return res.status(200).send("OK");
      
      const matchedClient = clients.find(c => {
         const cp = (c.phone || '').replace(/\\D/g, '');
         const lp = (c.local_phone || '').replace(/\\D/g, '');
         return cp.includes(phone) || lp.includes(phone) || phone.includes(cp) || phone.includes(lp);
      });
      
      if (!matchedClient) return res.status(200).send("OK");

      const { data: sessions } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('client_id', matchedClient.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
        
      if (!sessions || sessions.length === 0) {
         return res.status(200).send("OK");
      }
      
      let activeSession = sessions[0];
      const createdTime = new Date(activeSession.created_at).getTime();
      const now = new Date().getTime();
      if (now - createdTime > 30 * 60 * 1000) {
         await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
         return res.status(200).send("OK");
      }

      await supabaseAdmin.from('chat_messages').insert({
         session_id: activeSession.id,
         sender_type: 'client',
         content: content,
         media_url: mediaUrl
      });
      
      return res.status(200).send("OK");
    } catch(e) {
      console.error("Webhook Error:", e);
      return res.status(500).send("Error");
    }
  });

`;
    
    fs.writeFileSync('server.ts', pre + correctWebhooks + post);
    console.log("Server webhooks fixed successfully!");
} else {
    console.log("Could not find boundaries!");
}
