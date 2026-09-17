require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: clients } = await s.from('clients').select('id, name');
  const teste = clients.find(c => c.name.toLowerCase().includes('teste'));
  if (teste) {
      console.log("Cliente Teste found:", teste.id);
      const { data: visits } = await s.from('visits').select('*').eq('client_id', teste.id).eq('status', 'finalizada');
      console.log("Finalizada visits for Teste:", visits.length);
      if (visits.length === 0) {
          const { data: agendadas } = await s.from('visits').select('*').eq('client_id', teste.id).eq('status', 'agendada').limit(1);
          if (agendadas.length > 0) {
              await s.from('visits').update({
                  status: 'finalizada',
                  time: '2026-09-17',
                  observation: 'Concluído por correção do sistema.'
              }).eq('id', agendadas[0].id);
              console.log("Updated Cliente Teste visit to finalizada.");
          }
      }
  }
}
run();
