const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf-8');

const oldLine = "{(isAdmin || isManager) && isFutureRoute && !isCompleted && (";
const newLine = "{(isAdmin || isManager) && routeDate >= getLocalISODate() && !isCompleted && !isOrderingMode && (";

code = code.replace(oldLine, newLine);

fs.writeFileSync('src/pages/RoutesPage.tsx', code);
console.log("Patched selection visibility");
