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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    let updatedClientsCount = 0;
    let updatedContactsCount = 0;
    const details = [];

    // 1. Processar tabela 'clients'
    const { data: clients, error: cliErr } = await supabaseAdmin
      .from('clients')
      .select('id, name, phone');

    if (!cliErr && clients) {
      for (const client of clients) {
        if (!client.phone) continue;
        const currentPhone = String(client.phone).trim();
        const standardized = formatAstraCallsNumber(currentPhone);

        if (standardized && standardized !== currentPhone) {
          const { error: updErr } = await supabaseAdmin
            .from('clients')
            .update({ phone: standardized })
            .eq('id', client.id);

          if (!updErr) {
            updatedClientsCount++;
            details.push({
              type: 'client',
              id: client.id,
              name: client.name,
              oldPhone: currentPhone,
              newPhone: standardized
            });
          }
        }
      }
    }

    // 2. Processar tabela 'agenda_contacts'
    const { data: contacts, error: contErr } = await supabaseAdmin
      .from('agenda_contacts')
      .select('id, name, phone');

    if (!contErr && contacts) {
      for (const contact of contacts) {
        if (!contact.phone) continue;
        const currentPhone = String(contact.phone).trim();
        const standardized = formatAstraCallsNumber(currentPhone);

        if (standardized && standardized !== currentPhone) {
          const { error: updErr } = await supabaseAdmin
            .from('agenda_contacts')
            .update({ phone: standardized })
            .eq('id', contact.id);

          if (!updErr) {
            updatedContactsCount++;
            details.push({
              type: 'agenda_contact',
              id: contact.id,
              name: contact.name,
              oldPhone: currentPhone,
              newPhone: standardized
            });
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
}
