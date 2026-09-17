const fs = require('fs');

let main = fs.readFileSync('src/main.tsx', 'utf8');

// I'm going to manually inspect if there's any weird character
console.log("Len:", main.length);
