require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await s.rpc('exec_sql', { sql: 'select 1' });
  console.log("RPC result:", data, error);
}
run();
