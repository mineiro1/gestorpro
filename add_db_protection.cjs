require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // We can't easily alter RLS to check another table without a function, 
  // but we can create a trigger!
  const sql = `
    CREATE OR REPLACE FUNCTION check_chat_session_validity()
    RETURNS TRIGGER AS $$
    DECLARE
      session_created_at TIMESTAMPTZ;
      session_status TEXT;
    BEGIN
      SELECT created_at, status INTO session_created_at, session_status 
      FROM chat_sessions 
      WHERE id = NEW.session_id;

      IF session_status = 'closed' THEN
        RAISE EXCEPTION 'Cannot insert message into a closed session';
      END IF;

      IF EXTRACT(EPOCH FROM (NOW() - session_created_at)) > 1800 THEN
        -- Auto close it
        UPDATE chat_sessions SET status = 'closed', closed_at = NOW() WHERE id = NEW.session_id;
        RAISE EXCEPTION 'Session expired. Cannot insert message.';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS enforce_chat_session_validity ON chat_messages;
    
    CREATE TRIGGER enforce_chat_session_validity
    BEFORE INSERT ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION check_chat_session_validity();
  `;
  // We can't run raw SQL easily without rpc('exec_sql') which might not exist.
  // But wait, there is a cloudsql-execute-sql skill! Oh wait, this is Supabase PostgreSQL, not Cloud SQL.
  // We can't run raw SQL on Supabase from the js client unless there's a function for it.
  
  // Wait, what if I close the sessions manually?
  const { data: openSessions } = await supabaseAdmin.from('chat_sessions').select('*').eq('status', 'open');
  if (openSessions) {
      for (const s of openSessions) {
          const createdTime = new Date(s.created_at).getTime();
          const now = new Date().getTime();
          if (now - createdTime > 30 * 60 * 1000) {
              await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', s.id);
              console.log("Manually closed expired session:", s.id);
          }
      }
  }
}
run();
