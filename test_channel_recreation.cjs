require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("Subscribing channel 1...");
  const c1 = s.channel('routes-visits')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => console.log("C1 got event"))
    .subscribe((status) => console.log("C1 status:", status));

  await new Promise(r => setTimeout(r, 2000));

  console.log("Removing channel 1...");
  await s.removeChannel(c1);

  console.log("Subscribing channel 2 with same name 'routes-visits'...");
  let gotEvent = false;
  const c2 = s.channel('routes-visits')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => {
      console.log("C2 GOT EVENT!");
      gotEvent = true;
    })
    .subscribe((status) => console.log("C2 status:", status));

  await new Promise(r => setTimeout(r, 2000));

  const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: v } = await admin.from('visits').select('id').limit(1);
  await admin.from('visits').update({ notes: 'test channel reuse ' + Date.now() }).eq('id', v[0].id);

  await new Promise(r => setTimeout(r, 3000));
  console.log("Did c2 get event?", gotEvent);
  process.exit(0);
}
run();
