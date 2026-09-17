require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await s.rpc('exec_sql', { sql: `
    SELECT * FROM pg_stat_activity WHERE state = 'active';
  ` });
  console.log("Active queries:", data ? data.length : 0);
}
run();
