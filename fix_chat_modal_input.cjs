const fs = require('fs');
let code = fs.readFileSync('src/components/ChatModal.tsx', 'utf8');

const target = `{session?.status === 'open' && (`;
const replacement = `{session?.status === 'open' && timeLeft !== 0 && (`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/components/ChatModal.tsx', code);
    console.log("Success replacing input condition");
} else {
    console.log("Target not found");
}
