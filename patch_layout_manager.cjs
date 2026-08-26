const fs = require('fs');
let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

code = code.replace(
  "{ name: 'Configurações', path: '/settings', icon: Settings },",
  "// Will add Settings dynamically below"
);

code = code.replace(
  "if (userProfile?.email === 'servincg@gmail.com') {",
  "if (isAdmin) {\n    navItems.push({ name: 'Configurações', path: '/settings', icon: Settings });\n  }\n\n  if (userProfile?.email === 'servincg@gmail.com') {"
);

fs.writeFileSync('src/components/Layout.tsx', code);
console.log("Layout manager filter patched.");
