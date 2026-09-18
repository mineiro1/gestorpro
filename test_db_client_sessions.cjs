require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await s.from('chat_sessions').select('*').eq('client_id', '3afa3352-9e59-4ba5-9665-c4d927fdd0ef').eq('status', 'open');
  console.log("Open sessions for client:", data);
}
run();
