require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: v } = await admin.from('visits').select('id, admin_id').limit(1);
  const visit = v[0];
  console.log("Testing visit id:", visit.id, "admin_id:", visit.admin_id);

  let updateReceivedWithFilter = false;

  const channel = s.channel('test-rep-' + Date.now())
    .on('postgres_changes', { 
       event: 'UPDATE', 
       schema: 'public', 
       table: 'visits', 
       filter: `admin_id=eq.${visit.admin_id}` 
    }, (payload) => {
       console.log("FILTERED UPDATE RECEIVED!", payload);
       updateReceivedWithFilter = true;
    })
    .subscribe((status) => {
       console.log("Status:", status);
    });

  await new Promise(r => setTimeout(r, 3000));

  // Perform UPDATE without modifying admin_id
  console.log("Updating status to 'finalizada' without touching admin_id...");
  await admin.from('visits').update({ status: 'finalizada' }).eq('id', visit.id);

  await new Promise(r => setTimeout(r, 4000));
  console.log("Did filter catch UPDATE where admin_id wasn't in the update payload?", updateReceivedWithFilter);
  process.exit(0);
}
run();
