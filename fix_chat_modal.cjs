const fs = require('fs');

let content = fs.readFileSync('src/components/ChatModal.tsx', 'utf8');

const targetQuery = `      let { data: sessions, error } = await supabase
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

const replacement = `      let { data: sessions, error } = await supabase
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
      } else if (visit && visit.status !== 'finalizada') {
        // Create new session if none exists AND visit is not finalized
        const adminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
        
        const { data: newSession, error: createError } = await supabase
          .from('chat_sessions')
          .insert({
            visit_id: visit ? visit.id : null,
            admin_id: adminId,
            client_id: client.id,
            employee_id: userProfile?.uid,
            status: 'open'
          }).select().single();
          
        if (!createError && newSession) {
          currentSession = newSession;
        }
      } else {
        // Chat bloqueado pois a visita foi finalizada há mais de 30 mins, ou não há visita válida.
        // Apenas criamos uma "sessão fantasma" para ler o histórico, ou forçamos o status closed.
        currentSession = currentSession || { status: 'closed' };
      }`;

content = content.replace(targetQuery, replacement);

fs.writeFileSync('src/components/ChatModal.tsx', content);
console.log("ChatModal lock fixed");
