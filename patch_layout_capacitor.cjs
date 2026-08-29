const fs = require('fs');

let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

if (!code.includes("import { Capacitor } from '@capacitor/core';")) {
  code = code.replace(
    "import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';",
    "import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';\nimport { Capacitor } from '@capacitor/core';\nimport { LocalNotifications } from '@capacitor/local-notifications';"
  );
}

const targetStr = `  // Escuta novas visitas (e limpezas avulsas) agendadas para este técnico
  useEffect(() => {
    if (!userProfile || (userProfile.role !== 'employee' && userProfile.role !== 'manager')) return;

    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission().catch(() => {});
    }

    const showNotification = (title, body) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(title, {
              body,
              icon: 'https://cdn-icons-png.flaticon.com/512/123/123382.png',
              vibrate: [200, 100, 200],
            });
          });
        } else {
          new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/123/123382.png' });
        }
      }
    };`;

const replacementStr = `  // Escuta novas visitas (e limpezas avulsas) agendadas para este técnico
  useEffect(() => {
    if (!userProfile || (userProfile.role !== 'employee' && userProfile.role !== 'manager')) return;

    const requestPerms = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          await LocalNotifications.requestPermissions();
        } catch (e) {
          console.error("Local notifications permission error", e);
        }
      } else if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission().catch(() => {});
      }
    };
    requestPerms();

    const showNotification = async (title: string, body: string) => {
      if (Capacitor.isNativePlatform()) {
        try {
          await LocalNotifications.schedule({
            notifications: [
              {
                title,
                body,
                id: new Date().getTime(),
                schedule: { at: new Date(Date.now() + 1000) }
              }
            ]
          });
        } catch (e) {
          console.error("Capacitor local notification error", e);
        }
      } else {
        if ('Notification' in window && Notification.permission === 'granted') {
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
              registration.showNotification(title, {
                body,
                icon: 'https://cdn-icons-png.flaticon.com/512/123/123382.png',
                vibrate: [200, 100, 200],
              });
            });
          } else {
            new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/123/123382.png' });
          }
        }
      }
    };`;

code = code.replace(targetStr, replacementStr);
fs.writeFileSync('src/components/Layout.tsx', code);
console.log("Layout.tsx patched for Capacitor.");
