with open('server.ts', 'r') as f:
    content = f.read()

old_query = "const { data: clients, error: clientsErr } = await supabaseAdmin.from('clients').select('id, phone, local_phone');"
new_query = "const { data: clients, error: clientsErr } = await supabaseAdmin.from('clients').select('id, phone, local_phone, admin_id, employee_id');"

content = content.replace(old_query, new_query)

old_session = """      const { data: sessions, error: sessionsErr } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('client_id', matchedClient.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
        
      if (!sessions || sessions.length === 0) return res.status(200).send("EVENT_RECEIVED");
      
      const activeSession = sessions[0];"""

new_session = """      const { data: sessions, error: sessionsErr } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('client_id', matchedClient.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
        
      let activeSession = null;
      
      if (!sessions || sessions.length === 0) {
         // Create a new session so the message is not lost!
         const { data: newSession, error: createErr } = await supabaseAdmin.from('chat_sessions').insert({
             client_id: matchedClient.id,
             admin_id: matchedClient.admin_id,
             employee_id: matchedClient.employee_id || matchedClient.admin_id,
             status: 'open'
         }).select().single();
         if (createErr || !newSession) return res.status(200).send("EVENT_RECEIVED");
         activeSession = newSession;
      } else {
         activeSession = sessions[0];
      }"""

content = content.replace(old_session, new_session)

with open('server.ts', 'w') as f:
    f.write(content)
