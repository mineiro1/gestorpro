import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import * as dotenv from 'dotenv';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  app.use((req, res, next) => {
    console.log(`[${req.method}] ${req.url}`);
    next();
  });

  // API Routes
  app.get("/api/test-db", async (req, res) => {
    try {
      // test if we can read users without auth
      const { data, error } = await supabaseAdmin.from("users").select("id").limit(1);
      if (error) {
         return res.json({ status: "error", message: error.message, code: error.code, usingServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
      }
      return res.json({ status: "success", rows: data.length, usingServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
    } catch(e) {
      return res.json({ status: "exception", message: e.message });
    }
  });

  app.post("/api/create-preference", async (req, res) => {
    try {
      const { title, price, quantity, adminId, email, origin } = req.body;

      let mpToken = process.env.MP_ACCESS_TOKEN;
      if (!mpToken || mpToken.length < 40) {
        mpToken = "APP_USR-5520671839390863-031622-4f2fede32936291cc0567aebae0a319e-1434591190";
      }
      
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
            success: `${(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://gestaopro.com')}/`,
            failure: `${(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://gestaopro.com')}/`,
            pending: `${(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://gestaopro.com')}/`
          },
          auto_return: "approved",
          notification_url: `${(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://gestaopro.com')}/api/mp-webhook`
        }
      });

      console.log(`Success: ${response.id}`);
      res.json({ id: response.id, init_point: response.init_point });
    } catch (error: any) {
      console.error(error);
      console.log(`Error: ${error?.message || JSON.stringify(error)}`);
      res.status(500).json({ error: error?.message || "Failed to create preference" });
    }
  });


async function processPayment(paymentId, adminId) {
  try {
    console.log('Processing payment:', paymentId, 'for admin:', adminId);
    // Check if already processed
    const { data: existing, error: selError } = await supabaseAdmin.from('settings').select('id').eq('id', 'payment_' + paymentId).single();
    if (selError && selError.code !== 'PGRST116') {
        console.error('Error checking existing payment (Possible RLS issue):', selError);
        throw new Error("Failed to check existing payment: " + selError.message);
    }
    
    if (existing) {
      console.log('Payment already processed:', paymentId);
      return;
    }
    
    // Get user
    const { data: userData, error: userError } = await supabaseAdmin.from("users").select("subscription_expires_at").eq("id", adminId).single();
    if (userError) {
       console.error('Error fetching user (Possible RLS issue):', userError);
       throw new Error("Failed to fetch user: " + userError.message);
    }

    let currentExpiry = new Date();
    if (userData && userData.subscription_expires_at) {
       const userExpiry = new Date(userData.subscription_expires_at);
       if (userExpiry > currentExpiry) {
           currentExpiry = userExpiry;
       }
    }
    currentExpiry.setDate(currentExpiry.getDate() + 30);
    
    // Update user
    const { data: updateData, error: updateError } = await supabaseAdmin.from("users").update({
      subscription_status: 'active',
      subscription_expires_at: currentExpiry.toISOString(),
    }).eq('id', adminId).select();
    
    if (!updateError && (!updateData || updateData.length === 0)) {
        throw new Error("Update silent failure: Check if SUPABASE_SERVICE_ROLE_KEY is valid. RLS might have blocked the update.");
    }

    if (updateError) {
        console.error('Error updating user (Possible RLS issue):', updateError);
        throw new Error("Failed to update user: " + updateError.message);
    }
    
    // Mark as processed
    const { error: insError } = await supabaseAdmin.from('settings').insert({ id: 'payment_' + paymentId });
    if (insError) {
        console.error('Error inserting settings (Possible RLS issue):', insError);
        throw new Error("Failed to insert payment record: " + insError.message);
    }
    
    console.log('Successfully processed payment:', paymentId);
  } catch (error) {
    console.error('Critical Error processing payment:', error);
    throw error;
  }
}


  app.all("/api/sync-payment", async (req, res) => {
    const payment_id = req.body?.payment_id || req.query?.payment_id || req.query?.id;
    if (!payment_id) return res.status(400).json({ error: "Missing payment_id" });
    
    let mpToken = process.env.MP_ACCESS_TOKEN;
    if (!mpToken || mpToken.length < 40) {
      mpToken = "APP_USR-5520671839390863-031622-4f2fede32936291cc0567aebae0a319e-1434591190";
    }
    
    try {
      const client = new MercadoPagoConfig({ accessToken: mpToken });
      const paymentDetails = new Payment(client);
      const paymentInfo = await paymentDetails.get({ id: String(payment_id) });
      
      console.log("Sync Info:", paymentInfo.status, paymentInfo.external_reference);
      if (paymentInfo.status === "approved" && paymentInfo.external_reference) {
        await processPayment(paymentInfo.id, paymentInfo.external_reference);
        return res.json({ success: true });
      } else {
        return res.status(400).json({ error: "Payment not approved or missing external_reference" });
      }
    } catch (e: any) {
      console.error(e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/mp-webhook", async (req, res) => {
    console.log("Received MP Webhook:", req.query, req.body);
    let dataId = req.query["data.id"] || req.query.id || (req.body && req.body.data && req.body.data.id) || (req.body && req.body.id);
    let type = req.query.type || req.query.topic || (req.body && req.body.type) || (req.body && req.body.topic) || (req.body && req.body.action);
    
    console.log("Extracted Webhook Data - type:", type, "dataId:", dataId);

    if ((type === "payment" || type === "payment.created" || type === "payment.updated") && dataId) {
      let mpToken = process.env.MP_ACCESS_TOKEN;
      if (!mpToken || mpToken.length < 40) {
        mpToken = "APP_USR-5520671839390863-031622-4f2fede32936291cc0567aebae0a319e-1434591190";
      }

      if (!mpToken || !supabaseUrl) {
        console.error("Missing MP token or Supabase is not initialized.");
        return res.status(200).send("OK. But not processed due to missing config.");
      }

      try {
        const client = new MercadoPagoConfig({ accessToken: mpToken });
        const paymentDetails = new Payment(client);
        const paymentInfo = await paymentDetails.get({ id: dataId as string });
        
        console.log("Payment Info:", paymentInfo.status, paymentInfo.external_reference);

        if (paymentInfo.status === "approved" && paymentInfo.external_reference) {
          const adminId = paymentInfo.external_reference;
          
          await processPayment(paymentInfo.id, adminId);
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
    
    // Prevent silent SyntaxErrors: Return 404 for missing assets instead of index.html
    app.get('/assets/*', (req, res) => {
      res.status(404).send('Asset not found');
    });

    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
