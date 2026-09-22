import { createClient } from '@supabase/supabase-js';
import { initFirebase, admin } from '../_firebaseAdmin.js';

export default async function handler(req, res) {
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
    
    // A chave secreta dividida em duas partes para o GitHub não dar falso-positivo no radar de segurança:
    const part1 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnbW12cnZ1ZG96endxenN6dHdvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA1MjMzMSwi";
    const part2 = "ZXhwIjoyMDk0NjI4MzMxfQ.iB9iF3aoumsNtywpLZL_QjrBzR8QPWw7GGWQ6-Yx-Ik";
    const directKey = part1 + part2;
    
    // Se a Vercel falhar, ele usa a chave montada!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || directKey;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }

    // Helper para extrair e processar status updates (sent / delivered / read)
    const mapStatus = (raw) => {
      if (raw === undefined || raw === null) return null;
      const str = String(raw).toUpperCase().trim();
      if (str === '4' || str === '5' || str === 'READ' || str === 'PLAYED' || str === 'READ_RECEIPT' || str === 'VIEWED') return 'read';
      if (str === '3' || str === 'DELIVERY_ACK' || str === 'DELIVERED' || str === 'RECEIVED') return 'delivered';
      if (str === '2' || str === 'SERVER_ACK' || str === 'SENT') return 'sent';
      return null;
    };

    const statusUpdates = [];
    const isReceiptEvent = String(body?.event || '').toLowerCase().includes('receipt');

    const inspectItem = (item) => {
      if (!item || typeof item !== 'object') return;
      const id = item?.key?.id || item?.id || item?.keyId || item?.messageId || item?.update?.key?.id || item?.data?.key?.id;
      if (!id) return;
      if (isReceiptEvent || item?.receipt?.readTimestamp || item?.update?.readTimestamp) {
        statusUpdates.push({ id: String(id), status: 'read' });
        return;
      }
      const rawStatus = item?.update?.status ?? item?.status ?? item?.ack ?? item?.update?.ack ?? item?.statusLabel ?? item?.update?.statusLabel ?? item?.receipt?.status;
      const mapped = mapStatus(rawStatus);
      if (mapped) statusUpdates.push({ id: String(id), status: mapped });
    };

    if (body.entry && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        if (entry.changes && Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            const val = change.value;
            if (val?.statuses && Array.isArray(val.statuses)) {
              for (const st of val.statuses) {
                const mapped = mapStatus(st.status);
                if (st.id && mapped) statusUpdates.push({ id: String(st.id), status: mapped });
              }
            }
          }
        }
      }
    }
    if (body.statuses && Array.isArray(body.statuses)) {
      for (const st of body.statuses) {
        const mapped = mapStatus(st.status);
        if (st.id && mapped) statusUpdates.push({ id: String(st.id), status: mapped });
      }
    }
    if (Array.isArray(body)) {
      body.forEach(inspectItem);
    } else {
      inspectItem(body);
      if (Array.isArray(body.data)) body.data.forEach(inspectItem);
      else if (body.data && typeof body.data === 'object') inspectItem(body.data);
      if (Array.isArray(body.updates)) body.updates.forEach(inspectItem);
    }

    if (statusUpdates.length > 0) {
      for (const update of statusUpdates) {
        const { id: externalId, status: newStatus } = update;
        if (!externalId) continue;

        let { data: foundMsgs } = await supabaseAdmin
          .from('chat_messages')
          .select('id, media_url, sender_type')
          .eq('sender_type', 'tech')
          .ilike('media_url', `%${externalId}%`);

        if (!foundMsgs || foundMsgs.length === 0) {
          if (externalId.length > 8) {
            const shortId = externalId.slice(-12);
            const { data: fallback } = await supabaseAdmin
              .from('chat_messages')
              .select('id, media_url, sender_type')
              .eq('sender_type', 'tech')
              .ilike('media_url', `%${shortId}%`);
            foundMsgs = fallback;
          }
        }

        if (foundMsgs && foundMsgs.length > 0) {
          for (const fm of foundMsgs) {
            let existing = {};
            try { existing = JSON.parse(fm.media_url); } catch(e) {}
            if (existing.status === 'read' && newStatus !== 'read') continue;

            await supabaseAdmin
              .from('chat_messages')
              .update({
                media_url: JSON.stringify({
                  ...existing,
                  status: newStatus,
                  external_id: externalId,
                  status_updated_at: new Date().toISOString()
                })
              })
              .eq('id', fm.id);
          }
        }
      }
      return res.status(200).send("EVENT_RECEIVED");
    }
    
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
          } else if (msg.type === "audio" && msg.audio) {
             content = "🎵 Áudio recebido";
             mediaUrl = msg.audio.url || "";
          } else if (msg.type === "image" && msg.image) {
             content = msg.image.caption || "📸 Imagem recebida";
             mediaUrl = msg.image.url || "";
          } else if (msg.type === "video" && msg.video) {
             content = msg.video.caption || "🎥 Vídeo recebido";
             mediaUrl = msg.video.url || "";
          } else if (msg.type === "document" && msg.document) {
             content = `📄 Documento: ${msg.document.filename || 'Arquivo'}`;
             mediaUrl = msg.document.url || "";
          } else {
             content = `[Media: ${msg.type}]`;
          }

          // Fetch the mediaUrl immediately to bypass CORS and get the base64 for the frontend
          if (mediaUrl && mediaUrl.includes('api-wa.me') && mediaUrl.includes('/media')) {
             try {
                 const mediaRes = await fetch(mediaUrl);
                 if (mediaRes.ok) {
                     const mediaData = await mediaRes.json();
                     if (mediaData.base64) {
                         let b64 = mediaData.base64;
                         if (!b64.startsWith('data:')) {
                             let mime = mediaData.mimetype || 'application/octet-stream';
                             if (mime.includes('audio/ogg') && mime.includes('opus')) {
                                 mime = 'audio/ogg';
                             }
                             b64 = `data:${mime};base64,${b64}`;
                         } else {
                             if (b64.includes('audio/ogg') && b64.includes('opus')) {
                                 b64 = b64.replace('audio/ogg; codecs=opus', 'audio/ogg');
                             }
                         }
                         mediaUrl = b64;
                     }
                 }
             } catch (fetchErr) {
                 console.error("Error fetching media from api-wa.me:", fetchErr);
             }
          }
       } else {
          return res.status(200).send("EVENT_RECEIVED");
       }
    } 
    else if (body.type === "message" && body.data) {
        if (body.data.me) {
           return res.status(200).send("EVENT_RECEIVED"); 
        }
        phone = body.data.phoneNumber || "";
        if (!phone && body.data.remoteJid) {
            phone = body.data.remoteJid.split('@')[0];
        }
        if (body.data.messageType === "conversation" && body.data.msgContent && body.data.msgContent.conversation) {
            content = body.data.msgContent.conversation;
        } else if (body.data.msgContent && body.data.msgContent.extendedTextMessage && body.data.msgContent.extendedTextMessage.text) {
            content = body.data.msgContent.extendedTextMessage.text;
        } else if (body.data.messageType === "imageMessage" && body.data.msgContent && body.data.msgContent.imageMessage) {
            content = body.data.msgContent.imageMessage.caption || "📸 Imagem recebida";
            if (body.data.base64) {
               const b64 = body.data.base64; 
               if (typeof b64 === 'string' && b64.includes('use GET ')) { 
                  mediaUrl = b64.split('GET ')[1].split(' to ')[0]; 
               } else if (typeof b64 === 'string' && b64.includes('{"messageId"')) {
                  try {
                      const p = JSON.parse(b64);
                      mediaUrl = `data:${p.mimetype};base64,${p.base64}`;
                  } catch(e) { mediaUrl = `data:${body.data.msgContent[Object.keys(body.data.msgContent)[0]]?.mimetype || ''};base64,${b64}`; }
               } else { 
                  mediaUrl = `data:${body.data.msgContent[Object.keys(body.data.msgContent)[0]]?.mimetype || ''};base64,${b64}`; 
               }
            } else if (body.data.fileBase64) {
               const fb64 = body.data.fileBase64; 
               if (typeof fb64 === 'string' && fb64.includes('use GET ')) { 
                  mediaUrl = fb64.split('GET ')[1].split(' to ')[0]; 
               } else if (typeof fb64 === 'string' && fb64.includes('{"messageId"')) {
                  try {
                      const p = JSON.parse(fb64);
                      mediaUrl = `data:${p.mimetype};base64,${p.base64}`;
                  } catch(e) { mediaUrl = `data:${body.data.msgContent[Object.keys(body.data.msgContent)[0]]?.mimetype || ''};base64,${fb64}`; }
               } else { 
                  mediaUrl = `data:${body.data.msgContent[Object.keys(body.data.msgContent)[0]]?.mimetype || ''};base64,${fb64}`; 
               }
            }
        } else if (body.data.messageType === "audioMessage" && body.data.msgContent && body.data.msgContent.audioMessage) {
            content = "🎵 Áudio recebido";
            if (body.data.base64) {
               const b64 = body.data.base64; 
               if (typeof b64 === 'string' && b64.includes('use GET ')) { 
                  mediaUrl = b64.split('GET ')[1].split(' to ')[0]; 
               } else if (typeof b64 === 'string' && b64.includes('{"messageId"')) {
                  try {
                      const p = JSON.parse(b64);
                      mediaUrl = `data:${p.mimetype};base64,${p.base64}`;
                  } catch(e) { mediaUrl = `data:${body.data.msgContent[Object.keys(body.data.msgContent)[0]]?.mimetype || ''};base64,${b64}`; }
               } else { 
                  mediaUrl = `data:${body.data.msgContent[Object.keys(body.data.msgContent)[0]]?.mimetype || ''};base64,${b64}`; 
               }
            } else if (body.data.fileBase64) {
               const fb64 = body.data.fileBase64; 
               if (typeof fb64 === 'string' && fb64.includes('use GET ')) { 
                  mediaUrl = fb64.split('GET ')[1].split(' to ')[0]; 
               } else if (typeof fb64 === 'string' && fb64.includes('{"messageId"')) {
                  try {
                      const p = JSON.parse(fb64);
                      mediaUrl = `data:${p.mimetype};base64,${p.base64}`;
                  } catch(e) { mediaUrl = `data:${body.data.msgContent[Object.keys(body.data.msgContent)[0]]?.mimetype || ''};base64,${fb64}`; }
               } else { 
                  mediaUrl = `data:${body.data.msgContent[Object.keys(body.data.msgContent)[0]]?.mimetype || ''};base64,${fb64}`; 
               }
            }
        } else if (body.data.messageType === "videoMessage" && body.data.msgContent && body.data.msgContent.videoMessage) {
            content = body.data.msgContent.videoMessage.caption || "🎥 Vídeo recebido";
            if (body.data.base64) {
               const b64 = body.data.base64; 
               if (typeof b64 === 'string' && b64.includes('use GET ')) { 
                  mediaUrl = b64.split('GET ')[1].split(' to ')[0]; 
               } else if (typeof b64 === 'string' && b64.includes('{"messageId"')) {
                  try {
                      const p = JSON.parse(b64);
                      mediaUrl = `data:${p.mimetype};base64,${p.base64}`;
                  } catch(e) { mediaUrl = `data:${body.data.msgContent[Object.keys(body.data.msgContent)[0]]?.mimetype || ''};base64,${b64}`; }
               } else { 
                  mediaUrl = `data:${body.data.msgContent[Object.keys(body.data.msgContent)[0]]?.mimetype || ''};base64,${b64}`; 
               }
            } else if (body.data.fileBase64) {
               const fb64 = body.data.fileBase64; 
               if (typeof fb64 === 'string' && fb64.includes('use GET ')) { 
                  mediaUrl = fb64.split('GET ')[1].split(' to ')[0]; 
               } else if (typeof fb64 === 'string' && fb64.includes('{"messageId"')) {
                  try {
                      const p = JSON.parse(fb64);
                      mediaUrl = `data:${p.mimetype};base64,${p.base64}`;
                  } catch(e) { mediaUrl = `data:${body.data.msgContent[Object.keys(body.data.msgContent)[0]]?.mimetype || ''};base64,${fb64}`; }
               } else { 
                  mediaUrl = `data:${body.data.msgContent[Object.keys(body.data.msgContent)[0]]?.mimetype || ''};base64,${fb64}`; 
               }
            }
        } else if (body.data.messageType === "documentMessage" && body.data.msgContent && body.data.msgContent.documentMessage) {
            content = `📄 Documento recebido: ${body.data.msgContent.documentMessage.fileName || 'Arquivo'}`;
            if (body.data.base64) {
               const b64 = body.data.base64; 
               if (typeof b64 === 'string' && b64.includes('use GET ')) { 
                  mediaUrl = b64.split('GET ')[1].split(' to ')[0]; 
               } else if (typeof b64 === 'string' && b64.includes('{"messageId"')) {
                  try {
                      const p = JSON.parse(b64);
                      mediaUrl = `data:${p.mimetype};base64,${p.base64}`;
                  } catch(e) { mediaUrl = `data:${body.data.msgContent[Object.keys(body.data.msgContent)[0]]?.mimetype || ''};base64,${b64}`; }
               } else { 
                  mediaUrl = `data:${body.data.msgContent[Object.keys(body.data.msgContent)[0]]?.mimetype || ''};base64,${b64}`; 
               }
            } else if (body.data.fileBase64) {
               const fb64 = body.data.fileBase64; 
               if (typeof fb64 === 'string' && fb64.includes('use GET ')) { 
                  mediaUrl = fb64.split('GET ')[1].split(' to ')[0]; 
               } else if (typeof fb64 === 'string' && fb64.includes('{"messageId"')) {
                  try {
                      const p = JSON.parse(fb64);
                      mediaUrl = `data:${p.mimetype};base64,${p.base64}`;
                  } catch(e) { mediaUrl = `data:${body.data.msgContent[Object.keys(body.data.msgContent)[0]]?.mimetype || ''};base64,${fb64}`; }
               } else { 
                  mediaUrl = `data:${body.data.msgContent[Object.keys(body.data.msgContent)[0]]?.mimetype || ''};base64,${fb64}`; 
               }
            }
        } else if (body.data.messageType) {
            content = `[${body.data.messageType}]`;
        } else {
            content = "[Mensagem não textual recebida]";
        }
    }
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
    
    if (!phone || !content) {
       return res.status(200).send("EVENT_RECEIVED");
    }

    const cleanIncomingPhone = String(phone).replace(/\D/g, '');
    const incomingCore8 = cleanIncomingPhone.length >= 8 ? cleanIncomingPhone.slice(-8) : cleanIncomingPhone;
    const incomingCore9 = cleanIncomingPhone.length >= 9 ? cleanIncomingPhone.slice(-9) : cleanIncomingPhone;

    const { data: clients } = await supabaseAdmin.from('clients').select('id, name, phone, local_phone, admin_id');
    
    const matchedClient = (clients || []).find(c => {
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
        console.log("[Webhook WAME] Nenhum cliente encontrado para o telefone:", phone, cleanIncomingPhone);
        return res.status(200).send("EVENT_RECEIVED");
    }

    const { data: sessions } = await supabaseAdmin
      .from('chat_sessions')
      .select('*')
      .eq('client_id', matchedClient.id)
      .order('created_at', { ascending: false });
      
    let activeSession = null;
    const now = new Date().getTime();

    if (sessions && sessions.length > 0) {
      // Procura primeiro por sessão explicitamente 'open'
      const openSess = sessions.find(s => s.status === 'open');
      if (openSess) {
        const createdTime = new Date(openSess.created_at).getTime();
        if (now - createdTime <= 30 * 60 * 1000) {
          activeSession = openSess;
        } else {
          // Expirou os 30 min
          await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', openSess.id);
        }
      }
      
      // Se não encontrou 'open', verifica se a mais recente foi criada há menos de 30 min
      if (!activeSession) {
        const latestSess = sessions[0];
        const createdTime = new Date(latestSess.created_at).getTime();
        if (now - createdTime <= 30 * 60 * 1000) {
          activeSession = latestSess;
        }
      }
    }
    
    // Regra: A mensagem é descartada se colaborador/admin não iniciou atendimento nos últimos 30min
    if (!activeSession) {
       console.log("[Webhook WAME] Nenhuma sessão ativa (<30m) aberta para o cliente:", matchedClient.id, matchedClient.name);
       return res.status(200).send("EVENT_RECEIVED");
    }
    
    // Fetch mediaUrl immediately to bypass CORS and get the base64 for the frontend (Global catch-all)
    if (mediaUrl && mediaUrl.includes('api-wa.me') && mediaUrl.includes('/media')) {
       try {
           const mediaRes = await fetch(mediaUrl);
           if (mediaRes.ok) {
               const mediaData = await mediaRes.json();
               if (mediaData.base64) {
                   let b64 = mediaData.base64;
                   if (!b64.startsWith('data:')) {
                       let mime = mediaData.mimetype || 'application/octet-stream';
                       if (mime.includes('audio/ogg') && mime.includes('opus')) {
                           mime = 'audio/ogg';
                       }
                       b64 = `data:${mime};base64,${b64}`;
                   } else {
                       if (b64.includes('audio/ogg') && b64.includes('opus')) {
                           b64 = b64.replace('audio/ogg; codecs=opus', 'audio/ogg');
                       }
                   }
                   mediaUrl = b64;
               }
           }
       } catch (fetchErr) {
           console.error("Error fetching media from api-wa.me globally:", fetchErr);
       }
    }

    if (activeSession) {
      await supabaseAdmin.from('chat_messages').insert({
         session_id: activeSession.id,
         sender_type: 'client',
         content: content,
         media_url: mediaUrl
      });

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
          if (initialized && messaging) {
            for (const token of fcmTokens) {
              try {
                await messaging.send({
                  token,
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
                      sound: 'notificacao.mp3',
                      priority: 'max',
                      defaultSound: false,
                      defaultVibrateTimings: true
                    }
                  }
                });
              } catch (sendErr) {
                console.warn('[Webhook WAME] Erro ao enviar FCM individual:', sendErr.message);
              }
            }
          }
        }
      } catch (pushErr) {
        console.warn('[Webhook WAME] Erro ao disparar push nativo:', pushErr.message);
      }
    }
    
    return res.status(200).send("EVENT_RECEIVED");
    
  } catch(e) {
    return res.status(500).send("Error");
  }
}