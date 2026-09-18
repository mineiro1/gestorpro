require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error, count } = await s.from('oneoffjobs').select('id', { count: 'exact' });
  console.log("Total jobs:", count);
}
run();
