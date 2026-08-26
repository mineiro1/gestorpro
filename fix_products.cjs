const fs = require('fs');
let code = fs.readFileSync('src/pages/ProductsPage.tsx', 'utf-8');

code = code.replace(
  "const message = \\`",
  "const message = `"
).replace(
  "ola *\\${selectedClient.name}*",
  "Olá *${selectedClient.name}*"
); // I will just rewrite that part safely.
