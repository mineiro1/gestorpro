const fs = require('fs');
let code = fs.readFileSync('src/components/OnboardingTour.tsx', 'utf-8');

// Replace disableBeacon with skipBeacon
code = code.replace(/disableBeacon:/g, 'skipBeacon:');

// Replace styles block
code = code.replace(/styles=\{\{\s*options: \{\s*primaryColor: '#2563EB', \/\/ blue-600\s*zIndex: 10000,\s*\},/g, 'primaryColor="#2563EB"\n      zIndex={10000}\n      styles={{');

fs.writeFileSync('src/components/OnboardingTour.tsx', code);
