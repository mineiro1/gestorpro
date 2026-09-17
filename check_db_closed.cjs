require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data } = await s.from('chat_sessions').select('id, status, created_at, closed_at').order('created_at', { ascending: false }).limit(5);
  console.log(data);
}
run();
