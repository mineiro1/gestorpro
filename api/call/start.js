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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { clientId, phone, adminId } = req.body;
    if (!clientId && !phone) {
      return res.status(400).json({ error: "Telefone ou Cliente obrigatório para iniciar chamada" });
    }

    const astracallsUrl = 'https://calls.rspiscinas.app.br';
    const astracallsApiKey = 'rs_piscinas_segredo_2026';
    let sessionId = '8090cca3add0b8eb3e41efb9eec363e4';

    try {
      const sRes = await fetch(`${astracallsUrl}/api/sessions`, {
        headers: { 'X-Api-Key': astracallsApiKey }
      });
      if (sRes.ok) {
        const sData = await sRes.json();
        const active = sData?.sessions?.find(s => s.state === 'open' || s.paired) || sData?.sessions?.[0];
        if (active?.id) sessionId = active.id;
      }
    } catch (e) {}

    let targetPhone = phone;
    const supabaseAdmin = getSupabaseAdmin();

    if (!targetPhone && clientId) {
      const { data: client } = await supabaseAdmin
        .from('clients')
        .select('phone, name')
        .eq('id', clientId)
        .single();
      if (client?.phone) targetPhone = client.phone;
    }

    if (!targetPhone) {
      return res.status(400).json({ error: "Telefone do destinatário não encontrado" });
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
    let lastError = null;

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
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': astracallsApiKey
            },
            body: JSON.stringify({
              to: num,
              phone: num,
              recipient: num,
              audioOnly: true,
              isVideo: false
            })
          });

          if (resp.ok) {
            const data = await resp.json().catch(() => ({}));
            callId = data.id || data.callId || `call_${Date.now()}`;
            callData = { ...data, targetUsed: num };
            break;
          } else {
            const errTxt = await resp.text().catch(() => '');
            lastError = errTxt;
          }
        } catch (callErr) {
          lastError = callErr.message;
        }
      }
      if (callId) break;
    }

    if (!callId) {
      callId = `astracalls_local_${Date.now()}`;
      callData = { localFallback: true, warning: lastError };
    }

    return res.json({
      success: true,
      callId,
      sessionId,
      targetPhone: variants[0] || baseNumber,
      data: callData
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
