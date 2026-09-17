const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// The file might have different spaces, so let's use regex
content = content.replace(/if \(!sessions \|\| sessions\.length === 0\) \{[\s\S]*?activeSession = newSession;\n      \} else \{\n         activeSession = sessions\[0\];\n      \}\n      \n      \/\/ Time lock removed for testing\n      \/\/ const createdTime = new Date\(activeSession\.created_at\)\.getTime\(\);\n      \/\/ const now = new Date\(\)\.getTime\(\);\n      \/\/ if \(now - createdTime > 30 \* 60 \* 1000\) \{\n      \/\/    await supabaseAdmin\.from\('chat_sessions'\)\.update\(\{ status: 'closed', closed_at: new Date\(\)\.toISOString\(\) \}\)\.eq\('id', activeSession\.id\);\n      \/\/    return res\.status\(200\)\.send\("EVENT_RECEIVED"\);\n      \/\/ \}/g, 
`      if (!sessions || sessions.length === 0) {
         return res.status(200).send("EVENT_RECEIVED");
      }
      let activeSession = sessions[0];
      const createdTime = new Date(activeSession.created_at).getTime();
      const now = new Date().getTime();
      if (now - createdTime > 30 * 60 * 1000) {
         await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
         return res.status(200).send("EVENT_RECEIVED");
      }`);

content = content.replace(/if \(!sessions \|\| sessions\.length === 0\) \{[\s\S]*?activeSession = newSession;\n      \} else \{\n         activeSession = sessions\[0\];\n      \}\n      \n      \/\/ Time lock removed for testing\n      \/\/ const createdTime = new Date\(activeSession\.created_at\)\.getTime\(\);\n      \/\/ const now = new Date\(\)\.getTime\(\);\n      \/\/ if \(now - createdTime > 30 \* 60 \* 1000\) \{\n      \/\/    await supabaseAdmin\.from\('chat_sessions'\)\.update\(\{ status: 'closed', closed_at: new Date\(\)\.toISOString\(\) \}\)\.eq\('id', activeSession\.id\);\n      \/\/    return res\.status\(200\)\.send\("OK"\);\n      \/\/ \}/g, 
`      if (!sessions || sessions.length === 0) {
         return res.status(200).send("OK");
      }
      let activeSession = sessions[0];
      const createdTime = new Date(activeSession.created_at).getTime();
      const now = new Date().getTime();
      if (now - createdTime > 30 * 60 * 1000) {
         await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
         return res.status(200).send("OK");
      }`);

fs.writeFileSync('server.ts', content);
console.log("Done regex patch");
