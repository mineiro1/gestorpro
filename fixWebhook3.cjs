const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `  app.post("/api/mp-webhook", async (req, res) => {
    console.log("Received MP Webhook:", req.query, req.body);
    const { "data.id": dataId, type } = req.query;

    if (type === "payment" && dataId) {`;

const replacement = `  app.post("/api/mp-webhook", async (req, res) => {
    console.log("Received MP Webhook:", req.query, req.body);
    let dataId = req.query["data.id"] || req.query.id || (req.body && req.body.data && req.body.data.id) || (req.body && req.body.id);
    let type = req.query.type || req.query.topic || (req.body && req.body.type) || (req.body && req.body.topic) || (req.body && req.body.action);
    
    console.log("Extracted Webhook Data - type:", type, "dataId:", dataId);

    if ((type === "payment" || type === "payment.created" || type === "payment.updated") && dataId) {`;

code = code.replace(target, replacement);
fs.writeFileSync('server.ts', code);
