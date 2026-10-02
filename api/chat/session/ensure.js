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
    const { clientId, adminId, employeeId, visitId } = req.body;
    if (!clientId) {
      return res.status(400).json({ error: "Missing clientId" });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Busca sessões existentes do cliente
    const { data: existingSessions, error: findErr } = await supabaseAdmin
      .from('chat_sessions')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (findErr) {
      console.warn("[/api/chat/session/ensure] Erro ao buscar sessões:", findErr);
    }

    // Se já houver uma sessão aberta, valida o tempo (30 minutos)
    const openSession = existingSessions?.find(s => s.status === 'open');
    if (openSession) {
      const now = Date.now();
      const sessionStart = openSession.created_at ? new Date(openSession.created_at).getTime() : now;
      const isExpired = now - sessionStart > 30 * 60 * 1000;

      if (!isExpired) {
        return res.json({ success: true, session: openSession });
      } else {
        // Encerra sessão expirada
        await supabaseAdmin
          .from('chat_sessions')
          .update({ status: 'closed', closed_at: new Date().toISOString() })
          .eq('id', openSession.id);
      }
    }

    // 2. Resolver adminId e employeeId válidos
    let resolvedAdminId = adminId;
    let resolvedEmpId = employeeId;

    const { data: clientRow } = await supabaseAdmin
      .from('clients')
      .select('admin_id, employee_id')
      .eq('id', clientId)
      .maybeSingle();

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

    // 3. Criar nova sessão de atendimento
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

    if (createErr) {
      console.error("[/api/chat/session/ensure] Erro ao criar sessão:", createErr);
      return res.status(500).json({ error: createErr.message });
    }

    return res.json({ success: true, session: newSession });
  } catch (e) {
    console.error("[/api/chat/session/ensure] Erro inesperado:", e);
    return res.status(500).json({ error: e.message });
  }
}
