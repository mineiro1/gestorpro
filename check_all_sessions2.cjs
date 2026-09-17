require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: sessions, error } = await s.from('chat_sessions').select('*');
  console.log("All Sessions count:", sessions ? sessions.length : 0, error);
  if (sessions && sessions.length > 0) {
      console.log("Sample session:", sessions[0]);
  }
}
run();
