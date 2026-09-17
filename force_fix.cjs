const fs = require('fs');

let content = fs.readFileSync('src/components/ChatModal.tsx', 'utf8');
const search = `      let { data: sessions, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('client_id', client.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      let currentSession = null;
      if (sessions && sessions.length > 0) {
        currentSession = sessions[0];
      } else {
        // Create new session if none exists`;

// The actual file might have different spaces
content = content.replace(/let \{ data: sessions, error \} = await supabase[\s\S]*?\/\/ Create new session if none exists/m, `      let { data: sessions, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('client_id', client.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      let currentSession = null;
      let validSession = null;

      if (sessions && sessions.length > 0) {
        currentSession = sessions[0];
        
        // Verificação de expiração local
        if (currentSession.closed_at) {
           const closedTime = new Date(currentSession.closed_at).getTime();
           const now = new Date().getTime();
           if (now - closedTime > 30 * 60 * 1000) {
              // Expirou! Fecha e não usa
              await supabase.from('chat_sessions').update({ status: 'closed' }).eq('id', currentSession.id);
              currentSession.status = 'closed';
              validSession = null;
           } else {
              validSession = currentSession;
           }
        } else {
           validSession = currentSession;
        }
      }

      if (validSession) {
        currentSession = validSession;
      } else if (visit && !visit.isCompleted && visit.status !== 'finalizada') {
        // Create new session if none exists AND visit is not finalized`);

fs.writeFileSync('src/components/ChatModal.tsx', content);
console.log("Forced chat modal fix");
