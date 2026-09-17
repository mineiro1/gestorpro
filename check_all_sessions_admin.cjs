require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: sessions, error } = await s.from('chat_sessions').select('*');
  console.log("All Sessions count:", sessions ? sessions.length : 0, error);
  if (sessions && sessions.length > 0) {
      console.log("Open sessions count:", sessions.filter(s => s.status === 'open').length);
      console.log("Sessions for Amor or Teste:");
      const { data: clients } = await s.from('clients').select('id, name');
      const amorTeste = clients.filter(c => c.name.toLowerCase().includes('amor') || c.name.toLowerCase().includes('teste'));
      const ids = amorTeste.map(c => c.id);
      const targets = sessions.filter(s => ids.includes(s.client_id));
      console.log(targets);
  }
}
run();
