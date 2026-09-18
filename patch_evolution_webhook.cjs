const fs = require('fs');

let layout = fs.readFileSync('server.ts', 'utf8');

const target = `      const now = new Date().getTime();
      const createdTime = new Date(activeSession.created_at).getTime();
      
      // If session is older than 30 minutes, close it and discard message
      if (now - createdTime > 30 * 60 * 1000) {`;

const replacement = `      const now = new Date().getTime();
      const createdTime = new Date(activeSession.created_at).getTime();
      console.log("TIMER CHECK EVOLUTION:", { now, createdTime, diff: now - createdTime, limit: 30 * 60 * 1000 });
      // If session is older than 30 minutes, close it and discard message
      if (now - createdTime > 30 * 60 * 1000) {`;

if (layout.includes(target)) {
    layout = layout.split(target).join(replacement);
    fs.writeFileSync('server.ts', layout);
    console.log("Patched evolution webhook");
} else {
    console.log("Target not found");
}
