require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await s.from('chat_sessions').select('closed_at').limit(1);
  console.log("Data:", data, "Error:", error);
}
run();
