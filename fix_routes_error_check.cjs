const fs = require('fs');

let layout = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf8');

const target = `await supabase.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('client_id', selectedClientForReport.id).eq('status', 'open');`;

const replacement = `const { error: sessionUpdateErr } = await supabase.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('client_id', selectedClientForReport.id).eq('status', 'open');
              if (sessionUpdateErr) console.error("Error updating chat_sessions:", sessionUpdateErr);`;

if (layout.includes(target)) {
    layout = layout.split(target).join(replacement);
    fs.writeFileSync('src/pages/RoutesPage.tsx', layout);
    console.log("Replaced");
} else {
    console.log("Target not found");
}
