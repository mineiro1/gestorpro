const fs = require('fs');

let routes = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf8');

routes = routes.replace(
  /\.update\(\{ status: 'closed', closed_at: new Date\(\)\.toISOString\(\) \}\)/g,
  `.update({ closed_at: new Date().toISOString() })`
);

fs.writeFileSync('src/pages/RoutesPage.tsx', routes);
console.log("RoutesPage lock fixed");
