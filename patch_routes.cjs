const fs = require('fs');

// 1. Update App.tsx
let appStr = fs.readFileSync('src/App.tsx', 'utf-8');
if (!appStr.includes('import PartnerStores')) {
  appStr = appStr.replace("import Settings from './pages/Settings';", "import Settings from './pages/Settings';\nimport PartnerStores from './pages/PartnerStores';");
  appStr = appStr.replace('<Route path="settings" element={<ProtectedRoute allowedRoles={[\'admin\']}><Settings /></ProtectedRoute>} />', '<Route path="settings" element={<ProtectedRoute allowedRoles={[\'admin\']}><Settings /></ProtectedRoute>} />\n            <Route path="partners" element={<ProtectedRoute allowedRoles={[\'admin\', \'client\']}><PartnerStores /></ProtectedRoute>} />');
  fs.writeFileSync('src/App.tsx', appStr);
  console.log('App.tsx updated');
}

// 2. Update Layout.tsx (Add to Admin side drawer and Client side drawer)
let layoutStr = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

// Admin logic
const adminNavTarget = `if (isAdmin) {
    navItems.push({ name: 'Configurações', path: '/settings', icon: Settings });
  }`;
const adminNavReplacement = `if (isAdmin) {
    navItems.push({ name: 'Configurações', path: '/settings', icon: Settings });
    navItems.push({ name: 'Lojas Parceiras', path: '/partners', icon: Store });
  }`;

if (layoutStr.includes(adminNavTarget)) {
  layoutStr = layoutStr.replace(adminNavTarget, adminNavReplacement);
} else {
  console.log("Admin nav target not found");
}

// Client logic (drawer)
const clientNavTarget = `let navItems = isClient ? [
    { name: 'Meu Painel', path: '/client-panel', icon: Home }
  ] :`;
const clientNavReplacement = `let navItems = isClient ? [
    { name: 'Meu Painel', path: '/client-panel', icon: Home },
    { name: 'Lojas Parceiras', path: '/partners', icon: Store }
  ] :`;

if (layoutStr.includes(clientNavTarget)) {
  layoutStr = layoutStr.replace(clientNavTarget, clientNavReplacement);
} else {
  console.log("Client nav target not found");
}

// Client logic (bottom bar mobile)
const clientBottomTarget = `{(isClient ? [
             { name: 'Painel', path: '/client-panel', icon: Home }
           ] : (isAdmin || isManager) ? [`;
const clientBottomReplacement = `{(isClient ? [
             { name: 'Painel', path: '/client-panel', icon: Home },
             { name: 'Lojas', path: '/partners', icon: Store }
           ] : (isAdmin || isManager) ? [`;

if (layoutStr.includes(clientBottomTarget)) {
  layoutStr = layoutStr.replace(clientBottomTarget, clientBottomReplacement);
} else {
  console.log("Client bottom nav target not found");
}

// Fix imports in Layout.tsx
if (!layoutStr.includes('import { Store')) {
  layoutStr = layoutStr.replace("import { Home, Users, Settings, LogOut, Menu, X, Package, MessageSquare, ShieldAlert, History, Navigation, Map, ClipboardList, Briefcase, Contact, Bell, UserCircle } from 'lucide-react';", "import { Home, Users, Settings, LogOut, Menu, X, Package, MessageSquare, ShieldAlert, History, Navigation, Map, ClipboardList, Briefcase, Contact, Bell, UserCircle, Store } from 'lucide-react';");
}

fs.writeFileSync('src/components/Layout.tsx', layoutStr);
console.log('Layout.tsx updated');

