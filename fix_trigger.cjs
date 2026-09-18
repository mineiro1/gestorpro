require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const sql = `
    CREATE OR REPLACE FUNCTION check_chat_session_status()
    RETURNS TRIGGER AS $$
    DECLARE
      session_state text;
      session_created timestamptz;
    BEGIN
      SELECT status, created_at INTO session_state, session_created 
      FROM chat_sessions 
      WHERE id = NEW.session_id;

      IF session_state != 'open' THEN
        RAISE EXCEPTION 'Bloqueio de Segurança: A sessão não está ativa.';
      END IF;

      IF EXTRACT(EPOCH FROM (NOW() - session_created)) > 1800 THEN
        UPDATE chat_sessions SET status = 'closed', closed_at = NOW() WHERE id = NEW.session_id;
        RAISE EXCEPTION 'Bloqueio de Segurança: A sessão expirou (mais de 30 minutos).';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;
}
run();
