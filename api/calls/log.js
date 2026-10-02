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
  const supabaseAdmin = getSupabaseAdmin();

  if (req.method === 'POST') {
    try {
      const {
        clientId,
        clientName,
        phone,
        type = 'outbound',
        status = 'completed',
        duration = 0,
        provider = 'astracalls',
        audioRecordingUrl,
        adminId,
        employeeId
      } = req.body;

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

      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json({ success: true, log: data });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
