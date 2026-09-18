require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: msgs } = await s.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(5);
  console.log("Recent msgs:");
  console.table(msgs.map(m => ({ id: m.id, content: m.content, created_at: m.created_at, session_id: m.session_id })));

  if (msgs && msgs.length > 0) {
      const sessionIds = [...new Set(msgs.map(m => m.session_id))];
      const { data: sess } = await s.from('chat_sessions').select('*').in('id', sessionIds);
      console.log("Associated sessions:");
      console.table(sess.map(s => ({ id: s.id, status: s.status, created_at: s.created_at, closed_at: s.closed_at })));
  }
}
run();
