const fs = require('fs');
let code = fs.readFileSync('src/pages/Register.tsx', 'utf-8');

code = code.replace(/navigate\('\/'\);/g, "navigate('/dashboard');");

fs.writeFileSync('src/pages/Register.tsx', code);
console.log('Register.tsx patched');
