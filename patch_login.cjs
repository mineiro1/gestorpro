const fs = require('fs');
let code = fs.readFileSync('src/pages/Login.tsx', 'utf-8');

code = code.replace(/window\.location\.href = '\/';/g, "window.location.href = '/dashboard';");

fs.writeFileSync('src/pages/Login.tsx', code);
console.log('Login.tsx patched');
