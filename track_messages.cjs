require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: msgs } = await s.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(5);
  console.table(msgs.map(m => ({ 
      id: m.id.substring(0, 8) + '...', 
      content: m.content, 
      sender: m.sender_type,
      created: m.created_at,
      session: m.session_id.substring(0, 8) + '...'
  })));
}
run();
