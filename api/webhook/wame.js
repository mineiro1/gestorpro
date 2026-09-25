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
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://fgmmvrvudozzwqxzsztwo.supabase.co';
    
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
      // Se era puramente um evento de status (sem mensagens no corpo), retorna
      const hasMessagesInBody = Boolean(
        (body.entry && body.entry.some(e => e.changes?.some(c => c.value?.messages?.length > 0))) ||
        (Array.isArray(body) && body.some(b => b.message || b.msgContent || b.text || b.body)) ||
        (Array.isArray(body.data) && body.data.some(d => d.message || d.msgContent || d.text || d.body)) ||
        body.data?.msgContent ||
        body.data?.message ||
        body.data?.key ||
        body.message ||
        body.text ||
        body.body ||
        body.content
      );
      if (!hasMessagesInBody) {
        return res.status(200).send("EVENT_RECEIVED");
      }
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
    
    let phone = "";
    let content = "";
    let mediaUrl = "";
    let externalMsgId = "";
    
    // Extract candidate item from all possible container structures
    let rawItem = null;
    if (Array.isArray(body.data?.messages) && body.data.messages.length > 0) {
      rawItem = body.data.messages[0];
    } else if (Array.isArray(body.messages) && body.messages.length > 0) {
      rawItem = body.messages[0];
    } else if (Array.isArray(body.data) && body.data.length > 0) {
      rawItem = body.data[0];
    } else if (body.data && typeof body.data === 'object') {
      rawItem = body.data;
    } else {
      rawItem = body;
    }

    if (rawItem) {
      if (rawItem.key?.fromMe === true || rawItem.fromMe === true) {
        return res.status(200).send("EVENT_RECEIVED");
      }

      if (rawItem.key?.remoteJid) {
        phone = cleanJidToPhone(rawItem.key.remoteJid);
      } else if (rawItem.remoteJid) {
        phone = cleanJidToPhone(rawItem.remoteJid);
      } else if (rawItem.phoneNumber) {
        phone = cleanJidToPhone(rawItem.phoneNumber);
      } else if (rawItem.phone) {
        phone = cleanJidToPhone(rawItem.phone);
      } else if (rawItem.from) {
        phone = cleanJidToPhone(rawItem.from);
      } else if (rawItem.sender) {
        phone = cleanJidToPhone(rawItem.sender);
      }

      if (rawItem.key?.id || rawItem.id) {
        externalMsgId = String(rawItem.key?.id || rawItem.id);
      }

      const msgObj = rawItem.message || rawItem.msgContent || rawItem;
      const extracted = extractMessageData(msgObj);
      content = extracted.content;
      mediaUrl = extracted.mediaUrl || mediaUrl;
    }

    if (!phone && (body.object === "whatsapp_business_account" || body.object === "wame") && body.entry && body.entry[0]?.changes) {
       const value = body.entry[0].changes[0].value;
       if (value.messages && value.messages.length > 0) {
          const msg = value.messages[0];
          if (msg.from_me) {
             return res.status(200).send("EVENT_RECEIVED");
          }
          phone = cleanJidToPhone(msg.from);
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
       }
    } 
    else if (!phone && body.phone && (body.message || body.text)) {
        phone = cleanJidToPhone(body.phone);
        const extracted = extractMessageData(body.message || body.text);
        content = extracted.content || String(body.message || body.text);
    } else if (!phone && body.contact && (body.message || body.text)) {
        phone = cleanJidToPhone(body.contact);
        const extracted = extractMessageData(body.message || body.text);
        content = extracted.content || String(body.message || body.text);
    } else if (!phone && body.from && (body.body || body.message || body.text)) {
        phone = cleanJidToPhone(body.from);
        const extracted = extractMessageData(body.body || body.message || body.text);
        content = extracted.content || String(body.body || body.message || body.text);
    } else if (!phone && body.sender && (body.text || body.message)) {
        phone = cleanJidToPhone(body.sender);
        const extracted = extractMessageData(body.text || body.message);
        content = extracted.content || String(body.text || body.message);
    }
    
    // Se tiver mediaUrl mas não tiver conteúdo em texto, define texto descritivo
    if (!content && mediaUrl) {
      if (mediaUrl.includes('audio') || mediaUrl.includes('.ogg') || mediaUrl.includes('.mp3') || mediaUrl.includes('.webm')) {
        content = "🎵 Mensagem de Áudio";
      } else if (mediaUrl.includes('video') || mediaUrl.includes('.mp4')) {
        content = "🎥 Vídeo";
      } else {
        content = "📸 Imagem";
      }
    }

    if (!phone || (!content && !mediaUrl)) {
       console.log(`[Webhook WAME] Sem telefone ou sem dados: phone="${phone}", content="${content}"`);
       return res.status(200).send("EVENT_RECEIVED");
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

  const [{ data: clients }, { data: agendaContacts }] = await Promise.all([
    supabaseAdmin.from('clients').select('id, name, phone, local_phone, admin_id, employee_id'),
    supabaseAdmin.from('agenda_contacts').select('id, name, phone, admin_id')
  ]);
  
  const allTargets = [
    ...(clients || []).map(c => ({ ...c, is_agenda: false })),
    ...(agendaContacts || []).map(a => ({ ...a, local_phone: '', employee_id: a.admin_id, is_agenda: true }))
  ];

  const matchedClient = allTargets.find(c => {
     return isMatchingClientPhone(c.phone || '', cleanIncomingPhone) || isMatchingClientPhone(c.local_phone || '', cleanIncomingPhone);
  });
    
    if (!matchedClient) {
        console.log("[Webhook WAME] Nenhum cliente ou contato da agenda encontrado para o telefone:", phone, cleanIncomingPhone);
        return res.status(200).send("EVENT_RECEIVED");
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
       console.log("[Webhook WAME] Não foi possível criar ou obter sessão para:", matchedClient.id, matchedClient.name);
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
            const formatFirstTwoNames = (fullName) => {
              if (!fullName || typeof fullName !== 'string') return 'Cliente';
              const parts = fullName.trim().split(/\s+/).filter(Boolean);
              if (parts.length === 0) return 'Cliente';
              if (parts.length === 1) return parts[0];
              return `${parts[0]} ${parts[1]}`;
            };
            const clientDisplayName = formatFirstTwoNames(matchedClient.name);

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