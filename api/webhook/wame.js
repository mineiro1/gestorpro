import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Handle Wame/Meta GET Verification Challenge
  if (req.method === 'GET') {
    const mode = req.query["hub.mode"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && challenge) {
      return res.status(200).send(challenge);
    }
    return res.status(200).send("Wame Webhook is active!");
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }
    
    let phone = "";
    let content = "";
    let mediaUrl = "";
    
    // Parse Meta/Wame API format
    if ((body.object === "whatsapp_business_account" || body.object === "wame") && body.entry && body.entry[0].changes) {
       const value = body.entry[0].changes[0].value;
       if (value.messages && value.messages.length > 0) {
          const msg = value.messages[0];
          phone = msg.from;
          if (msg.type === "text" && msg.text) {
             content = msg.text.body;
          } else {
             content = `[Media: ${msg.type}]`;
          }
       } else {
          return res.status(200).send("EVENT_RECEIVED");
       }
    } 
    // Fallback parsing for alternative raw formats
    else if (body.phone && body.message) {
        phone = body.phone;
        content = body.message;
    } else if (body.contact && body.message) {
        phone = body.contact;
        content = body.message;
    } else if (body.from && body.body) {
        phone = body.from;
        content = body.body;
    }
    
    // DEBUG FALLBACK: SAVE EVERYTHING UNRECOGNIZED
    if (!phone || !content) {
       await supabaseAdmin.from('chat_messages').insert({
          session_id: 'e867ca9f-d11f-4bb5-8bc6-96e1455fd260',
          sender_type: 'client',
          content: "UNRECOGNIZED WEBHOOK: " + JSON.stringify(body).substring(0, 500)
       });
       return res.status(200).send("EVENT_RECEIVED");
    }

    const { data: clients } = await supabaseAdmin.from('clients').select('id, phone, local_phone, admin_id');
    
    const matchedClient = (clients || []).find(c => {
       const cp = (c.phone || '').replace(/\D/g, '');
       const lp = (c.local_phone || '').replace(/\D/g, '');
       if (!cp && !lp) return false;
       
       const getCore = (num) => num.length >= 8 ? num.slice(-8) : num;
       const webhookCore = getCore(phone.replace(/\D/g, ''));
       
       let matchPhone = false;
       if (cp.length > 5) {
          matchPhone = cp.includes(phone) || phone.includes(cp) || getCore(cp) === webhookCore;
       }
       
       let matchLocal = false;
       if (lp.length > 5) {
          matchLocal = lp.includes(phone) || phone.includes(lp) || getCore(lp) === webhookCore;
       }
       
       return matchPhone || matchLocal;
    });
    
    if (!matchedClient) {
        await supabaseAdmin.from('chat_messages').insert({
          session_id: 'e867ca9f-d11f-4bb5-8bc6-96e1455fd260',
          sender_type: 'client',
          content: `CLIENT NOT FOUND FOR PHONE: ${phone}. Msg: ${content}`
        });
        return res.status(200).send("EVENT_RECEIVED");
    }

    const { data: sessions } = await supabaseAdmin
      .from('chat_sessions')
      .select('*')
      .eq('client_id', matchedClient.id)
      .eq('status', 'open')
      .order('created_at', { ascending: false });
      
    let activeSession = sessions && sessions.length > 0 ? sessions[0] : null;
    
    if (!activeSession) {
       const { data: newSession } = await supabaseAdmin
         .from('chat_sessions')
         .insert({
            client_id: matchedClient.id,
            admin_id: matchedClient.admin_id,
            employee_id: matchedClient.admin_id,
            status: 'open'
         }).select().single();
       activeSession = newSession;
    }
    
    if (activeSession) {
      await supabaseAdmin.from('chat_messages').insert({
         session_id: activeSession.id,
         sender_type: 'client',
         content: content,
         media_url: mediaUrl
      });
    }
    
    return res.status(200).send("EVENT_RECEIVED");
    
  } catch(e) {
    return res.status(500).send("Error");
  }
}
