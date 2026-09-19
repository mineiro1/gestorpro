require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Connecting to realtime...");
  let received = false;
  
  const channel = s.channel('test-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, (payload) => {
      console.log("RECEIVED EVENT:", payload.eventType, payload.table);
      received = true;
    })
    .subscribe((status) => {
      console.log("Subscription status:", status);
    });

  // wait 3 seconds for subscription to be SUBSCRIBED
  await new Promise(r => setTimeout(r, 3000));

  console.log("Triggering dummy update on visits...");
  // pick one visit
  const { data: visits } = await s.from('visits').select('id, notes').limit(1);
  if (visits && visits.length > 0) {
    const v = visits[0];
    await s.from('visits').update({ notes: (v.notes || '') + ' ' }).eq('id', v.id);
  }

  // wait 4 seconds
  await new Promise(r => setTimeout(r, 4000));
  console.log("Event received?", received);
  process.exit(0);
}
run();
