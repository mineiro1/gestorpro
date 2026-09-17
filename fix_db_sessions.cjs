require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: clients } = await s.from('clients').select('id, name');
  const amorTeste = clients.filter(c => c.name.toLowerCase().includes('amor') || c.name.toLowerCase().includes('teste'));
  const ids = amorTeste.map(c => c.id);
  
  const { data: sessions } = await s.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).in('client_id', ids).eq('status', 'open').select();
  console.log("Closed orphan sessions:", sessions ? sessions.length : 0);
}
run();
