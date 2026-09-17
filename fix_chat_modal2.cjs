const fs = require('fs');

let content = fs.readFileSync('src/components/ChatModal.tsx', 'utf8');

content = content.replace(
  `} else if (visit && visit.status !== 'finalizada') {`,
  `} else if (visit && !visit.isCompleted && visit.status !== 'finalizada') {`
);

fs.writeFileSync('src/components/ChatModal.tsx', content);
console.log("ChatModal lock fixed again");
