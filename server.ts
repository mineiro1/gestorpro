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

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
let fcmInitialized = false;
try {
  if (getApps().length > 0) {
    fcmInitialized = true;
  } else {
    let serviceAccount = null;
    if (fs.existsSync('./service-account.json')) {
      try {
        serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));
      } catch (e) {}
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
        serviceAccount = raw.startsWith('{') ? JSON.parse(raw) : JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
      } catch (e) {}
    }

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

    initializeApp({
      credential: cert(serviceAccount)
    });
    fcmInitialized = true;
    console.log("Firebase Admin Initialized for Push Notifications (Project: " + serviceAccount.project_id + ")");
  }
} catch (e: any) {
  console.log("Error initializing Firebase Admin:", e.message);
}

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
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
            success: `${(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://www.rspiscinas.app.br')}/`,
            failure: `${(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://www.rspiscinas.app.br')}/`,
            pending: `${(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://www.rspiscinas.app.br')}/`
          },
          auto_return: "approved",
          notification_url: `${(process.env.PUBLIC_URL || origin || req.headers.origin || 'https://www.rspiscinas.app.br')}/api/mp-webhook`
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


  
// In-memory idempotency cache (stores client message IDs for deduplication within 30-120 seconds)
const processedMessageClientIds = new Map<string, { timestamp: number; externalId: string; messageId?: string; success: boolean }>();

// Clean up stale idempotency records periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of processedMessageClientIds.entries()) {
    if (now - val.timestamp > 120000) {
      processedMessageClientIds.delete(key);
    }
  }
}, 60000);

  app.get("/api/chat/messages/:clientId", async (req, res) => {
    try {
      const { clientId } = req.params;
      if (!clientId) return res.status(400).json({ error: "Missing clientId" });

      const { data: sData } = await supabaseAdmin
        .from('chat_sessions')
        .select('id')
        .eq('client_id', clientId);

      if (!sData || sData.length === 0) {
        return res.json({ success: true, messages: [] });
      }

      const sessionIds = sData.map((s) => s.id);

      const { data: loadedMsgs, error } = await supabaseAdmin
        .from('chat_messages')
        .select('*')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: true });

      if (error) {
        console.error("[/api/chat/messages] Erro ao buscar mensagens:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.json({ success: true, messages: loadedMsgs || [] });
    } catch (e: any) {
      console.error("[/api/chat/messages] Erro inesperado:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/chat/session/:clientId", async (req, res) => {
    try {
      const { clientId } = req.params;
      if (!clientId) return res.status(400).json({ error: "Missing clientId" });

      const { data: allSessions, error } = await supabaseAdmin
        .from('chat_sessions')
        .select('id, status, created_at, closed_at, client_id, admin_id, employee_id, visit_id')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("[/api/chat/session] Erro ao buscar sessões:", error);
        return res.status(500).json({ error: error.message });
      }

      const active = (allSessions || []).find(s => s.status === 'open' || s.status === 'active') || allSessions?.[0] || null;
      return res.json({ success: true, session: active, allSessions: allSessions || [] });
    } catch (e: any) {
      console.error("[/api/chat/session] Erro inesperado:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/chat/close", async (req, res) => {
    try {
      const { clientId } = req.body;
      if (!clientId) return res.status(400).json({ error: "Missing clientId" });
      await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('client_id', clientId).eq('status', 'open');
      return res.json({ success: true });
    } catch(e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/chat/session/ensure", async (req, res) => {
    try {
      const { clientId, adminId, employeeId, visitId } = req.body;
      if (!clientId) return res.status(400).json({ error: "Missing clientId" });

      // 1. Procurar sessão open existente
      const { data: openSessions } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (openSessions && openSessions.length > 0) {
        const currentSession = openSessions[0];
        if (openSessions.length > 1) {
          const extraIds = openSessions.slice(1).map(s => s.id);
          await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).in('id', extraIds);
        }
        return res.json({ success: true, session: currentSession });
      }

      // 2. Descobrir dados do cliente se adminId ou employeeId não foram passados
      let resolvedAdminId = adminId;
      let resolvedEmpId = employeeId || adminId;

      const { data: clientRow } = await supabaseAdmin.from('clients').select('admin_id, employee_id').eq('id', clientId).maybeSingle();
      if (clientRow) {
        resolvedAdminId = resolvedAdminId || clientRow.admin_id;
        resolvedEmpId = resolvedEmpId || clientRow.employee_id || clientRow.admin_id;
      }

      // Se ainda não temos adminId, buscar o primeiro usuário admin ativo
      if (!resolvedAdminId || !resolvedEmpId) {
        const { data: anyAdmin } = await supabaseAdmin.from('users').select('id').eq('role', 'admin').limit(1).maybeSingle();
        if (anyAdmin?.id) {
          resolvedAdminId = resolvedAdminId || anyAdmin.id;
          resolvedEmpId = resolvedEmpId || anyAdmin.id;
        }
      }

      // 3. Criar nova sessão de atendimento (somente colunas válidas no schema)
      const { data: newSession, error: createErr } = await supabaseAdmin
        .from('chat_sessions')
        .insert({
          client_id: clientId,
          visit_id: visitId || null,
          admin_id: resolvedAdminId,
          employee_id: resolvedEmpId,
          status: 'open',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createErr) {
        console.error("[/api/chat/session/ensure] Erro ao criar sessão:", createErr);
        return res.status(500).json({ error: createErr.message });
      }

      return res.json({ success: true, session: newSession });
    } catch (e: any) {
      console.error("[/api/chat/session/ensure] Erro inesperado:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/chat/upload", async (req, res) => {
    try {
      const { mediaBase64, mimeType } = req.body;
      if (!mediaBase64) {
        return res.status(400).json({ error: "Missing mediaBase64" });
      }

      if (mediaBase64.startsWith('http://') || mediaBase64.startsWith('https://')) {
        return res.json({ success: true, publicUrl: mediaBase64 });
      }

      const rawBase64 = mediaBase64.includes('base64,') ? mediaBase64.split('base64,')[1] : mediaBase64;
      const buffer = Buffer.from(rawBase64, 'base64');

      let ext = 'bin';
      if (mimeType?.includes('png')) ext = 'png';
      else if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) ext = 'jpg';
      else if (mimeType?.includes('webp')) ext = 'webp';
      else if (mimeType?.includes('mp4')) ext = 'mp4';
      else if (mimeType?.includes('webm')) ext = 'webm';
      else if (mimeType?.includes('ogg')) ext = 'ogg';
      else if (mimeType?.includes('mp3') || mimeType?.includes('mpeg')) ext = 'mp3';
      else if (mimeType?.includes('pdf')) ext = 'pdf';

      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

      const { error: uploadErr } = await supabaseAdmin.storage
        .from('chat-media')
        .upload(fileName, buffer, {
          contentType: mimeType || 'application/octet-stream',
          upsert: true
        });

      if (uploadErr) {
        console.error("[/api/chat/upload] Erro Supabase storage:", uploadErr);
        return res.status(500).json({ error: uploadErr.message });
      }

      const { data: pubData } = supabaseAdmin.storage.from('chat-media').getPublicUrl(fileName);
      if (!pubData?.publicUrl) {
        return res.status(500).json({ error: "Could not generate public URL" });
      }

      return res.json({ success: true, publicUrl: pubData.publicUrl });
    } catch (e: any) {
      console.error("[/api/chat/upload] Exception:", e);
      return res.status(500).json({ error: e.message || "Upload failed" });
    }
  });

  app.post("/api/chat/send", async (req, res) => {
    try {
      let { text, clientPhone, waSettings, messageId, sessionId, senderName, message_client_id, mediaBase64, mimeType, mediaUrl } = req.body;
      if ((!text && !mediaBase64 && !mediaUrl) || !clientPhone) return res.status(400).json({ error: "Missing fields" });

      const cleanDigits = String(clientPhone).replace(/\D/g, '');
      const targetNumber = cleanDigits.startsWith('55') ? cleanDigits : `55${cleanDigits}`;

      // Gerar ou sanitizar message_client_id para controle estrito de idempotência
      const clientMsgId = String(message_client_id || req.headers['x-idempotency-key'] || (messageId ? `mid_${messageId}` : `txt_${targetNumber}_${(text || '').trim().substring(0, 30)}_${mediaBase64 ? 'media' : 'txt'}`));
      const now = Date.now();

      // 1. Verificação de Idempotência em Memória (< 30 segundos)
      if (processedMessageClientIds.has(clientMsgId)) {
        const cached = processedMessageClientIds.get(clientMsgId)!;
        if (cached.success && now - cached.timestamp < 30000) {
          console.log(`[Idempotência] Ignorando envio duplicado (Memória): ${clientMsgId}`);
          return res.json({
            success: true,
            duplicated: true,
            externalId: cached.externalId || undefined,
            messageId: cached.messageId || messageId,
            message_client_id: clientMsgId
          });
        }
      }

      // Se waSettings não estiver completo, buscar configurações do admin no banco
      if (!waSettings?.evolutionApiKey && !waSettings?.metaToken) {
        let adminToSearch = req.body.adminId;
        if (!adminToSearch && req.body.clientId) {
          const { data: clientRow } = await supabaseAdmin.from('clients').select('admin_id').eq('id', req.body.clientId).maybeSingle();
          if (clientRow?.admin_id) adminToSearch = clientRow.admin_id;
        }

        if (adminToSearch) {
          const { data: specificAdmin } = await supabaseAdmin.from('users').select('whatsapp_settings').eq('id', adminToSearch).maybeSingle();
          if (specificAdmin?.whatsapp_settings?.metaToken || specificAdmin?.whatsapp_settings?.evolutionApiKey) {
            waSettings = specificAdmin.whatsapp_settings;
          }
        }

        if (!waSettings?.evolutionApiKey && !waSettings?.metaToken) {
          const { data: adminUsers } = await supabaseAdmin
            .from('users')
            .select('whatsapp_settings')
            .not('whatsapp_settings', 'is', null);
          const validAdmin = adminUsers?.find(u => u.whatsapp_settings?.evolutionApiKey || u.whatsapp_settings?.metaToken);
          if (validAdmin?.whatsapp_settings) {
            waSettings = validAdmin.whatsapp_settings;
          }
        }
      }

      // 3. Se houver mídia em base64, fazer upload para o Supabase Storage (bucket 'chat-media') para obter uma URL pública estável
      let publicMediaUrl = mediaUrl || '';
      if (mediaBase64 && (!publicMediaUrl || !publicMediaUrl.startsWith('http'))) {
        try {
          const rawBase64 = mediaBase64.includes('base64,') ? mediaBase64.split('base64,')[1] : mediaBase64;
          const buffer = Buffer.from(rawBase64, 'base64');
          
          let ext = 'bin';
          if (mimeType?.includes('png')) ext = 'png';
          else if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) ext = 'jpg';
          else if (mimeType?.includes('webp')) ext = 'webp';
          else if (mimeType?.includes('mp4')) ext = 'mp4';
          else if (mimeType?.includes('webm')) ext = 'webm';
          else if (mimeType?.includes('ogg')) ext = 'ogg';
          else if (mimeType?.includes('mp3') || mimeType?.includes('mpeg')) ext = 'mp3';
          else if (mimeType?.includes('pdf')) ext = 'pdf';

          const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
          
          const { error: uploadErr } = await supabaseAdmin.storage
            .from('chat-media')
            .upload(fileName, buffer, {
              contentType: mimeType || 'application/octet-stream',
              upsert: true
            });

          if (!uploadErr) {
            const { data: pubData } = supabaseAdmin.storage.from('chat-media').getPublicUrl(fileName);
            if (pubData?.publicUrl) {
              publicMediaUrl = pubData.publicUrl;
            }
          } else {
            console.warn("[/api/chat/send] Erro upload Storage Supabase:", uploadErr);
          }
        } catch (storageErr) {
          console.error("[/api/chat/send] Falha no processamento de mídia storage:", storageErr);
        }
      }

      let externalId = '';
      let sendSuccess = false;
      let lastSendError = '';

      // Determine active provider
      const provider = waSettings?.provider || (waSettings?.useMetaApi ? 'meta' : (waSettings?.useEvolutionApi ? 'evolution' : (waSettings?.useAstracalls !== false ? 'astracalls' : 'astracalls')));

      // 1. Provedor: AstraCalls
      if (provider === 'astracalls' || (waSettings?.useAstracalls && !waSettings?.useMetaApi && !waSettings?.useEvolutionApi)) {
        const astracallsUrl = (waSettings?.astracallsUrl || 'https://calls.rspiscinas.app.br').trim().replace(/\/$/, '');
        const astracallsApiKey = waSettings?.astracallsApiKey || 'rs_piscinas_segredo_2026';
        let sessionId = waSettings?.astracallsSessionId || '8090cca3add0b8eb3e41efb9eec363e4';

        try {
          if (!waSettings?.astracallsSessionId) {
            try {
              const sessRes = await fetch(`${astracallsUrl}/api/sessions`, {
                headers: { 'X-Api-Key': astracallsApiKey }
              });
              if (sessRes.ok) {
                const sData = await sessRes.json();
                const openSess = sData?.sessions?.find((s: any) => s.state === 'open' || s.paired) || sData?.sessions?.[0];
                if (openSess?.id) sessionId = openSess.id;
              }
            } catch (e) {}
          }

          const rawClean = targetNumber.replace(/\D/g, '');
          let twelveDigit = '';
          let thirteenDigit = '';

          let baseNum = rawClean;
          if (!baseNum.startsWith('55')) {
            if (baseNum.length === 10 || baseNum.length === 11) baseNum = '55' + baseNum;
            else if (baseNum.length === 8 || baseNum.length === 9) baseNum = '5567' + baseNum;
          }

          if (baseNum.startsWith('55') && baseNum.length >= 12) {
            const ddd = baseNum.substring(2, 4);
            const rest = baseNum.substring(4);
            if (baseNum.length === 13 && rest.startsWith('9')) {
              thirteenDigit = baseNum;
              twelveDigit = `55${ddd}${rest.substring(1)}`;
            } else if (baseNum.length === 12) {
              twelveDigit = baseNum;
              thirteenDigit = `55${ddd}9${rest}`;
            }
          }

          // Para AstraCalls: O formato de 12 dígitos sem o 9 (ex: 556791907236) DEVE ser o primeiro a ser enviado!
          const numbersToTry: string[] = [];
          if (twelveDigit) numbersToTry.push(twelveDigit);
          if (thirteenDigit) numbersToTry.push(thirteenDigit);
          if (!twelveDigit && !thirteenDigit) numbersToTry.push(targetNumber);

          let lastResponseText = '';
          for (const num of numbersToTry) {
            let sendEndpoint = `${astracallsUrl}/api/sessions/${sessionId}/messages/text`;
            let payload: any = {
              to: num,
              phone: num,
              recipient: num,
              text: text || '',
              message: text || ''
            };

            const mediaData = mediaBase64 || publicMediaUrl;
            if (mediaData) {
              const cleanCaption = (text && text !== '📸 Foto' && text !== '🎥 Vídeo') ? text : '';
              if (mimeType?.startsWith('image/')) {
                sendEndpoint = `${astracallsUrl}/api/sessions/${sessionId}/messages/image`;
                payload = {
                  to: num,
                  base64: mediaData,
                  caption: cleanCaption
                };
              } else if (mimeType?.startsWith('video/')) {
                sendEndpoint = `${astracallsUrl}/api/sessions/${sessionId}/messages/video`;
                payload = {
                  to: num,
                  base64: mediaData,
                  caption: cleanCaption
                };
              } else if (mimeType?.startsWith('audio/')) {
                sendEndpoint = `${astracallsUrl}/api/sessions/${sessionId}/messages/audio`;
                payload = {
                  to: num,
                  base64: mediaData
                };
              } else {
                sendEndpoint = `${astracallsUrl}/api/sessions/${sessionId}/messages/document`;
                payload = {
                  to: num,
                  base64: mediaData,
                  filename: 'documento',
                  caption: text || ''
                };
              }
            }

            const response = await fetch(sendEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': astracallsApiKey
              },
              body: JSON.stringify(payload)
            });

            if (response.ok) {
              sendSuccess = true;
              try {
                const astraData = await response.json();
                externalId = astraData?.id || astraData?.messageId || astraData?.key?.id || `astra_${Date.now()}`;
              } catch (e) {
                externalId = `astra_${Date.now()}`;
              }
              break;
            } else {
              lastResponseText = await response.text().catch(() => '');
            }
          }

          if (!sendSuccess) {
            lastSendError = `Erro AstraCalls: ${lastResponseText}`;
            console.warn("[/api/chat/send] AstraCalls error response:", lastResponseText);
          }
        } catch (astraErr: any) {
          lastSendError = `Falha na conexão com AstraCalls: ${astraErr.message}`;
          console.error("[/api/chat/send] Erro conexao AstraCalls:", astraErr.message);
        }
      } else if (provider === 'evolution' || (waSettings?.useEvolutionApi && waSettings?.evolutionApiUrl && waSettings?.evolutionApiKey && waSettings?.evolutionInstanceName)) {
        let baseUrl = waSettings.evolutionApiUrl.trim().replace(/\/$/, '');
        if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;

        let evoUrl = `${baseUrl}/message/sendText/${waSettings.evolutionInstanceName}`;
        let evoBody: any = {
          number: targetNumber,
          text: text || '',
          options: { delay: 500, presence: 'composing', linkPreview: false }
        };

        if (publicMediaUrl || mediaBase64) {
          const rawBase64 = mediaBase64?.includes('base64,') ? mediaBase64.split('base64,')[1] : (mediaBase64 || '');
          const mediaSource = publicMediaUrl || (mediaBase64 ? (mediaBase64.startsWith('data:') ? mediaBase64 : `data:${mimeType};base64,${mediaBase64}`) : '');
          
          if (mimeType?.startsWith('audio/')) {
            evoUrl = `${baseUrl}/message/sendWhatsAppAudio/${waSettings.evolutionInstanceName}`;
            evoBody = {
              number: targetNumber,
              audio: mediaSource,
              base64: rawBase64 || undefined,
              options: { delay: 500, presence: 'recording', encoding: true }
            };
          } else {
            evoUrl = `${baseUrl}/message/sendMedia/${waSettings.evolutionInstanceName}`;
            const mediatype = mimeType?.startsWith('video/') ? 'video' : (mimeType?.startsWith('image/') ? 'image' : 'document');
            evoBody = {
              number: targetNumber,
              media: mediaSource,
              base64: rawBase64 || undefined,
              mediatype: mediatype,
              caption: text || ''
            };
          }
        }

        try {
          const response = await fetch(evoUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': waSettings.evolutionApiKey
            },
            body: JSON.stringify(evoBody)
          });

          if (response.ok) {
            sendSuccess = true;
            try {
              const evoData = await response.json();
              externalId = evoData?.key?.id || 
                           evoData?.data?.key?.id || 
                           evoData?.messageId || 
                           evoData?.id || 
                           evoData?.messages?.[0]?.key?.id || 
                           evoData?.messages?.[0]?.id || '';
            } catch (e) {}
          } else {
            const errData = await response.json().catch(() => ({}));
            lastSendError = errData?.message || JSON.stringify(errData);
            console.warn("[/api/chat/send] Evolution API error response:", errData);
          }
        } catch (evoFetchErr: any) {
          lastSendError = evoFetchErr.message;
          console.error("[/api/chat/send] Erro conexão Evolution API:", evoFetchErr);
        }
      } else if (waSettings?.useMetaApi || waSettings?.metaToken) {
        if (!waSettings?.metaToken) throw new Error("Token Meta obrigatório");
        
        let baseUrl = (waSettings.metaServerUrl || 'https://graph.facebook.com/v19.0').trim().replace(/\/$/, '');
        if (!baseUrl.startsWith('http')) {
          baseUrl = 'https://' + baseUrl;
        }
        const isWame = baseUrl && !baseUrl.includes('graph.facebook.com');
        
        let url, headers, body;
        if (isWame) {
           headers = { 'Content-Type': 'application/json' };
           
           if (publicMediaUrl) {
             if (mimeType?.startsWith('image/')) {
               url = `${baseUrl}/${waSettings.metaToken}/message/image`;
               body = JSON.stringify({
                 to: targetNumber,
                 url: publicMediaUrl,
                 caption: text || ''
               });
             } else if (mimeType?.startsWith('video/')) {
               url = `${baseUrl}/${waSettings.metaToken}/message/video`;
               body = JSON.stringify({
                 to: targetNumber,
                 url: publicMediaUrl,
                 caption: text || ''
               });
             } else if (mimeType?.startsWith('audio/')) {
               url = `${baseUrl}/${waSettings.metaToken}/message/audio`;
               body = JSON.stringify({
                 to: targetNumber,
                 url: publicMediaUrl
               });
             } else {
               url = `${baseUrl}/${waSettings.metaToken}/message/document`;
               body = JSON.stringify({
                 to: targetNumber,
                 url: publicMediaUrl,
                 mimetype: mimeType || 'application/octet-stream',
                 filename: 'arquivo',
                 caption: text || ''
               });
             }
           } else {
             url = `${baseUrl}/${waSettings.metaToken}/message/text`;
             body = JSON.stringify({
               to: targetNumber,
               text: text || '',
               linkPreview: false,
               preview_url: false,
               options: { linkPreview: false }
             });
           }
        } else {
           const phoneId = waSettings.metaPhoneNumberId ? `/${waSettings.metaPhoneNumberId}` : '';
           url = `${baseUrl}${phoneId}/messages`;
           headers = {
              'Authorization': `Bearer ${waSettings.metaToken}`,
              'Content-Type': 'application/json'
           };
           if (publicMediaUrl) {
             const isVideo = mimeType?.startsWith('video/');
             const mediaType = isVideo ? 'video' : 'image';
             body = JSON.stringify({
               messaging_product: "whatsapp",
               recipient_type: "individual",
               to: targetNumber,
               type: mediaType,
               [mediaType]: {
                 caption: text || '',
                 link: publicMediaUrl
               }
             });
           } else {
             body = JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: targetNumber,
                type: "text",
                text: { preview_url: false, body: text || '' }
             });
           }
        }
        
        try {
          const response = await fetch(url, { method: 'POST', headers, body });
          if (response.ok) {
            sendSuccess = true;
            try {
              const metaData = await response.json();
              externalId = metaData?.messages?.[0]?.id || 
                           metaData?.id || 
                           metaData?.key?.id || 
                           metaData?.data?.key?.id || '';
            } catch (e) {}
          } else {
            const errText = await response.text().catch(() => '');
            lastSendError = errText;
            console.warn("[/api/chat/send] Meta/WAME API error response:", errText);
          }
        } catch (metaFetchErr: any) {
          lastSendError = metaFetchErr.message;
          console.error("[/api/chat/send] Erro conexão Meta/WAME API:", metaFetchErr);
        }
      } else {
        lastSendError = "Nenhum provedor de WhatsApp (Meta ou Evolution) está ativo nas configurações.";
      }
      
      const mediaPayload = {
        status: sendSuccess ? 'sent' : 'failed',
        external_id: externalId || undefined,
        message_client_id: clientMsgId,
        url: publicMediaUrl || mediaBase64 || undefined,
        sender_name: senderName || 'Colaborador',
        sent_at: sendSuccess ? new Date().toISOString() : undefined,
        error: sendSuccess ? undefined : (lastSendError || 'Falha no envio')
      };

      let insertedRow: any = null;

      // Atualiza o registro da mensagem no banco ou cria caso não exista
      if (messageId) {
        try {
          const { data: currentMsg } = await supabaseAdmin
            .from('chat_messages')
            .select('media_url')
            .eq('id', messageId)
            .single();

          let meta: any = {};
          if (currentMsg?.media_url) {
            try { meta = JSON.parse(currentMsg.media_url); } catch(e) {}
          }

          const { data: updated } = await supabaseAdmin
            .from('chat_messages')
            .update({
              media_url: JSON.stringify({
                ...meta,
                ...mediaPayload
              })
            })
            .eq('id', messageId)
            .select()
            .single();
          if (updated) insertedRow = updated;
        } catch (dbErr) {
          console.error("[/api/chat/send] Erro ao atualizar external_id no banco:", dbErr);
        }
      } else if (sessionId) {
        try {
          const { data: created } = await supabaseAdmin
            .from('chat_messages')
            .insert({
              session_id: sessionId,
              sender_type: 'tech',
              content: text,
              media_url: JSON.stringify(mediaPayload)
            })
            .select()
            .single();
          if (created) {
            messageId = created.id;
            insertedRow = created;
          }
        } catch (dbErr) {
          console.error("[/api/chat/send] Erro ao inserir mensagem no banco:", dbErr);
        }
      } else if (req.body.clientId) {
        try {
          const { data: existingSessions } = await supabaseAdmin
            .from('chat_sessions')
            .select('id, status')
            .eq('client_id', req.body.clientId)
            .order('created_at', { ascending: false })
            .limit(5);

          let sessId = existingSessions?.find(s => s.status === 'open')?.id || existingSessions?.[0]?.id;
          if (!sessId) {
            const { data: clientRow } = await supabaseAdmin.from('clients').select('admin_id, employee_id').eq('id', req.body.clientId).maybeSingle();
            let adminId = clientRow?.admin_id;
            let employeeId = clientRow?.employee_id || adminId;

            if (!adminId) {
              const { data: anyAdmin } = await supabaseAdmin.from('users').select('id').eq('role', 'admin').limit(1).maybeSingle();
              adminId = anyAdmin?.id;
              employeeId = adminId;
            }

            const { data: createdSess } = await supabaseAdmin.from('chat_sessions').insert({
              client_id: req.body.clientId,
              admin_id: adminId || null,
              employee_id: employeeId || null,
              status: 'open',
              created_at: new Date().toISOString()
            }).select('id').single();
            sessId = createdSess?.id;
          }

          if (sessId) {
            const { data: created } = await supabaseAdmin
              .from('chat_messages')
              .insert({
                session_id: sessId,
                sender_type: 'tech',
                content: text,
                media_url: JSON.stringify(mediaPayload)
              })
              .select()
              .single();
            if (created) {
              messageId = created.id;
              insertedRow = created;
            }
          }
        } catch (dbErr) {
          console.error("[/api/chat/send] Erro ao associar sessão/mensagem de relatório no banco:", dbErr);
        }
      }

      // Atualiza o cache com a resposta definitiva
      processedMessageClientIds.set(clientMsgId, {
        timestamp: Date.now(),
        externalId: externalId || '',
        messageId: messageId || '',
        success: sendSuccess
      });

      res.json({
        success: sendSuccess,
        externalId: externalId || undefined,
        messageId,
        message: insertedRow,
        message_client_id: clientMsgId,
        error: sendSuccess ? undefined : lastSendError
      });
    } catch(e: any) {
      console.error("[/api/chat/send] Erro:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/call/start", async (req, res) => {
    try {
      const { clientId, phone, adminId } = req.body;
      if (!clientId && !phone) {
        return res.status(400).json({ error: "Missing clientId or phone" });
      }

      let rawNumber = '';
      let clientName = 'Cliente';

      if (clientId) {
        const { data: client, error: clientErr } = await supabaseAdmin
          .from('clients')
          .select('id, name, phone, admin_id')
          .eq('id', clientId)
          .single();

        if (client && client.phone) {
          clientName = client.name || clientName;
          rawNumber = client.phone;
        }
      }

      if (!rawNumber && phone) {
        rawNumber = phone;
      }

      const cleanDigits = String(rawNumber || '').replace(/\D/g, '');
      if (!cleanDigits) {
        return res.status(404).json({ error: "Número do cliente não encontrado" });
      }

      // Normalização inteligente de DDI 55 e 9º dígito para AstraCalls VoIP
      let baseNumber = cleanDigits;
      if (!baseNumber.startsWith('55')) {
        if (baseNumber.length === 10 || baseNumber.length === 11) baseNumber = '55' + baseNumber;
        else if (baseNumber.length === 8 || baseNumber.length === 9) baseNumber = '5567' + baseNumber;
      }

      let twelveDigit = '';
      let thirteenDigit = '';
      if (baseNumber.startsWith('55') && baseNumber.length >= 12) {
        const ddd = baseNumber.substring(2, 4);
        const rest = baseNumber.substring(4);
        if (baseNumber.length === 13 && rest.startsWith('9')) {
          thirteenDigit = baseNumber;
          twelveDigit = `55${ddd}${rest.substring(1)}`;
        } else if (baseNumber.length === 12) {
          twelveDigit = baseNumber;
          thirteenDigit = `55${ddd}9${rest}`;
        }
      }

      // Para AstraCalls VoIP: O formato de 12 dígitos sem o 9 DEVE vir em primeiro lugar!
      const variants: string[] = [];
      if (twelveDigit) variants.push(twelveDigit);
      if (thirteenDigit) variants.push(thirteenDigit);
      if (!twelveDigit && !thirteenDigit) variants.push(baseNumber);

      // 2. AstraCalls session settings
      const astracallsUrl = (process.env.ASTRACALLS_URL || 'https://calls.rspiscinas.app.br').trim().replace(/\/$/, '');
      const astracallsApiKey = process.env.ASTRACALLS_API_KEY || 'rs_piscinas_segredo_2026';
      let sessionId = '8090cca3add0b8eb3e41efb9eec363e4';

      try {
        const sessRes = await fetch(`${astracallsUrl}/api/sessions`, {
          headers: { 'X-Api-Key': astracallsApiKey }
        });
        if (sessRes.ok) {
          const sData = await sessRes.json();
          const openSess = sData?.sessions?.find((s: any) => s.state === 'open' || s.paired) || sData?.sessions?.[0];
          if (openSess?.id) sessionId = openSess.id;
        }
      } catch (e) {}

      // 3. Initiate Real VoIP Call on AstraCalls (tentando variantes se necessário)
      let realCallId = `call_${Date.now()}`;
      let callCreated = false;

      for (const targetNumber of variants) {
        try {
          console.log(`[AstraCalls VoIP] Tentando chamada para ${targetNumber} na sessão ${sessionId}...`);
          const callRes = await fetch(`${astracallsUrl}/api/sessions/${sessionId}/calls`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': astracallsApiKey
            },
            body: JSON.stringify({
              to: targetNumber,
              phone: targetNumber
            })
          });

          if (callRes.ok) {
            const callData = await callRes.json();
            realCallId = callData?.call?.callId || callData?.callId || realCallId;
            console.log(`[AstraCalls VoIP] Chamada iniciada com sucesso no WhatsApp para ${targetNumber}! CallId: ${realCallId}`);
            callCreated = true;
            break;
          } else {
            const errBody = await callRes.text();
            console.warn(`[AstraCalls VoIP] Tentativa para ${targetNumber} retornou ${callRes.status}:`, errBody);
          }
        } catch (voipErr: any) {
          console.error(`[AstraCalls VoIP] Erro ao disparar para ${targetNumber}:`, voipErr.message);
        }
      }

      console.log(`[Call Started] In-App Call initiated for client ${clientName} (callId: ${realCallId})`);

      return res.json({
        success: true,
        callId: realCallId,
        sessionId,
        astracallsUrl,
        astracallsApiKey,
        clientName,
        status: "connecting"
      });
    } catch (e: any) {
      console.error("[/api/call/start] Erro:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/call/webrtc", async (req, res) => {
    try {
      const { callId, sessionId, sdp_offer } = req.body;
      const astracallsUrl = (process.env.ASTRACALLS_URL || 'https://calls.rspiscinas.app.br').trim().replace(/\/$/, '');
      const astracallsApiKey = process.env.ASTRACALLS_API_KEY || 'rs_piscinas_segredo_2026';
      const sid = sessionId || '8090cca3add0b8eb3e41efb9eec363e4';

      const webrtcRes = await fetch(`${astracallsUrl}/api/sessions/${sid}/calls/${callId}/webrtc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': astracallsApiKey
        },
        body: JSON.stringify({ sdp_offer })
      });

      const data = await webrtcRes.json();
      return res.status(webrtcRes.status).json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/call/hangup", async (req, res) => {
    try {
      const { callId, sessionId, clientId, duration, clientName, callerName } = req.body;
      console.log(`[Call Ended] Call hung up: ${callId || clientId} (duration: ${duration || 0}s)`);

      const sid = sessionId || 'd4f80e0ee23755d62116e25eabe7501b';
      const astracallsUrl = (process.env.ASTRACALLS_URL || 'https://calls.rspiscinas.app.br').trim().replace(/\/$/, '');
      const astracallsApiKey = process.env.ASTRACALLS_API_KEY || 'rs_piscinas_segredo_2026';

      if (callId) {
        try {
          await fetch(`${astracallsUrl}/api/sessions/${sid}/calls/${callId}`, {
            method: 'DELETE',
            headers: { 'X-Api-Key': astracallsApiKey }
          }).catch(() => {});
        } catch (e) {}
      }

      if (clientId || clientName) {
        const logId = `call_log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        try {
          await supabaseAdmin.from('settings').insert({
            id: logId,
            monthlyprice: Number(duration || 0),
            updated_at: new Date().toISOString()
          });
        } catch (dbErr) {}
      }

      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Endpoints para Gerenciamento do AstraCalls & Histórico de Gravações
  app.get("/api/astracalls/status", async (req, res) => {
    try {
      const astracallsUrl = process.env.ASTRACALLS_URL || 'https://calls.rspiscinas.app.br';
      const astracallsApiKey = process.env.ASTRACALLS_API_KEY || 'rs_piscinas_segredo_2026';

      const response = await fetch(`${astracallsUrl}/api/sessions`, {
        headers: { 'X-Api-Key': astracallsApiKey }
      });

      if (response.ok) {
        const data = await response.json();
        const activeSess = data?.sessions?.find((s: any) => s.state === 'open' || s.paired) || data?.sessions?.[0] || null;
        return res.json({
          success: true,
          online: true,
          url: astracallsUrl,
          session: activeSess,
          sessions: data?.sessions || []
        });
      } else {
        return res.json({
          success: false,
          online: false,
          url: astracallsUrl,
          status: response.status
        });
      }
    } catch (e: any) {
      return res.json({
        success: false,
        online: false,
        error: e.message
      });
    }
  });

  app.post("/api/astracalls/test-message", async (req, res) => {
    try {
      const { phone, message } = req.body;
      if (!phone) return res.status(400).json({ error: "Telefone obrigatório" });

      const cleanDigits = String(phone).replace(/\D/g, '');
      let baseNum = cleanDigits;
      if (!baseNum.startsWith('55')) {
        if (baseNum.length === 10 || baseNum.length === 11) baseNum = '55' + baseNum;
        else if (baseNum.length === 8 || baseNum.length === 9) baseNum = '5567' + baseNum;
      }

      let targetNumber = baseNum;
      if (baseNum.startsWith('55')) {
        const ddd = baseNum.substring(2, 4);
        const rest = baseNum.substring(4);
        if (baseNum.length === 13 && rest.startsWith('9')) {
          targetNumber = `55${ddd}${rest.substring(1)}`;
        }
      }

      const astracallsUrl = 'https://calls.rspiscinas.app.br';
      const astracallsApiKey = 'rs_piscinas_segredo_2026';
      let sessionId = req.body.sessionId || '8090cca3add0b8eb3e41efb9eec363e4';

      try {
        const sessRes = await fetch(`${astracallsUrl}/api/sessions`, {
          headers: { 'X-Api-Key': astracallsApiKey }
        });
        if (sessRes.ok) {
          const sData = await sessRes.json();
          const openSess = sData?.sessions?.find((s: any) => s.state === 'open' || s.paired) || sData?.sessions?.[0];
          if (openSess?.id) sessionId = openSess.id;
        }
      } catch (e) {}

      const resp = await fetch(`${astracallsUrl}/api/sessions/${sessionId}/messages/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': astracallsApiKey
        },
        body: JSON.stringify({
          to: targetNumber,
          phone: targetNumber,
          recipient: targetNumber,
          text: message || '🏊 Olá! Esta é uma mensagem de teste enviada pelo servidor AstraCalls oficial da RS Piscinas!',
          message: message || '🏊 Olá! Esta é uma mensagem de teste enviada pelo servidor AstraCalls oficial da RS Piscinas!'
        })
      });

      const responseText = await resp.text().catch(() => '');
      return res.json({
        success: resp.ok,
        status: resp.status,
        targetUsed: targetNumber,
        response: responseText
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Batch Phone Number Normalization / Standardization Tool for AstraCalls & WhatsApp
  app.post("/api/admin/standardize-phones", async (req, res) => {
    try {
      // 1. Fetch all clients
      const { data: clients, error: cErr } = await supabaseAdmin
        .from('clients')
        .select('id, name, phone, local_phone');
      
      if (cErr) throw cErr;

      let updatedCount = 0;
      const updatedClients: any[] = [];

      for (const c of clients || []) {
        if (!c.phone) continue;
        const clean = c.phone.replace(/\D/g, '');
        let standardPhone = c.phone.trim();
        let needsUpdate = false;

        // Visual CRM phone mask standard: (67) 99190-7236 or (67) 9190-7236
        if (/^\d{10,13}$/.test(standardPhone)) {
          let num = standardPhone;
          if (num.startsWith('55') && (num.length === 12 || num.length === 13)) {
            num = num.substring(2);
          }
          if (num.length === 11) {
            standardPhone = `(${num.substring(0, 2)}) ${num.substring(2, 7)}-${num.substring(7)}`;
            needsUpdate = true;
          } else if (num.length === 10) {
            standardPhone = `(${num.substring(0, 2)}) ${num.substring(2, 6)}-${num.substring(6)}`;
            needsUpdate = true;
          }
        }

        if (needsUpdate && standardPhone !== c.phone) {
          const { error: upErr } = await supabaseAdmin
            .from('clients')
            .update({ phone: standardPhone })
            .eq('id', c.id);
          
          if (!upErr) {
            updatedCount++;
            updatedClients.push({ id: c.id, name: c.name, before: c.phone, after: standardPhone });
          }
        }
      }

      // 2. Fetch agenda_contacts
      const { data: agenda, error: aErr } = await supabaseAdmin
        .from('agenda_contacts')
        .select('id, name, phone');
      
      if (!aErr && agenda) {
        for (const a of agenda) {
          if (!a.phone) continue;
          let standardPhone = a.phone.trim();
          let needsUpdate = false;
          if (/^\d{10,13}$/.test(standardPhone)) {
            let num = standardPhone;
            if (num.startsWith('55') && (num.length === 12 || num.length === 13)) {
              num = num.substring(2);
            }
            if (num.length === 11) {
              standardPhone = `(${num.substring(0, 2)}) ${num.substring(2, 7)}-${num.substring(7)}`;
              needsUpdate = true;
            } else if (num.length === 10) {
              standardPhone = `(${num.substring(0, 2)}) ${num.substring(2, 6)}-${num.substring(6)}`;
              needsUpdate = true;
            }
          }
          if (needsUpdate && standardPhone !== a.phone) {
            await supabaseAdmin.from('agenda_contacts').update({ phone: standardPhone }).eq('id', a.id);
            updatedCount++;
          }
        }
      }

      return res.json({
        success: true,
        totalChecked: (clients?.length || 0) + (agenda?.length || 0),
        updatedCount,
        details: updatedClients
      });
    } catch (e: any) {
      console.error("[/api/admin/standardize-phones] Erro:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  // Call Logs Store (in-memory cache synced with settings table)
  const inMemoryCallLogs: any[] = [
    {
      id: "call_log_1",
      call_id: "call_demo_1",
      client_name: "Centro Sul Piscinas",
      caller_name: "Renivaldo (Admin)",
      duration: 185,
      status: "completed",
      has_recording: true,
      recording_url: "/audio-placeholder.webm",
      created_at: new Date(Date.now() - 3600000 * 2).toISOString()
    }
  ];

  app.get("/api/calls/history", async (req, res) => {
    try {
      const { data: rows } = await supabaseAdmin
        .from('settings')
        .select('id, monthlyprice, updated_at')
        .like('id', 'call_log_%')
        .order('updated_at', { ascending: false })
        .limit(100);

      const dbLogs: any[] = [];
      if (rows && rows.length > 0) {
        for (const r of rows) {
          try {
            if (r.id.includes('__meta_')) {
              const b64 = r.id.split('__meta_')[1];
              const parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
              dbLogs.push({
                id: r.id,
                call_id: parsed.call_id || r.id,
                client_id: parsed.client_id || null,
                client_name: parsed.client_name || "Cliente RS Piscinas",
                caller_name: parsed.caller_name || "Colaborador",
                duration: Number(r.monthlyprice || parsed.duration || 0),
                status: parsed.status || "completed",
                has_recording: !!parsed.recording_url,
                recording_url: parsed.recording_url || "",
                created_at: r.updated_at
              });
              continue;
            }
          } catch (parseErr) {}

          const parts = r.id.split('_');
          const ts = parts[2] ? Number(parts[2]) : new Date(r.updated_at).getTime();
          dbLogs.push({
            id: r.id,
            call_id: `call_${ts}`,
            client_name: "Cliente RS Piscinas",
            caller_name: "Colaborador",
            duration: Number(r.monthlyprice || 0),
            status: "completed",
            has_recording: false,
            recording_url: "",
            created_at: r.updated_at || new Date(ts).toISOString()
          });
        }
      }

      // Merge with in-memory logs (dedup by id)
      const merged = [...inMemoryCallLogs, ...dbLogs];
      const unique = Array.from(new Map(merged.map(item => [item.id, item])).values());
      unique.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return res.json({ success: true, logs: unique });
    } catch (e: any) {
      return res.json({ success: true, logs: inMemoryCallLogs });
    }
  });

  app.post("/api/calls/log", async (req, res) => {
    try {
      const { clientName, clientId, callerName, duration, callId, status, recording_url } = req.body;
      
      const metaObj = {
        call_id: callId || `call_${Date.now()}`,
        client_id: clientId || null,
        client_name: clientName || 'Cliente',
        caller_name: callerName || 'Colaborador',
        duration: Number(duration || 0),
        status: status || 'completed',
        recording_url: recording_url || ''
      };

      const b64 = Buffer.from(JSON.stringify(metaObj)).toString('base64');
      const logId = `call_log_${Date.now()}__meta_${b64}`;

      const newEntry = {
        id: logId,
        ...metaObj,
        has_recording: !!recording_url,
        created_at: new Date().toISOString()
      };

      inMemoryCallLogs.unshift(newEntry);

      try {
        await supabaseAdmin.from('settings').insert({
          id: logId,
          monthlyprice: Number(duration || 0),
          updated_at: new Date().toISOString()
        });
      } catch (e) {}

      return res.json({ success: true, log: newEntry });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/calls/log/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const idx = inMemoryCallLogs.findIndex(l => l.id === id);
      if (idx !== -1) inMemoryCallLogs.splice(idx, 1);
      await supabaseAdmin.from('settings').delete().eq('id', id);
      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/chat/sync-status", async (req, res) => {
    try {
      let { messageIds, waSettings } = req.body;
      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return res.json({ updated: 0, statusMap: {} });
      }

      // Se waSettings não veio ou está vazio (ex: usuário colaborador), buscar as configurações do admin no banco
      if (!waSettings?.metaToken && !waSettings?.evolutionApiKey) {
        const { data: adminUsers } = await supabaseAdmin
          .from('users')
          .select('whatsapp_settings')
          .not('whatsapp_settings', 'is', null);
        const validAdmin = adminUsers?.find(u => u.whatsapp_settings?.metaToken || u.whatsapp_settings?.evolutionApiKey);
        if (validAdmin?.whatsapp_settings) {
          waSettings = validAdmin.whatsapp_settings;
        }
      }

      const { data: msgs } = await supabaseAdmin
        .from('chat_messages')
        .select('id, session_id, media_url, sender_type, created_at')
        .in('id', messageIds)
        .eq('sender_type', 'tech');

      if (!msgs || msgs.length === 0) {
        return res.json({ updated: 0, statusMap: {} });
      }

      let updatedCount = 0;
      const statusMap: Record<string, string> = {};

      // Consultar em paralelo todas as mensagens pendentes para resposta ultra rápida (< 250ms)
      await Promise.all(
        msgs.map(async (msg) => {
          let meta: any = {};
          try { meta = JSON.parse(msg.media_url); } catch(e) {}
          
          if (meta.status === 'read') {
            statusMap[msg.id] = 'read';
            return;
          }

          let remoteStatus: 'sent' | 'delivered' | 'read' | null = null;
          const externalId = meta.external_id;

          if (externalId) {
            // 1. Consulta na API WAME / Meta
            if ((waSettings?.useMetaApi || waSettings?.metaToken) && waSettings?.metaToken) {
              let baseUrl = (waSettings.metaServerUrl || 'https://graph.facebook.com/v19.0').trim().replace(/\/$/, '');
              if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
              const isWame = baseUrl && !baseUrl.includes('graph.facebook.com');

              if (isWame) {
                try {
                  const checkUrl = `${baseUrl}/${waSettings.metaToken}/message/${externalId}`;
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 2500);
                  const checkRes = await fetch(checkUrl, { signal: controller.signal });
                  clearTimeout(timeoutId);

                  if (checkRes.ok) {
                    const msgDetails = await checkRes.json();
                    const label = String(msgDetails?.data?.statusLabel || msgDetails?.statusLabel || msgDetails?.data?.status_label || '').toLowerCase().trim();
                    const numStatus = msgDetails?.data?.status ?? msgDetails?.status ?? msgDetails?.update?.status;
                    const ack = msgDetails?.data?.ack ?? msgDetails?.ack ?? msgDetails?.update?.ack;

                    if (label === 'read' || label === 'played' || label === 'viewed' || numStatus === 4 || numStatus === 5 || ack === 4 || ack === 5) {
                      remoteStatus = 'read';
                    } else if (label === 'delivered' || numStatus === 3 || ack === 3) {
                      remoteStatus = 'delivered';
                    } else if (label === 'sent' || numStatus === 2 || ack === 2) {
                      remoteStatus = 'sent';
                    }
                  }
                } catch(e) {}
              }
            } else if (waSettings?.useEvolutionApi && waSettings?.evolutionApiUrl && waSettings?.evolutionApiKey && waSettings?.evolutionInstanceName) {
              // 2. Consulta na Evolution API
              try {
                let baseUrl = waSettings.evolutionApiUrl.trim().replace(/\/$/, '');
                if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
                const checkUrl = `${baseUrl}/chat/findMessages/${waSettings.evolutionInstanceName}`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2500);
                const checkRes = await fetch(checkUrl, {
                  method: 'POST',
                  signal: controller.signal,
                  headers: {
                    'Content-Type': 'application/json',
                    'apikey': waSettings.evolutionApiKey
                  },
                  body: JSON.stringify({
                    where: {
                      key: {
                        id: externalId
                      }
                    }
                  })
                });
                clearTimeout(timeoutId);

                if (checkRes.ok) {
                  const evoData = await checkRes.json();
                  const rec = evoData?.messages?.records?.[0] || evoData?.records?.[0] || (Array.isArray(evoData) ? evoData[0] : evoData);
                  const rawStatus = rec?.status ?? rec?.update?.status ?? rec?.ack ?? rec?.update?.ack ?? rec?.statusLabel;
                  const str = String(rawStatus || '').toUpperCase().trim();
                  if (str === '4' || str === '5' || str === 'READ' || str === 'PLAYED' || str === 'READ_RECEIPT' || str === 'VIEWED') {
                    remoteStatus = 'read';
                  } else if (str === '3' || str === 'DELIVERY_ACK' || str === 'DELIVERED' || str === 'RECEIVED') {
                    remoteStatus = 'delivered';
                  } else if (str === '2' || str === 'SERVER_ACK' || str === 'SENT') {
                    remoteStatus = 'sent';
                  }
                }
              } catch(e) {}
            }
          }

          // 3. Se o cliente respondeu após esta mensagem no chat, considera lida imediatamente
          if (!remoteStatus || remoteStatus !== 'read') {
            try {
              const { data: replyMsg } = await supabaseAdmin
                .from('chat_messages')
                .select('id')
                .eq('session_id', msg.session_id)
                .eq('sender_type', 'client')
                .gt('created_at', msg.created_at)
                .limit(1);

              if (replyMsg && replyMsg.length > 0) {
                remoteStatus = 'read';
              }
            } catch(e) {}
          }

          // Se ainda estiver 'sending' e já passou mais de 5 segundos, promove para 'sent'
          if (!remoteStatus && (meta.status === 'sending' || !meta.status)) {
            const msgTime = new Date(msg.created_at).getTime();
            if (Date.now() - msgTime > 5000) {
              remoteStatus = 'sent';
            }
          }

          if (remoteStatus) {
            statusMap[msg.id] = remoteStatus;
            if (remoteStatus !== meta.status) {
              await supabaseAdmin
                .from('chat_messages')
                .update({
                  media_url: JSON.stringify({
                    ...meta,
                    status: remoteStatus,
                    status_updated_at: new Date().toISOString()
                  })
                })
                .eq('id', msg.id);
              updatedCount++;
            }
          }
        })
      );

      res.json({ updated: updatedCount, statusMap });
    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Helper to extract message status updates across AstraCalls, Meta, WAME and Evolution formats
  function extractStatusUpdates(body: any): Array<{ id: string; status: 'sent' | 'delivered' | 'read' | 'failed'; phone?: string; timestamp?: string; reason?: string }> {
    const results: Array<{ id: string; status: 'sent' | 'delivered' | 'read' | 'failed'; phone?: string; timestamp?: string; reason?: string }> = [];
    if (!body) return results;

    const mapStatus = (raw: any): 'sent' | 'delivered' | 'read' | 'failed' | null => {
      if (raw === undefined || raw === null) return null;
      const str = String(raw).toUpperCase().trim();
      if (str === '4' || str === '5' || str === 'READ' || str === 'PLAYED' || str === 'READ_RECEIPT' || str === 'VIEWED' || str === 'SEEN' || str === 'OPENED') {
        return 'read';
      }
      if (str === '3' || str === 'DELIVERY_ACK' || str === 'DELIVERED' || str === 'RECEIVED' || str === 'DELIVERED_ACK') {
        return 'delivered';
      }
      if (str === '2' || str === 'SERVER_ACK' || str === 'SENT' || str === 'PENDING' || str === 'ACCEPTED' || str === 'OK') {
        return 'sent';
      }
      if (str === 'FAILED' || str === 'ERROR' || str === 'UNDELIVERED' || str === 'REJECTED' || str === 'DROPPED' || str === 'EXPIRED') {
        return 'failed';
      }
      return null;
    };

    const isReceiptEvent = String(body?.event || body?.type || '').toLowerCase().includes('receipt') || String(body?.event || body?.type || '').toLowerCase().includes('read');

    const inspectItem = (item: any) => {
      if (!item || typeof item !== 'object') return;
      const id = item?.key?.id || item?.id || item?.keyId || item?.messageId || item?.message_id || item?.msgId || item?.update?.key?.id || item?.data?.key?.id || item?.data?.messageId || item?.data?.id;
      const phone = item?.phone || item?.to || item?.recipient || item?.recipient_id || item?.remoteJid || item?.key?.remoteJid || item?.data?.phone || item?.data?.to;
      const timestamp = item?.timestamp || item?.readTimestamp || item?.update?.readTimestamp || item?.read_at || item?.delivered_at || item?.created_at;
      const reason = item?.reason || item?.error || item?.errors?.[0]?.message || item?.message;

      if (!id && !phone) return;

      if (isReceiptEvent || item?.receipt?.readTimestamp || item?.update?.readTimestamp || item?.read_at) {
        results.push({ id: String(id || ''), status: 'read', phone: phone ? String(phone) : undefined, timestamp: timestamp ? String(timestamp) : undefined });
        return;
      }

      const rawStatus = item?.update?.status ?? item?.status ?? item?.ack ?? item?.update?.ack ?? item?.statusLabel ?? item?.update?.statusLabel ?? item?.receipt?.status ?? item?.delivery_status ?? item?.data?.status ?? item?.data?.ack;
      const mapped = mapStatus(rawStatus);
      if (mapped) {
        results.push({ id: String(id || ''), status: mapped, phone: phone ? String(phone) : undefined, timestamp: timestamp ? String(timestamp) : undefined, reason: reason ? String(reason) : undefined });
      }
    };

    // 1. Meta / WhatsApp Cloud API webhook formats
    if (body.entry && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        if (entry.changes && Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            const val = change.value;
            if (val?.statuses && Array.isArray(val.statuses)) {
              for (const st of val.statuses) {
                const mapped = mapStatus(st.status);
                if (st.id && mapped) {
                  results.push({
                    id: String(st.id),
                    status: mapped,
                    phone: st.recipient_id ? String(st.recipient_id) : undefined,
                    timestamp: st.timestamp ? String(st.timestamp) : undefined,
                    reason: st.errors && st.errors[0] ? String(st.errors[0].message || st.errors[0].title) : undefined
                  });
                }
              }
            }
          }
        }
      }
    }

    if (body.statuses && Array.isArray(body.statuses)) {
      for (const st of body.statuses) {
        const mapped = mapStatus(st.status);
        if (st.id && mapped) {
          results.push({
            id: String(st.id),
            status: mapped,
            phone: st.recipient_id ? String(st.recipient_id) : undefined,
            timestamp: st.timestamp ? String(st.timestamp) : undefined
          });
        }
      }
    }

    // 2. AstraCalls webhook formats
    if (body.event === 'message.status' || body.event === 'message.ack' || body.event === 'message_status' || body.event === 'messages.update' || body.type === 'message_status') {
      const astraId = body.messageId || body.id || body.message_id || body.msgId || body.data?.messageId || body.data?.id;
      const astraStatus = body.status || body.ack || body.data?.status || body.data?.ack;
      const mapped = mapStatus(astraStatus);
      if (mapped) {
        results.push({
          id: String(astraId || ''),
          status: mapped,
          phone: body.phone || body.to || body.recipient || body.data?.phone || body.data?.to,
          timestamp: body.timestamp || body.delivered_at || body.read_at,
          reason: body.error || body.reason
        });
      }
    }

    // 3. Array or Object inspections (Evolution, AstraCalls, Custom Webhook)
    if (Array.isArray(body)) {
      body.forEach(inspectItem);
    } else {
      inspectItem(body);
      if (Array.isArray(body.data)) {
        body.data.forEach(inspectItem);
      } else if (body.data && typeof body.data === 'object') {
        inspectItem(body.data);
      }
      if (Array.isArray(body.updates)) {
        body.updates.forEach(inspectItem);
      }
      if (Array.isArray(body.messages)) {
        body.messages.forEach(inspectItem);
      }
    }

    return results;
  }

  async function processStatusUpdates(body: any): Promise<{ updated: number; results: any[] }> {
    const updates = extractStatusUpdates(body);
    if (updates.length === 0) return { updated: 0, results: [] };

    let updatedCount = 0;
    const processedResults: any[] = [];

    for (const update of updates) {
      const { id: externalId, status: newStatus, phone, timestamp, reason } = update;
      let targetMessageId: string | null = null;
      let targetMediaUrl: string | null = null;

      // 1. Match by External ID in media_url JSON
      if (externalId && externalId.length > 3) {
        let { data: foundMsgs } = await supabaseAdmin
          .from('chat_messages')
          .select('id, media_url, sender_type, created_at')
          .eq('sender_type', 'tech')
          .ilike('media_url', `%${externalId}%`)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!foundMsgs || foundMsgs.length === 0) {
          if (externalId.length > 8) {
            const shortId = externalId.slice(-12);
            const { data: fallback } = await supabaseAdmin
              .from('chat_messages')
              .select('id, media_url, sender_type, created_at')
              .eq('sender_type', 'tech')
              .ilike('media_url', `%${shortId}%`)
              .order('created_at', { ascending: false })
              .limit(1);
            foundMsgs = fallback;
          }
        }

        if (foundMsgs && foundMsgs.length > 0) {
          targetMessageId = foundMsgs[0].id;
          targetMediaUrl = foundMsgs[0].media_url;
        }
      }

      // 2. Fallback: Match by recipient Phone number if External ID was not matched
      if (!targetMessageId && phone) {
        const cleanPhone = String(phone).replace(/\D/g, '');
        if (cleanPhone.length >= 8) {
          const { data: clients } = await supabaseAdmin.from('clients').select('id, phone, local_phone');
          const matched = (clients || []).find((c: any) => isMatchingClientPhone(c.phone || '', cleanPhone) || isMatchingClientPhone(c.local_phone || '', cleanPhone));
          
          if (matched?.id) {
            const { data: sess } = await supabaseAdmin.from('chat_sessions').select('id').eq('client_id', matched.id).order('created_at', { ascending: false }).limit(1);
            if (sess && sess.length > 0) {
              const { data: latestTechMsgs } = await supabaseAdmin
                .from('chat_messages')
                .select('id, media_url, sender_type, created_at')
                .eq('session_id', sess[0].id)
                .eq('sender_type', 'tech')
                .order('created_at', { ascending: false })
                .limit(1);
              if (latestTechMsgs && latestTechMsgs.length > 0) {
                targetMessageId = latestTechMsgs[0].id;
                targetMediaUrl = latestTechMsgs[0].media_url;
              }
            }
          }
        }
      }

      if (targetMessageId) {
        let existing: any = {};
        try {
          if (targetMediaUrl && targetMediaUrl.trim().startsWith('{')) {
            existing = JSON.parse(targetMediaUrl);
          }
        } catch (e) {}

        // Never downgrade from 'read' to 'delivered' or 'sent'
        if (existing.status === 'read' && newStatus !== 'read') {
          continue;
        }

        const updatePayload: any = {
          ...existing,
          status: newStatus,
          status_updated_at: timestamp ? new Date(isNaN(Number(timestamp)) ? timestamp : Number(timestamp) * (String(timestamp).length <= 10 ? 1000 : 1)).toISOString() : new Date().toISOString()
        };

        if (externalId) updatePayload.external_id = externalId;
        if (reason) updatePayload.error_reason = reason;

        await supabaseAdmin
          .from('chat_messages')
          .update({
            media_url: JSON.stringify(updatePayload)
          })
          .eq('id', targetMessageId);

        updatedCount++;
        processedResults.push({ messageId: targetMessageId, externalId, status: newStatus });
      }
    }

    console.log(`[Status Webhook] Atualizadas ${updatedCount} mensagens para novos status de entrega/leitura.`);
    return { updated: updatedCount, results: processedResults };
  }

  // Webhook for WAME / Meta API
  const recentProcessedMsgIds = new Map<string, number>();

  function isDuplicateIncomingMsg(uniqueKey: string): boolean {
    const now = Date.now();
    for (const [k, time] of recentProcessedMsgIds.entries()) {
      if (now - time > 30000) {
        recentProcessedMsgIds.delete(k);
      }
    }
    if (recentProcessedMsgIds.has(uniqueKey)) {
      return true;
    }
    recentProcessedMsgIds.set(uniqueKey, now);
    return false;
  }

  // Robust phone matcher for Brazilian numbers with/without 55, with/without 9th digit, DDD match
  function isMatchingClientPhone(storedRaw: string, incomingRaw: string): boolean {
    if (!storedRaw || !incomingRaw) return false;
    const stored = String(storedRaw).replace(/\D/g, '');
    const incoming = String(incomingRaw).replace(/\D/g, '');
    if (stored.length < 6 || incoming.length < 6) return false;

    const storedNo55 = stored.replace(/^55/, '');
    const incomingNo55 = incoming.replace(/^55/, '');

    if (stored === incoming || storedNo55 === incomingNo55) return true;

    // Check last 8 digits (always identical regardless of 9th digit)
    const storedLast8 = stored.slice(-8);
    const incomingLast8 = incoming.slice(-8);
    if (storedLast8.length === 8 && incomingLast8.length === 8 && storedLast8 === incomingLast8) {
      const storedDDD = storedNo55.length >= 10 ? storedNo55.slice(0, 2) : '';
      const incomingDDD = incomingNo55.length >= 10 ? incomingNo55.slice(0, 2) : '';
      if (storedDDD && incomingDDD) {
        return storedDDD === incomingDDD;
      }
      return true;
    }

    if (stored.includes(incoming) || incoming.includes(stored)) return true;
    if (storedNo55.includes(incomingNo55) || incomingNo55.includes(storedNo55)) return true;

    return false;
  }

  function cleanJidToPhone(rawJid: any): string {
    if (!rawJid) return '';
    const str = String(rawJid);
    const withoutDomain = str.split('@')[0];
    const withoutDevice = withoutDomain.split(':')[0];
    return withoutDevice.replace(/\D/g, '');
  }

  function extractMessageData(rawMsg: any): { content: string; mediaUrl: string } {
    if (!rawMsg) return { content: '', mediaUrl: '' };
    if (typeof rawMsg === 'string') return { content: rawMsg, mediaUrl: '' };

    // Recursively unwrap WhatsApp Baileys wrappers
    if (rawMsg.ephemeralMessage?.message) return extractMessageData(rawMsg.ephemeralMessage.message);
    if (rawMsg.viewOnceMessage?.message) return extractMessageData(rawMsg.viewOnceMessage.message);
    if (rawMsg.viewOnceMessageV2?.message) return extractMessageData(rawMsg.viewOnceMessageV2.message);
    if (rawMsg.documentWithCaptionMessage?.message) return extractMessageData(rawMsg.documentWithCaptionMessage.message);
    if (rawMsg.editedMessage?.message?.protocolMessage?.editedMessage) return extractMessageData(rawMsg.editedMessage.message.protocolMessage.editedMessage);

    if (rawMsg.conversation) return { content: rawMsg.conversation, mediaUrl: '' };
    if (rawMsg.extendedTextMessage?.text) return { content: rawMsg.extendedTextMessage.text, mediaUrl: '' };
    if (rawMsg.text) return { content: typeof rawMsg.text === 'string' ? rawMsg.text : (rawMsg.text?.body || ''), mediaUrl: '' };
    if (rawMsg.body) return { content: rawMsg.body, mediaUrl: '' };
    if (rawMsg.caption) return { content: rawMsg.caption, mediaUrl: '' };

    if (rawMsg.audioMessage) {
      return { content: '🎵 Áudio recebido', mediaUrl: rawMsg.audioMessage.url || rawMsg.audioMessage.directPath || '' };
    }
    if (rawMsg.imageMessage) {
      return { content: rawMsg.imageMessage.caption || '📸 Imagem recebida', mediaUrl: rawMsg.imageMessage.url || rawMsg.imageMessage.directPath || '' };
    }
    if (rawMsg.videoMessage) {
      return { content: rawMsg.videoMessage.caption || '🎥 Vídeo recebido', mediaUrl: rawMsg.videoMessage.url || rawMsg.videoMessage.directPath || '' };
    }
    if (rawMsg.documentMessage) {
      return { content: `📄 Documento: ${rawMsg.documentMessage.fileName || rawMsg.documentMessage.title || 'Arquivo'}`, mediaUrl: rawMsg.documentMessage.url || '' };
    }
    if (rawMsg.stickerMessage) {
      return { content: '🏷️ Figurinha recebida', mediaUrl: rawMsg.stickerMessage.url || '' };
    }

    if (rawMsg.buttonsResponseMessage?.selectedButtonId || rawMsg.buttonsResponseMessage?.selectedDisplayText) {
      return { content: rawMsg.buttonsResponseMessage.selectedDisplayText || rawMsg.buttonsResponseMessage.selectedButtonId, mediaUrl: '' };
    }
    if (rawMsg.templateButtonReplyMessage?.selectedId || rawMsg.templateButtonReplyMessage?.selectedDisplayText) {
      return { content: rawMsg.templateButtonReplyMessage.selectedDisplayText || rawMsg.templateButtonReplyMessage.selectedId, mediaUrl: '' };
    }
    if (rawMsg.listResponseMessage?.title || rawMsg.listResponseMessage?.singleSelectReply?.selectedRowId) {
      return { content: rawMsg.listResponseMessage.title || rawMsg.listResponseMessage.singleSelectReply?.selectedRowId, mediaUrl: '' };
    }

    return { content: '', mediaUrl: '' };
  }

  const handleWameWebhook = async (req: any, res: any) => {
    try {
      console.log("Wame/Meta Webhook Received:", JSON.stringify(req.body));
      const body = req.body || {};

      // 1. Process status updates (delivered / read / sent)
      await processStatusUpdates(body);

      // Check if message was sent by us (fromMe = true) - DO NOT treat as client message!
      const isFromMe = Boolean(
        body.fromMe === true ||
        body.key?.fromMe === true ||
        body.data?.fromMe === true ||
        body.data?.key?.fromMe === true ||
        (Array.isArray(body.data) && body.data.some((d: any) => d?.key?.fromMe === true || d?.fromMe === true)) ||
        (body.entry && body.entry.some((e: any) => e?.changes?.some((c: any) => c?.value?.messages?.some((m: any) => m?.from_me === true))))
      );

      if (isFromMe) {
        return res.status(200).send("EVENT_RECEIVED");
      }

      let phone = "";
      let content = "";
      let mediaUrl = "";
      let externalMsgId = "";
      
      // Extract candidate item from all possible container structures
      let rawItem: any = null;
      if (Array.isArray(body.data?.messages) && body.data.messages.length > 0) {
        rawItem = body.data.messages[0];
      } else if (Array.isArray(body.messages) && body.messages.length > 0) {
        rawItem = body.messages[0];
      } else if (Array.isArray(body.data) && body.data.length > 0) {
        rawItem = body.data[0];
      } else if (body.data && typeof body.data === 'object') {
        rawItem = body.data;
      } else {
        rawItem = body;
      }

      if (rawItem) {
        if (rawItem.key?.fromMe === true || rawItem.fromMe === true) {
          return res.status(200).send("EVENT_RECEIVED");
        }

        if (rawItem.key?.remoteJid) {
          phone = cleanJidToPhone(rawItem.key.remoteJid);
        } else if (rawItem.remoteJid) {
          phone = cleanJidToPhone(rawItem.remoteJid);
        } else if (rawItem.phoneNumber) {
          phone = cleanJidToPhone(rawItem.phoneNumber);
        } else if (rawItem.phone) {
          phone = cleanJidToPhone(rawItem.phone);
        } else if (rawItem.from) {
          phone = cleanJidToPhone(rawItem.from);
        } else if (rawItem.sender) {
          phone = cleanJidToPhone(rawItem.sender);
        }

        if (rawItem.key?.id || rawItem.id) {
          externalMsgId = String(rawItem.key?.id || rawItem.id);
        }

        const msgObj = rawItem.message || rawItem.msgContent || rawItem;
        const extracted = extractMessageData(msgObj);
        content = extracted.content;
        mediaUrl = extracted.mediaUrl || mediaUrl;
      }

      // Format Meta Cloud API / WAME
      if (!phone && (body.object === "whatsapp_business_account" || body.object === "wame") && body.entry && body.entry[0]?.changes) {
         const value = body.entry[0].changes[0].value;
         if (value.messages && value.messages.length > 0) {
            const msg = value.messages[0];
            if (msg.from_me) {
              return res.status(200).send("EVENT_RECEIVED");
            }
            phone = cleanJidToPhone(msg.from);
            externalMsgId = msg.id || "";
            if (msg.type === "text" && msg.text) {
               content = msg.text.body;
            } else if (msg.type === "audio") {
               content = "🎵 Mensagem de Áudio";
               mediaUrl = msg.audio?.url || "";
            } else if (msg.type === "image") {
               content = msg.image?.caption || "📷 Imagem";
               mediaUrl = msg.image?.url || "";
            } else if (msg.type === "video") {
               content = msg.video?.caption || "🎥 Vídeo";
               mediaUrl = msg.video?.url || "";
            }
         }
      } else if (!phone && body.phone && (body.message || body.text)) {
          phone = cleanJidToPhone(body.phone);
          const extracted = extractMessageData(body.message || body.text);
          content = extracted.content || String(body.message || body.text);
      } else if (!phone && body.contact && (body.message || body.text)) {
          phone = cleanJidToPhone(body.contact);
          const extracted = extractMessageData(body.message || body.text);
          content = extracted.content || String(body.message || body.text);
      } else if (!phone && body.from && (body.body || body.message || body.text)) {
          phone = cleanJidToPhone(body.from);
          const extracted = extractMessageData(body.body || body.message || body.text);
          content = extracted.content || String(body.body || body.message || body.text);
      } else if (!phone && body.sender && (body.text || body.message)) {
          phone = cleanJidToPhone(body.sender);
          const extracted = extractMessageData(body.text || body.message);
          content = extracted.content || String(body.text || body.message);
      }
      
      // Se tiver mediaUrl mas não tiver conteúdo em texto, define texto descritivo
      if (!content && mediaUrl) {
        if (mediaUrl.includes('audio') || mediaUrl.includes('.ogg') || mediaUrl.includes('.mp3') || mediaUrl.includes('.webm')) {
          content = "🎵 Mensagem de Áudio";
        } else if (mediaUrl.includes('video') || mediaUrl.includes('.mp4')) {
          content = "🎥 Vídeo";
        } else {
          content = "📸 Imagem";
        }
      }

      if (!phone || (!content && !mediaUrl)) {
        console.log(`[Webhook WAME] Ignorando payload sem telefone ou sem dados: phone="${phone}", content="${content}"`);
        return res.status(200).send("EVENT_RECEIVED");
      }
      const cleanIncoming = phone.replace(/\D/g, '');

      // Deduplicação de mensagens recebidas
      const dedupKey = externalMsgId ? `msg_${externalMsgId}` : `txt_${cleanIncoming}_${content}`;
      if (isDuplicateIncomingMsg(dedupKey)) {
        console.log("Ignorando mensagem duplicada recebida no webhook:", dedupKey);
        return res.status(200).send("EVENT_RECEIVED");
      }
      
      const [{ data: clients }, { data: agendaContacts }] = await Promise.all([
        supabaseAdmin.from('clients').select('id, name, phone, local_phone, admin_id, employee_id'),
        supabaseAdmin.from('agenda_contacts').select('id, name, phone, admin_id')
      ]);

      const allTargets = [
        ...(clients || []).map((c: any) => ({ ...c, is_agenda: false })),
        ...(agendaContacts || []).map((a: any) => ({ ...a, local_phone: '', employee_id: a.admin_id, is_agenda: true }))
      ];

      const matchedClient = allTargets.find((c: any) => {
         return isMatchingClientPhone(c.phone || '', cleanIncoming) || isMatchingClientPhone(c.local_phone || '', cleanIncoming);
      });
      
      if (!matchedClient) {
        console.log("[Webhook WAME] Nenhum cliente ou contato da agenda correspondente encontrado para o número:", phone, cleanIncoming);
        return res.status(200).send("EVENT_RECEIVED");
      }

      console.log(`[Webhook WAME] Mensagem recebida de ${matchedClient.name} (${cleanIncoming}): "${content}"`);

      const { data: sessions } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('client_id', matchedClient.id)
        .order('created_at', { ascending: false });
        
      const now = new Date().getTime();
      let activeSession: any = null;

      // Localiza sessões abertas e consolida duplicadas
      const openSessions = (sessions || []).filter((s: any) => s.status === 'open');
      if (openSessions.length > 0) {
        activeSession = openSessions[0];
        const createdTime = new Date(activeSession.created_at).getTime();
        
        // Se a sessão expirou (> 30 min), fecha ela
        if (now - createdTime > 30 * 60 * 1000) {
          await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
          activeSession = null;
        }

        // Fecha qualquer outra sessão aberta duplicada para manter apenas 1 sessão ativa
        if (openSessions.length > 1) {
          const extraIds = openSessions.slice(1).map((s: any) => s.id);
          await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).in('id', extraIds);
        }
      }

      if (!activeSession) {
        const { data: newSess } = await supabaseAdmin
          .from('chat_sessions')
          .insert({
            client_id: matchedClient.id,
            admin_id: matchedClient.admin_id,
            employee_id: matchedClient.employee_id || matchedClient.admin_id,
            status: 'open',
            created_at: new Date().toISOString()
          })
          .select()
          .single();
        activeSession = newSess;
      }

      if (!activeSession) {
        return res.status(200).send("EVENT_RECEIVED");
      }

      await supabaseAdmin.from('chat_messages').insert({
         session_id: activeSession.id,
         sender_type: 'client',
         content: content,
         media_url: mediaUrl
      });

      // Cliente respondeu: marca mensagens anteriores enviadas pelo colaborador como lidas
      const { data: unreadTechMsgs } = await supabaseAdmin
         .from('chat_messages')
         .select('id, media_url')
         .eq('session_id', activeSession.id)
         .eq('sender_type', 'tech');
      if (unreadTechMsgs) {
         for (const utm of unreadTechMsgs) {
            let existing: any = {};
            try { existing = JSON.parse(utm.media_url); } catch(e) {}
            if (existing.status !== 'read') {
               await supabaseAdmin.from('chat_messages').update({
                  media_url: JSON.stringify({ ...existing, status: 'read' })
               }).eq('id', utm.id);
            }
         }
      }

      // Dispara push notification para os responsáveis (admin e funcionário responsável)
      const targetUserId = matchedClient.admin_id || matchedClient.employee_id;
      if (targetUserId) {
        const clientDisplayName = formatFirstTwoNames(matchedClient.name);
        sendPushToAdmin(targetUserId, `💬 ${clientDisplayName}`, content, {
          clientId: matchedClient.id,
          sessionId: activeSession.id,
          type: 'chat_message',
          channelId: 'chat_messages'
        }).catch(err => console.error('[Push Notification Error]', err));
      }
      
      return res.status(200).send("EVENT_RECEIVED");
    } catch(e) {
      console.error("Webhook Error:", e);
      return res.status(500).send("Error");
    }
  };

  const handleWameGet = (req: any, res: any) => {
    const mode = req.query["hub.mode"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && challenge) {
      return res.status(200).send(challenge);
    }
    return res.status(200).send("OK");
  };

  app.get("/api/webhook/wame", handleWameGet);
  app.get("/webhook/wame", handleWameGet);
  app.post("/api/webhook/wame", handleWameWebhook);
  app.post("/webhook/wame", handleWameWebhook);

  const handleEvolutionWebhook = async (req: any, res: any) => {
    try {
      console.log("Evolution Webhook Received:", JSON.stringify(req.body));
      const body = req.body || {};

      // 1. Process status updates (delivered / read / sent)
      await processStatusUpdates(body);

      const msgData = body.data || body;
      
      if (!msgData || (!msgData.key && !msgData.message && !body.message)) return res.status(200).send("OK");
      if (msgData.key?.fromMe || msgData.fromMe) return res.status(200).send("OK");

      let remoteJid = msgData.key?.remoteJid || msgData.remoteJid || body.remoteJid || "";
      if (!remoteJid && msgData.from) remoteJid = msgData.from;
      if (!remoteJid) return res.status(200).send("OK");
      
      const cleanIncoming = remoteJid.split('@')[0].replace(/\D/g, '');
      let externalMsgId = msgData.key?.id || msgData.id || "";
      
      let content = "";
      if (msgData.message?.conversation) content = msgData.message.conversation;
      else if (msgData.message?.extendedTextMessage?.text) content = msgData.message.extendedTextMessage.text;
      else if (typeof msgData.message === 'string') content = msgData.message;
      else if (typeof body.message === 'string') content = body.message;
      
      let mediaUrl = "";
      if (msgData.message?.audioMessage) content = "🎵 Mensagem de Áudio";
      else if (msgData.message?.imageMessage) content = "📷 Imagem";

      if (!content && !mediaUrl) return res.status(200).send("OK");

      // Deduplicação
      const dedupKey = externalMsgId ? `evo_${externalMsgId}` : `evo_txt_${cleanIncoming}_${content}`;
      if (isDuplicateIncomingMsg(dedupKey)) {
        console.log("Ignorando mensagem duplicada Evolution:", dedupKey);
        return res.status(200).send("OK");
      }

      const [{ data: clients }, { data: agendaContacts }] = await Promise.all([
        supabaseAdmin.from('clients').select('id, name, phone, local_phone, admin_id, employee_id'),
        supabaseAdmin.from('agenda_contacts').select('id, name, phone, admin_id')
      ]);

      const allTargets = [
        ...(clients || []).map((c: any) => ({ ...c, is_agenda: false })),
        ...(agendaContacts || []).map((a: any) => ({ ...a, local_phone: '', employee_id: a.admin_id, is_agenda: true }))
      ];

      const matchedClient = allTargets.find((c: any) => {
         return isMatchingClientPhone(c.phone || '', cleanIncoming) || isMatchingClientPhone(c.local_phone || '', cleanIncoming);
      });
      
      if (!matchedClient) {
        console.log("[Webhook Evolution] Nenhum cliente ou contato da agenda correspondente encontrado para o número:", cleanIncoming);
        return res.status(200).send("OK");
      }

      const { data: sessions } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('client_id', matchedClient.id)
        .order('created_at', { ascending: false });
        
      const now = new Date().getTime();
      let activeSession: any = null;

      // Localiza sessões abertas e consolida duplicadas
      const openSessions = (sessions || []).filter((s: any) => s.status === 'open');
      if (openSessions.length > 0) {
        activeSession = openSessions[0];
        const createdTime = new Date(activeSession.created_at).getTime();
        
        // Se a sessão expirou (> 30 min), fecha ela
        if (now - createdTime > 30 * 60 * 1000) {
          await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
          activeSession = null;
        }

        // Fecha qualquer outra sessão aberta duplicada para manter apenas 1 sessão ativa
        if (openSessions.length > 1) {
          const extraIds = openSessions.slice(1).map((s: any) => s.id);
          await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).in('id', extraIds);
        }
      }

      if (!activeSession) {
        const { data: newSess } = await supabaseAdmin
          .from('chat_sessions')
          .insert({
            client_id: matchedClient.id,
            admin_id: matchedClient.admin_id,
            employee_id: matchedClient.employee_id || matchedClient.admin_id,
            status: 'open',
            created_at: new Date().toISOString()
          })
          .select()
          .single();
        activeSession = newSess;
      }

      if (!activeSession) {
        return res.status(200).send("OK");
      }

      await supabaseAdmin.from('chat_messages').insert({
         session_id: activeSession.id,
         sender_type: 'client',
         content: content,
         media_url: mediaUrl
      });

      // Cliente respondeu: marca mensagens anteriores enviadas pelo colaborador como lidas
      const { data: unreadTechMsgs } = await supabaseAdmin
         .from('chat_messages')
         .select('id, media_url')
         .eq('session_id', activeSession.id)
         .eq('sender_type', 'tech');
      if (unreadTechMsgs) {
         for (const utm of unreadTechMsgs) {
            let existing: any = {};
            try { existing = JSON.parse(utm.media_url); } catch(e) {}
            if (existing.status !== 'read') {
               await supabaseAdmin.from('chat_messages').update({
                  media_url: JSON.stringify({ ...existing, status: 'read' })
               }).eq('id', utm.id);
            }
         }
      }

      // Dispara push notification para os responsáveis
      const targetUserId = matchedClient.employee_id || matchedClient.admin_id;
      if (targetUserId) {
        const clientDisplayName = formatFirstTwoNames(matchedClient.name);
        sendPushToAdmin(targetUserId, `💬 ${clientDisplayName}`, content, {
          clientId: matchedClient.id,
          sessionId: activeSession.id,
          type: 'chat_message',
          channelId: 'chat_messages'
        }).catch(err => console.error('[Push Notification Error]', err));
      }
      
      return res.status(200).send("OK");
    } catch(e) {
      console.error("Webhook Error:", e);
      return res.status(500).send("Error");
    }
  };

  app.post("/api/webhook/evolution", handleEvolutionWebhook);
  app.post("/webhook/evolution", handleEvolutionWebhook);
  app.get("/api/webhook/evolution", handleWameGet);
  app.get("/webhook/evolution", handleWameGet);

  // Meta / WhatsApp Cloud API aliases
  app.post("/api/webhook/meta", handleWameWebhook);
  app.post("/webhook/meta", handleWameWebhook);
  app.get("/api/webhook/meta", handleWameGet);
  app.get("/webhook/meta", handleWameGet);

  // AstraCalls Webhook (status de entrega, leitura e mensagens recebidas)
  const handleAstraCallsWebhook = async (req: any, res: any) => {
    try {
      console.log("AstraCalls Webhook Received:", JSON.stringify(req.body));
      const body = req.body || {};

      // 1. Process status updates (sent, delivered, read, failed)
      const statusResult = await processStatusUpdates(body);

      // If it's only a status event, reply immediately
      const isStatusEvent = body.event === 'message.status' || body.event === 'message.ack' || body.event === 'message_status' || body.type === 'message_status';
      if (isStatusEvent) {
        return res.status(200).json({ success: true, event: body.event, ...statusResult });
      }

      // 2. Process incoming client message if present
      const msgData = body.data || body;
      const remotePhone = msgData.phone || msgData.to || msgData.from || msgData.sender || body.from || "";
      const content = msgData.text || msgData.message || msgData.content || body.text || body.message || "";
      const isFromMe = msgData.fromMe === true || body.fromMe === true || msgData.direction === 'outbound';

      if (isFromMe || !remotePhone || !content) {
        return res.status(200).json({ success: true, ...statusResult });
      }

      const cleanIncoming = String(remotePhone).replace(/\D/g, '');
      const [{ data: clients }, { data: agendaContacts }] = await Promise.all([
        supabaseAdmin.from('clients').select('id, name, phone, local_phone, admin_id, employee_id'),
        supabaseAdmin.from('agenda_contacts').select('id, name, phone, admin_id')
      ]);

      const allTargets = [
        ...(clients || []).map((c: any) => ({ ...c, is_agenda: false })),
        ...(agendaContacts || []).map((a: any) => ({ ...a, local_phone: '', employee_id: a.admin_id, is_agenda: true }))
      ];

      const matchedClient = allTargets.find((c: any) => {
         return isMatchingClientPhone(c.phone || '', cleanIncoming) || isMatchingClientPhone(c.local_phone || '', cleanIncoming);
      });

      if (!matchedClient) {
        console.log("[Webhook AstraCalls] Nenhum cliente encontrado para:", cleanIncoming);
        return res.status(200).json({ success: true, matched: false });
      }

      const { data: sessions } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('client_id', matchedClient.id)
        .order('created_at', { ascending: false });

      let activeSession: any = (sessions || []).find((s: any) => s.status === 'open');
      if (!activeSession) {
        const { data: newSess } = await supabaseAdmin
          .from('chat_sessions')
          .insert({
            client_id: matchedClient.id,
            admin_id: matchedClient.admin_id,
            employee_id: matchedClient.employee_id || matchedClient.admin_id,
            status: 'open',
            created_at: new Date().toISOString()
          })
          .select()
          .single();
        activeSession = newSess;
      }

      if (activeSession) {
        await supabaseAdmin.from('chat_messages').insert({
           session_id: activeSession.id,
           sender_type: 'client',
           content: String(content),
           media_url: ''
        });

        const targetUserId = matchedClient.employee_id || matchedClient.admin_id;
        if (targetUserId) {
          const clientDisplayName = formatFirstTwoNames(matchedClient.name);
          sendPushToAdmin(targetUserId, `💬 ${clientDisplayName}`, String(content), {
            clientId: matchedClient.id,
            sessionId: activeSession.id,
            type: 'chat_message',
            channelId: 'chat_messages'
          }).catch(err => console.error('[Push Notification Error]', err));
        }
      }

      return res.status(200).json({ success: true, processed: true });
    } catch (e: any) {
      console.error("[Webhook AstraCalls Error]", e);
      return res.status(500).json({ error: e.message });
    }
  };

  app.post("/api/webhook/astracalls", handleAstraCallsWebhook);
  app.post("/webhook/astracalls", handleAstraCallsWebhook);
  app.post("/api/astracalls/webhook", handleAstraCallsWebhook);
  app.get("/api/webhook/astracalls", handleWameGet);
  app.get("/webhook/astracalls", handleWameGet);
  app.get("/api/astracalls/webhook", handleWameGet);

  // Dedicated Universal Status Webhook (AstraCalls, Evolution, Meta, custom integrations)
  const handleUniversalStatusWebhook = async (req: any, res: any) => {
    try {
      console.log("[Status Webhook Received]:", JSON.stringify(req.body));
      const result = await processStatusUpdates(req.body || {});
      return res.status(200).json({
        success: true,
        message: "Status updates processed successfully",
        ...result
      });
    } catch (e: any) {
      console.error("[Status Webhook Error]:", e);
      return res.status(500).json({ error: e.message });
    }
  };

  app.post("/api/webhook/status", handleUniversalStatusWebhook);
  app.post("/webhook/status", handleUniversalStatusWebhook);
  app.post("/api/webhook/messages/status", handleUniversalStatusWebhook);
  app.get("/api/webhook/status", handleWameGet);
  app.get("/webhook/status", handleWameGet);
  app.get("/api/webhook/messages/status", handleWameGet);

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

  app.get('/api/test-env', (req, res) => {
    res.json({
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        hasAnonKey: !!process.env.VITE_SUPABASE_ANON_KEY
    });
  });

  // Helper to extract the first two names from a full client name
  function formatFirstTwoNames(fullName: string | null | undefined): string {
    if (!fullName || typeof fullName !== 'string') return 'Cliente';
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'Cliente';
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[1]}`;
  }

  // Cache para evitar notificações duplicadas (chave -> timestamp)
  const recentPushCache = new Map<string, number>();
  function shouldSendPush(key: string): boolean {
    if (!key) return true;
    const now = Date.now();
    // Limpa chaves antigas com mais de 2 minutos
    for (const [k, time] of recentPushCache.entries()) {
      if (now - time > 120000) recentPushCache.delete(k);
    }
    if (recentPushCache.has(key) && (now - recentPushCache.get(key)!) < 30000) {
      console.log(`[Push Server] Notificação bloqueada por deduplicação (já enviada nos últimos 30s): ${key}`);
      return false;
    }
    recentPushCache.set(key, now);
    return true;
  }

  // Helper to send push notification to all devices registered for an admin
  async function sendPushToAdmin(adminId: string, title: string, body: string, data: Record<string, string> = {}) {
    try {
      if (!adminId) return false;
      const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id, name, fcm_token')
        .eq('id', adminId);

      let rawTokens = (users || []).map(u => u.fcm_token).filter(Boolean);

      // Fallback: se o adminId não possuir tokens, buscar administradores do sistema com token ativo
      if (rawTokens.length === 0) {
        const { data: fallbackAdmins } = await supabaseAdmin
          .from('users')
          .select('id, name, fcm_token')
          .eq('role', 'admin')
          .not('fcm_token', 'is', null);
        if (fallbackAdmins && fallbackAdmins.length > 0) {
          rawTokens = fallbackAdmins.map(u => u.fcm_token).filter(Boolean);
        }
      }

      // Deduplica tokens garantindo que nenhum dispositivo receba 2x
      const tokens = Array.from(new Set(rawTokens));

      if (tokens.length === 0) {
        console.log(`[Push Server] Nenhum token FCM registrado no momento para admin ${adminId}.`);
        return false;
      }

      console.log(`[Push Server] Disparando push notification para ${tokens.length} dispositivo(s) único(s): "${title}"`);

      let sentCount = 0;
      for (const token of tokens) {
        if (fcmInitialized) {
          try {
            const isChat = data?.channelId === 'chat_messages' || data?.type === 'chat_message';
            const soundName = isChat ? 'chat_notification' : 'notificacao';
            const soundFile = isChat ? 'chat_notification.mp3' : 'notificacao.mp3';
            const channelTarget = data?.channelId || (isChat ? 'chat_messages' : 'atendimentos_v2');

            await getMessaging().send({
              token,
              notification: {
                title,
                body
              },
              data: {
                title,
                body,
                ...data,
                click_action: 'FCM_PLUGIN_ACTIVITY',
                url: data.url || (isChat ? '/messages' : '/routes'),
                channelId: channelTarget,
                channel_id: channelTarget,
                sound: soundName
              },
              android: {
                priority: 'high',
                ttl: 2419200,
                directBootOk: true,
                notification: {
                  channelId: channelTarget,
                  title,
                  body,
                  sound: soundName,
                  priority: 'max',
                  visibility: 'public',
                  defaultSound: false,
                  defaultVibrateTimings: true,
                  localOnly: false,
                  notificationCount: 1,
                  tag: data.tag || (data.visitId ? `visit_${data.visitId}` : (data.jobId ? `job_${data.jobId}` : undefined))
                }
              },
              apns: {
                headers: {
                  'apns-priority': '10',
                  'apns-push-type': 'alert'
                },
                payload: {
                  aps: {
                    sound: soundFile,
                    badge: 1,
                    contentAvailable: true,
                    alert: {
                      title,
                      body
                    }
                  }
                }
              }
            });
            sentCount++;
            console.log(`[Push Server] Push entregue via FCM para token ${token.substring(0, 10)}...`);
          } catch (fcmErr: any) {
            console.error(`[Push Server] Erro ao enviar token ${token.substring(0, 10)}...:`, fcmErr?.message || fcmErr);
            if (fcmErr?.code === 'messaging/registration-token-not-registered' || fcmErr?.code === 'messaging/invalid-registration-token') {
              // Limpar token inválido
              await supabaseAdmin.from('users').update({ fcm_token: null }).eq('fcm_token', token);
            }
          }
        } else {
          console.log(`[Push Server] Firebase Admin não inicializado no servidor. Token do admin registrado: ${token.substring(0, 12)}...`);
        }
      }
      return sentCount > 0;
    } catch (e: any) {
      console.error('[Push Server] Erro geral ao disparar push:', e);
      return false;
    }
  }

  // Endpoint to immediately trigger attendance completion push notification
  app.post("/api/notifications/notify-visit-completion", async (req, res) => {
    try {
      const { adminId, employeeId, clientId, clientName, techName, type } = req.body || {};

      // Deduplicação unificada por cliente/tipo
      const dedupeKey = `${type || 'visit'}_${clientId || clientName || 'unknown'}`;
      if (!shouldSendPush(dedupeKey)) {
        return res.json({ success: true, deduped: true });
      }

      let empName = techName || "Colaborador";
      if (!techName && employeeId) {
        const { data: empData } = await supabaseAdmin.from('users').select('name').eq('id', employeeId).single();
        if (empData?.name) empName = empData.name;
      }

      let resolvedClientName = clientName;
      let clientAdminId = null;
      if (clientId) {
        const { data: cliData } = await supabaseAdmin.from('clients').select('name, admin_id').eq('id', clientId).single();
        if (cliData?.name) resolvedClientName = cliData.name;
        if (cliData?.admin_id) clientAdminId = cliData.admin_id;
      }
      if (!resolvedClientName) resolvedClientName = "Cliente";

      const targetAdminId = clientAdminId || adminId;
      if (!targetAdminId) {
        // Fallback: se adminId não for passado, busca o primeiro admin ativo no sistema
        const { data: defaultAdmin } = await supabaseAdmin.from('users').select('id').eq('role', 'admin').limit(1).single();
        if (!defaultAdmin) {
          return res.status(400).json({ error: "Missing adminId and clientId" });
        }
      }

      const isJob = type === 'job';
      const title = isJob ? '🏊 Serviço Avulso Finalizado' : '🏊 Visita Finalizada!';
      const body = `O colaborador ${empName} finalizou o atendimento no cliente ${resolvedClientName}.`;

      const sent = await sendPushToAdmin(targetAdminId || '', title, body, {
        url: '/routes',
        channelId: 'atendimentos_v2',
        type: isJob ? 'job_completed' : 'visit_completed',
        clientId: String(clientId || ''),
        employeeId: String(employeeId || '')
      });

      return res.json({ success: true, sent });
    } catch (err: any) {
      console.error('[Push Server] Erro no endpoint notify-visit-completion:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Endpoint to send a test push notification to verify Capacitor setup
  app.post("/api/notifications/test-push", async (req, res) => {
    try {
      const { adminId } = req.body || {};
      if (!adminId) return res.status(400).json({ error: "Missing adminId" });

      const { data: user } = await supabaseAdmin.from('users').select('fcm_token, name').eq('id', adminId).single();
      const hasToken = !!user?.fcm_token;

      const sent = await sendPushToAdmin(
        adminId,
        '🏊 Teste de Notificação Push',
        'Seu dispositivo está conectado e configurado para receber alertas em tempo real das rotas!',
        {
          url: '/routes',
          channelId: 'atendimentos_v2',
          type: 'test_push'
        }
      );

      return res.json({
        success: true,
        sent,
        hasToken,
        fcmInitialized,
        tokenPreview: user?.fcm_token ? `${user.fcm_token.substring(0, 10)}...` : null
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Endpoint to check FCM server status
  app.get("/api/notifications/status", (req, res) => {
    res.json({
      fcmInitialized,
      hasServiceAccount: fs.existsSync('./service-account.json') || !!process.env.FIREBASE_SERVICE_ACCOUNT
    });
  });

  // Endpoint manual caso o admin deseje forçar a limpeza ou chamar via cron webhook
  app.post("/api/chat/purge-midnight", async (req, res) => {
    try {
      await purgeOldChatMessages();
      return res.json({ success: true, message: "Mensagens anteriores à meia-noite de hoje foram deletadas." });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Endpoint to manually trigger or test daily 7:00 AM billing reminders
  app.post("/api/notifications/trigger-due-reminders", async (req, res) => {
    try {
      const summary = await sendDailyBillingReminders();
      return res.json({ success: true, summary });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Background listener for Push Notifications (incoming client chat messages, finished visits, one-off jobs)
  supabaseAdmin.channel('push-notifications-db-events')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, async (payload) => {
       const newVisit = payload.new as any;
       if (!newVisit || newVisit.status !== 'finalizada') return;

       const dedupeKey = `visit_${newVisit.id}`;
       if (!shouldSendPush(dedupeKey)) return;

       let targetAdminId = newVisit.admin_id;
       if (!targetAdminId && newVisit.client_id) {
          const { data: cli } = await supabaseAdmin.from('clients').select('admin_id').eq('id', newVisit.client_id).single();
          if (cli?.admin_id) targetAdminId = cli.admin_id;
       }

       if (targetAdminId) {
           const { data: empData } = await supabaseAdmin.from('users').select('name').eq('id', newVisit.employee_id).single();
           const { data: cliData } = await supabaseAdmin.from('clients').select('name').eq('id', newVisit.client_id).single();

           const empName = empData?.name || 'Colaborador';
           const cliName = cliData?.name || 'Cliente';

           await sendPushToAdmin(
             targetAdminId,
             '🏊 Visita Finalizada!',
             `O colaborador ${empName} finalizou o atendimento no cliente ${cliName}.`,
             {
               url: '/routes',
               channelId: 'atendimentos_v2',
               type: 'visit_completed',
               visitId: String(newVisit.id || ''),
               clientId: String(newVisit.client_id || ''),
               tag: `visit_${newVisit.id}`
             }
           );
       }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'oneoffjobs' }, async (payload) => {
       const newJob = payload.new as any;
       if (!newJob || newJob.status !== 'concluido') return;

       const dedupeKey = `job_${newJob.id}`;
       if (!shouldSendPush(dedupeKey)) return;

       if (newJob.admin_id) {
           const { data: empData } = await supabaseAdmin.from('users').select('name').eq('id', newJob.employee_id).single();
           const empName = empData?.name || 'Colaborador';
           const cliName = newJob.client_name || 'Cliente';

           await sendPushToAdmin(
             newJob.admin_id,
             '🏊 Serviço Avulso Finalizado',
             `O colaborador ${empName} finalizou o serviço avulso para ${cliName}.`,
             {
               url: '/routes',
               channelId: 'atendimentos_v2',
               type: 'job_completed',
               jobId: String(newJob.id || ''),
               tag: `job_${newJob.id}`
             }
           );
       }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
       const newMsg = payload.new as any;
       if (newMsg.sender_type === 'client') {
          const { data: session } = await supabaseAdmin
            .from('chat_sessions')
            .select('id, admin_id, employee_id, client_id, status, created_at, closed_at')
            .eq('id', newMsg.session_id)
            .single();

          if (!session || session.status === 'closed') {
            return; // Sessão encerrada: não envia notificação push
          }

          const now = Date.now();
          const createdMs = session.created_at ? new Date(session.created_at).getTime() : 0;
          if (createdMs > 0 && now - createdMs > 30 * 60 * 1000) {
            await supabaseAdmin.from('chat_sessions')
              .update({ status: 'closed', closed_at: new Date().toISOString() })
              .eq('id', session.id);
            return;
          }

          let clientName = 'Cliente';
          if (session.client_id) {
            const { data: clientData } = await supabaseAdmin
              .from('clients')
              .select('name')
              .eq('id', session.client_id)
              .maybeSingle();
            if (clientData?.name) clientName = clientData.name;
          }

          const targetUserId = session.admin_id || session.employee_id;
          if (targetUserId) {
             const clientDisplayName = formatFirstTwoNames(clientName);
             await sendPushToAdmin(
               targetUserId,
               `💬 ${clientDisplayName}`,
               newMsg.content || 'Mensagem recebida',
               {
                 url: '/messages',
                 channelId: 'chat_messages',
                 type: 'chat_message',
                 clientId: String(session.client_id || ''),
                 sessionId: String(newMsg.session_id || '')
               }
             );
          }
       }
    })
    .subscribe();

  /**
   * Rotina de limpeza diária: às 00:00 (e ao iniciar),
   * deleta todas as mensagens de chat dos dias anteriores e finaliza/remove sessões antigas.
   */
  async function purgeOldChatMessages() {
    try {
      // Início do dia civil local (meia-noite)
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const startOfTodayIso = startOfToday.toISOString();

      console.log(`[Midnight Chat Cleaner] Executando limpeza de mensagens anteriores a ${startOfTodayIso}...`);

      // Deleta mensagens gravadas antes de hoje
      const { error: msgErr, count: msgCount } = await supabaseAdmin
        .from('chat_messages')
        .delete({ count: 'exact' })
        .lt('created_at', startOfTodayIso);

      if (msgErr) {
        console.error('[Midnight Chat Cleaner] Erro ao deletar mensagens antigas:', msgErr.message);
      } else {
        console.log(`[Midnight Chat Cleaner] Mensagens antigas deletadas com sucesso: ${msgCount ?? 'todas anteriores'}`);
      }

      // Fecha sessões abertas anteriores a hoje
      await supabaseAdmin
        .from('chat_sessions')
        .update({ status: 'closed', closed_at: startOfTodayIso })
        .eq('status', 'open')
        .lt('created_at', startOfTodayIso);

    } catch (e: any) {
      console.error('[Midnight Chat Cleaner] Exceção na rotina de limpeza:', e.message);
    }
  }

  // Agenda a execução da limpeza pontualmente às 00:00:00 diariamente
  function scheduleMidnightPurge() {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5, 0);
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    console.log(`[Midnight Chat Cleaner] Próxima limpeza agendada para ${nextMidnight.toISOString()} (em ${Math.round(msUntilMidnight / 60000)} minutos).`);

    setTimeout(() => {
      purgeOldChatMessages();
      // Repete a cada 24 horas a partir de então
      setInterval(purgeOldChatMessages, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  }

  // Executa uma limpeza ao inicializar para expurgar mensagens órfãs anteriores e agenda para 00:00
  purgeOldChatMessages();
  scheduleMidnightPurge();

  /**
   * Rotina Diária das 07:00 da manhã (Horário de Brasília):
   * Envia notificações push para o administrador informando:
   * 1. Clientes com mensalidade vencendo HOJE para realizar a cobrança
   * 2. Clientes com mensalidades já ATRASADAS para realizar a cobrança
   */
  async function sendDailyBillingReminders(): Promise<{ dueTodayCount: number; overdueCount: number; errors: any[] }> {
    const summary = { dueTodayCount: 0, overdueCount: 0, errors: [] as any[] };
    try {
      // Obter data atual no fuso de Brasília (YYYY-MM-DD)
      const now = new Date();
      const brParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(now);

      const year = brParts.find(p => p.type === 'year')?.value || `${now.getFullYear()}`;
      const month = brParts.find(p => p.type === 'month')?.value || `${String(now.getMonth() + 1).padStart(2, '0')}`;
      const day = brParts.find(p => p.type === 'day')?.value || `${String(now.getDate()).padStart(2, '0')}`;
      const todayStr = `${year}-${month}-${day}`;

      console.log(`[7AM Billing Reminder] Iniciando verificação de vencimentos para a data: ${todayStr}...`);

      // Buscar todos os clientes cadastrados que possuam data de vencimento
      const { data: clients, error: clientErr } = await supabaseAdmin
        .from('clients')
        .select('id, name, due_date, monthly_price, admin_id, active')
        .not('due_date', 'is', null);

      if (clientErr) {
        console.error('[7AM Billing Reminder] Erro ao buscar clientes:', clientErr.message);
        summary.errors.push(clientErr.message);
        return summary;
      }

      if (!clients || clients.length === 0) {
        console.log('[7AM Billing Reminder] Nenhum cliente encontrado com data de vencimento.');
        return summary;
      }

      // Buscar admin padrão caso o client.admin_id esteja vazio
      const { data: defaultAdmins } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('role', 'admin');
      const defaultAdminId = defaultAdmins && defaultAdmins.length > 0 ? defaultAdmins[0].id : null;

      for (const client of clients) {
        if (!client.due_date) continue;

        // Pular clientes inativos se houver flag
        if (client.active === false) continue;

        const targetAdminId = client.admin_id || defaultAdminId;
        if (!targetAdminId) continue;

        const clientName = client.name || 'Cliente';
        const clientDueDate = client.due_date;

        if (clientDueDate === todayStr) {
          // Vence HOJE
          summary.dueTodayCount++;
          const title = `💰 Vencimento Hoje: ${clientName}`;
          const body = `Hoje vence a mensalidade de ${clientName}. Realize a cobrança!`;
          
          await sendPushToAdmin(
            targetAdminId,
            title,
            body,
            {
              url: '/billing',
              channelId: 'cobrancas',
              type: 'billing_due_today',
              clientId: String(client.id)
            }
          );
        } else if (clientDueDate < todayStr) {
          // Já está ATRASADO
          summary.overdueCount++;
          const [dYear, dMonth, dDay] = clientDueDate.split('-');
          const formattedDueDate = dDay && dMonth ? `${dDay}/${dMonth}/${dYear}` : clientDueDate;
          const title = `⚠️ Cobrança Atrasada: ${clientName}`;
          const body = `O cliente ${clientName} está com mensalidade em atraso (venceu em ${formattedDueDate}). Realize a cobrança!`;

          await sendPushToAdmin(
            targetAdminId,
            title,
            body,
            {
              url: '/billing',
              channelId: 'cobrancas',
              type: 'billing_overdue',
              clientId: String(client.id)
            }
          );
        }
      }

      console.log(`[7AM Billing Reminder] Notificações concluídas: ${summary.dueTodayCount} vencendo hoje, ${summary.overdueCount} atrasados.`);
    } catch (err: any) {
      console.error('[7AM Billing Reminder] Erro inesperado na rotina de cobrança:', err);
      summary.errors.push(err?.message || String(err));
    }
    return summary;
  }

  // Agenda a execução da rotina de cobrança diariamente às 07:00 da manhã (Horário de Brasília)
  function schedule7AMBillingReminders() {
    function calculateMsUntil7AM(): number {
      const now = new Date();
      // Converte hora atual para horário de Brasília
      const brTimeStr = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
      const brDate = new Date(brTimeStr);

      const targetDate = new Date(brDate);
      targetDate.setHours(7, 0, 0, 0);

      // Se já passou das 07:00 de hoje no Brasil, agenda para as 07:00 de amanhã
      if (brDate.getTime() >= targetDate.getTime()) {
        targetDate.setDate(targetDate.getDate() + 1);
      }

      return targetDate.getTime() - brDate.getTime();
    }

    const msUntil7AM = calculateMsUntil7AM();
    console.log(`[7AM Billing Reminder] Próxima notificação agendada para daqui a ${Math.round(msUntil7AM / 60000)} minutos (07:00 Horário de Brasília).`);

    setTimeout(() => {
      sendDailyBillingReminders();
      // Repete diariamente a cada 24 horas
      setInterval(sendDailyBillingReminders, 24 * 60 * 60 * 1000);
    }, msUntil7AM);
  }

  schedule7AMBillingReminders();

  // Vite middleware for development (must be mounted AFTER all API routes)
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
