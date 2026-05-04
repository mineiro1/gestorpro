import admin from "firebase-admin";
import fs from "fs";
import { config } from "dotenv";

config();

let serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountStr.trim().startsWith('{')) {
  serviceAccountStr = Buffer.from(serviceAccountStr, 'base64').toString('utf8');
}
const serviceAccount = JSON.parse(serviceAccountStr);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function run() {
  try {
    const userRecord = await admin.auth().getUserByEmail('servincg@gmail.com');
    console.log("Logged in UID:", userRecord.uid);
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
