const admin = require('firebase-admin');
const fs = require('fs');
const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));

// Handle different import structures for firebase-admin
const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

admin.messaging().send({
    token: 'd1PG0vKzSK-pv85SPMrOyH:APA91bHb0Sp_z9ZYCJkSahVH3DRH9Os8V_BW3FNf7pE-lH9adjyPn21JVcyhyeyDbnyV_2ocUoVJJQH7QQdQkjOlL8edFUH4k-qa93PsGZXMYLhNN025eok',
    notification: {
        title: 'Teste Direto',
        body: 'Se isso apitar, o Firebase tá 100%'
    }
}).then(r => console.log("Success:", r)).catch(e => console.error("Error:", e));
