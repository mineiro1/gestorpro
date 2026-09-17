require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await s.rpc('exec_sql', { sql: `
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'visits' AND column_name = 'date';
  ` });
  console.log("Visits date type:", data);
}
run();
