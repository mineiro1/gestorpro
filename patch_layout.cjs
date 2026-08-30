const fs = require('fs');
let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

// Replace { name: 'Dashboard', path: '/', icon: Home } 
// and { name: 'Painel', path: '/', icon: Home }
code = code.replace(/path: '\/', icon: Home/g, "path: '/dashboard', icon: Home");

fs.writeFileSync('src/components/Layout.tsx', code);
console.log('Layout.tsx patched');
