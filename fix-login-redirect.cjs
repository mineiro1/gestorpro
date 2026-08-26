const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

// Replace navigate('/') with window.location.href = '/'
content = content.replace(
  `navigate('/');`,
  `window.location.href = '/';`
);

// We also don't really need the useEffect redirect if we just hard reload, but it's safe to keep.
// Actually, let's change the useEffect to also do window.location.href just in case.
content = content.replace(
  `navigate('/');`,
  `window.location.href = '/';`
);

fs.writeFileSync('src/pages/Login.tsx', content);
console.log('Replaced navigate with window.location.href');
