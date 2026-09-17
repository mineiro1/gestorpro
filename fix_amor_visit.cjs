require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const adminId = '698dfcdd-7c91-4df5-aaee-eae9e67f15ae';
  const clientId = 'b508179e-af21-47fc-8203-b4cd34f3335b'; // Amor
  
  // Find an agendada visit
  const { data: visits } = await s.from('visits').select('*').eq('client_id', clientId).eq('status', 'agendada').limit(1);
  
  if (visits && visits.length > 0) {
    const v = visits[0];
    const { error } = await s.from('visits').update({
      status: 'finalizada',
      time: '2026-09-17',
      observation: 'Concluído por correção do sistema.'
    }).eq('id', v.id);
    console.log("Updated visit to finalizada, error:", error);
  } else {
    console.log("No agendada visit found to complete.");
  }
}
run();
