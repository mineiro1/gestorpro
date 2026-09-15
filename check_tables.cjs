require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data } = await supabase.rpc('get_tables_info'); // if exists, else we can query pg_tables
  
  const { data: tables } = await supabase.from('clients').select('id').limit(1);
  console.log("Clients OK?", !!tables);
}
run();
