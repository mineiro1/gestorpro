const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// For WAME
const wameSearch = `      if (!sessions || sessions.length === 0) {
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
      }
      
      // Time lock removed for testing
      // const createdTime = new Date(activeSession.created_at).getTime();
      // const now = new Date().getTime();
      // if (now - createdTime > 30 * 60 * 1000) {
      //    await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
      //    return res.status(200).send("EVENT_RECEIVED");
      // }`;

const wameReplace = `      if (!sessions || sessions.length === 0) {
         // Security: Only receive messages if the employee initiated a session recently
         return res.status(200).send("EVENT_RECEIVED");
      }
      
      let activeSession = sessions[0];
      
      // Security Lock: 30 minutes limit
      const createdTime = new Date(activeSession.created_at).getTime();
      const now = new Date().getTime();
      if (now - createdTime > 30 * 60 * 1000) {
         await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
         return res.status(200).send("EVENT_RECEIVED");
      }`;

if (content.includes(wameSearch)) {
    content = content.replace(wameSearch, wameReplace);
    console.log("Wame patched");
} else {
    // try flexible matching
    console.log("Could not find exact wame block, skipping or needs regex");
}

// For EVOLUTION
const evoSearch = `      if (!sessions || sessions.length === 0) {
         const { data: newSession, error: createErr } = await supabaseAdmin.from('chat_sessions').insert({
             client_id: matchedClient.id,
             admin_id: matchedClient.admin_id,
             employee_id: matchedClient.employee_id || matchedClient.admin_id,
             status: 'open'
         }).select().single();
         if (createErr || !newSession) return res.status(200).send("OK");
         activeSession = newSession;
      } else {
         activeSession = sessions[0];
      }
      
      // Time lock removed for testing
      // const createdTime = new Date(activeSession.created_at).getTime();
      // const now = new Date().getTime();
      // if (now - createdTime > 30 * 60 * 1000) {
      //    await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
      //    return res.status(200).send("OK");
      // }`;

const evoReplace = `      if (!sessions || sessions.length === 0) {
         // Security: Only receive messages if the employee initiated a session recently
         return res.status(200).send("OK");
      }
      
      let activeSession = sessions[0];
      
      // Security Lock: 30 minutes limit
      const createdTime = new Date(activeSession.created_at).getTime();
      const now = new Date().getTime();
      if (now - createdTime > 30 * 60 * 1000) {
         await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
         return res.status(200).send("OK");
      }`;

if (content.includes(evoSearch)) {
    content = content.replace(evoSearch, evoReplace);
    console.log("Evo patched");
} else {
    console.log("Could not find exact evo block");
}

fs.writeFileSync('server.ts', content);
