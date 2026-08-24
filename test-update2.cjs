const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function test() {
  const { data, error } = await supabase.from('users').update({ subscription_status: 'active' }).eq('id', '123e4567-e89b-12d3-a456-426614174000');
  console.log('Data:', data);
  console.log('Error:', error);
}
test();
