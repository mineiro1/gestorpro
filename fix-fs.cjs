const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/fs\.appendFileSync\('mp-debug\.log', `\[\$\{req\.method\}\] \$\{req\.url\}\\n`\);/g, "console.log(`[${req.method}] ${req.url}`);");
code = code.replace(/fs\.appendFileSync\('mp-debug\.log', `Success: \$\{response\.id\}\\n`\);/g, "console.log(`Success: ${response.id}`);");
code = code.replace(/fs\.appendFileSync\('mp-debug\.log', `Error: \$\{error\?\.message \|\| JSON\.stringify\(error\)\}\\n`\);/g, "console.log(`Error: ${error?.message || JSON.stringify(error)}`);");

fs.writeFileSync('server.ts', code);
