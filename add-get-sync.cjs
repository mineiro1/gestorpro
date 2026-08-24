const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `  app.post("/api/sync-payment", async (req, res) => {
    const { payment_id } = req.body;
    if (!payment_id) return res.status(400).json({ error: "Missing payment_id" });`;

const replacement = `  app.all("/api/sync-payment", async (req, res) => {
    const payment_id = req.body?.payment_id || req.query?.payment_id || req.query?.id;
    if (!payment_id) return res.status(400).json({ error: "Missing payment_id" });`;

code = code.replace(target, replacement);
fs.writeFileSync('server.ts', code);
