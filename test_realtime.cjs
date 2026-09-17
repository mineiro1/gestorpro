require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("Subscribing to visits...");
  const channel = s.channel('test-visits')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, (payload) => {
      console.log("RECEIVED PAYLOAD:", payload);
    })
    .subscribe(async (status) => {
      console.log("Status:", status);
      if (status === 'SUBSCRIBED') {
         // Insert a fake visit
         console.log("Inserting fake visit...");
         const { data, error } = await s.from('visits').insert({
            admin_id: '698dfcdd-7c91-4df5-aaee-eae9e67f15ae',
            client_id: 'd5882472-0bdc-4ccd-8563-ecd47b89da04',
            employee_id: '698dfcdd-7c91-4df5-aaee-eae9e67f15ae',
            date: '2020-01-01',
            status: 'agendada'
         }).select().single();
         console.log("Inserted:", data, error);
         
         setTimeout(async () => {
             // Delete the fake visit
             if (data) await s.from('visits').delete().eq('id', data.id);
             console.log("Deleted");
             process.exit(0);
         }, 3000);
      }
    });
}
run();
