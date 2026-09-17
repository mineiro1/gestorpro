const fs = require('fs');
let server = fs.readFileSync('server.ts', 'utf8');

server = server.replace(
  `app.get("/api/health", (req, res) => {`,
  `app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});
app.get("/api/fix-rls", async (req, res) => {
  const { data, error } = await supabaseAdmin.rpc('get_schema_info');
  // Just try to insert and delete to check
  res.json({ status: "ok", error });
});
app.get("/api/health-orig", (req, res) => {`
);
fs.writeFileSync('server.ts', server);
console.log("added fix rls endpoint");
