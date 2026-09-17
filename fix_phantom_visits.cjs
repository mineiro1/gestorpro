require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const adminId = '698dfcdd-7c91-4df5-aaee-eae9e67f15ae';
  
  // Find Amor and Teste
  const { data: clients } = await s.from('clients').select('id, name');
  const amor = clients.find(c => c.name.toLowerCase().includes('amor'))?.id;
  const teste = clients.find(c => c.name.toLowerCase().includes('teste'))?.id;
  
  const ids = [amor, teste].filter(Boolean);
  
  // Delete phantom agendada visits
  const { data: phantom } = await s.from('visits').select('id').in('client_id', ids).eq('status', 'agendada');
  if (phantom && phantom.length > 0) {
      console.log(`Found ${phantom.length} phantom visits. Deleting...`);
      const vIds = phantom.map(v => v.id);
      
      // Detach chat sessions first
      await s.from('chat_sessions').update({ visit_id: null }).in('visit_id', vIds);
      
      await s.from('visits').delete().in('id', vIds);
      console.log("Deleted.");
  }
  
  // Close any open chats
  const { data: chats } = await s.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).in('client_id', ids).eq('status', 'open').select('id');
  if (chats && chats.length > 0) {
      console.log(`Closed ${chats.length} open chats.`);
  } else {
      console.log("No open chats found.");
  }
}
run();
