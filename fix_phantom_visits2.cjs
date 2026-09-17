require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const ids = [
    'b508179e-af21-47fc-8203-b4cd34f3335b', // Amor
    '804c35fc-53e5-400a-8795-8eb9fd7ad69b'  // Teste
  ];
  
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
