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
      let activeSession = sessions[0];`;
      
const replacement = `      let activeSession = sessions && sessions.length > 0 ? sessions[0] : null;
      
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
      }`;

if (layout.includes(target)) {
    layout = layout.replace(target, replacement);
    fs.writeFileSync('server.ts', layout);
    console.log("Success fix 1");
} else {
    // try a more generic replace since the error says let activeSession is declared twice
    let lines = layout.split('\n');
    let fixedLines = [];
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('let activeSession = sessions[0];')) {
            count++;
            if (count > 1) {
                // skip the second declaration
                continue;
            }
        }
        fixedLines.push(lines[i]);
    }
    fs.writeFileSync('server.ts', fixedLines.join('\n'));
    console.log("Success fix 2 (removed duplicate declaration)");
}
