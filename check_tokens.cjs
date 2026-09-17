const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);
async function check() {
  const { data, error } = await supabase.from('users').select('name, fcm_token').not('fcm_token', 'is', null);
  console.log("Users with tokens:", data);
  
  // also check if chat_messages realtime is enabled
  const { data: pubs } = await supabase.rpc('execute_sql', { sql_query: "SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';" });
  console.log("Realtime tables:", pubs);
}
check();
