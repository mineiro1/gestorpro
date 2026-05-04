import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import admin from "firebase-admin";
import * as dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Initialize Firebase Admin if Service Account is provided
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    let serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
    // If it doesn't look like JSON, try decoding as base64
    if (!serviceAccountStr.trim().startsWith('{')) {
      serviceAccountStr = Buffer.from(serviceAccountStr, 'base64').toString('utf8');
    }
    const serviceAccount = JSON.parse(serviceAccountStr);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize Firebase Admin. Please ensure FIREBASE_SERVICE_ACCOUNT is either a valid JSON string or a base64 encoded JSON string.", error);
  }
} else {
  console.warn("FIREBASE_SERVICE_ACCOUNT environment variable is missing. Webhooks targeting Firestore will fail.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  app.use((req, res, next) => {
    fs.appendFileSync('mp-debug.log', `[${req.method}] ${req.url}\n`);
    next();
  });

  // API Routes
  app.post("/api/create-preference", async (req, res) => {
    try {
      const { title, price, quantity, adminId, email } = req.body;

      const mpToken = process.env.MP_ACCESS_TOKEN || "APP_USR-5520671839390863-031622-4f2fede32936291cc0567aebae0a319e-1434591190";
      
      if (!mpToken) {
        console.error("No MP access token");
        return res.status(500).json({ error: "Mercado Pago access token not configured." });
      }

      const client = new MercadoPagoConfig({ accessToken: mpToken });
      const preference = new Preference(client);

      const response = await preference.create({
        body: {
          items: [
            {
              id: "subscription_monthly",
              title: title,
              quantity: quantity,
              unit_price: Number(price),
              currency_id: "BRL"
            }
          ],
          payer: {
            email: email || "admin@gestaopro.com",
            name: "Cliente",
            surname: "GestãoPro",
          },
          external_reference: adminId, // We use this to identify the user on webhook
          back_urls: {
            success: `${process.env.PUBLIC_URL || req.headers.origin || 'https://gestaopro.com'}/`,
            failure: `${process.env.PUBLIC_URL || req.headers.origin || 'https://gestaopro.com'}/`,
            pending: `${process.env.PUBLIC_URL || req.headers.origin || 'https://gestaopro.com'}/`
          },
          auto_return: "approved",
          notification_url: `${process.env.PUBLIC_URL || req.headers.origin || 'https://gestaopro.com'}/api/mp-webhook`
        }
      });

      fs.appendFileSync('mp-debug.log', `Success: ${response.id}\n`);
      res.json({ id: response.id, init_point: response.init_point });
    } catch (error: any) {
      console.error(error);
      fs.appendFileSync('mp-debug.log', `Error: ${error?.message || JSON.stringify(error)}\n`);
      res.status(500).json({ error: error?.message || "Failed to create preference" });
    }
  });

  app.post("/api/mp-webhook", async (req, res) => {
    console.log("Received MP Webhook:", req.query, req.body);
    const { "data.id": dataId, type } = req.query;

    if (type === "payment" && dataId) {
      const mpToken = process.env.MP_ACCESS_TOKEN || "APP_USR-5520671839390863-031622-4f2fede32936291cc0567aebae0a319e-1434591190";

      if (!mpToken || !admin.apps.length) {
        console.error("Missing MP token or Firebase Admin is not initialized.");
        return res.status(200).send("OK. But not processed due to missing config.");
      }

      try {
        const client = new MercadoPagoConfig({ accessToken: mpToken });
        const paymentDetails = new Payment(client);
        const paymentInfo = await paymentDetails.get({ id: dataId as string });
        
        console.log("Payment Info:", paymentInfo.status, paymentInfo.external_reference);

        if (paymentInfo.status === "approved" && paymentInfo.external_reference) {
          const adminId = paymentInfo.external_reference;
          
          // Add 30 days to current date
          const newExpiry = new Date();
          newExpiry.setDate(newExpiry.getDate() + 30);

          await admin.firestore().collection("users").doc(adminId).update({
            subscriptionStatus: 'active',
            subscriptionExpiresAt: admin.firestore.Timestamp.fromDate(newExpiry),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          console.log(`Subscription activated for adminId: ${adminId}`);
        }
      } catch (error) {
        console.error("Webhook processing error:", error);
      }
    }
    
    res.status(200).send("OK");
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
