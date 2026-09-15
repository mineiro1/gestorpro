with open('src/components/ChatModal.tsx', 'r') as f:
    content = f.read()

import re

# Fix loadOrCreateSession
old_load = """      let { data: sessions, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('visit_id', visit.id)
        .order('created_at', { ascending: false });

      let currentSession = null;
      if (sessions && sessions.length > 0) {
        currentSession = sessions[0];
        
        // Auto close if older than 30 mins and still open
        if (currentSession.status === 'open') {
          const createdTime = new Date(currentSession.created_at).getTime();
          const now = new Date().getTime();
          if (now - createdTime > 30 * 60 * 1000) {
             await supabase.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', currentSession.id);
             currentSession.status = 'closed';
          }
        }
      } else {
        // Create new session if none exists
        const adminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
        
        const { data: newSession, error: createError } = await supabase
          .from('chat_sessions')
          .insert({
            visit_id: visit.id,
            admin_id: adminId,
            client_id: client.id,
            employee_id: userProfile?.uid,
            status: 'open'
          }).select().single();
              
        console.log("CREATE SESSION RESULT:", newSession, "ERROR:", createError, "PARAMS:", { visit_id: visit.id, admin_id: adminId, client_id: client.id, employee_id: userProfile?.uid });

              
        if (!createError && newSession) {
          currentSession = newSession;
        }
      }"""

new_load = """      let { data: sessions, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false });

      let currentSession = null;
      if (sessions && sessions.length > 0) {
        currentSession = sessions[0];
        
        if (currentSession.status === 'open') {
          const createdTime = new Date(currentSession.created_at).getTime();
          const now = new Date().getTime();
          if (now - createdTime > 30 * 60 * 1000) {
             await supabase.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', currentSession.id);
             currentSession.status = 'closed';
          }
        }
      }

      if (!currentSession || currentSession.status === 'closed') {
        const adminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
        const { data: newSession, error: createError } = await supabase
          .from('chat_sessions')
          .insert({
            visit_id: visit.id,
            admin_id: adminId,
            client_id: client.id,
            employee_id: userProfile?.uid,
            status: 'open'
          }).select().single();
              
        if (!createError && newSession) {
          currentSession = newSession;
        }
      }"""

content = content.replace(old_load, new_load)

old_load_msg = """  const loadMessages = async (sessionId: string) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  };"""

new_load_msg = """  const loadMessages = async (sessionId: string) => {
    // Carregar histórico de TODAS as sessões do cliente, para não perder mensagens
    const { data: allSessions } = await supabase.from('chat_sessions').select('id').eq('client_id', client.id);
    if (allSessions && allSessions.length > 0) {
       const sessionIds = allSessions.map(s => s.id);
       const { data } = await supabase
         .from('chat_messages')
         .select('*')
         .in('session_id', sessionIds)
         .order('created_at', { ascending: true });
       if (data) setMessages(data);
    }
  };"""

content = content.replace(old_load_msg, new_load_msg)

with open('src/components/ChatModal.tsx', 'w') as f:
    f.write(content)
