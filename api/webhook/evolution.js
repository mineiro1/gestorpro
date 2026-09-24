import { createClient } from '@supabase/supabase-js';
import { initFirebase, admin } from '../_firebaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://fgmmvrvudozzwqxzsztwo.supabase.co';
    const part1 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnbW12cnZ1ZG96endxenN6dHdvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA1MjMzMSwi";
    const part2 = "ZXhwIjoyMDk0NjI4MzMxfQ.iB9iF3aoumsNtywpLZL_QjrBzR8QPWw7GGWQ6-Yx-Ik";
    const directKey = part1 + part2;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || directKey;
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
    
  function cleanJidToPhone(rawJid) {
    if (!rawJid) return '';
    const str = String(rawJid);
    const withoutDomain = str.split('@')[0];
    const withoutDevice = withoutDomain.split(':')[0];
    return withoutDevice.replace(/\D/g, '');
  }

  function extractMessageData(rawMsg) {
    if (!rawMsg) return { content: '', mediaUrl: '' };
    if (typeof rawMsg === 'string') return { content: rawMsg, mediaUrl: '' };

    // Recursively unwrap WhatsApp Baileys wrappers
    if (rawMsg.ephemeralMessage?.message) return extractMessageData(rawMsg.ephemeralMessage.message);
    if (rawMsg.viewOnceMessage?.message) return extractMessageData(rawMsg.viewOnceMessage.message);
    if (rawMsg.viewOnceMessageV2?.message) return extractMessageData(rawMsg.viewOnceMessageV2.message);
    if (rawMsg.documentWithCaptionMessage?.message) return extractMessageData(rawMsg.documentWithCaptionMessage.message);
    if (rawMsg.editedMessage?.message?.protocolMessage?.editedMessage) return extractMessageData(rawMsg.editedMessage.message.protocolMessage.editedMessage);

    if (rawMsg.conversation) return { content: rawMsg.conversation, mediaUrl: '' };
    if (rawMsg.extendedTextMessage?.text) return { content: rawMsg.extendedTextMessage.text, mediaUrl: '' };
    if (rawMsg.text) return { content: typeof rawMsg.text === 'string' ? rawMsg.text : (rawMsg.text?.body || ''), mediaUrl: '' };
    if (rawMsg.body) return { content: rawMsg.body, mediaUrl: '' };
    if (rawMsg.caption) return { content: rawMsg.caption, mediaUrl: '' };

    if (rawMsg.audioMessage) {
      return { content: '🎵 Áudio recebido', mediaUrl: rawMsg.audioMessage.url || rawMsg.audioMessage.directPath || '' };
    }
    if (rawMsg.imageMessage) {
      return { content: rawMsg.imageMessage.caption || '📸 Imagem recebida', mediaUrl: rawMsg.imageMessage.url || rawMsg.imageMessage.directPath || '' };
    }
    if (rawMsg.videoMessage) {
      return { content: rawMsg.videoMessage.caption || '🎥 Vídeo recebido', mediaUrl: rawMsg.videoMessage.url || rawMsg.videoMessage.directPath || '' };
    }
    if (rawMsg.documentMessage) {
      return { content: `📄 Documento: ${rawMsg.documentMessage.fileName || rawMsg.documentMessage.title || 'Arquivo'}`, mediaUrl: rawMsg.documentMessage.url || '' };
    }
    if (rawMsg.stickerMessage) {
      return { content: '🏷️ Figurinha recebida', mediaUrl: rawMsg.stickerMessage.url || '' };
    }

    if (rawMsg.buttonsResponseMessage?.selectedButtonId || rawMsg.buttonsResponseMessage?.selectedDisplayText) {
      return { content: rawMsg.buttonsResponseMessage.selectedDisplayText || rawMsg.buttonsResponseMessage.selectedButtonId, mediaUrl: '' };
    }
    if (rawMsg.templateButtonReplyMessage?.selectedId || rawMsg.templateButtonReplyMessage?.selectedDisplayText) {
      return { content: rawMsg.templateButtonReplyMessage.selectedDisplayText || rawMsg.templateButtonReplyMessage.selectedId, mediaUrl: '' };
    }
    if (rawMsg.listResponseMessage?.title || rawMsg.listResponseMessage?.singleSelectReply?.selectedRowId) {
      return { content: rawMsg.listResponseMessage.title || rawMsg.listResponseMessage.singleSelectReply?.selectedRowId, mediaUrl: '' };
    }

    return { content: '', mediaUrl: '' };
  }

  // Helper para extrair primeiro e segundo nome
  function formatFirstTwoNames(fullName) {
    if (!fullName || typeof fullName !== 'string') return 'Cliente';
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'Cliente';
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[1]}`;
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
    
    let phone = cleanJidToPhone(remoteJid);
    const extracted = extractMessageData(msgData.message || msgData.msgContent || msgData);
    let content = extracted.content;
    let mediaUrl = extracted.mediaUrl || "";

    if (!content && !mediaUrl) {
       console.log("No text or media content, ignoring.");
       return res.status(200).send("OK");
    }

    // Match the client in DB
    const { data: clients, error: clientsError } = await supabaseAdmin
       .from('clients')
       .select('id, name, phone, local_phone, admin_id');
       
    if (clientsError || !clients) {
       console.error("Error fetching clients", clientsError);
       return res.status(200).send("OK");
    }
    
  function isMatchingClientPhone(storedRaw, incomingRaw) {
    if (!storedRaw || !incomingRaw) return false;
    const stored = String(storedRaw).replace(/\D/g, '');
    const incoming = String(incomingRaw).replace(/\D/g, '');
    if (stored.length < 6 || incoming.length < 6) return false;

    const storedNo55 = stored.replace(/^55/, '');
    const incomingNo55 = incoming.replace(/^55/, '');

    if (stored === incoming || storedNo55 === incomingNo55) return true;

    // Check last 8 digits (always identical regardless of 9th digit)
    const storedLast8 = stored.slice(-8);
    const incomingLast8 = incoming.slice(-8);
    if (storedLast8.length === 8 && incomingLast8.length === 8 && storedLast8 === incomingLast8) {
      const storedDDD = storedNo55.length >= 10 ? storedNo55.slice(0, 2) : '';
      const incomingDDD = incomingNo55.length >= 10 ? incomingNo55.slice(0, 2) : '';
      if (storedDDD && incomingDDD) {
        return storedDDD === incomingDDD;
      }
      return true;
    }

    if (stored.includes(incoming) || incoming.includes(stored)) return true;
    if (storedNo55.includes(incomingNo55) || incomingNo55.includes(storedNo55)) return true;

    return false;
  }

  const cleanIncomingPhone = String(phone).replace(/\D/g, '');

  const matchedClient = (clients || []).find(c => {
     return isMatchingClientPhone(c.phone || '', cleanIncomingPhone) || isMatchingClientPhone(c.local_phone || '', cleanIncomingPhone);
  });
    
  if (!matchedClient) {
     console.log("[Webhook Evolution] Client not found for phone:", phone, cleanIncomingPhone);
     return res.status(200).send("OK");
  }

  const { data: sessions } = await supabaseAdmin
    .from('chat_sessions')
    .select('*')
    .eq('client_id', matchedClient.id)
    .order('created_at', { ascending: false });
    
  let activeSession = null;
  const now = new Date().getTime();

  // Localiza sessões abertas e consolida duplicadas
  const openSessions = (sessions || []).filter((s) => s.status === 'open');
  if (openSessions.length > 0) {
    activeSession = openSessions[0];
    const createdTime = new Date(activeSession.created_at).getTime();
    
    // Se a sessão expirou (> 30 min), fecha ela
    if (now - createdTime > 30 * 60 * 1000) {
      await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
      activeSession = null;
    }

    // Fecha qualquer outra sessão aberta duplicada para manter apenas 1 sessão ativa
    if (openSessions.length > 1) {
      const extraIds = openSessions.slice(1).map((s) => s.id);
      await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).in('id', extraIds);
    }
  }

  // Se não há sessão ativa, cria uma nova sessão aberta para o cliente imediatamente
  if (!activeSession) {
    const { data: newSess } = await supabaseAdmin
      .from('chat_sessions')
      .insert({
        client_id: matchedClient.id,
        admin_id: matchedClient.admin_id,
        employee_id: matchedClient.employee_id || null,
        status: 'open',
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    if (newSess) {
      activeSession = newSess;
    }
  }
    
    if (!activeSession) {
       console.log("[Webhook Evolution] Não foi possível criar ou obter sessão para:", matchedClient.id, matchedClient.name);
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

       // Dispara Push Notification nativo para o colaborador e administrador responsáveis
       try {
         const targetUserIds = new Set();
         if (activeSession.employee_id) targetUserIds.add(activeSession.employee_id);
         if (activeSession.admin_id) targetUserIds.add(activeSession.admin_id);
         if (matchedClient.admin_id) targetUserIds.add(matchedClient.admin_id);

         const { data: recipientUsers } = await supabaseAdmin
           .from('users')
           .select('id, fcm_token')
           .in('id', Array.from(targetUserIds));

         let fcmTokens = (recipientUsers || []).map(u => u.fcm_token).filter(Boolean);

         // Fallback: se nenhum dos IDs possuir token, busca administradores do sistema com token ativo
         if (fcmTokens.length === 0) {
           const { data: fallbackAdmins } = await supabaseAdmin
             .from('users')
             .select('fcm_token')
             .eq('role', 'admin')
             .not('fcm_token', 'is', null);
           if (fallbackAdmins && fallbackAdmins.length > 0) {
             fcmTokens = fallbackAdmins.map(u => u.fcm_token).filter(Boolean);
           }
         }

         if (fcmTokens.length > 0) {
           const { initialized, messaging } = initFirebase();
           const clientDisplayName = formatFirstTwoNames(matchedClient.name);

           if (initialized && messaging) {
             for (const token of fcmTokens) {
               try {
                 await messaging.send({
                   token,
                   notification: {
                     title: `💬 ${clientDisplayName}`,
                     body: content || (mediaUrl ? '📷 Foto/Áudio recebido' : 'Nova mensagem')
                   },
                   data: {
                     title: `💬 ${clientDisplayName}`,
                     body: content || (mediaUrl ? '📷 Foto/Áudio recebido' : 'Nova mensagem'),
                     sessionId: String(activeSession.id),
                     clientId: String(matchedClient.id),
                     click_action: 'FCM_PLUGIN_ACTIVITY',
                     channelId: 'chat_messages',
                     url: '/messages'
                   },
                   android: {
                     priority: 'high',
                     ttl: 2419200,
                     directBootOk: true,
                     notification: {
                       channelId: 'chat_messages',
                       title: `💬 ${clientDisplayName}`,
                       body: content || (mediaUrl ? '📷 Foto/Áudio recebido' : 'Nova mensagem'),
                       sound: 'chat_notification.mp3',
                       priority: 'max',
                       visibility: 'public',
                       defaultSound: false,
                       defaultVibrateTimings: true,
                       localOnly: false
                     }
                   }
                 });
               } catch (sendErr) {
                 console.warn('[Webhook Evolution] Erro ao enviar FCM individual:', sendErr.message);
               }
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
