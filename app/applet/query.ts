import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!);

async function main() {
  // try postgres query directly... we can't without pg connect, but we can guess.
  const statuses = ['retorno', 'needs_return', 'atrasado', 'agendado', 'agendada'];
  for (const s of statuses) {
     const { data: d2, error: e2 } = await supabase.from('oneoffjobs').insert({
         admin_id: '698dfcdd-7c91-4df5-aaee-eae9e67f15ae',
         title: 'test',
         date: '2025-01-01',
         price: 0,
         status: s
     });
     console.log("Trying", s, "-> Passed?", !e2);
  }
}

main();
