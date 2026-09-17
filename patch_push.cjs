const fs = require('fs');
let layoutCode = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

const targetImport = `import { LocalNotifications } from '@capacitor/local-notifications';`;
const replacementImport = `import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '../lib/supabase';`;

if(layoutCode.includes(targetImport)) {
    layoutCode = layoutCode.replace(targetImport, replacementImport);
}

const targetBanner = `const NotificationBanner = () => {`;
const replacementBanner = `const NotificationBanner = () => {
  const { userProfile } = useAuth();
`;

if(layoutCode.includes(targetBanner)) {
    layoutCode = layoutCode.replace(targetBanner, replacementBanner);
}

const targetCheck = `const status = await LocalNotifications.checkPermissions();`;
const replacementCheck = `const status = await LocalNotifications.checkPermissions();
          const pushStatus = await PushNotifications.checkPermissions();
          if (pushStatus.receive === 'prompt') {
            await PushNotifications.requestPermissions();
          }
          if (pushStatus.receive === 'granted') {
             await PushNotifications.register();
          }`;

if(layoutCode.includes(targetCheck)) {
    layoutCode = layoutCode.replace(targetCheck, replacementCheck);
}

const targetEffect = `checkPerms();
  }, []);`;
const replacementEffect = `checkPerms();

    if (Capacitor.isNativePlatform()) {
      const registerListener = PushNotifications.addListener('registration', async (token) => {
        if (userProfile && userProfile.uid) {
          try {
             await supabase.from('users').update({ fcm_token: token.value }).eq('uid', userProfile.uid);
          } catch(e){}
        }
      });
      return () => {
        registerListener.then(l => l.remove()).catch(()=>{});
      };
    }
  }, [userProfile]);`;

if(layoutCode.includes(targetEffect)) {
    layoutCode = layoutCode.replace(targetEffect, replacementEffect);
}

const targetReq = `const res = await LocalNotifications.requestPermissions();`;
const replacementReq = `const res = await LocalNotifications.requestPermissions();
        const pushRes = await PushNotifications.requestPermissions();
        if (pushRes.receive === 'granted') {
           await PushNotifications.register();
        }`;

if(layoutCode.includes(targetReq)) {
    layoutCode = layoutCode.replace(targetReq, replacementReq);
}

fs.writeFileSync('src/components/Layout.tsx', layoutCode);
console.log('Patched Layout for Push Notifications');
