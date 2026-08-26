const fs = require('fs');
let code = fs.readFileSync('src/pages/ProductsPage.tsx', 'utf-8');

code = code.replace(
  '<div className="text-sm text-gray-500">{c.phone}</div>',
  '{(isAdmin || isManager) && <div className="text-sm text-gray-500">{c.phone}</div>}'
);

fs.writeFileSync('src/pages/ProductsPage.tsx', code);
