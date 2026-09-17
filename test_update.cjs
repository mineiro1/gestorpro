const fs = require('fs');

let routes = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf8');
routes = routes.replace(
  `await supabase.from('chat_sessions')
        .update({ closed_at: new Date().toISOString() })
        .eq('client_id', selectedClientForReport.id)
        .eq('status', 'open');`,
  `const { error: chatUpdateErr } = await supabase.from('chat_sessions')
        .update({ closed_at: new Date().toISOString() })
        .eq('client_id', selectedClientForReport.id)
        .eq('status', 'open');
      if (chatUpdateErr) console.error("Error updating chat session:", chatUpdateErr);`
);
fs.writeFileSync('src/pages/RoutesPage.tsx', routes);
console.log("Replaced");
