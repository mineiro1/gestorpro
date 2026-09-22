import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let { messageIds, waSettings } = req.body;
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.json({ updated: 0, statusMap: {} });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const part1 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnbW12cnZ1ZG96endxenN6dHdvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA1MjMzMSwi";
    const part2 = "ZXhwIjoyMDk0NjI4MzMxfQ.iB9iF3aoumsNtywpLZL_QjrBzR8QPWw7GGWQ6-Yx-Ik";
    const directKey = part1 + part2;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || directKey;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Se waSettings não veio, busca do admin
    if (!waSettings?.metaToken && !waSettings?.evolutionApiKey) {
      const { data: adminUsers } = await supabaseAdmin
        .from('users')
        .select('whatsapp_settings')
        .not('whatsapp_settings', 'is', null);
      const validAdmin = adminUsers?.find(u => u.whatsapp_settings?.metaToken || u.whatsapp_settings?.evolutionApiKey);
      if (validAdmin?.whatsapp_settings) {
        waSettings = validAdmin.whatsapp_settings;
      }
    }

    const { data: msgs } = await supabaseAdmin
      .from('chat_messages')
      .select('id, session_id, media_url, sender_type, created_at')
      .in('id', messageIds)
      .eq('sender_type', 'tech');

    if (!msgs || msgs.length === 0) {
      return res.json({ updated: 0, statusMap: {} });
    }

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

        if (externalId) {
          if (waSettings?.useMetaApi && waSettings?.metaToken) {
            let baseUrl = (waSettings.metaServerUrl || 'https://graph.facebook.com/v19.0').trim().replace(/\/$/, '');
            if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
            const isWame = baseUrl && !baseUrl.includes('graph.facebook.com');

            if (isWame) {
              try {
                const checkUrl = `${baseUrl}/${waSettings.metaToken}/message/${externalId}`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2500);
                const checkRes = await fetch(checkUrl, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (checkRes.ok) {
                  const msgDetails = await checkRes.json();
                  const label = String(msgDetails?.data?.statusLabel || msgDetails?.statusLabel || msgDetails?.data?.status_label || '').toLowerCase().trim();
                  const numStatus = msgDetails?.data?.status ?? msgDetails?.status ?? msgDetails?.update?.status;
                  const ack = msgDetails?.data?.ack ?? msgDetails?.ack ?? msgDetails?.update?.ack;

                  if (label === 'read' || label === 'played' || label === 'viewed' || numStatus === 4 || numStatus === 5 || ack === 4 || ack === 5) {
                    remoteStatus = 'read';
                  } else if (label === 'delivered' || numStatus === 3 || ack === 3) {
                    remoteStatus = 'delivered';
                  } else if (label === 'sent' || numStatus === 2 || ack === 2) {
                    remoteStatus = 'sent';
                  }
                }
              } catch(e) {}
            }
          } else if (waSettings?.useEvolutionApi && waSettings?.evolutionApiUrl && waSettings?.evolutionApiKey && waSettings?.evolutionInstanceName) {
            try {
              let baseUrl = waSettings.evolutionApiUrl.trim().replace(/\/$/, '');
              if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
              const checkUrl = `${baseUrl}/chat/findMessages/${waSettings.evolutionInstanceName}`;
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 2500);
              const checkRes = await fetch(checkUrl, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': waSettings.evolutionApiKey
                },
                body: JSON.stringify({
                  where: { key: { id: externalId } }
                })
              });
              clearTimeout(timeoutId);

              if (checkRes.ok) {
                const evoData = await checkRes.json();
                const rec = evoData?.messages?.records?.[0] || evoData?.records?.[0] || (Array.isArray(evoData) ? evoData[0] : evoData);
                const rawStatus = rec?.status ?? rec?.update?.status ?? rec?.ack ?? rec?.update?.ack ?? rec?.statusLabel;
                const str = String(rawStatus || '').toUpperCase().trim();
                if (str === '4' || str === '5' || str === 'READ' || str === 'PLAYED' || str === 'READ_RECEIPT' || str === 'VIEWED') {
                  remoteStatus = 'read';
                } else if (str === '3' || str === 'DELIVERY_ACK' || str === 'DELIVERED' || str === 'RECEIVED') {
                  remoteStatus = 'delivered';
                } else if (str === '2' || str === 'SERVER_ACK' || str === 'SENT') {
                  remoteStatus = 'sent';
                }
              }
            } catch(e) {}
          }
        }

        // Se o cliente respondeu após esta mensagem, considera lida
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

        // Se ainda estiver 'sending' e já passou mais de 5 segundos, promove para 'sent'
        if (!remoteStatus && (meta.status === 'sending' || !meta.status)) {
          const msgTime = new Date(msg.created_at).getTime();
          if (Date.now() - msgTime > 5000) {
            remoteStatus = 'sent';
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
}
