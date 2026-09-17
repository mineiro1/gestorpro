require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: visits } = await s.from('visits').select('*, clients(name)').eq('status', 'finalizada').order('created_at', { ascending: false }).limit(5);
  console.log("Recent FINALIZADA visits:", JSON.stringify(visits, null, 2));
}
run();
