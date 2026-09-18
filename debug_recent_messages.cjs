require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: msgs } = await s.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(3);
  console.log("Recent messages:", msgs);
  if (msgs && msgs.length > 0) {
      const { data: sess } = await s.from('chat_sessions').select('*').eq('id', msgs[0].session_id).single();
      console.log("Session for most recent msg:", sess);
  }
}
run();
