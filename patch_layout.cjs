const fs = require('fs');

let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

code = code.replace(
  "    : [\n        { name: 'Rotas', path: '/routes', icon: Map },\n        { name: 'Clientes', path: '/clients', icon: Users },\n      ];",
  "    : [\n        { name: 'Rotas', path: '/routes', icon: Map },\n        { name: 'Produtos', path: '/products', icon: Package },\n      ];"
);

code = code.replace(
  "           ] : [\n             { name: 'Rotas', path: '/routes', icon: Map },\n             { name: 'Clientes', path: '/clients', icon: Users }\n           ]).map((item) => {",
  "           ] : [\n             { name: 'Rotas', path: '/routes', icon: Map },\n             { name: 'Produtos', path: '/products', icon: Package }\n           ]).map((item) => {"
);

fs.writeFileSync('src/components/Layout.tsx', code);
console.log("Layout patched.");
