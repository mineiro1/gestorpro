import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { initFirebase, admin } from './_firebaseAdmin.js';
import fs from 'fs';
import path from 'path';

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper para obter o cliente Supabase Admin
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

function formatAstraCallsNumber(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';

  let full = digits;
  if (!full.startsWith('55')) {
    if (full.length === 10 || full.length === 11) {
      full = '55' + full;
    } else if (full.length === 8 || full.length === 9) {
      full = '5567' + full;
    }
  }

  if (full.startsWith('55') && full.length === 13) {
    const ddd = full.substring(2, 4);
    const ninth = full.substring(4, 5);
    const rest = full.substring(5);
    if (ninth === '9') {
      return `55${ddd}${rest}`;
    }
  }

  return full;
}

const processedMessageClientIds = new Map();

// --- 1. CHAT ENDPOINTS ---

// Ensure Session
app.post(['/api/chat/session/ensure', '/chat/session/ensure'], async (req, res) => {
  try {
    const { clientId, adminId, employeeId, visitId } = req.body;
    if (!clientId) return res.status(400).json({ error: "Missing clientId" });

    const supabaseAdmin = getSupabaseAdmin();
    const { data: existingSessions } = await supabaseAdmin
      .from('chat_sessions')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(10);

    const openSession = existingSessions?.find(s => s.status === 'open');
    if (openSession) {
      const now = Date.now();
      const sessionStart = openSession.created_at ? new Date(openSession.created_at).getTime() : now;
      if (now - sessionStart <= 30 * 60 * 1000) {
        return res.json({ success: true, session: openSession });
      } else {
        await supabaseAdmin
          .from('chat_sessions')
          .update({ status: 'closed', closed_at: new Date().toISOString() })
          .eq('id', openSession.id);
      }
    }

    let resolvedAdminId = adminId;
    let resolvedEmpId = employeeId;
    const { data: clientRow } = await supabaseAdmin.from('clients').select('admin_id, employee_id').eq('id', clientId).maybeSingle();
    if (clientRow) {
      resolvedAdminId = resolvedAdminId || clientRow.admin_id;
      resolvedEmpId = resolvedEmpId || clientRow.employee_id || clientRow.admin_id;
    }

    if (!resolvedAdminId || !resolvedEmpId) {
      const { data: anyAdmin } = await supabaseAdmin.from('users').select('id').eq('role', 'admin').limit(1).maybeSingle();
      if (anyAdmin?.id) {
        resolvedAdminId = resolvedAdminId || anyAdmin.id;
        resolvedEmpId = resolvedEmpId || anyAdmin.id;
      }
    }

    const { data: newSession, error: createErr } = await supabaseAdmin
      .from('chat_sessions')
      .insert({
        client_id: clientId,
        visit_id: visitId || null,
        admin_id: resolvedAdminId || null,
        employee_id: resolvedEmpId || null,
        status: 'open',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createErr) return res.status(500).json({ error: createErr.message });
    return res.json({ success: true, session: newSession });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Upload Media
app.post(['/api/chat/upload', '/chat/upload'], async (req, res) => {
  try {
    const { mediaBase64, mimeType } = req.body;
    if (!mediaBase64) return res.status(400).json({ error: "Missing mediaBase64" });
    if (mediaBase64.startsWith('http://') || mediaBase64.startsWith('https://')) {
      return res.json({ success: true, publicUrl: mediaBase64 });
    }

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
    const supabaseAdmin = getSupabaseAdmin();

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('chat-media')
      .upload(fileName, buffer, { contentType: mimeType || 'application/octet-stream', upsert: true });

    if (uploadErr) return res.status(500).json({ error: uploadErr.message });

    const { data: pubData } = supabaseAdmin.storage.from('chat-media').getPublicUrl(fileName);
    if (!pubData?.publicUrl) return res.status(500).json({ error: "Could not generate public URL" });

    return res.json({ success: true, publicUrl: pubData.publicUrl });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Send Chat Message
app.post(['/api/chat/send', '/chat/send'], async (req, res) => {
  try {
    let { text, clientPhone, waSettings, messageId, sessionId, senderName, message_client_id, mediaBase64, mimeType, mediaUrl, recipient } = req.body;
    const phone = clientPhone || recipient;
    if ((!text && !mediaBase64 && !mediaUrl) || !phone) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const cleanDigits = String(phone).replace(/\D/g, '');
    const targetNumber = cleanDigits.startsWith('55') ? cleanDigits : `55${cleanDigits}`;
    const clientMsgId = String(message_client_id || req.headers['x-idempotency-key'] || (messageId ? `mid_${messageId}` : `txt_${targetNumber}_${(text || '').trim().substring(0, 30)}_${mediaBase64 ? 'media' : 'txt'}`));
    const now = Date.now();

    if (processedMessageClientIds.has(clientMsgId)) {
      const cached = processedMessageClientIds.get(clientMsgId);
      if (cached.success && now - cached.timestamp < 30000) {
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
        const { data: adminUsers } = await supabaseAdmin.from('users').select('whatsapp_settings').not('whatsapp_settings', 'is', null);
        const validAdmin = adminUsers?.find(u => u.whatsapp_settings?.evolutionApiKey || u.whatsapp_settings?.metaToken);
        if (validAdmin?.whatsapp_settings) waSettings = validAdmin.whatsapp_settings;
      }
    }

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
        const { error: uploadErr } = await supabaseAdmin.storage.from('chat-media').upload(fileName, buffer, { contentType: mimeType || 'application/octet-stream', upsert: true });
        if (!uploadErr) {
          const { data: pubData } = supabaseAdmin.storage.from('chat-media').getPublicUrl(fileName);
          if (pubData?.publicUrl) publicMediaUrl = pubData.publicUrl;
        }
      } catch (storageErr) {}
    }

    let externalId = '';
    let sendSuccess = false;
    let lastSendError = '';

    const provider = waSettings?.provider || (waSettings?.useMetaApi ? 'meta' : (waSettings?.useEvolutionApi ? 'evolution' : (waSettings?.useAstracalls !== false ? 'astracalls' : 'astracalls')));

    if (provider === 'astracalls' || (waSettings?.useAstracalls && !waSettings?.useMetaApi && !waSettings?.useEvolutionApi)) {
      const astracallsUrl = (waSettings?.astracallsUrl || 'https://calls.rspiscinas.app.br').trim().replace(/\/$/, '');
      const astracallsApiKey = waSettings?.astracallsApiKey || 'rs_piscinas_segredo_2026';
      let astraSessionId = waSettings?.astracallsSessionId || '8090cca3add0b8eb3e41efb9eec363e4';

      try {
        if (!waSettings?.astracallsSessionId) {
          try {
            const sessRes = await fetch(`${astracallsUrl}/api/sessions`, { headers: { 'X-Api-Key': astracallsApiKey } });
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
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': astracallsApiKey },
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

        if (!sendSuccess) lastSendError = `Erro AstraCalls: ${lastResponseText}`;
      } catch (astraErr) {
        lastSendError = `Falha na conexão com AstraCalls: ${astraErr.message}`;
      }
    } else if (provider === 'evolution' || (waSettings?.useEvolutionApi && waSettings?.evolutionApiUrl && waSettings?.evolutionApiKey && waSettings?.evolutionInstanceName)) {
      let baseUrl = waSettings.evolutionApiUrl.trim().replace(/\/$/, '');
      if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
      let evoUrl = `${baseUrl}/message/sendText/${waSettings.evolutionInstanceName}`;
      let evoBody = { number: targetNumber, text: text || '', options: { delay: 500, presence: 'composing', linkPreview: false } };

      if (publicMediaUrl || mediaBase64) {
        const rawBase64 = mediaBase64?.includes('base64,') ? mediaBase64.split('base64,')[1] : (mediaBase64 || '');
        const mediaSource = publicMediaUrl || (mediaBase64 ? (mediaBase64.startsWith('data:') ? mediaBase64 : `data:${mimeType};base64,${mediaBase64}`) : '');
        if (mimeType?.startsWith('audio/')) {
          evoUrl = `${baseUrl}/message/sendWhatsAppAudio/${waSettings.evolutionInstanceName}`;
          evoBody = { number: targetNumber, audio: mediaSource, base64: rawBase64 || undefined, options: { delay: 500, presence: 'recording', encoding: true } };
        } else {
          evoUrl = `${baseUrl}/message/sendMedia/${waSettings.evolutionInstanceName}`;
          const mediatype = mimeType?.startsWith('video/') ? 'video' : (mimeType?.startsWith('image/') ? 'image' : 'document');
          evoBody = { number: targetNumber, media: mediaSource, base64: rawBase64 || undefined, mediatype: mediatype, caption: text || '' };
        }
      }

      try {
        const response = await fetch(evoUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': waSettings.evolutionApiKey },
          body: JSON.stringify(evoBody)
        });
        if (response.ok) {
          sendSuccess = true;
          try {
            const evoData = await response.json();
            externalId = evoData?.key?.id || evoData?.data?.key?.id || evoData?.messageId || evoData?.id || evoData?.messages?.[0]?.key?.id || '';
          } catch (e) {}
        } else {
          const errData = await response.json().catch(() => ({}));
          lastSendError = errData?.message || JSON.stringify(errData);
        }
      } catch (evoFetchErr) {
        lastSendError = evoFetchErr.message;
      }
    } else if (waSettings?.useMetaApi || waSettings?.metaToken) {
      let baseUrl = (waSettings.metaServerUrl || 'https://graph.facebook.com/v19.0').trim().replace(/\/$/, '');
      if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
      const isWame = baseUrl && !baseUrl.includes('graph.facebook.com');
      let url, headers, body;
      if (isWame) {
        headers = { 'Content-Type': 'application/json' };
        if (publicMediaUrl) {
          if (mimeType?.startsWith('image/')) url = `${baseUrl}/${waSettings.metaToken}/message/image`;
          else if (mimeType?.startsWith('video/')) url = `${baseUrl}/${waSettings.metaToken}/message/video`;
          else if (mimeType?.startsWith('audio/')) url = `${baseUrl}/${waSettings.metaToken}/message/audio`;
          else url = `${baseUrl}/${waSettings.metaToken}/message/document`;
          body = JSON.stringify({ to: targetNumber, url: publicMediaUrl, caption: text || '' });
        } else {
          url = `${baseUrl}/${waSettings.metaToken}/message/text`;
          body = JSON.stringify({ to: targetNumber, text: text || '', linkPreview: false, options: { linkPreview: false } });
        }
      } else {
        const phoneId = waSettings.metaPhoneNumberId ? `/${waSettings.metaPhoneNumberId}` : '';
        url = `${baseUrl}${phoneId}/messages`;
        headers = { 'Authorization': `Bearer ${waSettings.metaToken}`, 'Content-Type': 'application/json' };
        body = JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: targetNumber, type: "text", text: { preview_url: false, body: text || '' } });
      }

      try {
        const response = await fetch(url, { method: 'POST', headers, body });
        if (response.ok) {
          sendSuccess = true;
          try {
            const metaData = await response.json();
            externalId = metaData?.messages?.[0]?.id || metaData?.id || metaData?.key?.id || '';
          } catch (e) {}
        } else {
          lastSendError = await response.text().catch(() => '');
        }
      } catch (metaFetchErr) {
        lastSendError = metaFetchErr.message;
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
    if (messageId) {
      try {
        const { data: currentMsg } = await supabaseAdmin.from('chat_messages').select('media_url').eq('id', messageId).single();
        let meta = {};
        if (currentMsg?.media_url) {
          try { meta = JSON.parse(currentMsg.media_url); } catch(e) {}
        }
        const { data: updated } = await supabaseAdmin.from('chat_messages').update({ media_url: JSON.stringify({ ...meta, ...mediaPayload }) }).eq('id', messageId).select().single();
        if (updated) insertedRow = updated;
      } catch (dbErr) {}
    } else if (sessionId) {
      try {
        const { data: created } = await supabaseAdmin.from('chat_messages').insert({ session_id: sessionId, sender_type: 'tech', content: text, media_url: JSON.stringify(mediaPayload) }).select().single();
        if (created) {
          messageId = created.id;
          insertedRow = created;
        }
      } catch (dbErr) {}
    } else if (req.body.clientId) {
      try {
        const { data: existingSessions } = await supabaseAdmin.from('chat_sessions').select('id, status').eq('client_id', req.body.clientId).order('created_at', { ascending: false }).limit(5);
        let sessId = existingSessions?.find(s => s.status === 'open')?.id || existingSessions?.[0]?.id;
        if (!sessId) {
          const { data: clientRow } = await supabaseAdmin.from('clients').select('admin_id, employee_id').eq('id', req.body.clientId).maybeSingle();
          let adminId = clientRow?.admin_id;
          let employeeId = clientRow?.employee_id || adminId;
          const { data: createdSess } = await supabaseAdmin.from('chat_sessions').insert({ client_id: req.body.clientId, admin_id: adminId || null, employee_id: employeeId || null, status: 'open', created_at: new Date().toISOString() }).select('id').single();
          sessId = createdSess?.id;
        }
        if (sessId) {
          const { data: created } = await supabaseAdmin.from('chat_messages').insert({ session_id: sessId, sender_type: 'tech', content: text, media_url: JSON.stringify(mediaPayload) }).select().single();
          if (created) {
            messageId = created.id;
            insertedRow = created;
          }
        }
      } catch (dbErr) {}
    }

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
    return res.status(500).json({ error: e.message });
  }
});

// Close Chat Session
app.post(['/api/chat/close', '/chat/close'], async (req, res) => {
  try {
    const { clientId, sessionId } = req.body;
    const supabaseAdmin = getSupabaseAdmin();
    const now = new Date().toISOString();
    if (sessionId) {
      await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: now }).eq('id', sessionId);
    } else if (clientId) {
      await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: now }).eq('client_id', clientId).eq('status', 'open');
    }
    return res.json({ success: true, message: 'Session closed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Sync Status
app.post(['/api/chat/sync-status', '/chat/sync-status'], async (req, res) => {
  try {
    let { messageIds, waSettings } = req.body;
    if (!Array.isArray(messageIds) || messageIds.length === 0) return res.json({ updated: 0, statusMap: {} });
    const supabaseAdmin = getSupabaseAdmin();
    const { data: msgs } = await supabaseAdmin.from('chat_messages').select('id, session_id, media_url, sender_type, created_at').in('id', messageIds).eq('sender_type', 'tech');
    if (!msgs || msgs.length === 0) return res.json({ updated: 0, statusMap: {} });

    let updatedCount = 0;
    const statusMap = {};
    for (const msg of msgs) {
      let meta = {};
      try { meta = JSON.parse(msg.media_url); } catch(e) {}
      if (meta.status === 'read') {
        statusMap[msg.id] = 'read';
        continue;
      }
      let remoteStatus = meta.status || 'sent';
      const msgTime = new Date(msg.created_at).getTime();
      if ((remoteStatus === 'sending' || !meta.status) && Date.now() - msgTime > 5000) {
        remoteStatus = 'sent';
      }
      statusMap[msg.id] = remoteStatus;
    }
    return res.json({ updated: updatedCount, statusMap });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- 2. ASTRACALLS ENDPOINTS ---

// Status
app.get(['/api/astracalls/status', '/astracalls/status'], async (req, res) => {
  try {
    const astracallsUrl = 'https://calls.rspiscinas.app.br';
    const astracallsApiKey = 'rs_piscinas_segredo_2026';
    const [healthRes, sessionsRes, webhookRes] = await Promise.allSettled([
      fetch(`${astracallsUrl}/health`),
      fetch(`${astracallsUrl}/api/sessions`, { headers: { 'X-Api-Key': astracallsApiKey } }),
      fetch(`${astracallsUrl}/api/webhook`, { headers: { 'X-Api-Key': astracallsApiKey } })
    ]);

    let isOnline = false;
    let sessions = [];
    let webhookConfig = null;
    if (healthRes.status === 'fulfilled' && healthRes.value.ok) isOnline = true;
    if (sessionsRes.status === 'fulfilled' && sessionsRes.value.ok) {
      const sData = await sessionsRes.value.json().catch(() => ({}));
      sessions = sData.sessions || [];
      if (sessions.length > 0) isOnline = true;
    }
    if (webhookRes.status === 'fulfilled' && webhookRes.value.ok) {
      webhookConfig = await webhookRes.value.json().catch(() => null);
    }
    return res.json({ online: isOnline, serverUrl: astracallsUrl, sessionsCount: sessions.length, sessions, webhookConfig });
  } catch (e) {
    return res.status(500).json({ error: e.message, online: false });
  }
});

// Test Message
app.post(['/api/astracalls/test-message', '/astracalls/test-message'], async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone) return res.status(400).json({ error: "Telefone obrigatório" });

    const cleanDigits = String(phone).replace(/\D/g, '');
    let baseNum = cleanDigits;
    if (!baseNum.startsWith('55')) {
      if (baseNum.length === 10 || baseNum.length === 11) baseNum = '55' + baseNum;
      else if (baseNum.length === 8 || baseNum.length === 9) baseNum = '5567' + baseNum;
    }

    let twelveDigit = '';
    let thirteenDigit = '';
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

    const numbersToTry = [];
    if (twelveDigit) numbersToTry.push(twelveDigit);
    if (thirteenDigit) numbersToTry.push(thirteenDigit);
    if (!twelveDigit && !thirteenDigit) numbersToTry.push(baseNum);

    const astracallsUrl = 'https://calls.rspiscinas.app.br';
    const astracallsApiKey = 'rs_piscinas_segredo_2026';
    let sessionId = '8090cca3add0b8eb3e41efb9eec363e4';

    try {
      const sRes = await fetch(`${astracallsUrl}/api/sessions`, { headers: { 'X-Api-Key': astracallsApiKey } });
      if (sRes.ok) {
        const sData = await sRes.json();
        const active = sData?.sessions?.find(s => s.state === 'open' || s.paired) || sData?.sessions?.[0];
        if (active?.id) sessionId = active.id;
      }
    } catch (e) {}

    let lastError = null;
    let successData = null;

    for (const targetNum of numbersToTry) {
      const endpoint = `${astracallsUrl}/api/sessions/${sessionId}/messages/text`;
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': astracallsApiKey },
          body: JSON.stringify({
            to: targetNum,
            recipient: targetNum,
            phone: targetNum,
            text: message || '🏊 Olá! Mensagem de teste oficial do servidor AstraCalls da RS Piscinas.',
            message: message || '🏊 Olá! Mensagem de teste oficial do servidor AstraCalls da RS Piscinas.'
          })
        });

        const respText = await resp.text().catch(() => '');
        let parsed = null;
        try { parsed = JSON.parse(respText); } catch (e) { parsed = { text: respText }; }

        if (resp.ok) {
          successData = { ...parsed, deliveredTo: targetNum };
          break;
        } else {
          lastError = parsed?.error || respText;
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    if (successData) return res.json({ success: true, data: successData });
    return res.status(500).json({ error: lastError || "Falha ao enviar mensagem de teste pelo AstraCalls" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Standardize Phones
app.post(['/api/admin/standardize-phones', '/admin/standardize-phones'], async (req, res) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    let updatedClientsCount = 0;
    let updatedContactsCount = 0;
    const details = [];

    const { data: clients } = await supabaseAdmin.from('clients').select('id, name, phone');
    if (clients) {
      for (const client of clients) {
        if (!client.phone) continue;
        const currentPhone = String(client.phone).trim();
        const standardized = formatAstraCallsNumber(currentPhone);
        if (standardized && standardized !== currentPhone) {
          const { error: updErr } = await supabaseAdmin.from('clients').update({ phone: standardized }).eq('id', client.id);
          if (!updErr) {
            updatedClientsCount++;
            details.push({ type: 'client', id: client.id, name: client.name, oldPhone: currentPhone, newPhone: standardized });
          }
        }
      }
    }

    const { data: contacts } = await supabaseAdmin.from('agenda_contacts').select('id, name, phone');
    if (contacts) {
      for (const contact of contacts) {
        if (!contact.phone) continue;
        const currentPhone = String(contact.phone).trim();
        const standardized = formatAstraCallsNumber(currentPhone);
        if (standardized && standardized !== currentPhone) {
          const { error: updErr } = await supabaseAdmin.from('agenda_contacts').update({ phone: standardized }).eq('id', contact.id);
          if (!updErr) {
            updatedContactsCount++;
            details.push({ type: 'agenda_contact', id: contact.id, name: contact.name, oldPhone: currentPhone, newPhone: standardized });
          }
        }
      }
    }

    return res.json({
      success: true,
      updatedClientsCount,
      updatedContactsCount,
      totalUpdated: updatedClientsCount + updatedContactsCount,
      details
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// --- 3. CALLS ENDPOINTS ---

app.post(['/api/call/start', '/call/start'], async (req, res) => {
  try {
    const { clientId, phone } = req.body;
    if (!clientId && !phone) return res.status(400).json({ error: "Telefone ou Cliente obrigatório" });

    const astracallsUrl = 'https://calls.rspiscinas.app.br';
    const astracallsApiKey = 'rs_piscinas_segredo_2026';
    let sessionId = '8090cca3add0b8eb3e41efb9eec363e4';

    try {
      const sRes = await fetch(`${astracallsUrl}/api/sessions`, { headers: { 'X-Api-Key': astracallsApiKey } });
      if (sRes.ok) {
        const sData = await sRes.json();
        const active = sData?.sessions?.find(s => s.state === 'open' || s.paired) || sData?.sessions?.[0];
        if (active?.id) sessionId = active.id;
      }
    } catch (e) {}

    let targetPhone = phone;
    const supabaseAdmin = getSupabaseAdmin();
    if (!targetPhone && clientId) {
      const { data: client } = await supabaseAdmin.from('clients').select('phone').eq('id', clientId).single();
      if (client?.phone) targetPhone = client.phone;
    }

    const cleanDigits = String(targetPhone).replace(/\D/g, '');
    let baseNumber = cleanDigits;
    if (!baseNumber.startsWith('55')) {
      if (baseNumber.length === 10 || baseNumber.length === 11) baseNumber = '55' + baseNumber;
      else if (baseNumber.length === 8 || baseNumber.length === 9) baseNumber = '5567' + baseNumber;
    }

    let twelve = '';
    let thirteen = '';
    if (baseNumber.startsWith('55') && baseNumber.length >= 12) {
      const ddd = baseNumber.substring(2, 4);
      const rest = baseNumber.substring(4);
      if (baseNumber.length === 13 && rest.startsWith('9')) {
        thirteen = baseNumber;
        twelve = `55${ddd}${rest.substring(1)}`;
      } else if (baseNumber.length === 12) {
        twelve = baseNumber;
        thirteen = `55${ddd}9${rest}`;
      }
    }

    const variants = [];
    if (twelve) variants.push(twelve);
    if (thirteen) variants.push(thirteen);
    if (!twelve && !thirteen) variants.push(baseNumber);

    let callId = null;
    let callData = null;

    for (const num of variants) {
      const endpoints = [
        `${astracallsUrl}/api/sessions/${sessionId}/calls/start`,
        `${astracallsUrl}/api/sessions/${sessionId}/calls/offer`,
        `${astracallsUrl}/api/sessions/${sessionId}/calls`
      ];
      for (const ep of endpoints) {
        try {
          const resp = await fetch(ep, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': astracallsApiKey },
            body: JSON.stringify({ to: num, phone: num, recipient: num, audioOnly: true, isVideo: false })
          });
          if (resp.ok) {
            const data = await resp.json().catch(() => ({}));
            callId = data.id || data.callId || `call_${Date.now()}`;
            callData = { ...data, targetUsed: num };
            break;
          }
        } catch (e) {}
      }
      if (callId) break;
    }

    if (!callId) {
      callId = `astracalls_local_${Date.now()}`;
      callData = { localFallback: true };
    }

    return res.json({ success: true, callId, sessionId, targetPhone: variants[0] || baseNumber, data: callData });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post(['/api/call/webrtc', '/call/webrtc'], async (req, res) => {
  try {
    const { sdp, type, sessionId: reqSessionId, callId } = req.body;
    const astracallsUrl = 'https://calls.rspiscinas.app.br';
    const astracallsApiKey = 'rs_piscinas_segredo_2026';
    const sessionId = reqSessionId || '8090cca3add0b8eb3e41efb9eec363e4';

    const resp = await fetch(`${astracallsUrl}/api/sessions/${sessionId}/calls/webrtc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': astracallsApiKey },
      body: JSON.stringify({ sdp, type, callId })
    });
    if (resp.ok) {
      const data = await resp.json();
      return res.json(data);
    }
    const errTxt = await resp.text().catch(() => '');
    return res.status(resp.status).json({ error: errTxt });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post(['/api/call/hangup', '/call/hangup'], async (req, res) => {
  try {
    const { callId, sessionId: reqSessionId } = req.body;
    const astracallsUrl = 'https://calls.rspiscinas.app.br';
    const astracallsApiKey = 'rs_piscinas_segredo_2026';
    const sessionId = reqSessionId || '8090cca3add0b8eb3e41efb9eec363e4';
    try {
      await fetch(`${astracallsUrl}/api/sessions/${sessionId}/calls/hangup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': astracallsApiKey },
        body: JSON.stringify({ callId })
      });
    } catch (e) {}
    return res.json({ success: true, callId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get(['/api/calls/history', '/calls/history'], async (req, res) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: calls } = await supabaseAdmin.from('call_logs').select('*').order('created_at', { ascending: false }).limit(50);
    return res.json({ calls: calls || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message, calls: [] });
  }
});

app.post(['/api/calls/log', '/calls/log'], async (req, res) => {
  try {
    const { clientId, clientName, phone, type = 'outbound', status = 'completed', duration = 0, provider = 'astracalls', audioRecordingUrl, adminId, employeeId } = req.body;
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('call_logs')
      .insert({
        client_id: clientId || null,
        client_name: clientName || null,
        phone: phone || null,
        type,
        status,
        duration,
        provider,
        audio_recording_url: audioRecordingUrl || null,
        admin_id: adminId || null,
        employee_id: employeeId || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, log: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.delete(['/api/calls/log/:id', '/calls/log/:id'], async (req, res) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin.from('call_logs').delete().eq('id', req.params.id);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// --- 4. NOTIFICATIONS (FCM) ENDPOINTS ---

app.get(['/api/notifications/status', '/notifications/status'], (req, res) => {
  initFirebase();
  const fcmInitialized = admin.apps.length > 0;
  const hasServiceAccount = !!process.env.FIREBASE_SERVICE_ACCOUNT || fs.existsSync(path.join(process.cwd(), 'service-account.json'));
  return res.json({ fcmInitialized, hasServiceAccount, environment: 'vercel_serverless' });
});

app.post(['/api/notifications/send', '/notifications/send'], async (req, res) => {
  try {
    const { targetUserId, title, body, data = {} } = req.body || {};
    if (!targetUserId || !title) return res.status(400).json({ error: 'targetUserId and title are required' });
    const supabaseAdmin = getSupabaseAdmin();
    const { data: users } = await supabaseAdmin.from('users').select('id, fcm_token').eq('id', targetUserId);
    const tokens = (users || []).map(u => u.fcm_token).filter(Boolean);
    if (tokens.length === 0) return res.json({ success: false, message: 'Nenhum token FCM' });

    initFirebase();
    if (!admin.apps.length) return res.json({ success: false, message: 'Firebase Admin não inicializado' });

    let sentCount = 0;
    for (const token of tokens) {
      try {
        await admin.messaging().send({
          token,
          notification: { title, body: body || '' },
          data: { ...data, click_action: 'FCM_PLUGIN_ACTIVITY', url: data.url || '/routes', channelId: data.channelId || 'atendimentos' },
          android: { priority: 'high', notification: { channelId: data.channelId || 'atendimentos', sound: 'default', priority: 'max' } }
        });
        sentCount++;
      } catch (fcmErr) {}
    }
    return res.json({ success: sentCount > 0, sentCount });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post(['/api/notifications/notify-visit-completion', '/notifications/notify-visit-completion'], async (req, res) => {
  try {
    const { visitId, adminId, employeeId, clientId, clientName, techName } = req.body || {};
    const supabaseAdmin = getSupabaseAdmin();

    let empName = techName || "Colaborador";
    if (employeeId && !techName) {
      const { data: empData } = await supabaseAdmin.from('users').select('name').eq('id', employeeId).maybeSingle();
      if (empData?.name) empName = empData.name;
    }
    let resolvedClientName = clientName || "Cliente";
    if (clientId && !clientName) {
      const { data: cliData } = await supabaseAdmin.from('clients').select('name').eq('id', clientId).maybeSingle();
      if (cliData?.name) resolvedClientName = cliData.name;
    }

    const { data: users } = await supabaseAdmin.from('users').select('id, fcm_token').in('id', [adminId, employeeId].filter(Boolean));
    let tokens = (users || []).map(u => u.fcm_token).filter(Boolean);
    if (tokens.length === 0) {
      const { data: activeAdmins } = await supabaseAdmin.from('users').select('fcm_token').eq('role', 'admin');
      tokens = (activeAdmins || []).map(u => u.fcm_token).filter(Boolean);
    }

    initFirebase();
    if (admin.apps.length > 0) {
      for (const token of tokens) {
        try {
          await admin.messaging().send({
            token,
            notification: { title: '🏊 Visita Finalizada!', body: `O colaborador ${empName} concluiu o atendimento em ${resolvedClientName}.` },
            data: { url: '/routes', visitId: String(visitId || ''), clientId: String(clientId || ''), channelId: 'atendimentos' },
            android: { priority: 'high' }
          });
        } catch (e) {}
      }
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post(['/api/notifications/test-push', '/notifications/test-push'], async (req, res) => {
  try {
    const { userId, title, body } = req.body || {};
    const supabaseAdmin = getSupabaseAdmin();
    const { data: u } = await supabaseAdmin.from('users').select('fcm_token').eq('id', userId).maybeSingle();
    if (!u?.fcm_token) return res.status(404).json({ error: 'Nenhum token FCM registrado para o usuário' });
    initFirebase();
    await admin.messaging().send({ token: u.fcm_token, notification: { title: title || 'Teste GestãoPro', body: body || 'Notificação push funcionando!' } });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// --- 5. MERCADO PAGO ENDPOINTS ---

app.post(['/api/create-preference', '/create-preference'], async (req, res) => {
  try {
    const { title, price, quantity, adminId, email, origin } = req.body || {};
    let mpToken = process.env.MP_ACCESS_TOKEN || "APP_USR-5520671839390863-031622-4f2fede32936291cc0567aebae0a319e-1434591190";
    const client = new MercadoPagoConfig({ accessToken: mpToken });
    const preference = new Preference(client);
    const response = await preference.create({
      body: {
        items: [{ id: "subscription_monthly", title: title || "Subscription", quantity: quantity || 1, unit_price: Number(price) || 0, currency_id: "BRL" }],
        payer: { email: email || "admin@gestaopro.com", name: "Cliente", surname: "GestãoPro" },
        external_reference: adminId,
        back_urls: {
          success: `${(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://www.rspiscinas.app.br')}/`,
          failure: `${(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://www.rspiscinas.app.br')}/`,
          pending: `${(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://www.rspiscinas.app.br')}/`
        },
        auto_return: "approved",
        notification_url: `${(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://www.rspiscinas.app.br')}/api/mp-webhook`
      }
    });
    return res.status(200).json({ id: response.id, init_point: response.init_point });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post(['/api/mp-webhook', '/mp-webhook'], async (req, res) => {
  let dataId = req.query["data.id"] || req.query.id || (req.body && req.body.data && req.body.data.id) || (req.body && req.body.id);
  let type = req.query.type || req.query.topic || (req.body && req.body.type) || (req.body && req.body.topic) || (req.body && req.body.action);
  if ((type === "payment" || type === "payment.created" || type === "payment.updated") && dataId) {
    let mpToken = process.env.MP_ACCESS_TOKEN || "APP_USR-5520671839390863-031622-4f2fede32936291cc0567aebae0a319e-1434591190";
    try {
      const client = new MercadoPagoConfig({ accessToken: mpToken });
      const paymentDetails = new Payment(client);
      const paymentInfo = await paymentDetails.get({ id: String(dataId) });
      if (paymentInfo.status === "approved" && paymentInfo.external_reference) {
        const supabaseAdmin = getSupabaseAdmin();
        const { data: existing } = await supabaseAdmin.from('settings').select('id').eq('id', 'payment_' + paymentInfo.id).single();
        if (!existing) {
          const { data: userData } = await supabaseAdmin.from("users").select("subscription_expires_at").eq("id", paymentInfo.external_reference).single();
          let currentExpiry = new Date();
          if (userData && userData.subscription_expires_at) {
            const userExpiry = new Date(userData.subscription_expires_at);
            if (userExpiry > currentExpiry) currentExpiry = userExpiry;
          }
          currentExpiry.setDate(currentExpiry.getDate() + 30);
          await supabaseAdmin.from("users").update({ subscription_status: 'active', subscription_expires_at: currentExpiry.toISOString() }).eq('id', paymentInfo.external_reference);
          await supabaseAdmin.from('settings').insert({ id: 'payment_' + paymentInfo.id });
        }
      }
    } catch (error) {}
  }
  return res.status(200).send("OK");
});

app.all(['/api/sync-payment', '/sync-payment'], async (req, res) => {
  try {
    const payment_id = req.body?.payment_id || req.query?.payment_id || req.query?.id;
    if (!payment_id) return res.status(400).json({ error: "Missing payment_id" });
    let mpToken = process.env.MP_ACCESS_TOKEN || "APP_USR-5520671839390863-031622-4f2fede32936291cc0567aebae0a319e-1434591190";
    const client = new MercadoPagoConfig({ accessToken: mpToken });
    const paymentDetails = new Payment(client);
    const paymentInfo = await paymentDetails.get({ id: String(payment_id) });
    if (paymentInfo.status === "approved" && paymentInfo.external_reference) {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: existing } = await supabaseAdmin.from('settings').select('id').eq('id', 'payment_' + paymentInfo.id).single();
      if (!existing) {
        const { data: userData } = await supabaseAdmin.from("users").select("subscription_expires_at").eq("id", paymentInfo.external_reference).single();
        let currentExpiry = new Date();
        if (userData && userData.subscription_expires_at) {
          const userExpiry = new Date(userData.subscription_expires_at);
          if (userExpiry > currentExpiry) currentExpiry = userExpiry;
        }
        currentExpiry.setDate(currentExpiry.getDate() + 30);
        await supabaseAdmin.from("users").update({ subscription_status: 'active', subscription_expires_at: currentExpiry.toISOString() }).eq('id', paymentInfo.external_reference);
        await supabaseAdmin.from('settings').insert({ id: 'payment_' + paymentInfo.id });
      }
      return res.status(200).json({ success: true });
    }
    return res.status(400).json({ error: "Payment not approved" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// --- 6. WEBHOOKS (ASTRACALLS / EVOLUTION / META / WAME) ---

app.all(['/api/webhook/astracalls', '/webhook/astracalls', '/api/astracalls/webhook', '/astracalls/webhook'], async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).send(req.query['hub.challenge'] || 'OK_ASTRACALLS');
  }
  try {
    const payload = req.body || {};
    const supabaseAdmin = getSupabaseAdmin();
    const data = payload.data || payload;
    const msgObj = data.message || data.messages?.[0] || (data.key ? data : null);
    if (msgObj) {
      const fromMe = msgObj.fromMe || msgObj.key?.fromMe;
      if (!fromMe) {
        let senderPhone = msgObj.from || msgObj.key?.remoteJid || msgObj.phone || msgObj.sender || '';
        senderPhone = senderPhone.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/\D/g, '');
        const textContent = msgObj.text || msgObj.body || msgObj.conversation || msgObj.message?.conversation || msgObj.message?.extendedTextMessage?.text || '';
        const mediaUrl = msgObj.mediaUrl || msgObj.url || msgObj.imageMessage?.url || msgObj.audioMessage?.url || '';

        if (senderPhone && (textContent || mediaUrl)) {
          const { data: allClients } = await supabaseAdmin.from('clients').select('id, name, phone, admin_id, employee_id');
          const matched = allClients?.find(c => {
            const cd = String(c.phone || '').replace(/\D/g, '');
            return cd && (senderPhone.endsWith(cd) || cd.endsWith(senderPhone) || senderPhone.slice(-8) === cd.slice(-8));
          });
          if (matched) {
            const { data: openSess } = await supabaseAdmin.from('chat_sessions').select('id').eq('client_id', matched.id).eq('status', 'open').maybeSingle();
            let targetSessId = openSess?.id;
            if (!targetSessId) {
              const { data: newSess } = await supabaseAdmin.from('chat_sessions').insert({
                client_id: matched.id,
                admin_id: matched.admin_id || null,
                employee_id: matched.employee_id || null,
                status: 'open',
                created_at: new Date().toISOString()
              }).select('id').single();
              targetSessId = newSess?.id;
            }
            if (targetSessId) {
              await supabaseAdmin.from('chat_messages').insert({
                session_id: targetSessId,
                sender_type: 'client',
                sender_name: matched.name || 'Cliente',
                content: textContent || 'Mídia recebida',
                media_url: mediaUrl || undefined,
                created_at: new Date().toISOString()
              });
            }
          }
        }
      }
    }
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(200).json({ success: true });
  }
});

app.all(['/api/webhook/wame', '/webhook/wame', '/api/webhook/evolution', '/webhook/evolution', '/api/webhook/meta', '/webhook/meta', '/api/webhook/status', '/webhook/status', '/api/webhook/messages/status'], async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).send(req.query["hub.challenge"] || "Webhook active");
  }
  return res.status(200).send("EVENT_RECEIVED");
});

export default app;
