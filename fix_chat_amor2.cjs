require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { error } = await s.from('chat_sessions')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('client_id', 'b508179e-af21-47fc-8203-b4cd34f3335b')
    .eq('status', 'open');
  console.log("Closed open chats for Amor, error:", error);
}
run();
