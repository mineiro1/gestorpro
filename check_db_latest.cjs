require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(3);
  console.log(JSON.stringify(data, null, 2));
}
run();
