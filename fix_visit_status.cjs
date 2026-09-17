const fs = require('fs');

let routes = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf8');
routes = routes.replace(
  `.select('id')\n        .eq('client_id', client.id)`,
  `.select('id, status')\n        .eq('client_id', client.id)`
);

routes = routes.replace(
  `visitId = existingVisit[0].id;`,
  `visitId = existingVisit[0].id;\n         var visitStatus = existingVisit[0].status;`
);

routes = routes.replace(
  `setActiveChatVisit({ id: visitId });`,
  `setActiveChatVisit({ id: visitId, status: typeof visitStatus !== 'undefined' ? visitStatus : 'agendada' });`
);

fs.writeFileSync('src/pages/RoutesPage.tsx', routes);
console.log("Passed status to ChatModal");
