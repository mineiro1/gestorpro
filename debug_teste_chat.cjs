require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: clients } = await s.from('clients').select('id, name');
  const teste = clients.find(c => c.name.toLowerCase().includes('teste'));
  if (!teste) return console.log("Cliente Teste not found.");
  
  console.log(`Cliente Teste ID: ${teste.id}`);
  
  const { data: chats } = await s.from('chat_sessions').select('*').eq('client_id', teste.id).order('created_at', { ascending: false });
  console.log("Chat sessions:");
  console.log(chats.slice(0, 5)); // Last 5
  
  const { data: visits } = await s.from('visits').select('*').eq('client_id', teste.id).order('created_at', { ascending: false });
  console.log("Visits:");
  console.log(visits.slice(0, 5));
}
run();
