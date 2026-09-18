require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await s.from('chat_messages').insert({
    session_id: '4b33ab66-d44f-4118-b033-b21f979b66b9',
    sender_type: 'client',
    content: 'Teste de bloqueio do SQL',
    media_url: ''
  });
  console.log("Insert result:", error ? error.message : "Success");
}
run();
