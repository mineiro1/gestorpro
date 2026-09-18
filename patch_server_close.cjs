const fs = require('fs');
let layout = fs.readFileSync('server.ts', 'utf8');

const target = `app.post("/api/chat/send", async (req, res) => {`;
const replacement = `app.post("/api/chat/close", async (req, res) => {
    try {
      const { clientId } = req.body;
      if (!clientId) return res.status(400).json({ error: "Missing clientId" });
      await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('client_id', clientId).eq('status', 'open');
      return res.json({ success: true });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/chat/send", async (req, res) => {`;

if (layout.includes(target)) {
    layout = layout.split(target).join(replacement);
    fs.writeFileSync('server.ts', layout);
    console.log("Added /api/chat/close");
} else {
    console.log("Target not found");
}
