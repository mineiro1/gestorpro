require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await s.from('chat_sessions').select('*').eq('id', '5784cde3-73d0-4001-a90d-0fee6281f44d').single();
  console.log(data);
}
run();
