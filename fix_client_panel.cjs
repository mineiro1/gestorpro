const fs = require('fs');
let code = fs.readFileSync('src/pages/ClientPanel.tsx', 'utf-8');

code = code.replace("// Find the end of this section (the next \\n\\n)", "// Find the end of this section");
code = code.replace("// Find the end of this section (the next \n\n)", "// Find the end of this section");

fs.writeFileSync('src/pages/ClientPanel.tsx', code);
