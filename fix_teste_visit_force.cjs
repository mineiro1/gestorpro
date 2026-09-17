require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const adminId = '698dfcdd-7c91-4df5-aaee-eae9e67f15ae';
  const testeId = '804c35fc-53e5-400a-8795-8eb9fd7ad69b'; 
  
  const { data: visits } = await s.from('visits').select('*').eq('client_id', testeId).eq('status', 'agendada').limit(1);
  if (visits && visits.length > 0) {
      await s.from('visits').update({
          status: 'finalizada',
          time: '2026-09-17',
          observation: 'Concluído por correção do sistema.'
      }).eq('id', visits[0].id);
      console.log("Forced update Cliente Teste visit to finalizada.");
  } else {
      console.log("No agendada visit found for Cliente Teste. Let's create one finalizada.");
      await s.from('visits').insert({
          admin_id: adminId,
          client_id: testeId,
          employee_id: adminId,
          date: '2026-09-17T00:00:00.000Z',
          time: '2026-09-17',
          status: 'finalizada'
      });
      console.log("Created finalizada visit for Cliente Teste.");
  }
}
run();
