require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const adminId = '698dfcdd-7c91-4df5-aaee-eae9e67f15ae';
  const activeRouteDate = '2026-09-17';
  
  const [year, month, day] = activeRouteDate.split('-').map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);
  const routeDateStartStr = start.toISOString();
  const routeDateEndStr = end.toISOString();
  
  const { data: visitsByTime } = await s.from('visits')
        .select('client_id, status')
        .eq('admin_id', adminId)
        .eq('time', activeRouteDate);
        
  const { data: visitsByDate } = await s.from('visits')
        .select('client_id, status')
        .eq('admin_id', adminId)
        .gte('date', routeDateStartStr)
        .lte('date', routeDateEndStr);
        
  const { data: visitsByCreated } = await s.from('visits')
        .select('client_id, status')
        .eq('admin_id', adminId)
        .gte('created_at', routeDateStartStr)
        .lte('created_at', routeDateEndStr);
        
  const visitsSnap = [...(visitsByTime || []), ...(visitsByDate || []), ...(visitsByCreated || [])];
  
  const completedIds = new Set();
  if (visitsSnap) {
    visitsSnap.forEach(data => {
        if (data.status !== 'agendada') {
           completedIds.add(data.client_id);
        }
    });
  }
  
  console.log("Completed IDs:", Array.from(completedIds));
}
run();
