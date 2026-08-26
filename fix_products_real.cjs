const fs = require('fs');
let code = fs.readFileSync('src/pages/ProductsPage.tsx', 'utf-8');

code = code.replace(/\\`/g, '`');
code = code.replace(/\\\$/g, '$');
code = code.replace(/\\\\n/g, '\\n');

fs.writeFileSync('src/pages/ProductsPage.tsx', code);
