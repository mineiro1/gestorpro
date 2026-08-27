const fs = require('fs');

// 1. Update App.tsx
let appStr = fs.readFileSync('src/App.tsx', 'utf-8');
if (!appStr.includes('import PartnerTechnicians')) {
  appStr = appStr.replace("import PartnerStores from './pages/PartnerStores';", "import PartnerStores from './pages/PartnerStores';\nimport PartnerTechnicians from './pages/PartnerTechnicians';");
  appStr = appStr.replace('<Route path="partners" element={<ProtectedRoute allowedRoles={[\'admin\', \'client\']}><PartnerStores /></ProtectedRoute>} />', '<Route path="partners" element={<ProtectedRoute allowedRoles={[\'admin\', \'client\']}><PartnerStores /></ProtectedRoute>} />\n            <Route path="technicians" element={<ProtectedRoute allowedRoles={[\'admin\', \'client\']}><PartnerTechnicians /></ProtectedRoute>} />');
  fs.writeFileSync('src/App.tsx', appStr);
  console.log('App.tsx updated');
}

// 2. Update Layout.tsx (Add to Admin side drawer and Client side drawer)
let layoutStr = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

// Admin logic
const adminNavTarget = `navItems.push({ name: 'Lojas Parceiras', path: '/partners', icon: Store });`;
const adminNavReplacement = `navItems.push({ name: 'Lojas Parceiras', path: '/partners', icon: Store });
    navItems.push({ name: 'Técnicos Parceiros', path: '/technicians', icon: Wrench });`;

if (layoutStr.includes(adminNavTarget)) {
  layoutStr = layoutStr.replace(adminNavTarget, adminNavReplacement);
} else {
  console.log("Admin nav target not found");
}

// Client logic (drawer)
const clientNavTarget = `{ name: 'Lojas Parceiras', path: '/partners', icon: Store }`;
const clientNavReplacement = `{ name: 'Lojas Parceiras', path: '/partners', icon: Store },
    { name: 'Técnicos Parceiros', path: '/technicians', icon: Wrench }`;

if (layoutStr.includes(clientNavTarget)) {
  layoutStr = layoutStr.replace(clientNavTarget, clientNavReplacement);
} else {
  console.log("Client nav target not found");
}

// Client logic (bottom bar mobile)
const clientBottomTarget = `{ name: 'Lojas', path: '/partners', icon: Store }`;
const clientBottomReplacement = `{ name: 'Lojas', path: '/partners', icon: Store },
             { name: 'Técnicos', path: '/technicians', icon: Wrench }`;

if (layoutStr.includes(clientBottomTarget)) {
  layoutStr = layoutStr.replace(clientBottomTarget, clientBottomReplacement);
} else {
  console.log("Client bottom nav target not found");
}

// Fix imports in Layout.tsx
if (!layoutStr.includes('import {  Menu, Store, Wrench')) {
  layoutStr = layoutStr.replace("import {  Menu, Store, X, Home", "import {  Menu, Store, Wrench, X, Home");
}

fs.writeFileSync('src/components/Layout.tsx', layoutStr);
console.log('Layout.tsx updated');

