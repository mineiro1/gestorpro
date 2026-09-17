const fs = require('fs');
let code = fs.readFileSync('src/lib/whatsapp.ts', 'utf-8');

// If WAME API is used, let's send to both the 10-digit and 11-digit numbers for DDD > 28.
// Since we can't reliably know which one is registered, and sending to an unregistered JID just silently fails.
// Wait, is it safe to send twice? What if WhatsApp resolves both to the same account and sends duplicate messages?
// Usually, WhatsApp Baileys requires the EXACT JID. If you send to the wrong JID, it just throws an error internally.
// We can modify `sendMetaMessage` to fire off both requests if it's WAME and DDD > 28.

// Wait, let's check what `isWame` does.
