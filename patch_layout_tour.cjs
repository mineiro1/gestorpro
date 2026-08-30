const fs = require('fs');
let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

// Add import for OnboardingTour
if (!code.includes('import OnboardingTour')) {
  code = code.replace(
    "import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';",
    "import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';\nimport OnboardingTour from './OnboardingTour';"
  );
}

// Modify navItems to include optional ID
code = code.replace(/navItems\.push\({ name: 'Lojas Parceiras', path: '\/partners', icon: Store }\);/g, "navItems.push({ name: 'Lojas Parceiras', path: '/partners', icon: Store, id: 'tour-partners' });");
code = code.replace(/navItems\.push\({ name: 'Técnicos Parceiros', path: '\/technicians', icon: Wrench }\);/g, "navItems.push({ name: 'Técnicos Parceiros', path: '/technicians', icon: Wrench, id: 'tour-technicians' });");

// Apply ID to the Link element
code = code.replace(
  /<Link\s*to=\{item\.path\}/,
  "<Link\n                  id={item.id}\n                  to={item.path}"
);

// Render OnboardingTour
code = code.replace(
  '<EmployeeLocationTracker />',
  '<EmployeeLocationTracker />\n      <OnboardingTour />'
);

fs.writeFileSync('src/components/Layout.tsx', code);
console.log('Layout.tsx patched for tour');
