const fs = require('fs');

let layout = fs.readFileSync('server.ts', 'utf8');

const target = `      const { data: sessions } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('client_id', matchedClient.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
        
      if (!sessions || sessions.length === 0) {
         return res.status(200).send("OK");
      }`;
      
const replacement = `      const { data: sessions } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('client_id', matchedClient.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
        
      let activeSession = sessions && sessions.length > 0 ? sessions[0] : null;
      
      // If no open session exists, create a new one automatically for incoming message
      if (!activeSession) {
          const { data: newSession } = await supabaseAdmin.from('chat_sessions').insert({
              admin_id: matchedClient.admin_id,
              client_id: matchedClient.id,
              employee_id: matchedClient.employee_id || matchedClient.admin_id,
              status: 'open'
          }).select('*').single();
          
          if (newSession) activeSession = newSession;
      }
      
      if (!activeSession) {
         return res.status(200).send("OK");
      }`;

if (layout.includes(target)) {
    layout = layout.replace(target, replacement);
    fs.writeFileSync('server.ts', layout);
    console.log("Success");
} else {
    console.log("Target not found");
}
