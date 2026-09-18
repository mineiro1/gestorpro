require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Iniciando Teste: O que acontece se o Admin deletar a visita?");
  
  // Setup: Pegar o Cliente Teste
  const routeDate = '2026-09-17';
  const { data: clients } = await s.from('clients').select('id, name');
  const testeId = clients.find(c => c.name.toLowerCase().includes('teste'))?.id;
  if (!testeId) return;

  // 1. Simular o Frontend (O que o frontend faz hoje para ver se tá concluído)
  // No RoutesPage, se a query acha uma visita finalizada, o chat trava. E se a visita sumir?
  const { data: existingVisit } = await s.from('visits')
    .select('id, status')
    .eq('client_id', testeId)
    .or(`time.eq.${routeDate},date.gte.${routeDate}T00:00:00.000Z`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!existingVisit || existingVisit.length === 0) {
      console.log("Sem visita encontrada. Frontend vai mostrar o cliente PENDENTE e liberar o Chat!");
  } else {
      console.log(`Visita encontrada com status: ${existingVisit[0].status}`);
  }

  // 2. Verificar Sessões de Chat Abertas (Se a visita sumiu, o chat permite nova abertura?)
  console.log("Verificando como o banco de dados se comporta em relação aos chats...");
}
run();
