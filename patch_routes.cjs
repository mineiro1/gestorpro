const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf8');

const fixLogic = `
      let currentDayOfWeek = '0';
      if (routeDate) {
         const [y, m, d] = routeDate.split('-').map(Number);
         currentDayOfWeek = new Date(y, m - 1, d).getDay().toString();
      } else if (selectedDay) {
         const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
         currentDayOfWeek = DAYS.indexOf(selectedDay).toString();
      }
      const routeOrderName = 'system_route_order_' + currentDayOfWeek;
`;

code = code.replace(
  "      const [y, m, d] = routeDate.split('-').map(Number); const currentDayOfWeek = new Date(y, m - 1, d).getDay().toString();\n      const routeOrderName = 'system_route_order_' + currentDayOfWeek;",
  fixLogic
);

code = code.replace(
  "      const [y, m, d] = routeDate.split('-').map(Number); const currentDayOfWeek = new Date(y, m - 1, d).getDay().toString();\n      const routeOrderName = 'system_route_order_' + currentDayOfWeek;",
  fixLogic
);

// Also fix the insert date in saveOrder:
// date: routeDate,
// change to: date: routeDate || new Date().toISOString().split('T')[0],
code = code.replace(
  "           date: routeDate,",
  "           date: routeDate || new Date().toISOString().split('T')[0],"
);

fs.writeFileSync('src/pages/RoutesPage.tsx', code);
