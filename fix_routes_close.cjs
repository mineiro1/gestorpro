const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf8');

// There are multiple occurrences of this update
code = code.replace(/await supabase\.from\('chat_sessions'\)\.update\(\{\s*closed_at:\s*new Date\(\)\.toISOString\(\)\s*\}\)/g, 
  "await supabase.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() })");

fs.writeFileSync('src/pages/RoutesPage.tsx', code);
console.log("Success updating RoutesPage");
