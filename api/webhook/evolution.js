import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    console.log("Evolution Webhook Received:", JSON.stringify(req.body));
    const body = req.body;
    
    // Extracted payload handling (supports v1, v2 and array formats)
    let msgData = body.data || body;
    
    // If data has a 'message' property that contains 'key', unwrap it (Evolution v2+)
    if (msgData.message && msgData.message.key) {
       msgData = msgData.message;
    } 
    // If it's an array of messages (Baileys raw format)
    else if (Array.isArray(msgData) && msgData[0]?.key) {
       msgData = msgData[0];
    } else if (msgData.messages && Array.isArray(msgData.messages) && msgData.messages[0]?.key) {
       msgData = msgData.messages[0];
    }

    if (!msgData || !msgData.key || !msgData.message) {
       console.log("Not a valid message payload, ignoring.");
       return res.status(200).send("OK");
    }
    
    // Ignore outgoing messages
    if (msgData.key.fromMe) {
       return res.status(200).send("OK");
    }
    
    let remoteJid = msgData.key.remoteJid || "";
    if (!remoteJid || remoteJid.includes('@g.us')) {
       // Ignore groups
       return res.status(200).send("OK");
    }
    
    // Naive clean for Brazilian numbers (removes 55 country code if exists)
    let phone = remoteJid.split('@')[0].replace(/^55/, ''); 
    
    let content = "";
    if (msgData.message.conversation) content = msgData.message.conversation;
    else if (msgData.message.extendedTextMessage) content = msgData.message.extendedTextMessage?.text || "";
    
    let mediaUrl = "";
    if (msgData.message.audioMessage) {
       content = "🎵 Mensagem de Áudio";
    } else if (msgData.message.imageMessage) {
       content = "📷 Imagem";
    } else if (msgData.message.documentMessage) {
       content = "📄 Documento";
    } else if (msgData.message.videoMessage) {
       content = "🎥 Vídeo";
    } else if (msgData.message.stickerMessage) {
       content = "🖼️ Figurinha";
    }

    if (!content && !mediaUrl) {
       console.log("No text or media content, ignoring.");
       return res.status(200).send("OK");
    }

    // Match the client in DB
    const { data: clients, error: clientsError } = await supabaseAdmin
       .from('clients')
       .select('id, phone, local_phone, admin_id');
       
    if (clientsError || !clients) {
       console.error("Error fetching clients", clientsError);
       return res.status(200).send("OK");
    }
    
    const matchedClient = clients.find(c => {
       const cp = (c.phone || '').replace(/\D/g, '');
       const lp = (c.local_phone || '').replace(/\D/g, '');
       return cp.includes(phone) || lp.includes(phone) || phone.includes(cp) || phone.includes(lp);
    });
    
    if (!matchedClient) {
       console.log("Client not found for phone:", phone);
       return res.status(200).send("OK");
    }

    // Check for open session
    const { data: sessions } = await supabaseAdmin
      .from('chat_sessions')
      .select('*')
      .eq('client_id', matchedClient.id)
      .eq('status', 'open')
      .order('created_at', { ascending: false });
      
    let activeSession = sessions && sessions.length > 0 ? sessions[0] : null;
    
    // Auto-close if older than 30 mins, or if no session exists, create a new one!
    const now = new Date().getTime();
    if (activeSession) {
       const createdTime = new Date(activeSession.created_at).getTime();
       if (now - createdTime > 30 * 60 * 1000) {
          await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
          activeSession = null;
       }
    }

    if (!activeSession) {
       // Auto-create a session so we don't lose the incoming message
       const { data: newSession, error: newSessionError } = await supabaseAdmin
         .from('chat_sessions')
         .insert({
            client_id: matchedClient.id,
            admin_id: matchedClient.admin_id,
            employee_id: matchedClient.admin_id, // Defaulting to admin since we don't know which employee
            status: 'open'
         }).select().single();
         
       if (newSessionError) {
          console.error("Failed to create new session:", newSessionError);
          return res.status(200).send("OK");
       }
       activeSession = newSession;
    }

    // Save the message
    const { error: insertError } = await supabaseAdmin.from('chat_messages').insert({
       session_id: activeSession.id,
       sender_type: 'client',
       content: content,
       media_url: mediaUrl
    });
    
    if (insertError) {
       console.error("Error inserting message:", insertError);
    } else {
       console.log("Message successfully saved to session", activeSession.id);
    }
    
    return res.status(200).send("OK");
  } catch(e) {
    console.error("Webhook Error:", e);
    return res.status(500).send("Error");
  }
}
