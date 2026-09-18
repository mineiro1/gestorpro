const fs = require('fs');
let layout = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf8');

const target1 = `const { error: sessionUpdateErr } = await supabase.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('client_id', selectedClientForReport.id).eq('status', 'open');
              if (sessionUpdateErr) console.error("Error updating chat_sessions:", sessionUpdateErr);`;

const replacement1 = `try {
                await fetch('/api/chat/close', {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ clientId: selectedClientForReport.id })
                });
              } catch(e) { console.error(e); }`;

if (layout.includes(target1)) {
    layout = layout.split(target1).join(replacement1);
    fs.writeFileSync('src/pages/RoutesPage.tsx', layout);
    console.log("Patched RoutesPage");
} else {
    console.log("Target 1 not found");
}
