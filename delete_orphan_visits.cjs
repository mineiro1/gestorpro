require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: clients } = await s.from('clients').select('id, name');
  const amorTeste = clients.filter(c => c.name.toLowerCase().includes('amor') || c.name.toLowerCase().includes('teste'));
  const ids = amorTeste.map(c => c.id);
  
  // Find all agendada visits created today (they have time = null and date = '2026-09-17T00:00:00+00:00')
  const { data: visits } = await s.from('visits')
      .select('id')
      .in('client_id', ids)
      .eq('status', 'agendada')
      .like('date', '2026-09-17%');
      
  console.log("Found orphan visits:", visits);
  if (visits && visits.length > 0) {
      const vIds = visits.map(v => v.id);
      const { error } = await s.from('visits').delete().in('id', vIds);
      console.log("Deleted orphans, error:", error);
  }
}
run();
