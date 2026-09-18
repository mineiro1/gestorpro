const fs = require('fs');
let code = fs.readFileSync('src/components/ChatModal.tsx', 'utf8');

const target = `    if (!text.trim() || !session || session.status === 'closed') return;`;
const replacement = `    if (!text.trim() || !session || session.status === 'closed' || timeLeft === 0) return;`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/components/ChatModal.tsx', code);
    console.log("Success replacing send validation");
} else {
    console.log("Target not found");
}
