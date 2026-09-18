const fs = require('fs');

let layout = fs.readFileSync('server.ts', 'utf8');

const target = `      let activeSession = sessions[0];
      const now = new Date().getTime();
      if (activeSession.closed_at) {
          const closedTime = new Date(activeSession.closed_at).getTime();
          if (now - closedTime > 30 * 60 * 1000) {
              await supabaseAdmin.from('chat_sessions').update({ status: 'closed' }).eq('id', activeSession.id);
              return res.status(200).send("EVENT_RECEIVED");
          }
      }`;
      
const replacement = `      let activeSession = sessions[0];
      
      const now = new Date().getTime();
      const createdTime = new Date(activeSession.created_at).getTime();
      
      // If session is older than 30 minutes, close it and discard message
      if (now - createdTime > 30 * 60 * 1000) {
          await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
          return res.status(200).send("EVENT_RECEIVED");
      }`;

if (layout.includes(target)) {
    layout = layout.replace(target, replacement);
    fs.writeFileSync('server.ts', layout);
    console.log("Success replacing WAME webhook");
} else {
    console.log("Target not found");
}
