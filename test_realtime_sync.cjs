require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("Subscribing to visits...");
  
  const p = new Promise((resolve) => {
      const channel = s.channel('test-visits')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, (payload) => {
          console.log("RECEIVED PAYLOAD:", payload);
          resolve();
        })
        .subscribe(async (status) => {
          console.log("Status:", status);
          if (status === 'SUBSCRIBED') {
             // Insert a fake visit
             console.log("Inserting fake visit...");
             const { data, error } = await s.from('visits').insert({
                admin_id: '698dfcdd-7c91-4df5-aaee-eae9e67f15ae',
                client_id: '698dfcdd-7c91-4df5-aaee-eae9e67f15ae', // must be valid uuid
                employee_id: '698dfcdd-7c91-4df5-aaee-eae9e67f15ae',
                date: '2020-01-01',
                status: 'agendada'
             }).select();
             console.log("Inserted:", data, error);
             
             if (data && data.length > 0) {
                 setTimeout(async () => {
                     console.log("Updating...");
                     await s.from('visits').update({ status: 'finalizada' }).eq('id', data[0].id);
                 }, 1000);
             } else {
                 resolve();
             }
          }
        });
  });
  
  await p;
  console.log("Done");
  process.exit(0);
}
run();
