require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("Subscribing...");
  
  const p = new Promise((resolve) => {
      s.channel('test-update')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'visits' }, (payload) => {
          console.log("RECEIVED UPDATE PAYLOAD:", payload);
          resolve();
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
             // We will update a visit that exists, let's find one first
             const { data: v } = await s.from('visits').select('*').limit(1);
             if (v && v.length > 0) {
                 console.log("Updating visit id:", v[0].id);
                 await s.from('visits').update({ notes: 'Test update ' + Date.now() }).eq('id', v[0].id);
             }
          }
        });
  });
  
  await p;
  console.log("Done");
  process.exit(0);
}
run();
