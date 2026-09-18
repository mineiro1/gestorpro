require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const sql = `
    CREATE OR REPLACE FUNCTION prevent_client_session_creation()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Se a sessão for criada sem um funcionário (employee_id) OU admin_id que iniciou
      -- Isso garante que apenas os usuários autenticados do painel podem criar.
      -- O webhook nunca cria sessões, mas se tentasse, não teria um employee_id associado da mesma forma que o app tem.
      IF NEW.employee_id IS NULL AND NEW.admin_id IS NULL THEN
        RAISE EXCEPTION 'Bloqueio de Segurança: Apenas a plataforma/colaborador pode iniciar um chat.';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS block_client_session_creation ON chat_sessions;

    CREATE TRIGGER block_client_session_creation
    BEFORE INSERT ON chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION prevent_client_session_creation();
  `;
}
run();
