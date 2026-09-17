require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: clients } = await s.from('clients').select('id, name');
  const amorTeste = clients.filter(c => c.name.toLowerCase().includes('amor') || c.name.toLowerCase().includes('teste'));
  const ids = amorTeste.map(c => c.id);
  
  const { data: visits } = await s.from('visits').select('*').in('client_id', ids).order('created_at', { ascending: false }).limit(5);
  console.log("Recent visits for Amor/Teste:", visits);
}
run();
