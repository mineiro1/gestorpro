import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

getMessaging().send({
    token: 'd1PG0vKzSK-pv85SPMrOyH:APA91bHb0Sp_z9ZYCJkSahVH3DRH9Os8V_BW3FNf7pE-lH9adjyPn21JVcyhyeyDbnyV_2ocUoVJJQH7QQdQkjOlL8edFUH4k-qa93PsGZXMYLhNN025eok',
    notification: {
        title: 'Teste Direto',
        body: 'Se isso apitar, o Firebase tá 100%'
    }
}).then(r => console.log("Success:", r)).catch(e => console.error("Error:", e));
