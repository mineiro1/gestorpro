require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: sess } = await s.from('chat_sessions').select('*').order('created_at', { ascending: false }).limit(2);
  console.log("Specific session:");
  console.table(sess);
}
run();
