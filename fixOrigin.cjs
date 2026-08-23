const fs = require('fs');

// Fix Dashboard.tsx
let dash = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');
dash = dash.replace(
  "email: userProfile?.email || 'admin@gestaopro.com'",
  "email: userProfile?.email || 'admin@gestaopro.com',\n          origin: window.location.origin"
);
fs.writeFileSync('src/pages/Dashboard.tsx', dash);

// Fix SubscriptionWall.tsx
let wall = fs.readFileSync('src/pages/SubscriptionWall.tsx', 'utf8');
wall = wall.replace(
  "email: userProfile?.email || 'admin@gestaopro.com'",
  "email: userProfile?.email || 'admin@gestaopro.com',\n          origin: window.location.origin"
);
fs.writeFileSync('src/pages/SubscriptionWall.tsx', wall);

// Fix server.ts
let server = fs.readFileSync('server.ts', 'utf8');
server = server.replace(
  "const { title, price, quantity, adminId, email } = req.body;",
  "const { title, price, quantity, adminId, email, origin } = req.body;"
);

// Replace notification_url and back_urls to use the frontend-provided origin
server = server.replace(
  /process\.env\.PUBLIC_URL \|\| req\.headers\.origin \|\| 'https:\/\/gestaopro\.com'/g,
  "(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://gestaopro.com')"
);

fs.writeFileSync('server.ts', server);

