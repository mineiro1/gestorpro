import re

with open('src/components/ChatModal.tsx', 'r') as f:
    content = f.read()

old_query = """      let { data: sessions, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false });

      let currentSession = null;
      if (sessions && sessions.length > 0) {
        currentSession = sessions[0];
        
        // Auto close if older than 30 mins and still open
        // if (currentSession.status === 'open') {
        //   const createdTime = new Date(currentSession.created_at).getTime();
        //   const now = new Date().getTime();
        //   if (now - createdTime > 30 * 60 * 1000) {
        //      await supabase.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', currentSession.id);
        //      currentSession.status = 'closed';
        //   }
        // }
      } else {
        // Create new session if none exists"""

new_query = """      let { data: sessions, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('client_id', client.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      let currentSession = null;
      if (sessions && sessions.length > 0) {
        currentSession = sessions[0];
      } else {
        // Create new session if none exists"""

content = content.replace(old_query, new_query)

with open('src/components/ChatModal.tsx', 'w') as f:
    f.write(content)
