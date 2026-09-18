require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await s.from('chat_sessions').insert({
    admin_id: '698dfcdd-7c91-4df5-aaee-eae9e67f15ae',
    client_id: 'f1e48b7c-a410-43a4-bdb9-ffc70dbd33e8',
    employee_id: '698dfcdd-7c91-4df5-aaee-eae9e67f15ae',
    status: 'open'
  }).select();
  console.log("Direct DB Insert session:", error ? error : data);
}
run();
