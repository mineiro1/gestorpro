const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

// Add import ProductsPage from './pages/ProductsPage';
if (!code.includes('import ProductsPage')) {
  code = code.replace(
    "import SuppliesForm from './pages/SuppliesForm';",
    "import SuppliesForm from './pages/SuppliesForm';\nimport ProductsPage from './pages/ProductsPage';"
  );
}

// Add route for products
if (!code.includes('path="products"')) {
  code = code.replace(
    '<Route path="clients/:id/supplies" element={<ProtectedRoute allowedRoles={[\'admin\', \'manager\', \'employee\']}><SuppliesForm /></ProtectedRoute>} />',
    '<Route path="clients/:id/supplies" element={<ProtectedRoute allowedRoles={[\'admin\', \'manager\', \'employee\']}><SuppliesForm /></ProtectedRoute>} />\n            <Route path="products" element={<ProtectedRoute allowedRoles={[\'admin\', \'manager\', \'employee\']}><ProductsPage /></ProtectedRoute>} />'
  );
}

fs.writeFileSync('src/App.tsx', code);
console.log("Patched App.tsx");
