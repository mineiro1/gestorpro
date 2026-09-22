import { initFirebase, admin } from '../_firebaseAdmin.js';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  initFirebase();
  const fcmInitialized = admin.apps.length > 0;
  const hasServiceAccount = !!process.env.FIREBASE_SERVICE_ACCOUNT || fs.existsSync(path.join(process.cwd(), 'service-account.json'));

  return res.json({
    fcmInitialized,
    hasServiceAccount,
    environment: 'vercel_serverless'
  });
}
