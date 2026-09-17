require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: chats } = await s.from('chat_sessions').select('*').eq('client_id', 'b508179e-af21-47fc-8203-b4cd34f3335b');
  console.log("Chat sessions for Amor:", chats);
}
run();
