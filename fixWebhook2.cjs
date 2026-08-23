const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const oldWebhookParse = `    const { "data.id": dataId, type } = req.query;
    if (type === "payment" && dataId) {`;

const newWebhookParse = `    let dataId = req.query["data.id"] || req.query.id || (req.body && req.body.data && req.body.data.id) || (req.body && req.body.id);
    let type = req.query.type || req.query.topic || (req.body && req.body.type) || (req.body && req.body.topic) || (req.body && req.body.action);
    
    console.log("Extracted Webhook Data - type:", type, "dataId:", dataId);

    if ((type === "payment" || type === "payment.created" || type === "payment.updated") && dataId) {`;

code = code.replace(oldWebhookParse, newWebhookParse);

fs.writeFileSync('server.ts', code);
