// Just a dummy to check if I can parse it
const fs = require('fs');
const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
console.log(v);
