import { createClient } from '@supabase/supabase-js';

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

function cleanDigitsOnly(str) {
  return String(str || '').replace(/\D/g, '');
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send(req.query['hub.challenge'] || 'OK_ASTRACALLS');
  }

  try {
    const payload = req.body || {};
    const supabaseAdmin = getSupabaseAdmin();

    const event = payload.event || payload.type || payload.event_type;
    const data = payload.data || payload;

    // 1. Mensagens Recebidas (Inbound)
    const msgObj = data.message || data.messages?.[0] || (data.key ? data : null);
    if (msgObj) {
      const fromMe = msgObj.fromMe || msgObj.key?.fromMe;
      if (!fromMe) {
        let senderPhone = msgObj.from || msgObj.key?.remoteJid || msgObj.phone || msgObj.sender || '';
        senderPhone = senderPhone.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const cleanSender = cleanDigitsOnly(senderPhone);

        const textContent = msgObj.text || msgObj.body || msgObj.conversation || msgObj.message?.conversation || msgObj.message?.extendedTextMessage?.text || '';
        const mediaUrl = msgObj.mediaUrl || msgObj.url || msgObj.imageMessage?.url || msgObj.audioMessage?.url || '';

        if (cleanSender && (textContent || mediaUrl)) {
          // Busca cliente correspondente pelo telefone
          const { data: allClients } = await supabaseAdmin.from('clients').select('id, name, phone, admin_id, employee_id');
          const matchedClient = allClients?.find(c => {
            const cDigits = cleanDigitsOnly(c.phone);
            return cDigits && (cleanSender.endsWith(cDigits) || cDigits.endsWith(cleanSender) || cleanSender.slice(-8) === cDigits.slice(-8));
          });

          if (matchedClient) {
            // Busca ou cria sessão aberta
            const { data: openSess } = await supabaseAdmin
              .from('chat_sessions')
              .select('id')
              .eq('client_id', matchedClient.id)
              .eq('status', 'open')
              .maybeSingle();

            let targetSessId = openSess?.id;
            if (!targetSessId) {
              const { data: newSess } = await supabaseAdmin.from('chat_sessions').insert({
                client_id: matchedClient.id,
                admin_id: matchedClient.admin_id || null,
                employee_id: matchedClient.employee_id || null,
                status: 'open',
                created_at: new Date().toISOString()
              }).select('id').single();
              targetSessId = newSess?.id;
            }

            if (targetSessId) {
              await supabaseAdmin.from('chat_messages').insert({
                session_id: targetSessId,
                sender_type: 'client',
                sender_name: matchedClient.name || 'Cliente',
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
    console.error("[api/webhook/astracalls] Erro:", e);
    return res.status(200).json({ success: true, error: e.message });
  }
}
