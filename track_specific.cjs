require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: sess } = await s.from('chat_sessions').select('*').eq('id', 'd9860172-23c2-4a0b-9993-9c8e8ad9c811');
  console.log("Specific session:");
  console.table(sess);
}
run();
