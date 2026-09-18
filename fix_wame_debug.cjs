const fs = require('fs');

let layout = fs.readFileSync('server.ts', 'utf8');

const target = `      try {
         await supabaseAdmin.from('chat_messages').insert({
            session_id: 'e867ca9f-d11f-4bb5-8bc6-96e1455fd260',
            sender_type: 'client',
            content: "WEBHOOK_PAYLOAD: " + JSON.stringify(req.body).substring(0, 500)
         });
      } catch(e) {}`;
      
if (layout.includes(target)) {
    layout = layout.replace(target, "");
    fs.writeFileSync('server.ts', layout);
    console.log("Success removing debug webhook log");
} else {
    console.log("Target not found");
}
