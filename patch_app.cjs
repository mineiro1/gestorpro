const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

// Replace Landing import if not exists
if (!code.includes('import Landing')) {
  code = code.replace(
    "import Login from './pages/Login';",
    "import Landing from './pages/Landing';\nimport Login from './pages/Login';"
  );
}

// Add Route for Landing
code = code.replace(
  '<Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>',
  '<Route path="/" element={<Landing />} />\n          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>'
);

// Move Dashboard route
code = code.replace(
  '<Route index element={<ProtectedRoute allowedRoles={[\'admin\', \'manager\']}><Dashboard /></ProtectedRoute>} />',
  '<Route path="/dashboard" element={<ProtectedRoute allowedRoles={[\'admin\', \'manager\']}><Dashboard /></ProtectedRoute>} />'
);

fs.writeFileSync('src/App.tsx', code);
console.log('App.tsx patched');
