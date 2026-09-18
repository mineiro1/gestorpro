require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: sess } = await s.from('chat_sessions').select('*').in('id', ['72ba6494-3b68-4c6f-9bfb-fcd45d71ef1e', '9991997e-be38-40e1-aec8-2e9f685f895a']);
  console.table(sess);
}
run();
