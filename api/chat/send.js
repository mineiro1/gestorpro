import { createClient } from '@supabase/supabase-js';

const processedMessageClientIds = new Map();

// Limpa cache de idempotência a cada 10 minutos
const cleanupInterval = setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [key, val] of processedMessageClientIds.entries()) {
    if (val.timestamp < cutoff) {
      processedMessageClientIds.delete(key);
    }
  }
}, 10 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();

function getSupabaseAdmin() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://fgmmvrvudozzwqxzsztwo.supabase.co';
  const part1 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnbW12cnZ1ZG96endxenN6dHdvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA1MjMzMSwi";
  const part2 = "ZXhwIjoyMDk0NjI4MzMxfQ.iB9iF3aoumsNtywpLZL_QjrBzR8QPWw7GGWQ6-Yx-Ik";
  const directKey = part1 + part2;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || directKey;
  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let { text, clientPhone, waSettings, messageId, sessionId, senderName, message_client_id, mediaBase64, mimeType, mediaUrl, recipient } = req.body;
    const phone = clientPhone || recipient;
    if ((!text && !mediaBase64 && !mediaUrl) || !phone) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const cleanDigits = String(phone).replace(/\D/g, '');
    const targetNumber = cleanDigits.startsWith('55') ? cleanDigits : `55${cleanDigits}`;

    // Gerar ou sanitizar message_client_id para controle estrito de idempotência
    const clientMsgId = String(message_client_id || req.headers['x-idempotency-key'] || (messageId ? `mid_${messageId}` : `txt_${targetNumber}_${(text || '').trim().substring(0, 30)}_${mediaBase64 ? 'media' : 'txt'}`));
    const now = Date.now();

    // 1. Verificação de Idempotência em Memória (< 30 segundos)
    if (processedMessageClientIds.has(clientMsgId)) {
      const cached = processedMessageClientIds.get(clientMsgId);
      if (cached.success && now - cached.timestamp < 30000) {
        console.log(`[Idempotência Serverless] Ignorando envio duplicado (Memória): ${clientMsgId}`);
        return res.json({
          success: true,
          duplicated: true,
          externalId: cached.externalId || undefined,
          messageId: cached.messageId || messageId,
          message_client_id: clientMsgId
        });
      }
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Se waSettings não estiver completo, buscar configurações do admin no banco
    if (!waSettings?.evolutionApiKey && !waSettings?.metaToken) {
      let adminToSearch = req.body.adminId;
      if (!adminToSearch && req.body.clientId) {
        const { data: clientRow } = await supabaseAdmin.from('clients').select('admin_id').eq('id', req.body.clientId).maybeSingle();
        if (clientRow?.admin_id) adminToSearch = clientRow.admin_id;
      }

      if (adminToSearch) {
        const { data: specificAdmin } = await supabaseAdmin.from('users').select('whatsapp_settings').eq('id', adminToSearch).maybeSingle();
        if (specificAdmin?.whatsapp_settings?.metaToken || specificAdmin?.whatsapp_settings?.evolutionApiKey) {
          waSettings = specificAdmin.whatsapp_settings;
        }
      }

      if (!waSettings?.evolutionApiKey && !waSettings?.metaToken) {
        const { data: adminUsers } = await supabaseAdmin
          .from('users')
          .select('whatsapp_settings')
          .not('whatsapp_settings', 'is', null);
        const validAdmin = adminUsers?.find(u => u.whatsapp_settings?.evolutionApiKey || u.whatsapp_settings?.metaToken);
        if (validAdmin?.whatsapp_settings) {
          waSettings = validAdmin.whatsapp_settings;
        }
      }
    }

    // Se houver mídia em base64, fazer upload para o Supabase Storage (bucket 'chat-media')
    let publicMediaUrl = mediaUrl || '';
    if (mediaBase64 && (!publicMediaUrl || !publicMediaUrl.startsWith('http'))) {
      try {
        const rawBase64 = mediaBase64.includes('base64,') ? mediaBase64.split('base64,')[1] : mediaBase64;
        const buffer = Buffer.from(rawBase64, 'base64');
        
        let ext = 'bin';
        if (mimeType?.includes('png')) ext = 'png';
        else if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) ext = 'jpg';
        else if (mimeType?.includes('webp')) ext = 'webp';
        else if (mimeType?.includes('mp4')) ext = 'mp4';
        else if (mimeType?.includes('webm')) ext = 'webm';
        else if (mimeType?.includes('ogg')) ext = 'ogg';
        else if (mimeType?.includes('mp3') || mimeType?.includes('mpeg')) ext = 'mp3';
        else if (mimeType?.includes('pdf')) ext = 'pdf';

        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
        
        const { error: uploadErr } = await supabaseAdmin.storage
          .from('chat-media')
          .upload(fileName, buffer, {
            contentType: mimeType || 'application/octet-stream',
            upsert: true
          });

        if (!uploadErr) {
          const { data: pubData } = supabaseAdmin.storage.from('chat-media').getPublicUrl(fileName);
          if (pubData?.publicUrl) {
            publicMediaUrl = pubData.publicUrl;
          }
        }
      } catch (storageErr) {
        console.error("[/api/chat/send] Falha no processamento de mídia storage:", storageErr);
      }
    }

    let externalId = '';
    let sendSuccess = false;
    let lastSendError = '';

    // Determina o provedor ativo (Padrão: AstraCalls)
    const provider = waSettings?.provider || (waSettings?.useMetaApi ? 'meta' : (waSettings?.useEvolutionApi ? 'evolution' : (waSettings?.useAstracalls !== false ? 'astracalls' : 'astracalls')));

    // 1. Provedor: AstraCalls
    if (provider === 'astracalls' || (waSettings?.useAstracalls && !waSettings?.useMetaApi && !waSettings?.useEvolutionApi)) {
      const astracallsUrl = (waSettings?.astracallsUrl || 'https://calls.rspiscinas.app.br').trim().replace(/\/$/, '');
      const astracallsApiKey = waSettings?.astracallsApiKey || 'rs_piscinas_segredo_2026';
      let astraSessionId = waSettings?.astracallsSessionId || '8090cca3add0b8eb3e41efb9eec363e4';

      try {
        if (!waSettings?.astracallsSessionId) {
          try {
            const sessRes = await fetch(`${astracallsUrl}/api/sessions`, {
              headers: { 'X-Api-Key': astracallsApiKey }
            });
            if (sessRes.ok) {
              const sData = await sessRes.json();
              const openSess = sData?.sessions?.find(s => s.state === 'open' || s.paired) || sData?.sessions?.[0];
              if (openSess?.id) astraSessionId = openSess.id;
            }
          } catch (e) {}
        }

        const rawClean = targetNumber.replace(/\D/g, '');
        let twelveDigit = '';
        let thirteenDigit = '';

        let baseNum = rawClean;
        if (!baseNum.startsWith('55')) {
          if (baseNum.length === 10 || baseNum.length === 11) baseNum = '55' + baseNum;
          else if (baseNum.length === 8 || baseNum.length === 9) baseNum = '5567' + baseNum;
        }

        if (baseNum.startsWith('55') && baseNum.length >= 12) {
          const ddd = baseNum.substring(2, 4);
          const rest = baseNum.substring(4);
          if (baseNum.length === 13 && rest.startsWith('9')) {
            thirteenDigit = baseNum;
            twelveDigit = `55${ddd}${rest.substring(1)}`;
          } else if (baseNum.length === 12) {
            twelveDigit = baseNum;
            thirteenDigit = `55${ddd}9${rest}`;
          }
        }

        // Para AstraCalls: O formato de 12 dígitos sem o 9 (ex: 556791907236) DEVE ser o primeiro a ser enviado!
        const numbersToTry = [];
        if (twelveDigit) numbersToTry.push(twelveDigit);
        if (thirteenDigit) numbersToTry.push(thirteenDigit);
        if (!twelveDigit && !thirteenDigit) numbersToTry.push(targetNumber);

        let lastResponseText = '';
        for (const num of numbersToTry) {
          let sendEndpoint = `${astracallsUrl}/api/sessions/${astraSessionId}/messages/text`;
          const payload = {
            to: num,
            phone: num,
            recipient: num,
            text: text || '',
            message: text || ''
          };

          if (publicMediaUrl || mediaBase64) {
            payload.mediaUrl = publicMediaUrl || mediaBase64;
            payload.mimeType = mimeType || undefined;
            if (mimeType?.startsWith('audio/')) {
              sendEndpoint = `${astracallsUrl}/api/sessions/${astraSessionId}/messages/audio`;
            }
          }

          const response = await fetch(sendEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': astracallsApiKey
            },
            body: JSON.stringify(payload)
          });

          if (response.ok) {
            sendSuccess = true;
            try {
              const astraData = await response.json();
              externalId = astraData?.id || astraData?.messageId || astraData?.key?.id || `astra_${Date.now()}`;
            } catch (e) {
              externalId = `astra_${Date.now()}`;
            }
            break;
          } else {
            lastResponseText = await response.text().catch(() => '');
          }
        }

        if (!sendSuccess) {
          lastSendError = `Erro AstraCalls: ${lastResponseText}`;
          console.warn("[/api/chat/send] AstraCalls error response:", lastResponseText);
        }
      } catch (astraErr) {
        lastSendError = `Falha na conexão com AstraCalls: ${astraErr.message}`;
        console.error("[/api/chat/send] Erro conexao AstraCalls:", astraErr.message);
      }
    } else if (provider === 'evolution' || (waSettings?.useEvolutionApi && waSettings?.evolutionApiUrl && waSettings?.evolutionApiKey && waSettings?.evolutionInstanceName)) {
      let baseUrl = waSettings.evolutionApiUrl.trim().replace(/\/$/, '');
      if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;

      let evoUrl = `${baseUrl}/message/sendText/${waSettings.evolutionInstanceName}`;
      let evoBody = {
        number: targetNumber,
        text: text || '',
        options: { delay: 500, presence: 'composing', linkPreview: false }
      };

      if (publicMediaUrl || mediaBase64) {
        const rawBase64 = mediaBase64?.includes('base64,') ? mediaBase64.split('base64,')[1] : (mediaBase64 || '');
        const mediaSource = publicMediaUrl || (mediaBase64 ? (mediaBase64.startsWith('data:') ? mediaBase64 : `data:${mimeType};base64,${mediaBase64}`) : '');
        
        if (mimeType?.startsWith('audio/')) {
          evoUrl = `${baseUrl}/message/sendWhatsAppAudio/${waSettings.evolutionInstanceName}`;
          evoBody = {
            number: targetNumber,
            audio: mediaSource,
            base64: rawBase64 || undefined,
            options: { delay: 500, presence: 'recording', encoding: true }
          };
        } else {
          evoUrl = `${baseUrl}/message/sendMedia/${waSettings.evolutionInstanceName}`;
          const mediatype = mimeType?.startsWith('video/') ? 'video' : (mimeType?.startsWith('image/') ? 'image' : 'document');
          evoBody = {
            number: targetNumber,
            media: mediaSource,
            base64: rawBase64 || undefined,
            mediatype: mediatype,
            caption: text || ''
          };
        }
      }

      try {
        const response = await fetch(evoUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': waSettings.evolutionApiKey
          },
          body: JSON.stringify(evoBody)
        });

        if (response.ok) {
          sendSuccess = true;
          try {
            const evoData = await response.json();
            externalId = evoData?.key?.id || 
                         evoData?.data?.key?.id || 
                         evoData?.messageId || 
                         evoData?.id || 
                         evoData?.messages?.[0]?.key?.id || 
                         evoData?.messages?.[0]?.id || '';
          } catch (e) {}
        } else {
          const errData = await response.json().catch(() => ({}));
          lastSendError = errData?.message || JSON.stringify(errData);
          console.warn("[/api/chat/send] Evolution API error response:", errData);
        }
      } catch (evoFetchErr) {
        lastSendError = evoFetchErr.message;
        console.error("[/api/chat/send] Erro conexão Evolution API:", evoFetchErr);
      }
    } else if (waSettings?.useMetaApi || waSettings?.metaToken) {
      if (!waSettings?.metaToken) throw new Error("Token Meta obrigatório");
      
      let baseUrl = (waSettings.metaServerUrl || 'https://graph.facebook.com/v19.0').trim().replace(/\/$/, '');
      if (!baseUrl.startsWith('http')) {
        baseUrl = 'https://' + baseUrl;
      }
      const isWame = baseUrl && !baseUrl.includes('graph.facebook.com');
      
      let url, headers, body;
      if (isWame) {
         headers = { 'Content-Type': 'application/json' };
         
         if (publicMediaUrl) {
           if (mimeType?.startsWith('image/')) {
             url = `${baseUrl}/${waSettings.metaToken}/message/image`;
             body = JSON.stringify({
               to: targetNumber,
               url: publicMediaUrl,
               caption: text || ''
             });
           } else if (mimeType?.startsWith('video/')) {
             url = `${baseUrl}/${waSettings.metaToken}/message/video`;
             body = JSON.stringify({
               to: targetNumber,
               url: publicMediaUrl,
               caption: text || ''
             });
           } else if (mimeType?.startsWith('audio/')) {
             url = `${baseUrl}/${waSettings.metaToken}/message/audio`;
             body = JSON.stringify({
               to: targetNumber,
               url: publicMediaUrl
             });
           } else {
             url = `${baseUrl}/${waSettings.metaToken}/message/document`;
             body = JSON.stringify({
               to: targetNumber,
               url: publicMediaUrl,
               mimetype: mimeType || 'application/octet-stream',
               filename: 'arquivo',
               caption: text || ''
             });
           }
         } else {
           url = `${baseUrl}/${waSettings.metaToken}/message/text`;
           body = JSON.stringify({
             to: targetNumber,
             text: text || '',
             linkPreview: false,
             options: { linkPreview: false }
           });
         }
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
          to: targetNumber,
          type: "text",
          text: { preview_url: false, body: text || '' }
        });
      }

      try {
        const response = await fetch(url, { method: 'POST', headers, body });
        if (response.ok) {
          sendSuccess = true;
          try {
            const metaData = await response.json();
            externalId = metaData?.messages?.[0]?.id || 
                         metaData?.id || 
                         metaData?.key?.id || 
                         metaData?.data?.key?.id || '';
          } catch (e) {}
        } else {
          const errText = await response.text().catch(() => '');
          lastSendError = errText;
          console.warn("[/api/chat/send] Meta/WAME API error response:", errText);
        }
      } catch (metaFetchErr) {
        lastSendError = metaFetchErr.message;
        console.error("[/api/chat/send] Erro conexão Meta/WAME API:", metaFetchErr);
      }
    } else {
      lastSendError = "Nenhum provedor de WhatsApp ativo nas configurações.";
    }
    
    const mediaPayload = {
      status: sendSuccess ? 'sent' : 'failed',
      external_id: externalId || undefined,
      message_client_id: clientMsgId,
      url: publicMediaUrl || mediaBase64 || undefined,
      sender_name: senderName || 'Colaborador',
      sent_at: sendSuccess ? new Date().toISOString() : undefined,
      error: sendSuccess ? undefined : (lastSendError || 'Falha no envio')
    };

    let insertedRow = null;

    // Atualiza o registro da mensagem no banco ou cria caso não exista
    if (messageId) {
      try {
        const { data: currentMsg } = await supabaseAdmin
          .from('chat_messages')
          .select('media_url')
          .eq('id', messageId)
          .single();

        let meta = {};
        if (currentMsg?.media_url) {
          try { meta = JSON.parse(currentMsg.media_url); } catch(e) {}
        }

        const { data: updated } = await supabaseAdmin
          .from('chat_messages')
          .update({
            media_url: JSON.stringify({
              ...meta,
              ...mediaPayload
            })
          })
          .eq('id', messageId)
          .select()
          .single();
        if (updated) insertedRow = updated;
      } catch (dbErr) {
        console.error("[/api/chat/send] Erro ao atualizar external_id no banco:", dbErr);
      }
    } else if (sessionId) {
      try {
        const { data: created } = await supabaseAdmin
          .from('chat_messages')
          .insert({
            session_id: sessionId,
            sender_type: 'tech',
            content: text,
            media_url: JSON.stringify(mediaPayload)
          })
          .select()
          .single();
        if (created) {
          messageId = created.id;
          insertedRow = created;
        }
      } catch (dbErr) {
        console.error("[/api/chat/send] Erro ao inserir mensagem no banco:", dbErr);
      }
    } else if (req.body.clientId) {
      try {
        const { data: existingSessions } = await supabaseAdmin
          .from('chat_sessions')
          .select('id, status')
          .eq('client_id', req.body.clientId)
          .order('created_at', { ascending: false })
          .limit(5);

        let sessId = existingSessions?.find(s => s.status === 'open')?.id || existingSessions?.[0]?.id;
        if (!sessId) {
          const { data: clientRow } = await supabaseAdmin.from('clients').select('admin_id, employee_id').eq('id', req.body.clientId).maybeSingle();
          let adminId = clientRow?.admin_id;
          let employeeId = clientRow?.employee_id || adminId;

          if (!adminId) {
            const { data: anyAdmin } = await supabaseAdmin.from('users').select('id').eq('role', 'admin').limit(1).maybeSingle();
            adminId = anyAdmin?.id;
            employeeId = adminId;
          }

          const { data: createdSess } = await supabaseAdmin.from('chat_sessions').insert({
            client_id: req.body.clientId,
            admin_id: adminId || null,
            employee_id: employeeId || null,
            status: 'open',
            created_at: new Date().toISOString()
          }).select('id').single();
          sessId = createdSess?.id;
        }

        if (sessId) {
          const { data: created } = await supabaseAdmin
            .from('chat_messages')
            .insert({
              session_id: sessId,
              sender_type: 'tech',
              content: text,
              media_url: JSON.stringify(mediaPayload)
            })
            .select()
            .single();
          if (created) {
            messageId = created.id;
            insertedRow = created;
          }
        }
      } catch (dbErr) {
        console.error("[/api/chat/send] Erro ao associar sessão/mensagem no banco:", dbErr);
      }
    }

    // Atualiza o cache com a resposta definitiva
    processedMessageClientIds.set(clientMsgId, {
      timestamp: Date.now(),
      externalId: externalId || '',
      messageId: messageId || '',
      success: sendSuccess
    });

    return res.json({
      success: sendSuccess,
      externalId: externalId || undefined,
      messageId,
      message: insertedRow,
      message_client_id: clientMsgId,
      error: sendSuccess ? undefined : lastSendError
    });
  } catch(e) {
    console.error("[/api/chat/send] Erro geral:", e);
    return res.status(500).json({ error: e.message });
  }
}
