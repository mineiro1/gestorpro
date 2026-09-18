require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: clients } = await s.from('clients').select('id, name');
  const testeId = clients.find(c => c.name.toLowerCase().includes('teste'))?.id;
  
  const { data: v } = await s.from('visits').select('*').eq('client_id', testeId).eq('status', 'finalizada');
  console.log("Visits for Teste:");
  console.log(v);
}
run();
