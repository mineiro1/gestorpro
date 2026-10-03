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

    // 3. Fallback para credenciais embutidas seguras do projeto gestorpro-7d98c
    if (!serviceAccount || !serviceAccount.private_key) {
      serviceAccount = {
        type: "service_account",
        project_id: "gestorpro-7d98c",
        private_key_id: "fbd5e57675835fa590994a15c3ac0404557262d8",
        private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQC8T3VtwP1slyxS\nHQj71quHQgr1E9N6rxERW9GK0KO78STZkwdCK9pihg9UQKjsmbrFC+f4WqJgSq4C\nz+niWPcALuVO0DMrjQbl90WD7K8H/P/x37vZin3Xp49AoeuPriULDvcCTG98vtlH\noTTpYalfUAlqZuYy0M1TzZKl1qWE55+4vKXsxB/+jbncWKTHz7+o4Vk16DVDTAV8\ntB8fBBg/uG+XPJV709p6ggkd7+pxWfTgMLoQdAjDtxH4unmSPX7b33MvoeMH8un9\nOxcfKAZyHcjgDvXbGvjKnUMEO/AcDiE8O8SDwONVm1X6ppVtmapfGMF1oUZsQtYC\nph1I3t4TAgMBAAECggEAHZ5R1gV41s+gRPoUI6hMKmYU2x9XMADBKn3Ko47VcgYn\nyaD6j0nee4iieJoC99PmMIAC6Gk5CPQ2EnMpUlSz5O97Wb4djkgMQbd2050ymosM\nprqODVVfHcBZI81UA7FcWjTsXQwwrOpHuqB8dgjKXxdzo6yzoGJ/KSM4YaU1O4X9\nhgQtk+LDfjOK+5I7NLksRK1WsdiRT9TJQZn3L73n/DBaO9ZGs28qc31hw9ftxdYz\ni9AOmzg3FlLgDlWfQhXnufJ+ux46moHMitQ3l+IyKY9Atwk55wDpFbOWAqCERx3x\nqiejT0iFeBJSsm9iSOMt8h7u7TBVL7Tsm92HEA/iQQKBgQDzW25nFgCaAcYlIaM6\ndRmf3bQtx4UHwe+vNezEOA4rJ83GEGhtILN1E0bMUESX0bZD9uBw4Eop2vYfcMaI\npRJlB1K9IMNZbPyM63661spcKaqEZ/fu30O8OWSpkGkWaVRZHH85m+t/7c/vCFl7\neHqybiK35YNpb2PKoU8qDIfW6QKBgQDGF+yBMljY6aGBFPqWKHt9IKsmFkp2grMI\nu1MCDK7OJYSUXMuNJNcirhCwTkXbLDTka0K3LQORQuft1P/SiRqQvopPZkPSZ0uf\nBAIJh5np91p5qJ6BETp5si93nywvPUASB9zKtXjiP5EetQ5M6Y+mQE/qEazBRVZY\nJpOTCOhnmwKBgQCMUjMls7UjGFTFglDZWz4sRS0onHwjjfsDn2dneR8KWUg4path\nCVMQ9c2D7+CtXdnn9IlT7LA21C/Iz0Fa9zvVD1TxAtxBSyuQohWP7FwAqnHNKRn4\nHbqz5LAbac5+gruFKn5dnH89Y8XbAYh/PmgZTJIuUWPlvrne1AaOq20ESQKBgQCA\nMHch3BzWscmLqLHIfgX7oSpgCUjCjC2jVuWOi/qK+IhlIe+vNMnrbUzrapuWC3Nm\n5WpU81I9rFg99fpemc6RIFyMqRb2j1XGX2eaFyAo4aKw28dGqol2uzIwbNbA8xgF\nEwV0QB8r+grFHlFUwEfvQ+rzA+ERaPdJMB2LptYORQKBgQCvJc6MOwytTWZKUC9D\nSbDb12QttP8UaIoj86dXB2A7H+rF1UhbdEunLmnVYgeR8szAWxUexgfC7Ui+48ZS\nG4ltlzUlHOUFPine5JlfEmEfBoPA8+suiKJJCRH79sx7olnugA1NouryKV/JKaSn\nWfhdQ4sm1OPnPvhu8PuVDpVcHA==\n-----END PRIVATE KEY-----\n",
        client_email: "firebase-adminsdk-fbsvc@gestorpro-7d98c.iam.gserviceaccount.com",
        client_id: "115774516866623649136",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40gestorpro-7d98c.iam.gserviceaccount.com",
        universe_domain: "googleapis.com"
      };
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


