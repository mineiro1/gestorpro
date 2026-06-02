import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function main() {
  const { data, error } = await supabase.rpc('get_check_constraints');
  console.log("RPC Error:", error);
  console.log("RPC Data:", data);
  
  // if rpc 'get_check_constraints' doesn't exist, try querying a status that passes
  const statuses = ['pendente', 'em_andamento', 'concluido', 'retorno', 'cancelado', 'Pendente', 'Concluído', 'PENDENTE', 'needs_return'];
  
  for (const s of statuses) {
     const { data: d2, error: e2 } = await supabase.from('oneoffjobs').insert({
         admin_id: '698dfcdd-7c91-4df5-aaee-eae9e67f15ae',
         title: 'test',
         date: '2025-01-01',
         price: 0,
         status: s
     });
     console.log("Trying", s, "-> Error?", !!e2, e2?.message);
  }
}

main();
