require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: clients } = await s.from('clients').select('id, name');
  const targetClients = clients.filter(c => c.name.toLowerCase().includes('amor') || c.name.toLowerCase().includes('teste'));
  console.log("Target Clients:", targetClients);
  
  if (targetClients.length > 0) {
      const clientIds = targetClients.map(c => c.id);
      const { data: sessions, error } = await s.from('chat_sessions').select('*').in('client_id', clientIds);
      console.log("Sessions:", sessions);
  }
}
run();
