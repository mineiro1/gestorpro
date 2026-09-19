require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: visits } = await s.from('visits').select('id, admin_id, notes').limit(1);
  const v = visits[0];
  console.log("Visit admin_id:", v.admin_id);

  let received = false;
  const channel = s.channel('test-filter')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'visits', filter: `admin_id=eq.${v.admin_id}` }, (payload) => {
      console.log("RECEIVED FILTERED EVENT:", payload.eventType);
      received = true;
    })
    .subscribe((status) => {
      console.log("Subscription status:", status);
    });

  await new Promise(r => setTimeout(r, 3000));
  await s.from('visits').update({ notes: (v.notes || '') + ' ' }).eq('id', v.id);
  await new Promise(r => setTimeout(r, 4000));
  console.log("Filtered event received?", received);
  process.exit(0);
}
run();
