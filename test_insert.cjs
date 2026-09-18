require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await s.from('chat_messages').insert({
    session_id: 'afdf0727-37b5-4177-82c7-220976ad927a', // A closed session
    sender_type: 'client',
    content: 'Teste final com o trigger novo',
    media_url: ''
  });
  console.log("Insert result (closed session):", error ? error.message : "Success");
}
run();
