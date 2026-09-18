require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await s.from('oneoffjobs').select('client_name').like('client_name', 'system_route_order_%');
  console.log("Names in DB:", data);
}
run();
