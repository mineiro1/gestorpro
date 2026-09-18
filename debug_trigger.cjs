require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: msgs, error: err1 } = await s.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(3);
  if (err1) console.error("Err1", err1);
  console.log("Recent msgs:", msgs);

  if (msgs && msgs.length > 0) {
      const { data: sess, error: err2 } = await s.from('chat_sessions').select('*').eq('id', msgs[0].session_id).single();
      if (err2) console.error("Err2", err2);
      console.log("Session for most recent msg:", sess);
      
      const { data: allSessionsForClient } = await s.from('chat_sessions').select('*').eq('client_id', sess.client_id).order('created_at', { ascending: false });
      console.log("All sessions for this client:", allSessionsForClient);
  }
}
run();
