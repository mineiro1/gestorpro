const fs = require('fs');
let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

code = code.replace(
  "Contact , Package } from 'lucide-react';",
  "Contact , Package, Settings } from 'lucide-react';"
);

code = code.replace(
  "{ name: 'Avulsos', path: '/one-off-jobs', icon: Briefcase },",
  "{ name: 'Avulsos', path: '/one-off-jobs', icon: Briefcase },\n        { name: 'Configurações', path: '/settings', icon: Settings },"
);

fs.writeFileSync('src/components/Layout.tsx', code);
console.log("Layout menu patched.");
