require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const vIds = [
    'ae4172b2-c0f0-4ead-9d32-7958455df772',
    '8e403ef7-5c62-4d48-96c6-8d5829fb8545',
    '6dd7b646-6b6c-4b16-a00d-592295cf6e92',
    '53b70976-49b2-4324-b671-47aa241b10e3'
  ];
  const { error } = await s.from('visits').delete().in('id', vIds);
  console.log("Deleted specific orphans, error:", error);
}
run();
