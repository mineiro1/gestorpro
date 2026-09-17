const fs = require('fs');

// Fix Layout.tsx
let layoutContent = fs.readFileSync('src/components/Layout.tsx', 'utf8');
layoutContent = layoutContent.replace("import { supabase } from '../lib/supabase';\nimport EmployeeLocationTracker from './EmployeeLocationTracker';", "import EmployeeLocationTracker from './EmployeeLocationTracker';");
layoutContent = layoutContent.replace(/userProfile\.id/g, "userProfile.uid");
fs.writeFileSync('src/components/Layout.tsx', layoutContent);

// Fix server.ts
let serverContent = fs.readFileSync('server.ts', 'utf8');
serverContent = serverContent.replace("const newVisit = payload.new;", "const newVisit = payload.new as any;");
serverContent = serverContent.replace("const newJob = payload.new;", "const newJob = payload.new as any;");
serverContent = serverContent.replace("const newMsg = payload.new;", "const newMsg = payload.new as any;");
fs.writeFileSync('server.ts', serverContent);

console.log("Lint fixes applied.");
