require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const routeDate = '2026-09-17';
  const testeId = '804c35fc-53e5-400a-8795-8eb9fd7ad69b';
  
  const { data: test1, error: e1 } = await s.from('visits')
    .select('id')
    .eq('client_id', testeId)
    .gte('date', `${routeDate}T00:00:00.000Z`)
    .lte('date', `${routeDate}T23:59:59.999Z`);
  console.log("Test 1 (gte/lte):", test1, e1);
    
  const { data: test2, error: e2 } = await s.from('visits')
    .select('id')
    .eq('client_id', testeId)
    .eq('time', routeDate);
  console.log("Test 2 (time eq):", test2, e2);
  
  const { data: test3, error: e3 } = await s.from('visits')
    .select('id')
    .eq('client_id', testeId)
    .or(`date.gte.${routeDate}T00:00:00.000Z,time.eq.${routeDate}`);
  console.log("Test 3 (or gte):", test3, e3);
}
run();
