import { createClient } from '@supabase/supabase-js';
import { initFirebase, admin } from '../_firebaseAdmin.js';

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
    
    const cleanIncomingPhone = String(phone).replace(/\D/g, '');
    const incomingCore8 = cleanIncomingPhone.length >= 8 ? cleanIncomingPhone.slice(-8) : cleanIncomingPhone;
    const incomingCore9 = cleanIncomingPhone.length >= 9 ? cleanIncomingPhone.slice(-9) : cleanIncomingPhone;

    const matchedClient = clients.find(c => {
       const cp = (c.phone || '').replace(/\D/g, '');
       const lp = (c.local_phone || '').replace(/\D/g, '');
       if (!cp && !lp) return false;
       
       const matchesNum = (stored) => {
         if (!stored || stored.length < 6) return false;
         const storedCore8 = stored.slice(-8);
         const storedCore9 = stored.length >= 9 ? stored.slice(-9) : storedCore8;
         return stored === cleanIncomingPhone ||
                cleanIncomingPhone.includes(stored) ||
                stored.includes(cleanIncomingPhone) ||
                storedCore8 === incomingCore8 ||
                storedCore9 === incomingCore9;
       };

       return matchesNum(cp) || matchesNum(lp);
    });
    
    if (!matchedClient) {
       console.log("[Webhook Evolution] Client not found for phone:", phone, cleanIncomingPhone);
       return res.status(200).send("OK");
    }

    // Check for open session
    const { data: sessions } = await supabaseAdmin
      .from('chat_sessions')
      .select('*')
      .eq('client_id', matchedClient.id)
      .order('created_at', { ascending: false });
      
    let activeSession = null;
    const now = new Date().getTime();

    if (sessions && sessions.length > 0) {
      const openSess = sessions.find(s => s.status === 'open');
      if (openSess) {
        const createdTime = new Date(openSess.created_at).getTime();
        if (now - createdTime <= 30 * 60 * 1000) {
          activeSession = openSess;
        } else {
          await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', openSess.id);
        }
      }

      if (!activeSession) {
        const latestSess = sessions[0];
        const createdTime = new Date(latestSess.created_at).getTime();
        if (now - createdTime <= 30 * 60 * 1000) {
          activeSession = latestSess;
        }
      }
    }
    
    // If no active session, ignore message (rule: admin/collaborator must initiate chat)
    if (!activeSession) {
       console.log("[Webhook Evolution] No active chat session (<30m) for client:", matchedClient.id, matchedClient.name);
       return res.status(200).send("OK");
    }

    // Save the message only if session is actively open
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

       // Dispara Push Notification nativo para o responsável pelo atendimento
       try {
         const targetUserId = activeSession.employee_id || activeSession.admin_id;
         if (targetUserId) {
           const { data: recipientUser } = await supabaseAdmin
             .from('users')
             .select('fcm_token')
             .eq('id', targetUserId)
             .single();

           if (recipientUser?.fcm_token) {
             initFirebase();
             if (admin.apps.length) {
               await admin.messaging().send({
                 token: recipientUser.fcm_token,
                 notification: {
                   title: `💬 ${matchedClient.name || 'Cliente'}`,
                   body: content || (mediaUrl ? '📷 Foto/Áudio recebido' : 'Nova mensagem')
                 },
                 data: {
                   sessionId: String(activeSession.id),
                   clientId: String(matchedClient.id),
                   click_action: 'FCM_PLUGIN_ACTIVITY',
                   channelId: 'chat_messages',
                   url: '/messages'
                 },
                 android: {
                   priority: 'high',
                   notification: {
                     channelId: 'chat_messages',
                     sound: 'default',
                     priority: 'max',
                     defaultSound: true,
                     defaultVibrateTimings: true
                   }
                 }
               });
             }
           }
         }
       } catch (pushErr) {
         console.warn('[Webhook Evolution] Erro ao disparar push nativo:', pushErr.message);
       }
    }
    
    return res.status(200).send("OK");
  } catch(e) {
    console.error("Webhook Error:", e);
    return res.status(500).send("Error");
  }
}
