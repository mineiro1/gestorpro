const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function addCol() {
  const { error } = await supabase.rpc('execute_sql', {
    sql_query: "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fcm_token text;"
  });
  if (error) {
    console.log("RPC failed, trying raw query...", error.message);
  } else {
    console.log("fcm_token added");
  }
}
addCol();
