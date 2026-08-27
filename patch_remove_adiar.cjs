const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf-8');

const regex = /\s*\{\(isAdmin \|\| isManager\) && routeDate === getLocalISODate\(\) && routeClients\.length > 0 && !isOrderingMode && \([\s\S]*?title="Adiar clientes selecionados para amanhã"[\s\S]*?<\/button>\s*\)\}/;

if (regex.test(code)) {
  code = code.replace(regex, '');
  fs.writeFileSync('src/pages/RoutesPage.tsx', code);
  console.log("Successfully removed 'Adiar' button.");
} else {
  console.log("Could not find regex target.");
}
