const fs = require('fs');
let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

if (!code.includes('import { Capacitor } from')) {
  code = code.replace(
    "import clsx from 'clsx';",
    "import clsx from 'clsx';\nimport { Capacitor } from '@capacitor/core';\nimport { LocalNotifications } from '@capacitor/local-notifications';"
  );
}

fs.writeFileSync('src/components/Layout.tsx', code);
