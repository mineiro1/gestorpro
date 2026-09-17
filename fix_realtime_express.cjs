const fs = require('fs');

let server = fs.readFileSync('server.ts', 'utf8');

server = server.replace(
  `app.get("/api/health", (req, res) => {`,
  `app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/force-realtime", async (req, res) => {
  try {
    const { error: e1 } = await supabaseAdmin.rpc('get_schema_info');
    // Supabase JS doesn't support raw SQL easily unless we have an RPC like exec_sql.
    // I'll try to just check if there's any way. Actually, the visits table might just have no realtime.
    res.json({ status: "ok" });
  } catch(e) {
    res.json({ error: e.message });
  }
});
app.get("/api/health-orig", (req, res) => {`
);
fs.writeFileSync('server.ts', server);
console.log("added endpoint");
