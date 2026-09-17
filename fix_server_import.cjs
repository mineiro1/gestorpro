const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

// replace require with import
code = code.replace("const admin = require('firebase-admin');", "import * as admin from 'firebase-admin';");

fs.writeFileSync('server.ts', code);
