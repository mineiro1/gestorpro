require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: sess } = await s.from('chat_sessions').select('*').order('created_at', { ascending: false }).limit(5);
  console.log("Most recent sessions in the database:");
  console.table(sess.map(s => ({ 
      id: s.id.substring(0, 8) + '...', 
      status: s.status, 
      created: s.created_at, 
      closed: s.closed_at,
      admin: s.admin_id.substring(0, 8) + '...',
      client: s.client_id.substring(0, 8) + '...',
      employee: s.employee_id ? s.employee_id.substring(0, 8) + '...' : 'none'
  })));
}
run();
