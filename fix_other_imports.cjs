const fs = require('fs');

function patchFile(file) {
  let code = fs.readFileSync(file, 'utf-8');
  if (!code.includes("import { openWhatsApp }")) {
    code = code.replace(
      "import { supabase } from '../lib/supabase';",
      "import { supabase } from '../lib/supabase';\nimport { openWhatsApp } from '../lib/whatsapp';"
    );
  }
  
  // Replace the dynamic import block
  code = code.replace(
    /import\('\.\.\/lib\/whatsapp'\)\.then\(\(\{ openWhatsApp \}\) => \{\n\s*openWhatsApp\(number, message\);\n\s*\}\);/g,
    "openWhatsApp(number, message);"
  );
  
  // For Clients.tsx which uses clientPhone instead of number
  code = code.replace(
    /import\('\.\.\/lib\/whatsapp'\)\.then\(\(\{ openWhatsApp \}\) => \{\n\s*openWhatsApp\(clientPhone\);\n\s*\}\);/g,
    "openWhatsApp(clientPhone);"
  );
  
  fs.writeFileSync(file, code);
  console.log("Patched " + file);
}

patchFile('src/pages/Billing.tsx');
patchFile('src/pages/Messages.tsx');
patchFile('src/pages/Clients.tsx');

