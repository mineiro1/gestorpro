require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: visits } = await s.from('visits').select('*').eq('client_id', 'f1e48b7c-a410-43a4-bdb9-ffc70dbd33e8').order('date', { ascending: false }).limit(2);
  console.log("Visits for client f1e48b7c-a410-43a4-bdb9-ffc70dbd33e8:");
  console.table(visits);
}
run();
