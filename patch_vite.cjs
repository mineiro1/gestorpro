const fs = require('fs');

let code = fs.readFileSync('vite.config.ts', 'utf-8');

code = code.replace(
  "import {defineConfig, loadEnv} from 'vite';",
  "import {defineConfig, loadEnv} from 'vite';\nimport { VitePWA } from 'vite-plugin-pwa';"
);

code = code.replace(
  "plugins: [react(), tailwindcss()],",
  `plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
          enabled: true
        },
        manifest: {
          name: 'GestãoPro',
          short_name: 'GestãoPro',
          description: 'Sistema de gestão para manutenção de piscinas',
          theme_color: '#3b82f6',
          icons: [
            {
              src: 'https://cdn-icons-png.flaticon.com/512/123/123382.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],`
);

fs.writeFileSync('vite.config.ts', code);
console.log('vite.config.ts patched');
