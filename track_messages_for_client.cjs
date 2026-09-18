require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: sess } = await s.from('chat_sessions').select('id, status, created_at').eq('client_id', 'f1e48b7c-a410-43a4-bdb9-ffc70dbd33e8').order('created_at', { ascending: false }).limit(3);
  console.log("Sessions for teste2:");
  console.table(sess);
}
run();
