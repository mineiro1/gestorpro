import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import fs from 'fs';
import path from 'path';

function initFirebase() {
  if (getApps().length > 0) {
    return { initialized: true, messaging: getMessaging() };
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

    if (serviceAccount && serviceAccount.private_key && serviceAccount.client_email) {
      initializeApp({
        credential: cert(serviceAccount)
      });
      console.log('[Firebase Admin] Inicializado com sucesso para FCM');
      return { initialized: true, messaging: getMessaging() };
    } else if (serviceAccount && !serviceAccount.private_key) {
      console.warn('[Firebase Admin] O arquivo/variável fornecido é google-services.json e não a Chave de Conta de Serviço (service-account.json com private_key)');
    }
  } catch (err) {
    console.warn('[Firebase Admin] Falha ao inicializar:', err.message);
  }

  return { initialized: false, messaging: null };
}

export { initFirebase, getApps, getMessaging };

