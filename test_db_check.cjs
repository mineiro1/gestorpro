require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await s.from('oneoffjobs').select('id, client_name, date, status').limit(20);
  console.log("Error:", error);
  console.log("Jobs:", data);
}
run();
