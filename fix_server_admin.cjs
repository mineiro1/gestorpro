const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

// Replace old firebase-admin syntax with the modular syntax
code = code.replace("import * as admin from 'firebase-admin';", "import { initializeApp, cert } from 'firebase-admin/app';\nimport { getMessaging } from 'firebase-admin/messaging';");
code = code.replace("admin.initializeApp({\n      credential: admin.credential.cert(serviceAccount)\n    });", "initializeApp({\n      credential: cert(serviceAccount)\n    });");
code = code.replace("admin.initializeApp({\n      credential: admin.credential.cert(serviceAccount)\n    });", "initializeApp({\n      credential: cert(serviceAccount)\n    });");
code = code.replace("admin.messaging().send({", "getMessaging().send({");

fs.writeFileSync('server.ts', code);
console.log("Fixed firebase-admin syntax");
