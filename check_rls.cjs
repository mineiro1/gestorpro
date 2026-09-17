require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await s.from('chat_sessions').update({ status: 'closed' }).eq('id', 'not-exist');
  console.log("Error:", error);
}
run();
