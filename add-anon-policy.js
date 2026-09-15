import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { error: e1 } = await supabase.rpc('exec_sql', { sql: `
    create policy "Allow anon inserts for backend" on chat_messages for insert to anon with check (true);
    create policy "Allow anon selects for backend" on clients for select to anon using (true);
    create policy "Allow anon selects for backend" on chat_sessions for select to anon using (true);
    create policy "Allow anon updates for backend" on chat_sessions for update to anon using (true) with check (true);
  `});
  console.log("Result:", e1);
}
run();
