import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('clients').select('id').limit(1);
  if (error) console.log(error);
  else console.log(typeof data[0]?.id, data[0]?.id);
}
run();
