const fs = require('fs');
let serverCode = fs.readFileSync('server.ts', 'utf-8');

const target = `const supabaseAdmin = createClient(`;
const replacement = `const admin = require('firebase-admin');
let fcmInitialized = false;
try {
  // Try to initialize Firebase Admin if service account exists
  if (fs.existsSync('./service-account.json')) {
    const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    fcmInitialized = true;
    console.log("Firebase Admin Initialized for Push Notifications");
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    fcmInitialized = true;
    console.log("Firebase Admin Initialized from ENV");
  } else {
    console.log("Firebase Admin NOT initialized. Missing service-account.json");
  }
} catch (e) {
  console.log("Error initializing Firebase Admin:", e.message);
}

const supabaseAdmin = createClient(`;

if (!serverCode.includes("require('firebase-admin')")) {
    serverCode = serverCode.replace(target, replacement);
}

const target2 = `app.listen(PORT, "0.0.0.0", () => {
    console.log(\`Server running on http://localhost:\${PORT}\`);
  });`;

const replacement2 = `
  // Background listener for Push Notifications
  supabaseAdmin.channel('push-notifications-chat')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
       if (!fcmInitialized) return;
       const newMsg = payload.new;
       if (newMsg.sender_type === 'client') {
          // Find admin/users who should receive this
          const { data: session } = await supabaseAdmin.from('chat_sessions').select('admin_id, client_id, client_name').eq('id', newMsg.session_id).single();
          if (session && session.admin_id) {
             const { data: users } = await supabaseAdmin.from('users').select('fcm_token').eq('uid', session.admin_id);
             if (users && users.length > 0) {
                users.forEach(u => {
                   if (u.fcm_token) {
                      admin.messaging().send({
                         token: u.fcm_token,
                         notification: {
                            title: 'Nova mensagem de ' + (session.client_name || 'Cliente'),
                            body: newMsg.message || 'Mensagem de texto'
                         }
                      }).catch(e => console.error("FCM Send Error:", e));
                   }
                });
             }
          }
       }
    })
    .subscribe();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(\`Server running on http://localhost:\${PORT}\`);
  });`;

if (!serverCode.includes("push-notifications-chat")) {
    serverCode = serverCode.replace(target2, replacement2);
}

fs.writeFileSync('server.ts', serverCode);
console.log("Patched server.ts with FCM Push background worker");
