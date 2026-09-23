import admin from 'firebase-admin';
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

    // 1. Tenta carregar do arquivo físico service-account.json primeiro
    const filePath = path.join(process.cwd(), 'service-account.json');
    if (fs.existsSync(filePath)) {
      try {
        serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch (e) {
        console.warn('[Firebase Admin] Erro ao ler service-account.json:', e.message);
      }
    }

    // 2. Se não carregou do arquivo, tenta a variável de ambiente
    if ((!serviceAccount || !serviceAccount.private_key) && process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
        if (raw.startsWith('{')) {
          serviceAccount = JSON.parse(raw);
        } else {
          const decoded = Buffer.from(raw, 'base64').toString('utf-8');
          if (decoded.startsWith('{')) {
            serviceAccount = JSON.parse(decoded);
          }
        }
      } catch (e) {
        console.warn('[Firebase Admin] Variável FIREBASE_SERVICE_ACCOUNT não é um JSON válido');
      }
    }

    if (serviceAccount && serviceAccount.private_key && serviceAccount.client_email) {
      initializeApp({
        credential: cert(serviceAccount)
      });
      console.log('[Firebase Admin] Inicializado com sucesso para FCM (Projeto:', serviceAccount.project_id, ')');
      return { initialized: true, messaging: getMessaging() };
    } else if (serviceAccount && !serviceAccount.private_key) {
      console.warn('[Firebase Admin] O arquivo/variável fornecido não possui private_key');
    }
  } catch (err) {
    console.warn('[Firebase Admin] Falha ao inicializar:', err.message);
  }

  return { initialized: false, messaging: null };
}

export { initFirebase, getApps, getMessaging, admin };


