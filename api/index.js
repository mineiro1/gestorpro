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
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://fgmmvrvudozzwqzsztwo.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnbW12cnZ1ZG96endxenN6dHdvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA1MjMzMSwiZXhwIjoyMDk0NjI4MzMxfQ.iB9iF3aoumsNtywpLZL_QjrBzR8QPWw7GGWQ6-Yx-Ik';
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

function isMatchingClientPhone(storedRaw, incomingRaw) {
  if (!storedRaw || !incomingRaw) return false;
  const stored = String(storedRaw).replace(/\D/g, '');
  const incoming = String(incomingRaw).replace(/\D/g, '');
  if (stored.length < 6 || incoming.length < 6) return false;

  const storedNo55 = stored.replace(/^55/, '');
  const incomingNo55 = incoming.replace(/^55/, '');

  if (stored === incoming || storedNo55 === incomingNo55) return true;

  const storedLast8 = stored.slice(-8);
  const incomingLast8 = incoming.slice(-8);
  if (storedLast8.length === 8 && incomingLast8.length === 8 && storedLast8 === incomingLast8) {
    const storedDDD = storedNo55.length >= 10 ? storedNo55.slice(0, 2) : '';
    const incomingDDD = incomingNo55.length >= 10 ? incomingNo55.slice(0, 2) : '';
    if (storedDDD && incomingDDD) return storedDDD === incomingDDD;
    return true;
  }

  if (stored.includes(incoming) || incoming.includes(stored)) return true;
  if (storedNo55.includes(incomingNo55) || incomingNo55.includes(storedNo55)) return true;

  return false;
}

function mapStatus(raw) {
  if (raw === undefined || raw === null) return null;
  const str = String(raw).toUpperCase().trim();
  if (str === '4' || str === '5' || str === 'READ' || str === 'PLAYED' || str === 'READ_RECEIPT' || str === 'VIEWED') return 'read';
  if (str === '3' || str === 'DELIVERY_ACK' || str === 'DELIVERED' || str === 'RECEIVED') return 'delivered';
  if (str === '2' || str === 'SERVER_ACK' || str === 'SENT') return 'sent';
  if (str === 'FAILED' || str === 'ERROR' || str === '0') return 'failed';
  return null;
}

function extractStatusUpdates(body) {
  const results = [];
  if (!body) return results;

  const inspectItem = (item) => {
    if (!item || typeof item !== 'object') return;
    const id = item?.key?.id || item?.id || item?.keyId || item?.messageId || item?.msgId || item?.update?.key?.id || item?.data?.key?.id || item?.data?.id || item?.data?.messageId;
    const phone = item?.phone || item?.to || item?.recipient || item?.key?.remoteJid || item?.remoteJid || item?.from;
    const timestamp = item?.timestamp || item?.update?.readTimestamp || item?.receipt?.readTimestamp || item?.time;
    const reason = item?.error || item?.reason || item?.message;

    if (item?.receipt?.readTimestamp || item?.update?.readTimestamp || item?.status === 'read' || item?.update?.status === 'read') {
      results.push({ id: String(id || ''), status: 'read', phone: phone ? String(phone) : undefined, timestamp: timestamp ? String(timestamp) : undefined });
      return;
    }

    const rawStatus = item?.update?.status ?? item?.status ?? item?.ack ?? item?.update?.ack ?? item?.statusLabel ?? item?.update?.statusLabel ?? item?.receipt?.status ?? item?.data?.status ?? item?.data?.ack;
    const mapped = mapStatus(rawStatus);
    if (mapped) {
      results.push({ id: String(id || ''), status: mapped, phone: phone ? String(phone) : undefined, timestamp: timestamp ? String(timestamp) : undefined, reason: reason ? String(reason) : undefined });
    }
  };

  if (body.entry && Array.isArray(body.entry)) {
    for (const entry of body.entry) {
      if (entry.changes && Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          const val = change.value;
          if (val?.statuses && Array.isArray(val.statuses)) {
            for (const st of val.statuses) {
              const mapped = mapStatus(st.status);
              if (st.id && mapped) {
                results.push({ id: String(st.id), status: mapped, phone: st.recipient_id ? String(st.recipient_id) : undefined, timestamp: st.timestamp ? String(st.timestamp) : undefined });
              }
            }
          }
        }
      }
    }
  }

  if (body.statuses && Array.isArray(body.statuses)) {
    for (const st of body.statuses) {
      const mapped = mapStatus(st.status);
      if (st.id && mapped) {
        results.push({ id: String(st.id), status: mapped, phone: st.recipient_id ? String(st.recipient_id) : undefined, timestamp: st.timestamp ? String(st.timestamp) : undefined });
      }
    }
  }

  if (Array.isArray(body)) {
    body.forEach(inspectItem);
  } else {
    inspectItem(body);
    if (Array.isArray(body.data)) body.data.forEach(inspectItem);
    else if (body.data && typeof body.data === 'object') inspectItem(body.data);
    if (Array.isArray(body.updates)) body.updates.forEach(inspectItem);
    if (Array.isArray(body.messages)) body.messages.forEach(inspectItem);
  }

  return results;
}

async function processStatusUpdates(body) {
  const updates = extractStatusUpdates(body);
  if (updates.length === 0) return { updated: 0, results: [] };

  const supabaseAdmin = getSupabaseAdmin();
  let updatedCount = 0;
  const processedResults = [];

  for (const update of updates) {
    const { id: externalId, status: newStatus, phone } = update;
    let targetMessageId = null;
    let targetMediaUrl = null;

    if (externalId && externalId.length > 3) {
      let { data: foundMsgs } = await supabaseAdmin
        .from('chat_messages')
        .select('id, media_url, sender_type, created_at')
        .eq('sender_type', 'tech')
        .ilike('media_url', `%${externalId}%`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!foundMsgs || foundMsgs.length === 0) {
        if (externalId.length > 8) {
          const shortId = externalId.slice(-12);
          const { data: fallback } = await supabaseAdmin
            .from('chat_messages')
            .select('id, media_url, sender_type, created_at')
            .eq('sender_type', 'tech')
            .ilike('media_url', `%${shortId}%`)
            .order('created_at', { ascending: false })
            .limit(1);
          foundMsgs = fallback;
        }
      }

      if (foundMsgs && foundMsgs.length > 0) {
        targetMessageId = foundMsgs[0].id;
        targetMediaUrl = foundMsgs[0].media_url;
      }
    }

    if (targetMessageId && newStatus) {
      let existing = {};
      try { existing = JSON.parse(targetMediaUrl || '{}'); } catch(e) {}
      if (existing.status !== 'read' || newStatus === 'read') {
        const { error: updErr } = await supabaseAdmin
          .from('chat_messages')
          .update({
            media_url: JSON.stringify({
              ...existing,
              status: newStatus,
              external_id: externalId || existing.external_id,
              status_updated_at: new Date().toISOString()
            })
          })
          .eq('id', targetMessageId);

        if (!updErr) {
          updatedCount++;
          processedResults.push({ id: targetMessageId, externalId, newStatus });
        }
      }
    }
  }

  return { updated: updatedCount, results: processedResults };
}

const processedMessageClientIds = new Map();

function cleanJidToPhone(rawJid) {
  if (!rawJid) return '';
  const str = String(rawJid);
  const withoutDomain = str.split('@')[0];
  const withoutDevice = withoutDomain.split(':')[0];
  return withoutDevice.replace(/\D/g, '');
}

// Cache bidirecional de LIDs (Linked Identity Device) do WhatsApp Web/Multi-Device para telefones reais
const lidToRealPhoneCache = new Map();
let lastAstraContactsFetch = 0;

async function refreshAstraContactsCache(force = false) {
  const now = Date.now();
  if (!force && lastAstraContactsFetch > 0 && now - lastAstraContactsFetch < 10 * 60 * 1000) {
    return;
  }
  try {
    const astracallsUrl = (process.env.ASTRACALLS_URL || 'https://calls.rspiscinas.app.br').trim().replace(/\/$/, '');
    const astracallsApiKey = process.env.ASTRACALLS_API_KEY || 'rs_piscinas_segredo_2026';
    const sessionId = '8090cca3add0b8eb3e41efb9eec363e4';

    const res = await fetch(`${astracallsUrl}/api/sessions/${sessionId}/contacts`, {
      headers: { 'X-Api-Key': astracallsApiKey }
    });
    if (!res.ok) return;
    const contacts = await res.json();
    if (!Array.isArray(contacts)) return;

    lastAstraContactsFetch = now;
    const nonLidContacts = contacts.filter((c) => !c.id?.includes('@lid') && (c.number || c.id));
    const lidContacts = contacts.filter((c) => c.id?.includes('@lid') || (c.number && c.number.length > 13));

    for (const lid of lidContacts) {
      const cleanLid = cleanJidToPhone(lid.id || lid.number);
      if (!cleanLid) continue;
      const lidName = (lid.name || lid.pushName || lid.pushname || lid.fullName || '').trim().toLowerCase();
      if (!lidName) continue;

      const phoneMatch = nonLidContacts.find((c) => {
        const cName = (c.name || c.pushName || c.pushname || c.fullName || '').trim().toLowerCase();
        return cName && cName === lidName;
      });

      if (phoneMatch) {
        const realPhone = cleanJidToPhone(phoneMatch.number || phoneMatch.id);
        if (realPhone) {
          lidToRealPhoneCache.set(cleanLid, realPhone);
        }
      }
    }
    console.log(`[AstraCalls Cache] Mapeamento de LIDs atualizado: ${lidToRealPhoneCache.size} LIDs mapeados para números.`);
  } catch (err) {
    console.warn('[AstraCalls Cache] Erro ao carregar contatos AstraCalls:', err.message);
  }
}

async function resolveLidToRealPhone(
  cleanLid,
  rawRemote,
  msgData = {},
  body = {},
  allTargets = []
) {
  if (!cleanLid) return null;

  // 1. Verificar cache em memória
  if (lidToRealPhoneCache.has(cleanLid)) {
    return lidToRealPhoneCache.get(cleanLid);
  }

  // 2. Se não está no cache, atualizar cache forçadamente
  await refreshAstraContactsCache(true);
  if (lidToRealPhoneCache.has(cleanLid)) {
    return lidToRealPhoneCache.get(cleanLid);
  }

  // 3. Tentar resolução via pushName
  const pushName = String(msgData?.pushName || body?.pushName || msgData?.verifiedName || body?.verifiedName || '').trim().toLowerCase();
  if (pushName && pushName.length >= 3) {
    const targetByName = allTargets.find((t) => {
      const tName = String(t.name || '').trim().toLowerCase();
      return tName && (tName === pushName || tName.includes(pushName) || pushName.includes(tName));
    });

    if (targetByName?.phone) {
      const resolved = cleanJidToPhone(targetByName.phone);
      if (resolved) {
        lidToRealPhoneCache.set(cleanLid, resolved);
        return resolved;
      }
    }
  }

  // 4. Se houver apenas uma sessão ativa aberta no momento no app, associar o LID a essa sessão
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: openSess } = await supabaseAdmin
      .from('chat_sessions')
      .select('id, client_id')
      .eq('status', 'open')
      .gte('created_at', thirtyMinAgo);

    if (openSess && openSess.length === 1) {
      const singleClientId = openSess[0].client_id;
      const cli = allTargets.find((t) => t.id === singleClientId);
      if (cli?.phone) {
        const resolved = cleanJidToPhone(cli.phone);
        if (resolved) {
          console.log(`[LID Resolver] Associado LID ${cleanLid} ao cliente da única sessão ativa: ${cli.name} (${resolved})`);
          lidToRealPhoneCache.set(cleanLid, resolved);
          return resolved;
        }
      }
    }
  } catch (e) {}

  return null;
}

function extractMessageData(rawMsg) {
  if (!rawMsg) return { content: '', mediaUrl: '' };
  if (typeof rawMsg === 'string') return { content: rawMsg, mediaUrl: '' };

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

function formatFirstTwoNames(fullName) {
  if (!fullName || typeof fullName !== 'string') return 'Cliente';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Cliente';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1]}`;
}

const recentProcessedMsgIds = new Map();
function isDuplicateIncomingMsg(uniqueKey) {
  const now = Date.now();
  for (const [k, time] of recentProcessedMsgIds.entries()) {
    if (now - time > 30000) {
      recentProcessedMsgIds.delete(k);
    }
  }
  if (recentProcessedMsgIds.has(uniqueKey)) {
    return true;
  }
  recentProcessedMsgIds.set(uniqueKey, now);
  return false;
}

// Rotina contínua de expurgo de mensagens e sessões expiradas (> 30 min) ou encerradas
async function cleanupExpiredAndClosedChatMessages() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const now = Date.now();
    const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000).toISOString();

    // 1. Fechar sessões 'open' com mais de 30 minutos e deletar suas mensagens
    const { data: expiredOpenSessions } = await supabaseAdmin
      .from('chat_sessions')
      .select('id, client_id')
      .eq('status', 'open')
      .lt('created_at', thirtyMinutesAgo);

    if (expiredOpenSessions && expiredOpenSessions.length > 0) {
      const expiredIds = expiredOpenSessions.map(s => s.id);
      console.log(`[Chat Expiry Cleaner] Expurgando ${expiredIds.length} sessões abertas há mais de 30 minutos...`);
      await supabaseAdmin.from('chat_messages').delete().in('session_id', expiredIds);
      await supabaseAdmin.from('chat_sessions').update({ 
        status: 'closed', 
        closed_at: new Date().toISOString() 
      }).in('id', expiredIds);
    }

    // 2. Deletar mensagens de sessões que já possuem status 'closed'
    const { data: closedSessions } = await supabaseAdmin
      .from('chat_sessions')
      .select('id')
      .eq('status', 'closed');

    if (closedSessions && closedSessions.length > 0) {
      const closedIds = closedSessions.map(s => s.id);
      await supabaseAdmin.from('chat_messages').delete().in('session_id', closedIds);
    }
  } catch (e) {
    console.warn('[Chat Expiry Cleaner] Erro na limpeza periódica:', e.message);
  }
}

// Inicia cache e expurgo
cleanupExpiredAndClosedChatMessages();
refreshAstraContactsCache();

// Sincronização direta e bidirecional de mensagens AstraCalls para sessões ativas (< 30 min)
async function syncAstraCallsIncomingMessages({ clientId, sessionId, waSettings } = {}) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const astracallsUrl = (waSettings?.astracallsUrl || process.env.ASTRACALLS_URL || 'https://calls.rspiscinas.app.br').trim().replace(/\/$/, '');
    const astracallsApiKey = waSettings?.astracallsApiKey || process.env.ASTRACALLS_API_KEY || 'rs_piscinas_segredo_2026';
    const astraSessionId = waSettings?.astracallsSessionId || '8090cca3add0b8eb3e41efb9eec363e4';

    let session = null;
    if (sessionId) {
      const { data } = await supabaseAdmin.from('chat_sessions').select('*').eq('id', sessionId).maybeSingle();
      session = data;
    } else if (clientId) {
      const { data } = await supabaseAdmin.from('chat_sessions').select('*').eq('client_id', clientId).eq('status', 'open').order('created_at', { ascending: false }).limit(1);
      session = data?.[0];
    }

    if (!session || session.status !== 'open') {
      return { synced: 0, reason: 'no_open_session' };
    }

    const sessionStartMs = new Date(session.created_at).getTime();
    const now = Date.now();
    if (now - sessionStartMs > 30 * 60 * 1000) {
      await supabaseAdmin.from('chat_messages').delete().eq('session_id', session.id);
      await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', session.id);
      return { synced: 0, reason: 'session_expired' };
    }

    const targetClientId = clientId || session.client_id;
    let client = null;
    const { data: cRow } = await supabaseAdmin.from('clients').select('id, name, phone, local_phone, admin_id, employee_id').eq('id', targetClientId).maybeSingle();
    if (cRow) {
      client = cRow;
    } else {
      const { data: aRow } = await supabaseAdmin.from('agenda_contacts').select('id, name, phone, admin_id').eq('id', targetClientId).maybeSingle();
      if (aRow) client = { ...aRow, local_phone: '', employee_id: aRow.admin_id };
    }

    if (!client) return { synced: 0, reason: 'client_not_found' };

    const rawPhone = client.phone || client.local_phone || '';
    const digits = String(rawPhone).replace(/\D/g, '');
    if (!digits) return { synced: 0, reason: 'no_phone' };

    const ddd = digits.length >= 10 ? digits.slice(-10, -8) : '67';
    const num8 = digits.slice(-8);

    const chatIds = new Set([
      `55${ddd}${num8}@s.whatsapp.net`,
      `55${ddd}9${num8}@s.whatsapp.net`,
      `55${ddd}${num8}@c.us`,
      `55${ddd}9${num8}@c.us`
    ]);

    try {
      const cRes = await fetch(`${astracallsUrl}/api/sessions/${astraSessionId}/contacts`, {
        headers: { 'X-Api-Key': astracallsApiKey }
      });
      if (cRes.ok) {
        const contacts = await cRes.json();
        if (Array.isArray(contacts)) {
          const matchedContacts = contacts.filter(c => {
            const cNum = String(c.number || c.id || '').replace(/\D/g, '');
            return cNum.endsWith(num8) || (cNum.length >= 10 && cNum.includes(num8));
          });

          const knownNames = new Set();
          for (const mc of matchedContacts) {
            if (mc.id) chatIds.add(mc.id);
            if (mc.jid) chatIds.add(mc.jid);
            const n = (mc.name || mc.pushName || mc.pushname || mc.fullName || '').trim().toLowerCase();
            if (n && n.length >= 3) knownNames.add(n);
          }

          const normClientName = (client.name || '').trim().toLowerCase();
          if (normClientName && normClientName.length >= 3) knownNames.add(normClientName);

          for (const c of contacts) {
            const isLid = c.id?.includes('@lid') || c.jid?.includes('@lid');
            if (!isLid) continue;
            const cName = (c.name || c.pushName || c.pushname || c.fullName || '').trim().toLowerCase();
            if (!cName || cName.length < 3) continue;

            let matches = false;
            for (const kn of knownNames) {
              if (cName === kn || cName.includes(kn) || kn.includes(cName)) {
                matches = true;
                break;
              }
            }
            if (matches) {
              if (c.id) chatIds.add(c.id);
              if (c.jid) chatIds.add(c.jid);
            }
          }
        }
      }
    } catch (e) {}

    const { data: currentMsgs } = await supabaseAdmin.from('chat_messages').select('id, media_url, sender_type').eq('session_id', session.id);
    const existingExtIds = new Set();
    (currentMsgs || []).forEach(m => {
      try {
        const meta = typeof m.media_url === 'string' && m.media_url.startsWith('{') ? JSON.parse(m.media_url) : {};
        if (meta.external_id) existingExtIds.add(String(meta.external_id));
        if (meta.astra_id) existingExtIds.add(String(meta.astra_id));
      } catch (e) {}
    });

    let newInsertedCount = 0;
    for (const cid of chatIds) {
      try {
        const mRes = await fetch(`${astracallsUrl}/api/sessions/${astraSessionId}/messages?chatId=${encodeURIComponent(cid)}&limit=15`, {
          headers: { 'X-Api-Key': astracallsApiKey }
        });
        if (!mRes.ok) continue;
        const msgs = await mRes.json();
        if (!Array.isArray(msgs)) continue;

        for (const m of msgs) {
          if (m.fromMe) continue;
          if (m.timestamp < sessionStartMs) continue;
          const extId = String(m.id || '');
          if (extId && existingExtIds.has(extId)) continue;

          let content = m.body || m.text || m.message || '';
          if (m.type === 'audio' && !content) content = '🎵 Mensagem de Áudio';
          if (m.type === 'image' && !content) content = '📸 Imagem';
          if (m.type === 'video' && !content) content = '🎥 Vídeo';
          if (m.type === 'document' && !content) content = '📄 Documento';
          if (!content) continue;

          const meta = {
            external_id: extId || undefined,
            astra_id: extId || undefined,
            status: 'read'
          };

          const { error: insErr } = await supabaseAdmin.from('chat_messages').insert({
            session_id: session.id,
            sender_type: 'client',
            content: String(content),
            media_url: JSON.stringify(meta),
            created_at: new Date(m.timestamp).toISOString()
          });

          if (!insErr) {
            existingExtIds.add(extId);
            newInsertedCount++;
          }
        }
      } catch (e) {}
    }

    if (newInsertedCount > 0) {
      const { data: unreadTech } = await supabaseAdmin
        .from('chat_messages')
        .select('id, media_url')
        .eq('session_id', session.id)
        .eq('sender_type', 'tech');

      if (unreadTech) {
        for (const utm of unreadTech) {
          let mMeta = {};
          try { mMeta = JSON.parse(utm.media_url); } catch(e) {}
          if (mMeta.status !== 'read') {
            await supabaseAdmin.from('chat_messages').update({
              media_url: JSON.stringify({ ...mMeta, status: 'read' })
            }).eq('id', utm.id);
          }
        }
      }

      const targetUserId = client.employee_id || client.admin_id;
      if (targetUserId && typeof sendPushToAdmin === 'function') {
        const clientDisplayName = formatFirstTwoNames(client.name);
        sendPushToAdmin(targetUserId, `💬 ${clientDisplayName}`, 'Nova mensagem recebida no WhatsApp', {
          clientId: client.id,
          sessionId: session.id,
          type: 'chat_message',
          channelId: 'chat_messages'
        }).catch(() => {});
      }
    }

    return { synced: newInsertedCount, success: true, chatIds: Array.from(chatIds) };
  } catch (err) {
    return { synced: 0, error: err.message };
  }
}

// --- 1. CHAT ENDPOINTS ---

// Obter / Sincronizar Mensagens do Chat de um Cliente (GET e POST)
const handleGetChatMessages = async (req, res) => {
  try {
    const clientId = req.params?.clientId || req.body?.clientId || req.query?.clientId;
    if (!clientId) return res.status(400).json({ error: "Missing clientId" });

    const supabaseAdmin = getSupabaseAdmin();

    // Expurgar mensagens de sessões expiradas ou encerradas
    await cleanupExpiredAndClosedChatMessages();

    // Sincronizar mensagens pendentes da AstraCalls antes de retornar
    try {
      await syncAstraCallsIncomingMessages({ clientId, waSettings: req.body?.waSettings });
    } catch(e) {}

    // Buscar APENAS sessão aberta ('open') do cliente
    const { data: openSessions } = await supabaseAdmin
      .from('chat_sessions')
      .select('id, created_at, status')
      .eq('client_id', clientId)
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (!openSessions || openSessions.length === 0) {
      return res.json({ success: true, messages: [] });
    }

    const activeSession = openSessions[0];
    const now = Date.now();
    const createdMs = activeSession.created_at ? new Date(activeSession.created_at).getTime() : 0;

    // Se a sessão expirou (> 30 min), deleta as mensagens do chat/banco e fecha a sessão
    if (createdMs > 0 && now - createdMs > 30 * 60 * 1000) {
      await supabaseAdmin.from('chat_messages').delete().eq('session_id', activeSession.id);
      await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
      return res.json({ success: true, messages: [] });
    }

    // Retorna APENAS as mensagens da sessão aberta ativa atual
    const { data: loadedMsgs, error } = await supabaseAdmin
      .from('chat_messages')
      .select('*')
      .eq('session_id', activeSession.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error("[/api/chat/messages] Erro ao buscar mensagens:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ success: true, messages: loadedMsgs || [] });
  } catch (e) {
    console.error("[/api/chat/messages] Erro inesperado:", e);
    return res.status(500).json({ error: e.message });
  }
};

app.get(['/api/chat/messages/:clientId', '/chat/messages/:clientId', '/api/chat/messages', '/chat/messages'], handleGetChatMessages);
app.post(['/api/chat/messages/:clientId', '/chat/messages/:clientId', '/api/chat/messages', '/chat/messages', '/api/chat/sync-messages', '/chat/sync-messages'], handleGetChatMessages);


// Obter Sessão Ativa do Chat de um Cliente
app.get(['/api/chat/session/:clientId', '/chat/session/:clientId'], async (req, res) => {
  try {
    const { clientId } = req.params;
    if (!clientId) return res.status(400).json({ error: "Missing clientId" });

    const supabaseAdmin = getSupabaseAdmin();
    const { data: allSessions, error } = await supabaseAdmin
      .from('chat_sessions')
      .select('id, status, created_at, closed_at, client_id, admin_id, employee_id, visit_id')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("[/api/chat/session] Erro ao buscar sessões:", error);
      return res.status(500).json({ error: error.message });
    }

    const active = (allSessions || []).find(s => s.status === 'open' || s.status === 'active') || allSessions?.[0] || null;
    return res.json({ success: true, session: active, allSessions: allSessions || [] });
  } catch (e) {
    console.error("[/api/chat/session] Erro inesperado:", e);
    return res.status(500).json({ error: e.message });
  }
});

// Ensure Session
app.post(['/api/chat/session/ensure', '/chat/session/ensure'], async (req, res) => {
  try {
    const { clientId, adminId, employeeId, visitId } = req.body;
    if (!clientId) return res.status(400).json({ error: "Missing clientId" });

    const supabaseAdmin = getSupabaseAdmin();
    const now = Date.now();

    // 1. Procurar sessão open existente
    const { data: openSessions } = await supabaseAdmin
      .from('chat_sessions')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (openSessions && openSessions.length > 0) {
      const currentSession = openSessions[0];
      const createdMs = currentSession.created_at ? new Date(currentSession.created_at).getTime() : 0;

      // Se a sessão existente ainda estiver dentro do limite de 30 minutos, reutiliza
      if (createdMs > 0 && now - createdMs <= 30 * 60 * 1000) {
        if (openSessions.length > 1) {
          const extraIds = openSessions.slice(1).map((s) => s.id);
          await supabaseAdmin.from('chat_messages').delete().in('session_id', extraIds);
          await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).in('id', extraIds);
        }
        return res.json({ success: true, session: currentSession });
      } else {
        // Sessão existente expirou (> 30 min): deletar mensagens e fechar
        console.log(`[/api/chat/session/ensure] Sessão existente expirou (>30min). Deletando mensagens e fechando...`);
        const expiredIds = openSessions.map((s) => s.id);
        await supabaseAdmin.from('chat_messages').delete().in('session_id', expiredIds);
        await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).in('id', expiredIds);
      }
    }

    let resolvedAdminId = adminId;
    let resolvedEmpId = employeeId || adminId;
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
          let payload = {
            to: num,
            phone: num,
            recipient: num,
            text: text || '',
            message: text || ''
          };

          const mediaData = mediaBase64 || publicMediaUrl;
          if (mediaData) {
            const cleanCaption = (text && text !== '📸 Foto' && text !== '🎥 Vídeo') ? text : '';
            if (mimeType?.startsWith('image/')) {
              sendEndpoint = `${astracallsUrl}/api/sessions/${astraSessionId}/messages/image`;
              payload = {
                to: num,
                base64: mediaData,
                caption: cleanCaption
              };
            } else if (mimeType?.startsWith('video/')) {
              sendEndpoint = `${astracallsUrl}/api/sessions/${astraSessionId}/messages/video`;
              payload = {
                to: num,
                base64: mediaData,
                caption: cleanCaption
              };
            } else if (mimeType?.startsWith('audio/')) {
              sendEndpoint = `${astracallsUrl}/api/sessions/${astraSessionId}/messages/audio`;
              payload = {
                to: num,
                base64: mediaData
              };
            } else {
              sendEndpoint = `${astracallsUrl}/api/sessions/${astraSessionId}/messages/document`;
              payload = {
                to: num,
                base64: mediaData,
                filename: 'documento',
                caption: text || ''
              };
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
    if (!clientId && !sessionId) return res.status(400).json({ error: "Missing clientId or sessionId" });

    const supabaseAdmin = getSupabaseAdmin();
    const now = new Date().toISOString();

    let query = supabaseAdmin.from('chat_sessions').select('id');
    if (sessionId) {
      query = query.eq('id', sessionId);
    } else {
      query = query.eq('client_id', clientId);
    }

    const { data: targetSessions } = await query;
    if (targetSessions && targetSessions.length > 0) {
      const sIds = targetSessions.map((s) => s.id);
      console.log(`[/api/chat/close] Encerrando chat e excluindo todas as mensagens de ${sIds.length} sessões...`);
      await supabaseAdmin.from('chat_messages').delete().in('session_id', sIds);
      await supabaseAdmin.from('chat_sessions').update({ 
        status: 'closed', 
        closed_at: now 
      }).in('id', sIds);
    }

    return res.json({ success: true, closed: true, deleted: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Sync Status (1 tique -> 2 tiques entregue -> 2 tiques azuis lido) e Sincronização em Tempo Real de Mensagens
app.post(['/api/chat/sync-status', '/chat/sync-status'], async (req, res) => {
  try {
    let { messageIds, waSettings, clientId, sessionId } = req.body;
    const supabaseAdmin = getSupabaseAdmin();

    // Sincroniza mensagens do cliente via AstraCalls se houver conversa em andamento (< 30 min)
    let syncRes = null;
    if (clientId || sessionId) {
      try {
        syncRes = await syncAstraCallsIncomingMessages({ clientId, sessionId, waSettings });
      } catch (e) {
        console.warn('Erro ao sincronizar mensagens AstraCalls em sync-status:', e.message);
      }
    }

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.json({ updated: 0, statusMap: {}, syncedIncoming: syncRes?.synced || 0 });
    }

    if (!waSettings?.metaToken && !waSettings?.evolutionApiKey) {
      const { data: adminUsers } = await supabaseAdmin.from('users').select('whatsapp_settings').not('whatsapp_settings', 'is', null);
      const validAdmin = adminUsers?.find(u => u.whatsapp_settings?.metaToken || u.whatsapp_settings?.evolutionApiKey);
      if (validAdmin?.whatsapp_settings) waSettings = validAdmin.whatsapp_settings;
    }

    const { data: msgs } = await supabaseAdmin
      .from('chat_messages')
      .select('id, session_id, media_url, sender_type, created_at')
      .in('id', messageIds)
      .eq('sender_type', 'tech');

    if (!msgs || msgs.length === 0) return res.json({ updated: 0, statusMap: {} });

    let updatedCount = 0;
    const statusMap = {};

    await Promise.all(
      msgs.map(async (msg) => {
        let meta = {};
        try { meta = JSON.parse(msg.media_url); } catch(e) {}
        if (meta.status === 'read') {
          statusMap[msg.id] = 'read';
          return;
        }

        let remoteStatus = null;
        const externalId = meta.external_id;

        // 1. Consulta em APIs externas se configurado
        if (externalId) {
          if (waSettings?.useEvolutionApi && waSettings?.evolutionApiUrl && waSettings?.evolutionApiKey && waSettings?.evolutionInstanceName) {
            try {
              let baseUrl = waSettings.evolutionApiUrl.trim().replace(/\/$/, '');
              if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
              const checkUrl = `${baseUrl}/chat/findMessages/${waSettings.evolutionInstanceName}`;
              const checkRes = await fetch(checkUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': waSettings.evolutionApiKey },
                body: JSON.stringify({ where: { key: { id: externalId } } })
              });
              if (checkRes.ok) {
                const evoData = await checkRes.json();
                const rec = evoData?.messages?.records?.[0] || evoData?.records?.[0] || (Array.isArray(evoData) ? evoData[0] : evoData);
                const raw = String(rec?.status ?? rec?.statusLabel ?? rec?.ack ?? '').toUpperCase().trim();
                if (raw === '4' || raw === '5' || raw === 'READ' || raw === 'PLAYED' || raw === 'READ_RECEIPT' || raw === 'VIEWED') remoteStatus = 'read';
                else if (raw === '3' || raw === 'DELIVERY_ACK' || raw === 'DELIVERED' || raw === 'RECEIVED') remoteStatus = 'delivered';
                else if (raw === '2' || raw === 'SERVER_ACK' || raw === 'SENT') remoteStatus = 'sent';
              }
            } catch (e) {}
          }
        }

        // 2. Se o cliente respondeu após esta mensagem no chat, marca como 'read' (2 tiques azuis)
        if (!remoteStatus || remoteStatus !== 'read') {
          try {
            const { data: replyMsg } = await supabaseAdmin
              .from('chat_messages')
              .select('id')
              .eq('session_id', msg.session_id)
              .eq('sender_type', 'client')
              .gt('created_at', msg.created_at)
              .limit(1);

            if (replyMsg && replyMsg.length > 0) {
              remoteStatus = 'read';
            }
          } catch(e) {}
        }

        // 3. Se a mensagem foi disparada com sucesso e já tem mais de 2.5s, marca como 'delivered' (2 tiques cinzas)
        if (!remoteStatus && (meta.status === 'sent' || !meta.status || meta.status === 'sending')) {
          const msgTime = new Date(msg.created_at).getTime();
          if (Date.now() - msgTime > 2500) {
            remoteStatus = 'delivered';
          }
        }

        if (remoteStatus) {
          statusMap[msg.id] = remoteStatus;
          if (remoteStatus !== meta.status) {
            await supabaseAdmin
              .from('chat_messages')
              .update({
                media_url: JSON.stringify({
                  ...meta,
                  status: remoteStatus,
                  status_updated_at: new Date().toISOString()
                })
              })
              .eq('id', msg.id);
            updatedCount++;
          }
        }
      })
    );

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

// Helper deduplicação e envio de Push Notification via FCM
const recentPushCache = new Map();
function shouldSendPush(key) {
  const now = Date.now();
  for (const [k, time] of recentPushCache.entries()) {
    if (now - time > 120000) recentPushCache.delete(k);
  }
  if (recentPushCache.has(key) && (now - recentPushCache.get(key)) < 30000) {
    return false;
  }
  recentPushCache.set(key, now);
  return true;
}

async function sendPushToAdmin(adminId, title, body, data = {}) {
  try {
    if (!adminId) {
      console.warn('[Push API] adminId não fornecido. Envio cancelado para segurança.');
      return { sent: false, count: 0, reason: 'adminId não fornecido' };
    }

    const supabaseAdmin = getSupabaseAdmin();
    let rawTokens = [];
    
    // Busca tokens EXCLUSIVAMENTE para o administrador especificado (isolamento estrito)
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, name, fcm_token, whatsapp_settings')
      .eq('id', adminId);

    (users || []).forEach(u => {
      if (u.fcm_token) rawTokens.push(u.fcm_token);
      if (Array.isArray(u.whatsapp_settings?.devices)) {
        u.whatsapp_settings.devices.forEach(d => {
          if (d?.token) rawTokens.push(d.token);
        });
      }
    });

    const tokens = Array.from(new Set(rawTokens.filter(Boolean)));
    if (tokens.length === 0) {
      console.log(`[Push API] Nenhum token FCM registrado para o admin ${adminId}. Envio cancelado.`);
      return { sent: false, count: 0, reason: `Nenhum token FCM registrado para o admin ${adminId}` };
    }

    const { initialized, messaging } = initFirebase();
    if (!initialized || !messaging) {
      return { sent: false, count: 0, reason: 'Firebase Admin não inicializado' };
    }

    const isChat = data?.channelId === 'chat_messages' || data?.type === 'chat_message';
    const isBilling = data?.channelId === 'cobrancas' || (typeof data?.type === 'string' && data.type.startsWith('billing'));
    const soundName = isChat ? 'chat_notification' : 'notificacao';
    const soundFile = isChat ? 'chat_notification.mp3' : 'notificacao.mp3';
    const channelTarget = data?.channelId || (isChat ? 'chat_messages' : (isBilling ? 'cobrancas' : 'atendimentos_v2'));
    const defaultUrl = isChat ? '/messages' : (isBilling ? '/billing' : '/routes');

    let sentCount = 0;
    for (const token of tokens) {
      try {
        await messaging.send({
          token,
          notification: {
            title,
            body
          },
          data: {
            title,
            body,
            ...data,
            click_action: 'FCM_PLUGIN_ACTIVITY',
            url: data.url || defaultUrl,
            channelId: channelTarget,
            channel_id: channelTarget,
            sound: soundName
          },
          android: {
            priority: 'high',
            ttl: 2419200,
            directBootOk: true,
            notification: {
              channelId: channelTarget,
              title,
              body,
              sound: soundName,
              priority: 'max',
              visibility: 'public',
              defaultSound: true,
              defaultVibrateTimings: true,
              localOnly: false,
              notificationCount: 1,
              tag: data.tag || (data.visitId ? `visit_${data.visitId}` : (data.jobId ? `job_${data.jobId}` : (data.clientId ? `billing_${data.clientId}` : undefined)))
            }
          },
          apns: {
            headers: {
              'apns-priority': '10',
              'apns-push-type': 'alert'
            },
            payload: {
              aps: {
                sound: soundFile,
                badge: 1,
                contentAvailable: true,
                alert: {
                  title,
                  body
                }
              }
            }
          }
        });
        sentCount++;
      } catch (fcmErr) {
        console.error('[FCM Send Error]:', fcmErr.message);
        if (fcmErr?.code === 'messaging/registration-token-not-registered' || fcmErr?.code === 'messaging/invalid-registration-token') {
          await supabaseAdmin.from('users').update({ fcm_token: null }).eq('fcm_token', token);
        }
      }
    }

    return { sent: sentCount > 0, count: sentCount, tokensFound: tokens.length };
  } catch (err) {
    console.error('[sendPushToAdmin Error]:', err.message);
    return { sent: false, error: err.message };
  }
}

// Endpoint to register/update device in the multi-device registry
app.post(['/api/notifications/register-device', '/notifications/register-device'], async (req, res) => {
  try {
    const { userId, adminId, token, platform, deviceId, deviceName } = req.body || {};
    if (!userId || !token) {
      return res.status(400).json({ error: "Missing userId or token" });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Atualiza users.fcm_token como token principal do usuário logado
    await supabaseAdmin.from('users').update({ fcm_token: token }).eq('id', userId);

    // 2. Busca informações do usuário para verificar se é colaborador ou possui admin_id
    let targetAdminId = adminId;
    const { data: userRow } = await supabaseAdmin.from('users').select('id, role, admin_id, whatsapp_settings').eq('id', userId).maybeSingle();
    if (!targetAdminId && userRow?.admin_id) {
      targetAdminId = userRow.admin_id;
    }

    // Função auxiliar para atualizar a lista de múltiplos dispositivos
    const updateDevicesList = async (targetUserId, existingSettings) => {
      let currentSettings = existingSettings;
      if (!currentSettings) {
        const { data: row } = await supabaseAdmin.from('users').select('whatsapp_settings').eq('id', targetUserId).maybeSingle();
        currentSettings = row?.whatsapp_settings || {};
      }
      let devices = Array.isArray(currentSettings.devices) ? currentSettings.devices : [];

      const cleanDevId = deviceId || `dev_${token.slice(0, 16)}`;
      devices = devices.filter(d => d && d.token && d.token !== token && d.deviceId !== cleanDevId);

      devices.unshift({
        token,
        deviceId: cleanDevId,
        platform: platform || 'android',
        deviceName: deviceName || 'Celular Android',
        lastSeen: new Date().toISOString()
      });

      devices = devices.slice(0, 10);

      await supabaseAdmin.from('users').update({
        whatsapp_settings: {
          ...currentSettings,
          devices
        }
      }).eq('id', targetUserId);
    };

    // Atualiza a lista de dispositivos para o próprio usuário (isolamento estrito por usuário)
    await updateDevicesList(userId, userRow?.whatsapp_settings);

    return res.json({ success: true });
  } catch (err) {
    console.error('[Push API] Erro ao registrar dispositivo:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Rotina Diária das 07:00 da manhã (Horário de Brasília):
// Envia notificações push exclusivamente para o administrador proprietário de cada cliente
async function sendDailyBillingReminders(filterAdminId = null) {
  const summary = { dueTodayCount: 0, overdueCount: 0, skippedCount: 0, errors: [] };
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Obter data atual no fuso de Brasília (YYYY-MM-DD)
    const now = new Date();
    const brParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now);

    const year = brParts.find(p => p.type === 'year')?.value || `${now.getFullYear()}`;
    const month = brParts.find(p => p.type === 'month')?.value || `${String(now.getMonth() + 1).padStart(2, '0')}`;
    const day = brParts.find(p => p.type === 'day')?.value || `${String(now.getDate()).padStart(2, '0')}`;
    const todayStr = `${year}-${month}-${day}`;

    console.log(`[7AM Billing Reminder] Verificando vencimentos (Data: ${todayStr}, Filtro Admin: ${filterAdminId || 'TODOS'})...`);

    // Busca clientes ativos com data de vencimento e que possuam admin_id definido
    let query = supabaseAdmin
      .from('clients')
      .select('id, name, due_date, monthly_price, admin_id, active')
      .not('due_date', 'is', null)
      .not('admin_id', 'is', null);

    if (filterAdminId) {
      query = query.eq('admin_id', filterAdminId);
    }

    const { data: clients, error: clientErr } = await query;

    if (clientErr) {
      console.error('[7AM Billing Reminder] Erro ao buscar clientes:', clientErr.message);
      summary.errors.push(clientErr.message);
      return summary;
    }

    if (!clients || clients.length === 0) {
      console.log('[7AM Billing Reminder] Nenhum cliente encontrado.');
      return summary;
    }

    for (const client of clients) {
      if (!client.due_date) continue;
      if (client.active === false) continue;
      if (!client.admin_id) continue;

      // Se um filtro de admin específico foi solicitado, ignora clientes de outros admins
      if (filterAdminId && client.admin_id !== filterAdminId) continue;

      const targetAdminId = client.admin_id;
      const clientName = client.name || 'Cliente';
      const clientDueDate = client.due_date;

      if (clientDueDate === todayStr) {
        summary.dueTodayCount++;
        const title = `💰 Vencimento Hoje: ${clientName}`;
        const body = `Hoje vence a mensalidade de ${clientName}. Realize a cobrança!`;
        
        await sendPushToAdmin(
          targetAdminId,
          title,
          body,
          {
            url: '/billing',
            channelId: 'cobrancas',
            type: 'billing_due_today',
            clientId: String(client.id)
          }
        );
      } else if (clientDueDate < todayStr) {
        summary.overdueCount++;
        const [dYear, dMonth, dDay] = clientDueDate.split('-');
        const formattedDueDate = dDay && dMonth ? `${dDay}/${dMonth}/${dYear}` : clientDueDate;
        const title = `⚠️ Cobrança Atrasada: ${clientName}`;
        const body = `O cliente ${clientName} está com mensalidade em atraso (venceu em ${formattedDueDate}). Realize a cobrança!`;

        await sendPushToAdmin(
          targetAdminId,
          title,
          body,
          {
            url: '/billing',
            channelId: 'cobrancas',
            type: 'billing_overdue',
            clientId: String(client.id)
          }
        );
      }
    }

    console.log(`[7AM Billing Reminder] Concluído para ${filterAdminId || 'todos admins'}: ${summary.dueTodayCount} hoje, ${summary.overdueCount} atrasados.`);
  } catch (err) {
    console.error('[7AM Billing Reminder] Erro inesperado na rotina de cobrança:', err);
    summary.errors.push(err?.message || String(err));
  }
  return summary;
}

// Endpoint para Cron Job da Vercel e chamadas manuais (suporta GET e POST)
app.all([
  '/api/cron/billing-reminders',
  '/cron/billing-reminders',
  '/api/notifications/trigger-due-reminders',
  '/notifications/trigger-due-reminders'
], async (req, res) => {
  try {
    const filterAdminId = req.query?.adminId || req.body?.adminId || req.query?.userId || req.body?.userId || null;
    const summary = await sendDailyBillingReminders(filterAdminId);
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      filterAdminId: filterAdminId || 'all_admins_strictly_isolated',
      summary
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post(['/api/notifications/notify-visit-completion', '/notifications/notify-visit-completion'], async (req, res) => {
  try {
    const { visitId, adminId, employeeId, clientId, clientName, techName, type } = req.body || {};
    const supabaseAdmin = getSupabaseAdmin();

    const dedupeKey = visitId ? `visit_${visitId}` : `${type || 'visit'}_${clientId || clientName || 'unknown'}`;
    if (!shouldSendPush(dedupeKey)) {
      return res.json({ success: true, deduped: true });
    }

    let empName = techName || "Colaborador";
    if (employeeId && !techName) {
      const { data: empData } = await supabaseAdmin.from('users').select('name').eq('id', employeeId).maybeSingle();
      if (empData?.name) empName = empData.name;
    }

    let resolvedClientName = clientName;
    let clientAdminId = null;
    if (clientId) {
      const { data: cliData } = await supabaseAdmin.from('clients').select('name, admin_id').eq('id', clientId).maybeSingle();
      if (cliData?.name) resolvedClientName = cliData.name;
      if (cliData?.admin_id) clientAdminId = cliData.admin_id;
    }
    if (!resolvedClientName) resolvedClientName = "Cliente";

    let targetAdminId = clientAdminId || adminId;
    if (!targetAdminId && employeeId) {
      const { data: empUser } = await supabaseAdmin.from('users').select('admin_id').eq('id', employeeId).maybeSingle();
      if (empUser?.admin_id) targetAdminId = empUser.admin_id;
    }
    if (!targetAdminId) {
      const { data: fallbackAdmin } = await supabaseAdmin.from('users').select('id').eq('role', 'admin').limit(1).maybeSingle();
      if (fallbackAdmin?.id) targetAdminId = fallbackAdmin.id;
    }
    if (!targetAdminId) {
      targetAdminId = '698dfcdd-7c91-4df5-aaee-eae9e67f15ae';
    }
    const isJob = type === 'job';
    const title = isJob ? '🏊 Serviço Avulso Finalizado' : '🏊 Visita Finalizada!';
    const body = `O colaborador ${empName} finalizou o atendimento no cliente ${resolvedClientName}.`;

    console.log(`[Push Notification] Disparando alerta de atendimento para admin ${targetAdminId}: ${title}`);

    const result = await sendPushToAdmin(targetAdminId || '', title, body, {
      url: '/routes',
      channelId: 'atendimentos_v2',
      type: isJob ? 'job_completed' : 'visit_completed',
      visitId: String(visitId || ''),
      clientId: String(clientId || ''),
      employeeId: String(employeeId || ''),
      tag: visitId ? `visit_${visitId}` : `visit_${Date.now()}`
    });

    return res.json({ success: true, sent: result.sent, count: result.count, reason: result.reason });
  } catch (err) {
    console.error('[Push API] Erro no endpoint notify-visit-completion:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Webhook para eventos do banco de dados (Supabase Database Webhooks)
// Chamado automaticamente quando um registro é inserido/atualizado na tabela 'visits' ou 'oneoffjobs'
app.post([
  '/api/webhooks/database',
  '/webhooks/database',
  '/api/webhooks/visit-completed',
  '/webhooks/visit-completed'
], async (req, res) => {
  try {
    const payload = req.body || {};
    const { type, table, record, old_record } = payload;
    const row = record || payload;
    const targetTable = table || (row.client_id !== undefined ? 'visits' : (row.price !== undefined ? 'oneoffjobs' : 'visits'));
    const supabaseAdmin = getSupabaseAdmin();

    console.log(`[Database Webhook] Evento recebido: Tabela: ${targetTable}, Tipo: ${type || 'manual/direct'}, Status: ${row?.status}`);

    // 1. Visita Finalizada
    if (targetTable === 'visits' && row && row.status === 'finalizada') {
      const visitId = String(row.id || '');
      const dedupeKey = `visit_${visitId}`;
      if (shouldSendPush(dedupeKey)) {
        // Resolução ultra-resiliente de 5 níveis do Admin Responsável
        let targetAdminId = row.admin_id;
        if (!targetAdminId && row.client_id) {
          const { data: cli } = await supabaseAdmin.from('clients').select('admin_id, name').eq('id', row.client_id).maybeSingle();
          if (cli?.admin_id) targetAdminId = cli.admin_id;
        }
        if (!targetAdminId && row.employee_id) {
          const { data: empUser } = await supabaseAdmin.from('users').select('admin_id').eq('id', row.employee_id).maybeSingle();
          if (empUser?.admin_id) targetAdminId = empUser.admin_id;
        }
        if (!targetAdminId) {
          const { data: fallbackAdmin } = await supabaseAdmin.from('users').select('id').eq('role', 'admin').limit(1).maybeSingle();
          if (fallbackAdmin?.id) targetAdminId = fallbackAdmin.id;
        }
        if (!targetAdminId) {
          targetAdminId = '698dfcdd-7c91-4df5-aaee-eae9e67f15ae';
        }

        let empName = 'Colaborador';
        if (row.employee_id) {
          const { data: empData } = await supabaseAdmin.from('users').select('name').eq('id', row.employee_id).maybeSingle();
          if (empData?.name) empName = empData.name;
        }

        let cliName = row.client_name;
        if (!cliName && row.client_id) {
          const { data: cliData } = await supabaseAdmin.from('clients').select('name').eq('id', row.client_id).maybeSingle();
          if (cliData?.name) cliName = cliData.name;
        }
        if (!cliName) cliName = 'Cliente';

        console.log(`[Database Webhook] Disparando push de visita ${visitId} para o admin ${targetAdminId}`);

        await sendPushToAdmin(
          targetAdminId,
          '🏊 Visita Finalizada!',
          `O colaborador ${empName} finalizou o atendimento no cliente ${cliName}.`,
          {
            url: '/routes',
            channelId: 'atendimentos_v2',
            type: 'visit_completed',
            visitId: String(visitId),
            clientId: String(row.client_id || ''),
            employeeId: String(row.employee_id || ''),
            tag: `visit_${visitId}`
          }
        );
      }
    }

    // 2. Serviço Avulso Concluído
    if (targetTable === 'oneoffjobs' && row && row.status === 'concluido') {
      const jobId = String(row.id || '');
      const dedupeKey = `job_${jobId}`;
      if (shouldSendPush(dedupeKey)) {
        let targetAdminId = row.admin_id;
        if (!targetAdminId && row.employee_id) {
          const { data: empUser } = await supabaseAdmin.from('users').select('admin_id').eq('id', row.employee_id).maybeSingle();
          if (empUser?.admin_id) targetAdminId = empUser.admin_id;
        }
        if (!targetAdminId) {
          const { data: fallbackAdmin } = await supabaseAdmin.from('users').select('id').eq('role', 'admin').limit(1).maybeSingle();
          if (fallbackAdmin?.id) targetAdminId = fallbackAdmin.id;
        }
        if (!targetAdminId) {
          targetAdminId = '698dfcdd-7c91-4df5-aaee-eae9e67f15ae';
        }

        let empName = 'Colaborador';
        if (row.employee_id) {
          const { data: empData } = await supabaseAdmin.from('users').select('name').eq('id', row.employee_id).maybeSingle();
          if (empData?.name) empName = empData.name;
        }
        const cliName = row.client_name || 'Cliente';

        console.log(`[Database Webhook] Disparando push de avulso ${jobId} para o admin ${targetAdminId}`);

        await sendPushToAdmin(
          targetAdminId,
          '🏊 Serviço Avulso Finalizado',
          `O colaborador ${empName} finalizou o serviço avulso para ${cliName}.`,
          {
            url: '/routes',
            channelId: 'atendimentos_v2',
            type: 'job_completed',
            jobId: String(jobId),
            tag: `job_${jobId}`
          }
        );
      }
    }

    return res.json({ success: true, processed: true });
  } catch (err) {
    console.error('[Database Webhook Error]:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Endpoint autônomo de varredura (Sweep) para checar e notificar visitas recentes pendentes
app.all(['/api/cron/sync-visits', '/api/notifications/sweep-recent-visits'], async (req, res) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const sinceDate = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recentVisits, error: vErr } = await supabaseAdmin
      .from('visits')
      .select('id, admin_id, client_id, employee_id, status, created_at, date, client_name')
      .eq('status', 'finalizada')
      .or(`created_at.gte.${sinceDate},date.gte.${sinceDate}`)
      .order('created_at', { ascending: false })
      .limit(20);

    let sentCount = 0;
    if (!vErr && recentVisits) {
      for (const v of recentVisits) {
        const dedupeKey = `visit_${v.id}`;
        if (shouldSendPush(dedupeKey)) {
          let targetAdminId = v.admin_id;
          if (!targetAdminId && v.client_id) {
            const { data: cli } = await supabaseAdmin.from('clients').select('admin_id, name').eq('id', v.client_id).maybeSingle();
            if (cli?.admin_id) targetAdminId = cli.admin_id;
          }
          if (!targetAdminId && v.employee_id) {
            const { data: empUser } = await supabaseAdmin.from('users').select('admin_id').eq('id', v.employee_id).maybeSingle();
            if (empUser?.admin_id) targetAdminId = empUser.admin_id;
          }
          if (!targetAdminId) {
            targetAdminId = '698dfcdd-7c91-4df5-aaee-eae9e67f15ae';
          }

          let empName = 'Colaborador';
          if (v.employee_id) {
            const { data: empData } = await supabaseAdmin.from('users').select('name').eq('id', v.employee_id).maybeSingle();
            if (empData?.name) empName = empData.name;
          }

          let cliName = v.client_name;
          if (!cliName && v.client_id) {
            const { data: cliData } = await supabaseAdmin.from('clients').select('name').eq('id', v.client_id).maybeSingle();
            if (cliData?.name) cliName = cliData.name;
          }
          if (!cliName) cliName = 'Cliente';

          await sendPushToAdmin(
            targetAdminId,
            '🏊 Visita Finalizada!',
            `O colaborador ${empName} finalizou o atendimento no cliente ${cliName}.`,
            {
              url: '/routes',
              channelId: 'atendimentos_v2',
              type: 'visit_completed',
              visitId: String(v.id),
              clientId: String(v.client_id || ''),
              employeeId: String(v.employee_id || ''),
              tag: `visit_${v.id}`
            }
          );
          sentCount++;
        }
      }
    }

    return res.json({ success: true, sweeped: recentVisits?.length || 0, sentCount });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Endpoint para envio de push em caso de Repasse de Rota de Emergência entre colaboradores
app.post(['/api/notifications/notify-handoff', '/notifications/notify-handoff'], async (req, res) => {
  try {
    const { targetEmployeeId, sourceEmployeeName, clientCount, reason } = req.body || {};
    if (!targetEmployeeId) {
      return res.status(400).json({ error: "Missing targetEmployeeId" });
    }
    const count = clientCount || 1;
    const title = '🚨 Rota de Emergência Repassada!';
    const reasonText = reason ? ` Motivo: ${reason}.` : '';
    const body = `Você recebeu ${count} atendimento(s) transferido(s) de ${sourceEmployeeName || 'um colega'}.${reasonText} Abra as rotas para visualizar.`;

    const result = await sendPushToAdmin(targetEmployeeId, title, body, {
      url: '/routes',
      channelId: 'atendimentos_v2',
      type: 'route_handoff'
    });

    return res.json({ success: true, sent: result.sent });
  } catch (err) {
    console.error('[Handoff Push Error]:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.all(['/api/notifications/test-push', '/notifications/test-push'], async (req, res) => {
  try {
    const { adminId, userId, title, body } = req.body || req.query || {};
    let targetId = adminId || userId;
    const supabaseAdmin = getSupabaseAdmin();

    let user = null;
    if (targetId) {
      const { data: u } = await supabaseAdmin.from('users').select('id, fcm_token, name').eq('id', targetId).maybeSingle();
      user = u;
      if (!user) {
        return res.status(404).json({ success: false, error: `Usuário ${targetId} não foi encontrado.` });
      }
      if (!user.fcm_token) {
        return res.status(400).json({
          success: false,
          targetUserId: targetId,
          error: `O administrador "${user.name || targetId}" ainda não possui dispositivo/token FCM registrado no aplicativo.`
        });
      }
    } else {
      const { data: fallbackUsers } = await supabaseAdmin
        .from('users')
        .select('id, fcm_token, name')
        .eq('role', 'admin')
        .not('fcm_token', 'is', null)
        .limit(1);
      if (fallbackUsers && fallbackUsers.length > 0) {
        user = fallbackUsers[0];
        targetId = user.id;
      }
    }

    const result = await sendPushToAdmin(
      targetId,
      title || '🏊 Teste de Notificação Push',
      body || 'Seu dispositivo está conectado e configurado para receber alertas em tempo real das rotas e cobranças!',
      {
        url: '/routes',
        channelId: 'atendimentos_v2',
        type: 'test_push'
      }
    );

    return res.json({
      success: result.sent,
      sent: result.sent,
      count: result.count,
      targetUserId: targetId,
      hasToken: !!user?.fcm_token,
      tokenPreview: user?.fcm_token ? `${user.fcm_token.substring(0, 10)}...` : null,
      reason: result.reason
    });
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

const handleWameGet = (req, res) => {
  const mode = req.query["hub.mode"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && challenge) {
    return res.status(200).send(challenge);
  }
  return res.status(200).send("OK");
};

// AstraCalls Webhook
const handleAstraCallsWebhook = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).send(req.query['hub.challenge'] || 'OK_ASTRACALLS');
  }
  try {
    const payload = req.body || {};
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Processa atualizações de status de mensagens enviadas
    const statusResult = await processStatusUpdates(payload);

    const isStatusOnly = payload.event === 'message.status' || payload.event === 'message.ack' || payload.event === 'message_status' || payload.event === 'messages.update' || payload.type === 'message_status';
    if (isStatusOnly) {
      return res.status(200).json({ success: true, event: payload.event, ...statusResult });
    }

    // 2. Processa mensagens recebidas do cliente (suporta objetos diretos e arrays de mensagens)
    const rawItem = payload.data?.messages?.[0] || payload.messages?.[0] || (Array.isArray(payload.data) ? payload.data[0] : null) || (Array.isArray(payload) ? payload[0] : null) || payload.data || payload;
    const msgData = rawItem || payload;
    const isFromMe = Boolean(
      msgData.key?.fromMe === true ||
      msgData.fromMe === true ||
      payload.fromMe === true ||
      msgData.direction === 'outbound' ||
      msgData.direction === 'outgoing'
    );

    if (isFromMe) {
      return res.status(200).json({ success: true, fromMe: true, ...statusResult });
    }

    let rawRemote = msgData.key?.remoteJid || msgData.remoteJid || msgData.chat || msgData.chatId || msgData.from || msgData.sender || msgData.phone || msgData.to || payload.chat || payload.from || payload.chatId || "";
    const cleanIncoming = cleanJidToPhone(rawRemote);

    const extracted = extractMessageData(msgData.message || msgData);
    let content = extracted.content || msgData.body || msgData.text || msgData.message || msgData.content || payload.body || payload.text || payload.message || "";
    let mediaUrl = extracted.mediaUrl || msgData.mediaUrl || msgData.url || "";
    let externalMsgId = String(msgData.key?.id || msgData.id || payload.id || payload.messageId || "");

    if (msgData.type === 'audio' && !content) content = "🎵 Mensagem de Áudio";
    if (msgData.type === 'image' && !content) content = "📸 Imagem";
    if (msgData.type === 'video' && !content) content = "🎥 Vídeo";
    if (msgData.type === 'document' && !content) content = "📄 Documento";

    if (!cleanIncoming || (!content && !mediaUrl)) {
      return res.status(200).json({ success: true, ...statusResult });
    }

    // Deduplicação
    const dedupKey = externalMsgId ? `astra_${externalMsgId}` : `astra_txt_${cleanIncoming}_${content}`;
    if (isDuplicateIncomingMsg(dedupKey)) {
      return res.status(200).json({ success: true, duplicate: true });
    }

    const [{ data: clients }, { data: agendaContacts }] = await Promise.all([
      supabaseAdmin.from('clients').select('id, name, phone, local_phone, admin_id, employee_id'),
      supabaseAdmin.from('agenda_contacts').select('id, name, phone, admin_id')
    ]);

    const allTargets = [
      ...(clients || []).map((c) => ({ ...c, is_agenda: false })),
      ...(agendaContacts || []).map((a) => ({ ...a, local_phone: '', employee_id: a.admin_id, is_agenda: true }))
    ];

    let candidatePhones = [cleanIncoming];
    const isLid = rawRemote.includes('@lid') || cleanIncoming.length > 13;
    if (isLid) {
      const resolved = await resolveLidToRealPhone(cleanIncoming, rawRemote, msgData, payload, allTargets);
      if (resolved) {
        candidatePhones.push(resolved);
      }
    }

    const matchedClient = allTargets.find((c) => {
      return candidatePhones.some(cand => 
        isMatchingClientPhone(c.phone || '', cand) || isMatchingClientPhone(c.local_phone || '', cand)
      );
    });

    if (!matchedClient) {
      console.log("[Webhook AstraCalls] Mensagem ignorada (número não pertence a cliente cadastrado):", cleanIncoming, rawRemote, "Candidatos:", candidatePhones);
      return res.status(200).json({ success: true, matched: false });
    }

    const { data: sessions } = await supabaseAdmin
      .from('chat_sessions')
      .select('*')
      .eq('client_id', matchedClient.id)
      .order('created_at', { ascending: false });

    const now = Date.now();
    let activeSession = null;

    // Localiza sessões abertas válidas criadas nos últimos 30 minutos
    const openSessions = (sessions || []).filter((s) => s.status === 'open');
    if (openSessions.length > 0) {
      for (const sess of openSessions) {
        const createdTime = new Date(sess.created_at).getTime();
        if (now - createdTime <= 30 * 60 * 1000) {
          if (!activeSession) {
            activeSession = sess;
          } else {
            await supabaseAdmin.from('chat_messages').delete().eq('session_id', sess.id);
            await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', sess.id);
          }
        } else {
          console.log(`[Webhook AstraCalls] Sessão expirou (>30 min). Deletando mensagens da sessão ${sess.id}...`);
          await supabaseAdmin.from('chat_messages').delete().eq('session_id', sess.id);
          await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', sess.id);
        }
      }
    }

    // REGRA ESTRITA: Se não houver conversa ativa iniciada pelo colaborador nos últimos 30 min, descarta!
    if (!activeSession) {
      console.log(`[Webhook AstraCalls] Mensagem descartada de ${matchedClient.name} (${cleanIncoming}): Nenhuma conversa ativa de 30 minutos em andamento iniciada pelo colaborador.`);
      return res.status(200).json({ success: true, activeSession: false });
    }

    const metadataPayload = {
      external_id: externalMsgId || undefined,
      astra_id: externalMsgId || undefined,
      url: mediaUrl || undefined,
      status: 'read'
    };

    // Insere sem sender_name (a coluna não existe na tabela chat_messages do Supabase)
    await supabaseAdmin.from('chat_messages').insert({
      session_id: activeSession.id,
      sender_type: 'client',
      content: String(content),
      media_url: JSON.stringify(metadataPayload)
    });

    // Cliente respondeu: marca mensagens anteriores enviadas pelo colaborador como lidas
    const { data: unreadTech } = await supabaseAdmin
      .from('chat_messages')
      .select('id, media_url')
      .eq('session_id', activeSession.id)
      .eq('sender_type', 'tech');

    if (unreadTech) {
      for (const utm of unreadTech) {
        let mMeta = {};
        try { mMeta = JSON.parse(utm.media_url); } catch(e) {}
        if (mMeta.status !== 'read') {
          await supabaseAdmin.from('chat_messages').update({
            media_url: JSON.stringify({ ...mMeta, status: 'read' })
          }).eq('id', utm.id);
        }
      }
    }

    const targetUserId = matchedClient.employee_id || matchedClient.admin_id;
    if (targetUserId) {
      const clientDisplayName = formatFirstTwoNames(matchedClient.name);
      sendPushToAdmin(targetUserId, `💬 ${clientDisplayName}`, String(content), {
        clientId: matchedClient.id,
        sessionId: activeSession.id,
        type: 'chat_message',
        channelId: 'chat_messages'
      }).catch(err => console.error('[Push Notification Error]', err));
    }

    return res.status(200).json({ success: true, processed: true });
  } catch (e) {
    console.error("[Webhook AstraCalls Error]", e);
    return res.status(500).json({ error: e.message });
  }
};

app.all(['/api/webhook/astracalls', '/webhook/astracalls', '/api/astracalls/webhook', '/astracalls/webhook'], handleAstraCallsWebhook);

// Evolution Webhook
const handleEvolutionWebhook = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).send("OK_EVOLUTION");
  }
  try {
    const body = req.body || {};
    await processStatusUpdates(body);

    const msgData = body.data || body;
    if (!msgData || (!msgData.key && !msgData.message && !body.message)) return res.status(200).send("OK");
    if (msgData.key?.fromMe || msgData.fromMe) return res.status(200).send("OK");

    let remoteJid = msgData.key?.remoteJid || msgData.remoteJid || body.remoteJid || "";
    if (!remoteJid && msgData.from) remoteJid = msgData.from;
    if (!remoteJid) return res.status(200).send("OK");

    const cleanIncoming = remoteJid.split('@')[0].replace(/\D/g, '');
    let externalMsgId = msgData.key?.id || msgData.id || "";

    let content = "";
    if (msgData.message?.conversation) content = msgData.message.conversation;
    else if (msgData.message?.extendedTextMessage?.text) content = msgData.message.extendedTextMessage.text;
    else if (typeof msgData.message === 'string') content = msgData.message;
    else if (typeof body.message === 'string') content = body.message;

    let mediaUrl = "";
    if (msgData.message?.audioMessage) content = "🎵 Mensagem de Áudio";
    else if (msgData.message?.imageMessage) content = "📷 Imagem";

    if (!content && !mediaUrl) return res.status(200).send("OK");

    const dedupKey = externalMsgId ? `evo_${externalMsgId}` : `evo_txt_${cleanIncoming}_${content}`;
    if (isDuplicateIncomingMsg(dedupKey)) {
      return res.status(200).send("OK");
    }

    const supabaseAdmin = getSupabaseAdmin();
    const [{ data: clients }, { data: agendaContacts }] = await Promise.all([
      supabaseAdmin.from('clients').select('id, name, phone, local_phone, admin_id, employee_id'),
      supabaseAdmin.from('agenda_contacts').select('id, name, phone, admin_id')
    ]);

    const allTargets = [
      ...(clients || []).map((c) => ({ ...c, is_agenda: false })),
      ...(agendaContacts || []).map((a) => ({ ...a, local_phone: '', employee_id: a.admin_id, is_agenda: true }))
    ];

    let candidatePhones = [cleanIncoming];
    const isLid = remoteJid.includes('@lid') || cleanIncoming.length > 13;
    if (isLid) {
      const resolved = await resolveLidToRealPhone(cleanIncoming, remoteJid, msgData, body, allTargets);
      if (resolved) candidatePhones.push(resolved);
    }

    const matchedClient = allTargets.find((c) => {
      return candidatePhones.some(cand => 
        isMatchingClientPhone(c.phone || '', cand) || isMatchingClientPhone(c.local_phone || '', cand)
      );
    });

    if (!matchedClient) return res.status(200).send("OK");

    const { data: sessions } = await supabaseAdmin
      .from('chat_sessions')
      .select('*')
      .eq('client_id', matchedClient.id)
      .order('created_at', { ascending: false });

    const now = Date.now();
    let activeSession = null;

    const openSessions = (sessions || []).filter((s) => s.status === 'open');
    if (openSessions.length > 0) {
      for (const sess of openSessions) {
        const createdTime = new Date(sess.created_at).getTime();
        if (now - createdTime <= 30 * 60 * 1000) {
          if (!activeSession) {
            activeSession = sess;
          } else {
            await supabaseAdmin.from('chat_messages').delete().eq('session_id', sess.id);
            await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', sess.id);
          }
        } else {
          await supabaseAdmin.from('chat_messages').delete().eq('session_id', sess.id);
          await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', sess.id);
        }
      }
    }

    if (!activeSession) return res.status(200).send("OK");

    await supabaseAdmin.from('chat_messages').insert({
      session_id: activeSession.id,
      sender_type: 'client',
      content: content,
      media_url: mediaUrl
    });

    const targetUserId = matchedClient.employee_id || matchedClient.admin_id;
    if (targetUserId) {
      const clientDisplayName = formatFirstTwoNames(matchedClient.name);
      sendPushToAdmin(targetUserId, `💬 ${clientDisplayName}`, content, {
        clientId: matchedClient.id,
        sessionId: activeSession.id,
        type: 'chat_message',
        channelId: 'chat_messages'
      }).catch(err => console.error('[Push Notification Error]', err));
    }

    return res.status(200).send("OK");
  } catch (e) {
    return res.status(500).send("Error");
  }
};

app.all(['/api/webhook/evolution', '/webhook/evolution'], handleEvolutionWebhook);

// Status and WAME Webhooks
app.all(['/api/webhook/wame', '/webhook/wame', '/api/webhook/meta', '/webhook/meta', '/api/webhook/status', '/webhook/status', '/api/webhook/messages/status'], async (req, res) => {
  if (req.method === 'GET') {
    return handleWameGet(req, res);
  }
  try {
    await processStatusUpdates(req.body || {});
  } catch(e) {}
  return res.status(200).send("EVENT_RECEIVED");
});

export default app;

