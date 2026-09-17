const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const s = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);
s.channel('test')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, payload => {
     console.log(payload);
  })
  .subscribe((status, err) => {
    console.log("Subscribed:", status, err);
    process.exit(0);
  });
