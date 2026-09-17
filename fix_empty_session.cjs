const fs = require('fs');
let content = fs.readFileSync('src/components/ChatModal.tsx', 'utf8');

// If currentSession is still null because it expired and wasn't recreated, assign a dummy
content = content.replace(
  `      }
      
      setSession(currentSession);`,
  `      }
      
      if (!currentSession) {
          currentSession = { status: 'closed' };
      }
      
      setSession(currentSession);`
);

fs.writeFileSync('src/components/ChatModal.tsx', content);
console.log("Empty session fallback added");
