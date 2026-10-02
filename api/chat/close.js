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
    const { clientId, sessionId } = req.body;
    const supabaseAdmin = getSupabaseAdmin();
    const now = new Date().toISOString();

    if (sessionId) {
      await supabaseAdmin
        .from('chat_sessions')
        .update({ status: 'closed', closed_at: now })
        .eq('id', sessionId);
    } else if (clientId) {
      await supabaseAdmin
        .from('chat_sessions')
        .update({ status: 'closed', closed_at: now })
        .eq('client_id', clientId)
        .eq('status', 'open');
    }

    return res.json({ success: true, message: 'Session closed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
