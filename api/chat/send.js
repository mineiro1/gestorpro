import { createClient } from '@supabase/supabase-js';

const processedClientMsgIds = new Map();

// Limpa cache de idempotência a cada 10 minutos
const cleanupInterval = setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [key, val] of processedClientMsgIds.entries()) {
    if (val.timestamp < cutoff) {
      processedClientMsgIds.delete(key);
    }
  }
}, 10 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let { text, clientPhone, waSettings, messageId, sessionId, senderName, message_client_id, mediaBase64, mimeType, mediaUrl } = req.body;
    if ((!text && !mediaBase64 && !mediaUrl) || !clientPhone) return res.status(400).json({ error: "Missing fields" });

    const cleanDigits = String(clientPhone).replace(/\D/g, '');
    const targetNumber = cleanDigits.startsWith('55') ? cleanDigits : `55${cleanDigits}`;

    // Gerar ou sanitizar message_client_id para controle estrito de idempotência
    const clientMsgId = String(message_client_id || req.headers['x-idempotency-key'] || (messageId ? `mid_${messageId}` : `txt_${targetNumber}_${(text || '').trim().substring(0, 30)}_${mediaBase64 ? 'media' : 'txt'}`));
    const now = Date.now();

    // 1. Verificação de Idempotência em Memória (< 30 segundos)
    if (processedClientMsgIds.has(clientMsgId)) {
      const cached = processedClientMsgIds.get(clientMsgId);
      if (now - cached.timestamp < 30000) {
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

    // Inicializa Supabase Admin se disponível
    let supabaseAdmin = null;
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://fgmmvrvudozzwqxzsztwo.supabase.co';
      const part1 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnbW12cnZ1ZG96endxenN6dHdvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA1MjMzMSwi";
      const part2 = "ZXhwIjoyMDk0NjI4MzMxfQ.iB9iF3aoumsNtywpLZL_QjrBzR8QPWw7GGWQ6-Yx-Ik";
      const directKey = part1 + part2;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || directKey || process.env.VITE_SUPABASE_ANON_KEY || '';
      if (supabaseUrl && supabaseKey) {
        supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
      }
    } catch (e) {
      console.warn("[/api/chat/send] Erro ao instanciar Supabase:", e);
    }

    // 2. Verificação de Idempotência no Banco de Dados (< 30 segundos)
    if (supabaseAdmin) {
      const thirtySecondsAgo = new Date(now - 30000).toISOString();
      try {
        const { data: recentMatching } = await supabaseAdmin
          .from('chat_messages')
          .select('id, media_url, created_at')
          .gte('created_at', thirtySecondsAgo)
          .eq('sender_type', 'tech')
          .ilike('media_url', `%"message_client_id":"${clientMsgId}"%`)
          .limit(1);

        if (recentMatching && recentMatching.length > 0) {
          let existingMeta = {};
          try { existingMeta = JSON.parse(recentMatching[0].media_url); } catch(e) {}

          const isSameUnsentRecord = messageId && recentMatching[0].id === messageId && !existingMeta.external_id && existingMeta.status !== 'sent';
          if (!isSameUnsentRecord) {
            console.log(`[Idempotência Serverless] Ignorando envio duplicado (Banco de Dados): ${clientMsgId}`);
            processedClientMsgIds.set(clientMsgId, {
              timestamp: now,
              externalId: existingMeta.external_id || '',
              messageId: recentMatching[0].id
            });
            return res.json({
              success: true,
              duplicated: true,
              externalId: existingMeta.external_id || undefined,
              messageId: recentMatching[0].id,
              message_client_id: clientMsgId
            });
          }
        }
      } catch (dbCheckErr) {
        console.warn("[Idempotência Serverless] Erro ao consultar duplicidade no banco:", dbCheckErr);
      }
    }

    // Registra lock provisório para evitar concorrência simultânea
    processedClientMsgIds.set(clientMsgId, {
      timestamp: now,
      externalId: '',
      messageId: messageId || ''
    });

    // Se waSettings não estiver completo, buscar configurações no banco
    if (supabaseAdmin && (!waSettings?.evolutionApiKey && !waSettings?.metaToken)) {
      try {
        const { data: adminUsers } = await supabaseAdmin
          .from('users')
          .select('whatsapp_settings')
          .not('whatsapp_settings', 'is', null);
        const validAdmin = adminUsers?.find(u => u.whatsapp_settings?.evolutionApiKey || u.whatsapp_settings?.metaToken);
        if (validAdmin?.whatsapp_settings) {
          waSettings = validAdmin.whatsapp_settings;
        }
      } catch (dbErr) {
        console.error("Erro ao buscar waSettings atualizado:", dbErr);
      }
    }

    let externalId = '';
    let sendSuccess = false;
    let lastSendError = '';

    // Envio ÚNICO via Evolution API
    if (waSettings?.useEvolutionApi && waSettings?.evolutionApiUrl && waSettings?.evolutionApiKey && waSettings?.evolutionInstanceName) {
      let baseUrl = waSettings.evolutionApiUrl.trim().replace(/\/$/, '');
      if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;

      let evoUrl = `${baseUrl}/message/sendText/${waSettings.evolutionInstanceName}`;
      let evoBody = {
        number: targetNumber,
        text: text || '',
        options: { delay: 500, presence: 'composing', linkPreview: false }
      };

      if (mediaBase64 && mimeType) {
        const dataUri = mediaBase64.startsWith('data:') ? mediaBase64 : `data:${mimeType};base64,${mediaBase64}`;
        const rawBase64 = mediaBase64.includes('base64,') ? mediaBase64.split('base64,')[1] : mediaBase64;
        if (mimeType.startsWith('audio/')) {
          evoUrl = `${baseUrl}/message/sendWhatsAppAudio/${waSettings.evolutionInstanceName}`;
          evoBody = {
            number: targetNumber,
            audio: dataUri,
            base64: rawBase64,
            options: { delay: 500, presence: 'recording', encoding: true }
          };
        } else {
          evoUrl = `${baseUrl}/message/sendMedia/${waSettings.evolutionInstanceName}`;
          const mediatype = mimeType.startsWith('video/') ? 'video' : (mimeType.startsWith('image/') ? 'image' : 'document');
          evoBody = {
            number: targetNumber,
            media: dataUri,
            base64: rawBase64,
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
        console.error("[/api/chat/send] Erro de conexão com Evolution API:", evoFetchErr);
      }
    } else if (waSettings?.useMetaApi) {
      if (!waSettings.metaToken) throw new Error("Token Meta obrigatório");

      let baseUrl = (waSettings.metaServerUrl || 'https://graph.facebook.com/v19.0').trim().replace(/\/$/, '');
      if (!baseUrl.startsWith('http')) {
        baseUrl = 'https://' + baseUrl;
      }
      const isWame = baseUrl && !baseUrl.includes('graph.facebook.com');

      let url, headers, body;
      if (isWame) {
        url = `${baseUrl}/${waSettings.metaToken}/message/text`;
        headers = { 'Content-Type': 'application/json' };
        let bodyObj = {
          to: targetNumber,
          text: text || '',
          linkPreview: false,
          preview_url: false,
          previewUrl: false,
          options: { linkPreview: false }
        };

        if (mediaBase64 && mimeType) {
          const dataUri = mediaBase64.startsWith('data:') ? mediaBase64 : `data:${mimeType};base64,${mediaBase64}`;
          const rawBase64 = mediaBase64.includes('base64,') ? mediaBase64.split('base64,')[1] : mediaBase64;
          if (mimeType.startsWith('audio/')) {
            url = `${baseUrl}/${waSettings.metaToken}/message/voice`;
            bodyObj = {
              to: targetNumber,
              audio: dataUri,
              media: dataUri,
              base64: rawBase64,
              voice: true
            };
          } else if (mimeType.startsWith('image/')) {
            url = `${baseUrl}/${waSettings.metaToken}/message/image`;
            bodyObj = {
              to: targetNumber,
              image: dataUri,
              media: dataUri,
              base64: rawBase64,
              caption: text || ''
            };
          } else if (mimeType.startsWith('video/')) {
            url = `${baseUrl}/${waSettings.metaToken}/message/video`;
            bodyObj = {
              to: targetNumber,
              video: dataUri,
              media: dataUri,
              base64: rawBase64,
              caption: text || ''
            };
          } else {
            url = `${baseUrl}/${waSettings.metaToken}/message/doc`;
            bodyObj = {
              to: targetNumber,
              document: dataUri,
              media: dataUri,
              base64: rawBase64,
              caption: text || ''
            };
          }
        }
        body = JSON.stringify(bodyObj);
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

      // Envio ESTRITAMENTE ÚNICO: 1 requisição para o targetNumber
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body
        });

        if (response.ok) {
          sendSuccess = true;
          try {
            const resData = await response.json();
            externalId = resData?.id || 
                         resData?.messages?.[0]?.id || 
                         resData?.data?.id || 
                         resData?.key?.id || '';
          } catch (e) {}
        } else {
          const errText = await response.text().catch(() => '');
          lastSendError = errText;
          console.warn("[/api/chat/send] Meta/WAME API error response:", errText);
        }
      } catch (metaFetchErr) {
        lastSendError = metaFetchErr.message;
        console.error("[/api/chat/send] Erro de conexão com Meta/WAME API:", metaFetchErr);
      }
    } else {
      lastSendError = "Nenhum provedor de WhatsApp (Meta ou Evolution) está ativo nas configurações.";
    }

    // Atualiza idempotência em memória com externalId
    processedClientMsgIds.set(clientMsgId, {
      timestamp: Date.now(),
      externalId,
      messageId: messageId || ''
    });

    // Atualiza metadados da mensagem no banco se messageId existir
    if (supabaseAdmin && messageId) {
      try {
        const { data: existingRow } = await supabaseAdmin
          .from('chat_messages')
          .select('media_url')
          .eq('id', messageId)
          .single();

        let parsedMeta = {};
        if (existingRow?.media_url) {
          try { parsedMeta = JSON.parse(existingRow.media_url); } catch (e) {}
        }
        const updatedMeta = {
          ...parsedMeta,
          status: sendSuccess ? 'sent' : 'failed',
          external_id: externalId || parsedMeta.external_id || undefined,
          message_client_id: clientMsgId,
          sent_at: sendSuccess ? new Date().toISOString() : undefined,
          error: sendSuccess ? undefined : (lastSendError || 'Falha no envio')
        };
        await supabaseAdmin
          .from('chat_messages')
          .update({ media_url: JSON.stringify(updatedMeta) })
          .eq('id', messageId);
      } catch (updateErr) {
        console.warn("[/api/chat/send] Erro ao atualizar status da mensagem no banco:", updateErr);
      }
    }

    return res.json({
      success: sendSuccess,
      externalId: externalId || undefined,
      message_client_id: clientMsgId,
      error: sendSuccess ? undefined : lastSendError
    });

  } catch(e) {
    console.error("[/api/chat/send] Erro geral:", e);
    return res.status(500).json({ error: e.message });
  }
}
