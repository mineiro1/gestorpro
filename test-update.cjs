const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function test() {
  const { data, error } = await supabase.from('users').update({ subscription_status: 'active' }).eq('id', 'non-existent');
  console.log('Data:', data);
  console.log('Error:', error);
}
test();
