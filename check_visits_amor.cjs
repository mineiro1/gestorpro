require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: clients } = await s.from('clients').select('id, name');
  const amor = clients.find(c => c.name.toLowerCase().includes('amor'));
  
  if (amor) {
      const { data: visits } = await s.from('visits').select('*').eq('client_id', amor.id).order('created_at', { ascending: false }).limit(5);
      console.log("Recent visits for Amor:", visits);
  }
}
run();
