const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

code = code.replace(
  "import OneOffJobs from './pages/OneOffJobs';",
  "import OneOffJobs from './pages/OneOffJobs';\nimport Settings from './pages/Settings';"
);

code = code.replace(
  "<Route path=\"one-off-jobs\" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><OneOffJobs /></ProtectedRoute>} />",
  "<Route path=\"one-off-jobs\" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><OneOffJobs /></ProtectedRoute>} />\n            <Route path=\"settings\" element={<ProtectedRoute allowedRoles={['admin']}><Settings /></ProtectedRoute>} />"
);

fs.writeFileSync('src/App.tsx', code);
console.log("App.tsx patched.");
