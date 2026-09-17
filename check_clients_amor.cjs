require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: clients } = await s.from('clients').select('id, name');
  const matches = clients.filter(c => c.name.toLowerCase().includes('amor'));
  console.log("Clients with amor:", matches);
}
run();
