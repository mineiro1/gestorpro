require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await s.from('oneoffjobs').select('*').like('client_name', 'system_route_order_%');
  console.log("System Route Orders:");
  console.table(data.map(d => ({
     id: d.id.substring(0, 5),
     name: d.client_name,
     admin: d.admin_id.substring(0,5),
     emp: d.employee_id.substring(0,5),
     desc: d.description ? d.description.substring(0, 30) + '...' : ''
  })));
}
run();
