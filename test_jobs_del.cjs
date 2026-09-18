require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: d1 } = await s.from('oneoffjobs').insert({
       admin_id: '698dfcdd-7c91-4df5-aaee-eae9e67f15ae',
       employee_id: '698dfcdd-7c91-4df5-aaee-eae9e67f15ae',
       title: 'system_route_order_3',
       client_name: 'system_route_order_3',
       client_phone: '00000000000',
       description: '[]',
       price: 0,
       date: '2026-09-17',
       status: 'cancelado'
  }).select();
  console.log("Inserted:", d1 ? d1[0].id : null);
  
  setTimeout(async () => {
    const { data: d2 } = await s.from('oneoffjobs').select('id');
    console.log("Found after 2s:", d2);
  }, 2000);
}
run();
