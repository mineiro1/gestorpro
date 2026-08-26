const fs = require('fs');

let code = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf-8');

code = code.replace(
  "  whatsappSettings?: {\n    reminderDays: number;",
  "  whatsappSettings?: {\n    companyName?: string;\n    companyLogo?: string;\n    reminderDays: number;"
);

fs.writeFileSync('src/contexts/AuthContext.tsx', code);
console.log("AuthContext patched.");
