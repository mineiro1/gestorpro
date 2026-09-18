const fs = require('fs');
const content = fs.readFileSync('server.ts', 'utf8');

const regex = /now - createdTime \> 30 \* 60 \* 1000/g;
const matches = content.match(regex);
console.log("Matches of 30 min check:", matches ? matches.length : 0);

const activeSessionCreation = content.match(/let activeSession = sessions.*?\[0\].*?;/g);
console.log("activeSession assignments:", activeSessionCreation);
