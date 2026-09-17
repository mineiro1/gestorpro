const fs = require('fs');

let server = fs.readFileSync('server.ts', 'utf8');

// Replace the 30 * 60 * 1000 logic for webhook evolution
const oldEvoLock = `      let activeSession = sessions[0];
      const createdTime = new Date(activeSession.created_at).getTime();
      const now = new Date().getTime();
      if (now - createdTime > 30 * 60 * 1000) {
         await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
         return res.status(200).send("OK");
      }`;

const newEvoLock = `      let activeSession = sessions[0];
      const now = new Date().getTime();
      if (activeSession.closed_at) {
          const closedTime = new Date(activeSession.closed_at).getTime();
          if (now - closedTime > 30 * 60 * 1000) {
              await supabaseAdmin.from('chat_sessions').update({ status: 'closed' }).eq('id', activeSession.id);
              return res.status(200).send("OK");
          }
      }`;
server = server.replace(oldEvoLock, newEvoLock);

// Also replace it for webhook/wame
const oldWameLock = `      let activeSession = sessions[0];
      const createdTime = new Date(activeSession.created_at).getTime();
      const now = new Date().getTime();
      if (now - createdTime > 30 * 60 * 1000) {
         await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
         return res.status(200).send("EVENT_RECEIVED");
      }`;
      
const newWameLock = `      let activeSession = sessions[0];
      const now = new Date().getTime();
      if (activeSession.closed_at) {
          const closedTime = new Date(activeSession.closed_at).getTime();
          if (now - closedTime > 30 * 60 * 1000) {
              await supabaseAdmin.from('chat_sessions').update({ status: 'closed' }).eq('id', activeSession.id);
              return res.status(200).send("EVENT_RECEIVED");
          }
      }`;
server = server.replace(oldWameLock, newWameLock);

fs.writeFileSync('server.ts', server);
console.log("Server webhook lock fixed");
