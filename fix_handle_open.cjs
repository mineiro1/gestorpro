const fs = require('fs');
let routes = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf8');

routes = routes.replace(
  `const handleOpenChat = async (client: any, e?: React.MouseEvent) => {`,
  `const handleOpenChat = async (client: any, isCompleted: boolean, e?: React.MouseEvent) => {`
);

routes = routes.replace(
  `onClick={(e) => handleOpenChat(client, e)}`,
  `onClick={(e) => handleOpenChat(client, isCompleted, e)}`
);

routes = routes.replace(
  `setActiveChatVisit({ id: visitId, status: typeof visitStatus !== 'undefined' ? visitStatus : 'agendada' });`,
  `setActiveChatVisit({ id: visitId, status: typeof visitStatus !== 'undefined' ? visitStatus : 'agendada', isCompleted });`
);

fs.writeFileSync('src/pages/RoutesPage.tsx', routes);
console.log("Passed isCompleted");
