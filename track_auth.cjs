require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: clients } = await s.from('clients').select('id, name').eq('id', 'f1e48b7c-a410-43a4-bdb9-ffc70dbd33e8');
  console.log("Client causing issues:");
  console.table(clients);
}
run();
