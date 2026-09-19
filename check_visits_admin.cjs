require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: visits } = await s.from('visits').select('id, admin_id, employee_id, client_id, status, created_at, date, time').order('created_at', { ascending: false }).limit(10);
  console.table(visits);
}
run();
