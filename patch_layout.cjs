const fs = require('fs');
let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

// Add "Package" import if missing
if (!code.includes('Package,')) {
  code = code.replace(/import \{([^}]+)\} from 'lucide-react';/, "import { $1, Package } from 'lucide-react';");
}

code = code.replace(
  "{ name: 'Clientes', path: '/clients', icon: Users },",
  "{ name: 'Clientes', path: '/clients', icon: Users },\n        { name: 'Produtos', path: '/products', icon: Package },"
);

fs.writeFileSync('src/components/Layout.tsx', code);
console.log("Patched Layout.tsx");
