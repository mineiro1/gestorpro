require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const routeDate = '2026-09-17';
  const testeId = '804c35fc-53e5-400a-8795-8eb9fd7ad69b'; // Teste
  
  const { data: existingVisit } = await s.from('visits')
    .select('id, status')
    .eq('client_id', testeId)
    .or(`time.eq.${routeDate},date.gte.${routeDate}T00:00:00.000Z`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (existingVisit && existingVisit.length > 0) {
      console.log(`Simulação do sistema detectou a visita: Status [${existingVisit[0].status.toUpperCase()}]`);
      if (existingVisit[0].status === 'finalizada') {
          console.log("🎯 RESULTADO: SUCESSO! O chat será bloqueado.");
      } else {
          console.log("❌ RESULTADO: FALHA (Status incorreto).");
      }
  } else {
      console.log("❌ RESULTADO: FALHA! Visita fantasma seria gerada.");
  }
}
run();
