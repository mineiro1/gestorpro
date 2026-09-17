const fs = require('fs');
let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');
code = code.replace(".eq('uid', userProfile.uid);", ".eq('id', userProfile.uid);");
fs.writeFileSync('src/components/Layout.tsx', code);

let serverCode = fs.readFileSync('server.ts', 'utf-8');
serverCode = serverCode.replace(".eq('uid', session.admin_id);", ".eq('id', session.admin_id);");
fs.writeFileSync('server.ts', serverCode);

console.log("Fixed!");
