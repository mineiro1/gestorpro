const fs = require('fs');

let layout = fs.readFileSync('server.ts', 'utf8');

const target = `      let activeSession = sessions && sessions.length > 0 ? sessions[0] : null;
      
      // If no open session exists, create a new one automatically for incoming message
      if (!activeSession) {
          const { data: newSession } = await supabaseAdmin.from('chat_sessions').insert({
              admin_id: matchedClient.admin_id,
              client_id: matchedClient.id,
              employee_id: matchedClient.employee_id || matchedClient.admin_id,
              status: 'open'
          }).select('*').single();
          
          if (newSession) activeSession = newSession;
      }
      
      if (!activeSession) {
         return res.status(200).send("OK");
      }
      
      const now = new Date().getTime();
      if (activeSession.closed_at) {
          const closedTime = new Date(activeSession.closed_at).getTime();
          if (now - closedTime > 30 * 60 * 1000) {
              await supabaseAdmin.from('chat_sessions').update({ status: 'closed' }).eq('id', activeSession.id);
              return res.status(200).send("OK");
          }
      }`;
      
const replacement = `      let activeSession = sessions && sessions.length > 0 ? sessions[0] : null;
      
      if (!activeSession) {
         return res.status(200).send("OK");
      }
      
      const now = new Date().getTime();
      const createdTime = new Date(activeSession.created_at).getTime();
      
      // If session is older than 30 minutes, close it and discard message
      if (now - createdTime > 30 * 60 * 1000) {
          await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
          return res.status(200).send("OK");
      }`;

if (layout.includes(target)) {
    layout = layout.replace(target, replacement);
    fs.writeFileSync('server.ts', layout);
    console.log("Success replacing webhook logic in server.ts");
} else {
    console.log("Target not found");
}
