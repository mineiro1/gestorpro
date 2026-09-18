require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: messages } = await s.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(5);
  console.log(messages);
}
run();
