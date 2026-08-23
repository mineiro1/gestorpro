const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `      if (paymentInfo.status === "approved" && paymentInfo.external_reference) {`;
const replacement = `      console.log("Sync Info:", paymentInfo.status, paymentInfo.external_reference);
      if (paymentInfo.status === "approved" && paymentInfo.external_reference) {`;

code = code.replace(target, replacement);
fs.writeFileSync('server.ts', code);
