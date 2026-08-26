const fs = require('fs');
let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

code = code.replace(
  'e.currentTarget.src = "/logo.png";',
  'e.currentTarget.style.display = "none";'
);
code = code.replace(
  'e.currentTarget.src = "/logo.png";',
  'e.currentTarget.style.display = "none";'
);

fs.writeFileSync('src/components/Layout.tsx', code);
console.log("Layout logo patched again.");
