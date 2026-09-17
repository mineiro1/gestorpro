const fs = require('fs');
const glob = require('fs').readdirSync('src/pages');

// For RoutesPage
let routes = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf8');
routes = routes.replace(
  `await supabase.from('visits').delete().eq('id', id);`,
  `await supabase.from('chat_sessions').update({ visit_id: null }).eq('visit_id', id);\n                   await supabase.from('visits').delete().eq('id', id);`
);
fs.writeFileSync('src/pages/RoutesPage.tsx', routes);

// For VisitsHistory
let vh = fs.readFileSync('src/pages/VisitsHistory.tsx', 'utf8');
vh = vh.replace(
  `const { error } = await supabase.from('visits').delete().eq('id', visitToDelete);`,
  `await supabase.from('chat_sessions').update({ visit_id: null }).eq('visit_id', visitToDelete);\n      const { error } = await supabase.from('visits').delete().eq('id', visitToDelete);`
);
fs.writeFileSync('src/pages/VisitsHistory.tsx', vh);

// For ClientForm
let cf = fs.readFileSync('src/pages/ClientForm.tsx', 'utf8');
cf = cf.replace(
  `await supabase.from('visits').delete().in('id', toDelete);`,
  `await supabase.from('chat_sessions').update({ visit_id: null }).in('visit_id', toDelete);\n          await supabase.from('visits').delete().in('id', toDelete);`
);
fs.writeFileSync('src/pages/ClientForm.tsx', cf);

console.log("Deletes fixed for visits");
