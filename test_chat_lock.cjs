require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Iniciando Teste Automatizado de Trava do Chat...");
  
  // 1. Setup
  const routeDate = '2026-09-17';
  const { data: clients } = await s.from('clients').select('id, name');
  const testeId = clients.find(c => c.name.toLowerCase().includes('teste'))?.id;

  if (!testeId) {
      console.log("❌ Cliente Teste não encontrado.");
      return;
  }
  console.log(`✅ Cliente Teste encontrado.`);

  // 2. Garantir que tem uma visita finalizada hoje e NENHUMA agendada
  await s.from('visits').delete().eq('client_id', testeId).eq('status', 'agendada');
  const { data: checkFinal } = await s.from('visits').select('*').eq('client_id', testeId).eq('status', 'finalizada').limit(1);
  if (checkFinal && checkFinal.length > 0) {
      console.log("✅ Visita FINALIZADA confirmada no banco de dados.");
  } else {
      console.log("❌ Falha na base: Visita finalizada sumiu.");
      return;
  }

  // 3. Simular o clique no botão de chat (usando a exata query corrigida do frontend)
  const { data: existingVisit } = await s.from('visits')
    .select('id, status')
    .eq('client_id', testeId)
    .or(`date.like.${routeDate}%,time.eq.${routeDate}`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (existingVisit && existingVisit.length > 0) {
      console.log(`🔍 Simulação do sistema detectou a visita: Status [${existingVisit[0].status.toUpperCase()}]`);
      if (existingVisit[0].status === 'finalizada') {
          console.log("🎯 RESULTADO: SUCESSO!");
          console.log("O sistema reconheceu que a visita de hoje já está concluída.");
          console.log("Ação do Frontend: O chat será bloqueado (travado) e nenhuma nova visita será duplicada.");
      } else {
          console.log("❌ RESULTADO: FALHA (Status incorreto).");
      }
  } else {
      console.log("❌ RESULTADO: FALHA!");
      console.log("A query não achou a visita finalizada e criaria uma 'fantasma'.");
  }
}
run();
