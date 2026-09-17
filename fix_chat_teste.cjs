require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { error } = await s.from('chat_sessions')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('client_id', '804c35fc-53e5-400a-8795-8eb9fd7ad69b')
    .eq('status', 'open');
  console.log("Closed open chats for Cliente Teste, error:", error);
}
run();
