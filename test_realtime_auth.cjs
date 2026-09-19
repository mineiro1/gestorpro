require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("Checking anon client connection to realtime...");
  const channel = s.channel('test-anon')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, (payload) => {
      console.log("ANON RECEIVED:", payload.eventType);
    })
    .subscribe((status, err) => {
      console.log("Anon status:", status, err);
    });

  await new Promise(r => setTimeout(r, 4000));
  
  // Now with admin client trigger an update
  const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: visits } = await admin.from('visits').select('id, admin_id, notes').limit(1);
  await admin.from('visits').update({ notes: 'test anon ' + Date.now() }).eq('id', visits[0].id);

  await new Promise(r => setTimeout(r, 4000));
  process.exit(0);
}
run();
