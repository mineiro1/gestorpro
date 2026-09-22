import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

let fcmInitialized = false;

function initFirebase() {
  if (admin.apps.length > 0) {
    return admin;
  }

  try {
    let serviceAccount = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      if (raw.startsWith('{')) {
        serviceAccount = JSON.parse(raw);
      } else {
        // Possível Base64
        const decoded = Buffer.from(raw, 'base64').toString('utf-8');
        serviceAccount = JSON.parse(decoded);
      }
    } else {
      const filePath = path.join(process.cwd(), 'service-account.json');
      if (fs.existsSync(filePath)) {
        serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    }

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      fcmInitialized = true;
      console.log('[Firebase Admin] Inicializado com sucesso para FCM');
    }
  } catch (err) {
    console.warn('[Firebase Admin] Falha ao inicializar:', err.message);
  }

  return admin;
}

export { initFirebase, admin };
