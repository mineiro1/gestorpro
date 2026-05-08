import { MercadoPagoConfig, Payment } from "mercadopago";
import admin from "firebase-admin";

if (process.env.FIREBASE_SERVICE_ACCOUNT && !admin.apps.length) {
  try {
    let serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountStr.trim().startsWith('{')) {
      serviceAccountStr = Buffer.from(serviceAccountStr, 'base64').toString('utf8');
    }
    const serviceAccount = JSON.parse(serviceAccountStr);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error("Failed to initialize Firebase Admin", error);
  }
}

export default async function handler(req: any, res: any) {
  const { "data.id": dataId, type } = req.query;

  if (type === "payment" && dataId) {
    let mpToken = process.env.MP_ACCESS_TOKEN;
    if (!mpToken || mpToken.length < 40) {
      mpToken = "APP_USR-5520671839390863-031622-4f2fede32936291cc0567aebae0a319e-1434591190";
    }

    if (!mpToken || !admin.apps.length) {
      console.error("Missing MP token or Firebase Admin is not initialized.");
      return res.status(200).send("OK. But not processed due to missing config.");
    }

    try {
      const client = new MercadoPagoConfig({ accessToken: mpToken });
      const paymentDetails = new Payment(client);
      const paymentInfo = await paymentDetails.get({ id: dataId as string });
      
      if (paymentInfo && paymentInfo.status === "approved" && paymentInfo.external_reference) {
        const adminId = paymentInfo.external_reference;
        
        const userRef = admin.firestore().collection("users").doc(adminId);
        const userDoc = await userRef.get();
        const userData = userDoc.data();
        
        // Determina a data base para expiração: a data atual, ou a data de expiração atual se for no futuro
        let baseDate = new Date();
        if (userData?.subscriptionExpiresAt) {
          const currentExpiry = userData.subscriptionExpiresAt.toDate ? userData.subscriptionExpiresAt.toDate() : new Date(userData.subscriptionExpiresAt);
          if (currentExpiry > baseDate) {
            baseDate = currentExpiry;
          }
        }
        
        const newExpiry = new Date(baseDate.getTime());
        // Adiciona um mês (30 dias)
        newExpiry.setDate(newExpiry.getDate() + 30);

        await userRef.set({
          subscriptionStatus: 'active',
          subscriptionExpiresAt: admin.firestore.Timestamp.fromDate(newExpiry),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    } catch (error) {
      console.error("Webhook processing error:", error);
    }
  }
  
  res.status(200).send("OK");
}
