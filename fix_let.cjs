const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(/let activeSession = null;\s+if \(!sessions \|\| sessions\.length === 0\) \{\s+return res\.status\(200\)\.send\("OK"\);\s+\}\s+let activeSession = sessions\[0\];/g, 
`      if (!sessions || sessions.length === 0) {
         return res.status(200).send("OK");
      }
      let activeSession = sessions[0];`);

content = content.replace(/let activeSession = null;\s+if \(!sessions \|\| sessions\.length === 0\) \{\s+return res\.status\(200\)\.send\("EVENT_RECEIVED"\);\s+\}\s+let activeSession = sessions\[0\];/g, 
`      if (!sessions || sessions.length === 0) {
         return res.status(200).send("EVENT_RECEIVED");
      }
      let activeSession = sessions[0];`);

fs.writeFileSync('server.ts', content);
