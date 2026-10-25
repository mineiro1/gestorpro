import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import * as dotenv from 'dotenv';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

import { getBrazilianPhoneVariations } from './src/lib/phoneUtils';

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

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

async function startServer() {
  const app = express();
  const portArgIndex = process.argv.indexOf("--port");
  const parsedPort = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? parseInt(process.argv[portArgIndex + 1], 10) : undefined;
  const PORT = Number(process.env.PORT) || parsedPort || 3000;

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

  // Endpoint de Resolução de Login e Senha para o Portal do Cliente
  // Suporta com precisão os 4 formatos de telefone do Brasil:
  // 1. AstraCalls: DDI 55 + DDD + 8 dígitos (ex: 551187654321)
  // 2. Com DDI e com 9: DDI 55 + DDD + 9 dígitos (ex: 5511987654321)
  // 3. Sem DDI com 9: DDD + 9 dígitos (ex: 11987654321)
  // 4. Sem DDI sem 9: DDD + 8 dígitos (ex: 1187654321)
  app.post("/api/auth/client-resolve", async (req, res) => {
    try {
      const { login, password } = req.body;
      if (!login) {
        return res.status(400).json({ success: false, message: "Login não informado" });
      }

      const cleanLogin = String(login).trim();
      // Se for email corporativo/pessoal que não é do portal do cliente (ex: servincg@gmail.com)
      if (cleanLogin.includes('@') && !cleanLogin.endsWith('@gestaopro.com') && !cleanLogin.endsWith('@serviplay.com')) {
        return res.json({ success: false, reason: "standard_email" });
      }

      const loginVariations = getBrazilianPhoneVariations(cleanLogin).all;
      const passVariations = password ? getBrazilianPhoneVariations(String(password).trim()).all : [];

      // 1. Procurar em 'users'
      const { data: allUsers, error: uErr } = await supabaseAdmin
        .from('users')
        .select('id, name, email, phone, role, client_id, active, admin_id');

      let matchedUser = allUsers?.find(u => {
        const uPhone = (u.phone || '').replace(/\D/g, '');
        const uEmailPrefix = (u.email || '').split('@')[0].replace(/\D/g, '');
        return loginVariations.includes(uPhone) || loginVariations.includes(uEmailPrefix);
      });

      // 2. Se não encontrou em 'users', procurar em 'clients'
      let matchedClient: any = null;
      if (!matchedUser) {
        const { data: allClients } = await supabaseAdmin
          .from('clients')
          .select('id, name, phone, email, active, admin_id');

        matchedClient = allClients?.find(c => {
          const cPhone = (c.phone || '').replace(/\D/g, '');
          return loginVariations.includes(cPhone);
        });

        if (matchedClient) {
          // Verifica se já tem usuário apontando para esse client_id
          matchedUser = allUsers?.find(u => u.client_id === matchedClient.id);
          
          if (!matchedUser) {
            // Cria o usuário para este cliente no auth e na tabela users
            const primaryPhone = getBrazilianPhoneVariations(matchedClient.phone || cleanLogin).no55With9 || cleanLogin.replace(/\D/g, '');
            const clientEmail = `${primaryPhone}@gestaopro.com`;
            const defaultPassword = primaryPhone;

            let authUser = null;
            try {
              const { data: newAuth, error: createAuthErr } = await supabaseAdmin.auth.admin.createUser({
                email: clientEmail,
                password: defaultPassword,
                email_confirm: true,
                user_metadata: { name: matchedClient.name, role: 'client' }
              });
              if (newAuth?.user) {
                authUser = newAuth.user;
              } else if (createAuthErr?.message?.includes('already registered')) {
                const { data: existingList } = await supabaseAdmin.auth.admin.listUsers();
                authUser = (existingList?.users as any[])?.find((u: any) => u.email === clientEmail);
              }
            } catch (e) {}

            if (authUser) {
              const { data: newUser } = await supabaseAdmin.from('users').upsert({
                id: authUser.id,
                name: matchedClient.name,
                email: clientEmail,
                phone: primaryPhone,
                role: 'client',
                client_id: matchedClient.id,
                admin_id: matchedClient.admin_id,
                active: true
              }).select().single();
              matchedUser = newUser;
            }
          }
        }
      }

      if (!matchedUser) {
        return res.json({ success: false, reason: "user_not_found" });
      }

      if (matchedUser.active === false) {
        return res.status(403).json({ success: false, error: "Esta conta está desativada no momento. Entre em contato com a empresa." });
      }

      // Se for cliente (ou tiver client_id associado)
      if (matchedUser.role === 'client' || matchedUser.client_id) {
        const { data: authUserData } = await supabaseAdmin.auth.admin.getUserById(matchedUser.id);
        const authEmail = authUserData?.user?.email || matchedUser.email || `${matchedUser.phone}@gestaopro.com`;

        const userPhoneVariations = getBrazilianPhoneVariations(matchedUser.phone || '').all;
        const targetPassword = password ? String(password).trim() : (matchedUser.phone || '123456');

        // Se a senha informada corresponde a qualquer uma das 4 variações do telefone do cliente,
        // ou às variações digitadas no login:
        const isPhoneMatch = passVariations.some(p => userPhoneVariations.includes(p) || loginVariations.includes(p)) ||
                             userPhoneVariations.some(p => passVariations.includes(p));

        if (isPhoneMatch || !password) {
          // Atualiza a senha no Supabase Auth para a senha que o cliente digitou,
          // garantindo login imediato sem nenhuma falha de credenciais!
          await supabaseAdmin.auth.admin.updateUserById(matchedUser.id, {
            password: targetPassword,
            email_confirm: true
          });

          return res.json({
            success: true,
            email: authEmail,
            password: targetPassword,
            role: 'client',
            user: matchedUser
          });
        } else {
          // Se for senha customizada, valida no Supabase
          const testClient = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY || '');
          const { data: testAuth, error: testErr } = await testClient.auth.signInWithPassword({
            email: authEmail,
            password: targetPassword
          });

          if (!testErr && testAuth?.user) {
            return res.json({
              success: true,
              email: authEmail,
              password: targetPassword,
              role: 'client',
              user: matchedUser
            });
          }
        }
      }

      return res.json({ success: false, reason: "credentials_mismatch" });
    } catch (err: any) {
      console.error("[client-resolve] Erro:", err);
      return res.status(500).json({ success: false, error: err.message });
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

  // Rotina contínua de expurgo de mensagens e sessões expiradas (> 30 min) ou encerradas
  async function cleanupExpiredAndClosedChatMessages() {
    try {
      const now = Date.now();
      const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000).toISOString();

      // 1. Fechar sessões 'open' com mais de 30 minutos e deletar suas mensagens
      const { data: expiredOpenSessions } = await supabaseAdmin
        .from('chat_sessions')
        .select('id, client_id')
        .eq('status', 'open')
        .lt('created_at', thirtyMinutesAgo);

      if (expiredOpenSessions && expiredOpenSessions.length > 0) {
        const expiredIds = expiredOpenSessions.map(s => s.id);
        console.log(`[Chat Expiry Cleaner] Expurgando ${expiredIds.length} sessões abertas há mais de 30 minutos...`);
        await supabaseAdmin.from('chat_messages').delete().in('session_id', expiredIds);
        await supabaseAdmin.from('chat_sessions').update({ 
          status: 'closed', 
          closed_at: new Date().toISOString() 
        }).in('id', expiredIds);
      }

      // 2. Deletar mensagens de sessões que já possuem status 'closed'
      const { data: closedSessions } = await supabaseAdmin
        .from('chat_sessions')
        .select('id')
        .eq('status', 'closed');

      if (closedSessions && closedSessions.length > 0) {
        const closedIds = closedSessions.map(s => s.id);
        await supabaseAdmin.from('chat_messages').delete().in('session_id', closedIds);
      }
    } catch (e: any) {
      console.warn('[Chat Expiry Cleaner] Erro na limpeza periódica:', e.message);
    }
  }

  // Executar limpeza contínua a cada 30 segundos
  setInterval(cleanupExpiredAndClosedChatMessages, 30000);

  app.get("/api/chat/messages/:clientId", async (req, res) => {
    try {
      const { clientId } = req.params;
      if (!clientId) return res.status(400).json({ error: "Missing clientId" });

      // Expurgar mensagens de sessões expiradas ou encerradas
      await cleanupExpiredAndClosedChatMessages();

      // Buscar APENAS sessão aberta ('open') do cliente
      const { data: openSessions } = await supabaseAdmin
        .from('chat_sessions')
        .select('id, created_at, status')
        .eq('client_id', clientId)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (!openSessions || openSessions.length === 0) {
        return res.json({ success: true, messages: [] });
      }

      const activeSession = openSessions[0];
      const now = Date.now();
      const createdMs = activeSession.created_at ? new Date(activeSession.created_at).getTime() : 0;

      // Se a sessão expirou (> 30 min), deleta as mensagens do chat/banco e fecha a sessão
      if (createdMs > 0 && now - createdMs > 30 * 60 * 1000) {
        await supabaseAdmin.from('chat_messages').delete().eq('session_id', activeSession.id);
        await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
        return res.json({ success: true, messages: [] });
      }

      // Retorna APENAS as mensagens da sessão aberta ativa atual
      const { data: loadedMsgs, error } = await supabaseAdmin
        .from('chat_messages')
        .select('*')
        .eq('session_id', activeSession.id)
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
      const { clientId, sessionId } = req.body;
      if (!clientId && !sessionId) return res.status(400).json({ error: "Missing clientId or sessionId" });

      let query = supabaseAdmin.from('chat_sessions').select('id');
      if (sessionId) {
        query = query.eq('id', sessionId);
      } else {
        query = query.eq('client_id', clientId);
      }

      const { data: targetSessions } = await query;
      if (targetSessions && targetSessions.length > 0) {
        const sIds = targetSessions.map((s: any) => s.id);
        console.log(`[/api/chat/close] Encerrando chat e excluindo todas as mensagens de ${sIds.length} sessões...`);
        // Deleta todas as mensagens do chat no banco de dados
        await supabaseAdmin.from('chat_messages').delete().in('session_id', sIds);
        // Atualiza status da sessão para closed
        await supabaseAdmin.from('chat_sessions').update({ 
          status: 'closed', 
          closed_at: new Date().toISOString() 
        }).in('id', sIds);
      }

      return res.json({ success: true, closed: true, deleted: true });
    } catch(e: any) {
      console.error("[/api/chat/close] Erro:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/chat/session/ensure", async (req, res) => {
    try {
      const { clientId, adminId, employeeId, visitId } = req.body;
      if (!clientId) return res.status(400).json({ error: "Missing clientId" });

      const now = Date.now();

      // 1. Procurar sessão open existente
      const { data: openSessions } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (openSessions && openSessions.length > 0) {
        const currentSession = openSessions[0];
        const createdMs = currentSession.created_at ? new Date(currentSession.created_at).getTime() : 0;

        // Se a sessão existente ainda estiver dentro do limite de 30 minutos, reutiliza
        if (createdMs > 0 && now - createdMs <= 30 * 60 * 1000) {
          if (openSessions.length > 1) {
            const extraIds = openSessions.slice(1).map((s: any) => s.id);
            await supabaseAdmin.from('chat_messages').delete().in('session_id', extraIds);
            await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).in('id', extraIds);
          }
          return res.json({ success: true, session: currentSession });
        } else {
          // Sessão existente expirou (> 30 min): deletar mensagens e fechar
          console.log(`[/api/chat/session/ensure] Sessão existente expirou (>30min). Deletando mensagens e fechando...`);
          const expiredIds = openSessions.map((s: any) => s.id);
          await supabaseAdmin.from('chat_messages').delete().in('session_id', expiredIds);
          await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).in('id', expiredIds);
        }
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

      // 3. Criar nova sessão de atendimento de 30 minutos
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
      } else {
        let validSessionId: string | null = null;
        const nowTime = Date.now();

        if (sessionId) {
          const { data: sessCheck } = await supabaseAdmin
            .from('chat_sessions')
            .select('id, status, created_at')
            .eq('id', sessionId)
            .maybeSingle();

          const sessAge = sessCheck?.created_at ? (nowTime - new Date(sessCheck.created_at).getTime()) : 9999999;
          if (sessCheck && sessCheck.status === 'open' && sessAge <= 30 * 60 * 1000) {
            validSessionId = sessCheck.id;
          }
        }

        const targetClientId = req.body.clientId;
        if (!validSessionId && targetClientId) {
          const { data: existingSessions } = await supabaseAdmin
            .from('chat_sessions')
            .select('id, status, created_at')
            .eq('client_id', targetClientId)
            .eq('status', 'open')
            .order('created_at', { ascending: false });

          validSessionId = (existingSessions || []).find((s: any) => {
            const cTime = s.created_at ? new Date(s.created_at).getTime() : 0;
            return cTime > 0 && nowTime - cTime <= 30 * 60 * 1000;
          })?.id || null;

          if (!validSessionId) {
            const { data: clientRow } = await supabaseAdmin.from('clients').select('admin_id, employee_id').eq('id', targetClientId).maybeSingle();
            let adminId = clientRow?.admin_id;
            let employeeId = clientRow?.employee_id || adminId;

            if (!adminId) {
              const { data: anyAdmin } = await supabaseAdmin.from('users').select('id').eq('role', 'admin').limit(1).maybeSingle();
              adminId = anyAdmin?.id;
              employeeId = adminId;
            }

            const { data: createdSess } = await supabaseAdmin.from('chat_sessions').insert({
              client_id: targetClientId,
              admin_id: adminId || null,
              employee_id: employeeId || null,
              status: 'open',
              created_at: new Date().toISOString()
            }).select('id').single();
            validSessionId = createdSess?.id || null;
          }
        }

        if (validSessionId) {
          try {
            const { data: created } = await supabaseAdmin
              .from('chat_messages')
              .insert({
                session_id: validSessionId,
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

  // Cache bidirecional de LIDs (Linked Identity Device) do WhatsApp Web/Multi-Device para telefones reais
  const lidToRealPhoneCache = new Map<string, string>();
  let lastAstraContactsFetch = 0;

  async function refreshAstraContactsCache(force = false) {
    const now = Date.now();
    if (!force && lastAstraContactsFetch > 0 && now - lastAstraContactsFetch < 10 * 60 * 1000) {
      return;
    }
    try {
      const astracallsUrl = (process.env.ASTRACALLS_URL || 'https://calls.rspiscinas.app.br').trim().replace(/\/$/, '');
      const astracallsApiKey = process.env.ASTRACALLS_API_KEY || 'rs_piscinas_segredo_2026';
      const sessionId = '8090cca3add0b8eb3e41efb9eec363e4';

      const res = await fetch(`${astracallsUrl}/api/sessions/${sessionId}/contacts`, {
        headers: { 'X-Api-Key': astracallsApiKey }
      });
      if (!res.ok) return;
      const contacts = await res.json();
      if (!Array.isArray(contacts)) return;

      lastAstraContactsFetch = now;
      const nonLidContacts = contacts.filter((c: any) => !c.id?.includes('@lid') && (c.number || c.id));
      const lidContacts = contacts.filter((c: any) => c.id?.includes('@lid') || (c.number && c.number.length > 13));

      for (const lid of lidContacts) {
        const cleanLid = cleanJidToPhone(lid.id || lid.number);
        if (!cleanLid) continue;
        const lidName = (lid.name || lid.pushName || lid.pushname || lid.fullName || '').trim().toLowerCase();
        if (!lidName) continue;

        const phoneMatch = nonLidContacts.find((c: any) => {
          const cName = (c.name || c.pushName || c.pushname || c.fullName || '').trim().toLowerCase();
          return cName && cName === lidName;
        });

        if (phoneMatch) {
          const realPhone = cleanJidToPhone(phoneMatch.number || phoneMatch.id);
          if (realPhone) {
            lidToRealPhoneCache.set(cleanLid, realPhone);
          }
        }
      }
      console.log(`[AstraCalls Cache] Mapeamento de LIDs atualizado: ${lidToRealPhoneCache.size} LIDs mapeados para números de telefone.`);
    } catch (err: any) {
      console.warn('[AstraCalls Cache] Erro ao carregar contatos AstraCalls:', err.message);
    }
  }

  async function resolveLidToRealPhone(
    cleanLid: string,
    rawRemote: string,
    msgData: any = {},
    body: any = {},
    allTargets: any[] = []
  ): Promise<string | null> {
    if (!cleanLid) return null;

    // 1. Verificar cache em memória
    if (lidToRealPhoneCache.has(cleanLid)) {
      return lidToRealPhoneCache.get(cleanLid)!;
    }

    // 2. Se não está no cache, atualizar cache forçadamente de contatos
    await refreshAstraContactsCache(true);
    if (lidToRealPhoneCache.has(cleanLid)) {
      return lidToRealPhoneCache.get(cleanLid)!;
    }

    // 3. Tentar resolução via pushName do webhook com os contatos ou clientes cadastrados
    const pushName = String(msgData?.pushName || body?.pushName || msgData?.verifiedName || body?.verifiedName || '').trim().toLowerCase();
    if (pushName && pushName.length >= 3) {
      const targetByName = allTargets.find((t: any) => {
        const tName = String(t.name || '').trim().toLowerCase();
        return tName && (tName === pushName || tName.includes(pushName) || pushName.includes(tName));
      });

      if (targetByName?.phone) {
        const resolved = cleanJidToPhone(targetByName.phone);
        if (resolved) {
          lidToRealPhoneCache.set(cleanLid, resolved);
          return resolved;
        }
      }
    }

    // 4. Se houver apenas uma sessão ativa aberta no momento no app, associar o LID a essa sessão
    try {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: openSess } = await supabaseAdmin
        .from('chat_sessions')
        .select('id, client_id')
        .eq('status', 'open')
        .gte('created_at', thirtyMinAgo);

      if (openSess && openSess.length === 1) {
        const singleClientId = openSess[0].client_id;
        const cli = allTargets.find((t: any) => t.id === singleClientId);
        if (cli?.phone) {
          const resolved = cleanJidToPhone(cli.phone);
          if (resolved) {
            console.log(`[LID Resolver] Associado LID ${cleanLid} ao cliente da única sessão ativa em andamento: ${cli.name} (${resolved})`);
            lidToRealPhoneCache.set(cleanLid, resolved);
            return resolved;
          }
        }
      }
    } catch (e) {}

    return null;
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

      let candidatePhones = [cleanIncoming];
      const isLid = phone.includes('@lid') || cleanIncoming.length > 13;
      if (isLid) {
        const resolved = await resolveLidToRealPhone(cleanIncoming, phone, rawItem, body, allTargets);
        if (resolved) {
          candidatePhones.push(resolved);
        }
      }

      const matchedClient = allTargets.find((c: any) => {
         return candidatePhones.some(cand => 
           isMatchingClientPhone(c.phone || '', cand) || isMatchingClientPhone(c.local_phone || '', cand)
         );
      });
      
      if (!matchedClient) {
        console.log("[Webhook WAME] Nenhum cliente ou contato da agenda correspondente encontrado para o número:", phone, cleanIncoming, "Candidatos:", candidatePhones);
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

      // Localiza sessões abertas válidas criadas nos últimos 30 minutos
      const openSessions = (sessions || []).filter((s: any) => s.status === 'open');
      if (openSessions.length > 0) {
        for (const sess of openSessions) {
          const createdTime = new Date(sess.created_at).getTime();
          if (now - createdTime <= 30 * 60 * 1000) {
            if (!activeSession) {
              activeSession = sess;
            } else {
              // Fecha duplicada e deleta mensagens
              await supabaseAdmin.from('chat_messages').delete().eq('session_id', sess.id);
              await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', sess.id);
            }
          } else {
            // Se a sessão expirou (> 30 min), deleta as mensagens do chat/banco e fecha
            console.log(`[Webhook WAME] Sessão expirou (>30 min). Deletando mensagens da sessão ${sess.id}...`);
            await supabaseAdmin.from('chat_messages').delete().eq('session_id', sess.id);
            await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', sess.id);
          }
        }
      }

      // REGRA ESTRITA: Se não houver sessão aberta nos últimos 30 minutos pelo colaborador/admin,
      // as mensagens NÃO devem aparecer no chat e devem ser descartadas do banco de dados!
      if (!activeSession) {
        console.log(`[Webhook WAME] Mensagem descartada de ${matchedClient.name} (${cleanIncoming}): Nenhuma conversa ativa de 30 minutos em andamento iniciada pelo colaborador.`);
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

      let candidatePhones = [cleanIncoming];
      const isLid = remoteJid.includes('@lid') || cleanIncoming.length > 13;
      if (isLid) {
        const resolved = await resolveLidToRealPhone(cleanIncoming, remoteJid, msgData, body, allTargets);
        if (resolved) {
          candidatePhones.push(resolved);
        }
      }

      const matchedClient = allTargets.find((c: any) => {
         return candidatePhones.some(cand => 
           isMatchingClientPhone(c.phone || '', cand) || isMatchingClientPhone(c.local_phone || '', cand)
         );
      });
      
      if (!matchedClient) {
        console.log("[Webhook Evolution] Nenhum cliente ou contato da agenda correspondente encontrado para o número:", cleanIncoming, "Candidatos:", candidatePhones);
        return res.status(200).send("OK");
      }

      const { data: sessions } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('client_id', matchedClient.id)
        .order('created_at', { ascending: false });
        
      const now = new Date().getTime();
      let activeSession: any = null;

      // Localiza sessões abertas válidas criadas nos últimos 30 minutos
      const openSessions = (sessions || []).filter((s: any) => s.status === 'open');
      if (openSessions.length > 0) {
        for (const sess of openSessions) {
          const createdTime = new Date(sess.created_at).getTime();
          if (now - createdTime <= 30 * 60 * 1000) {
            if (!activeSession) {
              activeSession = sess;
            } else {
              // Fecha duplicada e deleta mensagens
              await supabaseAdmin.from('chat_messages').delete().eq('session_id', sess.id);
              await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', sess.id);
            }
          } else {
            // Se a sessão expirou (> 30 min), deleta as mensagens do chat/banco e fecha
            console.log(`[Webhook Evolution] Sessão expirou (>30 min). Deletando mensagens da sessão ${sess.id}...`);
            await supabaseAdmin.from('chat_messages').delete().eq('session_id', sess.id);
            await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', sess.id);
          }
        }
      }

      // REGRA ESTRITA: Se não houver sessão aberta nos últimos 30 minutos pelo colaborador/admin,
      // as mensagens NÃO devem aparecer no chat e devem ser descartadas do banco de dados!
      if (!activeSession) {
        console.log(`[Webhook Evolution] Mensagem descartada de ${matchedClient.name} (${cleanIncoming}): Nenhuma conversa ativa de 30 minutos em andamento iniciada pelo colaborador.`);
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
      const isFromMe = Boolean(
        msgData.key?.fromMe === true ||
        msgData.fromMe === true ||
        body.fromMe === true ||
        msgData.direction === 'outbound'
      );

      if (isFromMe) {
        return res.status(200).json({ success: true, fromMe: true, ...statusResult });
      }

      let rawRemote = msgData.key?.remoteJid || msgData.remoteJid || msgData.chat || msgData.chatId || msgData.from || msgData.sender || msgData.phone || msgData.to || body.chat || body.from || "";
      const cleanIncoming = cleanJidToPhone(rawRemote);

      let extracted = extractMessageData(msgData.message || msgData);
      let content = extracted.content || msgData.body || msgData.text || msgData.message || msgData.content || body.body || body.text || body.message || "";
      let mediaUrl = extracted.mediaUrl || msgData.mediaUrl || msgData.url || "";
      let externalMsgId = String(msgData.key?.id || msgData.id || body.id || body.messageId || "");

      if (msgData.type === 'audio' && !content) content = "🎵 Mensagem de Áudio";
      if (msgData.type === 'image' && !content) content = "📸 Imagem";
      if (msgData.type === 'video' && !content) content = "🎥 Vídeo";
      if (msgData.type === 'document' && !content) content = "📄 Documento";

      if (!cleanIncoming || (!content && !mediaUrl)) {
        return res.status(200).json({ success: true, ...statusResult });
      }

      // Deduplicação
      const dedupKey = externalMsgId ? `astra_${externalMsgId}` : `astra_txt_${cleanIncoming}_${content}`;
      if (isDuplicateIncomingMsg(dedupKey)) {
        console.log("Ignorando mensagem duplicada AstraCalls:", dedupKey);
        return res.status(200).json({ success: true, duplicate: true });
      }

      const [{ data: clients }, { data: agendaContacts }] = await Promise.all([
        supabaseAdmin.from('clients').select('id, name, phone, local_phone, admin_id, employee_id'),
        supabaseAdmin.from('agenda_contacts').select('id, name, phone, admin_id')
      ]);

      const allTargets = [
        ...(clients || []).map((c: any) => ({ ...c, is_agenda: false })),
        ...(agendaContacts || []).map((a: any) => ({ ...a, local_phone: '', employee_id: a.admin_id, is_agenda: true }))
      ];

      // 1. Resolver candidato a telefone real (incluindo resolução precisa de LID)
      let candidatePhones = [cleanIncoming];
      const isLid = rawRemote.includes('@lid') || cleanIncoming.length > 13;
      if (isLid) {
        const resolved = await resolveLidToRealPhone(cleanIncoming, rawRemote, msgData, body, allTargets);
        if (resolved) {
          candidatePhones.push(resolved);
        }
      }

      const matchedClient = allTargets.find((c: any) => {
         return candidatePhones.some(cand => 
           isMatchingClientPhone(c.phone || '', cand) || isMatchingClientPhone(c.local_phone || '', cand)
         );
      });

      if (!matchedClient) {
        console.log("[Webhook AstraCalls] Mensagem ignorada (número não pertence a cliente cadastrado):", cleanIncoming, rawRemote, "Candidatos:", candidatePhones);
        return res.status(200).json({ success: true, matched: false });
      }

      const { data: sessions } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('client_id', matchedClient.id)
        .order('created_at', { ascending: false });

      const now = new Date().getTime();
      let activeSession: any = null;

      // Localiza sessões abertas válidas criadas nos últimos 30 minutos
      const openSessions = (sessions || []).filter((s: any) => s.status === 'open');
      if (openSessions.length > 0) {
        for (const sess of openSessions) {
          const createdTime = new Date(sess.created_at).getTime();
          if (now - createdTime <= 30 * 60 * 1000) {
            if (!activeSession) {
              activeSession = sess;
            } else {
              // Fecha duplicada e deleta mensagens
              await supabaseAdmin.from('chat_messages').delete().eq('session_id', sess.id);
              await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', sess.id);
            }
          } else {
            // Se a sessão expirou (> 30 min), deleta as mensagens do chat/banco e fecha
            console.log(`[Webhook AstraCalls] Sessão expirou (>30 min). Deletando mensagens da sessão ${sess.id}...`);
            await supabaseAdmin.from('chat_messages').delete().eq('session_id', sess.id);
            await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', sess.id);
          }
        }
      }

      // REGRA ESTRITA: Se não houver sessão aberta nos últimos 30 minutos pelo colaborador/admin,
      // as mensagens NÃO devem aparecer no chat e devem ser descartadas do banco de dados!
      if (!activeSession) {
        console.log(`[Webhook AstraCalls] Mensagem descartada de ${matchedClient.name} (${cleanIncoming}): Nenhuma conversa ativa de 30 minutos em andamento iniciada pelo colaborador.`);
        return res.status(200).json({ success: true, activeSession: false });
      }

      if (activeSession) {
        const metadataPayload = {
          external_id: externalMsgId || undefined,
          astra_id: externalMsgId || undefined,
          url: mediaUrl || undefined,
          status: 'read'
        };

        await supabaseAdmin.from('chat_messages').insert({
           session_id: activeSession.id,
           sender_type: 'client',
           content: String(content),
           media_url: JSON.stringify(metadataPayload)
        });

        // Cliente respondeu: marca mensagens anteriores do tech como lidas
        const { data: unreadTech } = await supabaseAdmin
          .from('chat_messages')
          .select('id, media_url')
          .eq('session_id', activeSession.id)
          .eq('sender_type', 'tech');

        if (unreadTech) {
          for (const utm of unreadTech) {
            let mMeta: any = {};
            try { mMeta = JSON.parse(utm.media_url); } catch(e) {}
            if (mMeta.status !== 'read') {
              await supabaseAdmin.from('chat_messages').update({
                media_url: JSON.stringify({ ...mMeta, status: 'read' })
              }).eq('id', utm.id);
            }
          }
        }

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

  // Helper to send push notification to all devices registered for a specific user (admin or employee)
  async function sendPushToUser(userId: string, title: string, body: string, data: Record<string, string> = {}) {
    try {
      if (!userId) {
        console.warn('[Push Server] userId não fornecido. Envio abortado por segurança.');
        return false;
      }

      // 1. Coleta todos os tokens ativos pertencentes EXCLUSIVAMENTE ao userId informado
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, name, fcm_token, whatsapp_settings')
        .eq('id', userId);

      let rawTokens: string[] = [];
      (users || []).forEach(u => {
        if (u.fcm_token) rawTokens.push(u.fcm_token);
        if (Array.isArray(u.whatsapp_settings?.devices)) {
          u.whatsapp_settings.devices.forEach((d: any) => {
            if (d?.token) rawTokens.push(d.token);
          });
        }
      });

      // Deduplica tokens garantindo que nenhum dispositivo receba 2x (sem misturar contas)
      const tokens = Array.from(new Set(rawTokens.filter(Boolean)));

      if (tokens.length === 0) {
        console.log(`[Push Server] Nenhum token FCM registrado no momento para o usuário ${userId}. Envio cancelado.`);
        return false;
      }

      console.log(`[Push Server] Disparando push notification para ${tokens.length} dispositivo(s) do usuário ${userId}: "${title}"`);

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
                  defaultVibrateTimings: true,
                  localOnly: false,
                  notificationCount: 1,
                  tag: data.tag || (data.visitId ? `visit_${data.visitId}` : (data.jobId ? `job_${data.jobId}` : (data.clientId ? `billing_${data.clientId}` : undefined)))
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
              // Limpar apenas o token expirado na coluna principal se for igual
              await supabaseAdmin.from('users').update({ fcm_token: null }).eq('fcm_token', token);
            }
          }
        } else {
          console.log(`[Push Server] Firebase Admin não inicializado no servidor. Token do usuário registrado: ${token.substring(0, 12)}...`);
        }
      }
      return sentCount > 0;
    } catch (e: any) {
      console.error('[Push Server] Erro geral ao disparar push:', e);
      return false;
    }
  }

// Helper específico para envio de push EXCLUSIVAMENTE ao Administrador responsável
  async function sendPushToAdmin(adminId: string, title: string, body: string, data: Record<string, string> = {}) {
    let sent = false;
    const targetIds = new Set<string>();

    // 1. Define o Administrador Responsável
    if (adminId && adminId.trim() !== '') {
      targetIds.add(adminId.trim());
    } else {
      // Fallback seguro para o Administrador principal
      targetIds.add('698dfcdd-7c91-4df5-aaee-eae9e67f15ae');
    }

    // 2. REGRA DE SEGURANÇA: Se o colaborador for diferente do Admin, garante que o colaborador não esteja na lista de destino
    const currentEmployeeId = data.employeeId || data.employee_id;
    if (currentEmployeeId) {
      // Só remove se o ID do colaborador for diferente do ID do Administrador destinatário
      for (const id of Array.from(targetIds)) {
        if (id === currentEmployeeId && targetIds.size > 1) {
          targetIds.delete(id);
        }
      }
    }

    // Remove explicitamente a conta de colaborador do Renivaldo caso esteja na lista
    if (!targetIds.has('698dfcdd-7c91-4df5-aaee-eae9e67f15ae') || targetIds.size > 1) {
      targetIds.delete('81bb13fb-c0de-48c6-ad01-3019e9b48026');
    }

    // 3. Validação rigorosa: Garante que NENHUM usuário com cargo de 'employee' ou 'client' receba esta notificação
    const validatedAdminIds: string[] = [];
    for (const uid of targetIds) {
      try {
        const { data: userRow } = await supabaseAdmin
          .from('users')
          .select('id, role')
          .eq('id', uid)
          .maybeSingle();

        // Só envia se for confirmado como administrador ou gerente
        if (userRow && (userRow.role === 'admin' || userRow.role === 'manager')) {
          validatedAdminIds.push(uid);
        }
      } catch (err) {
        console.warn(`[Push Server] Falha ao validar permissão do usuário ${uid}:`, err);
      }
    }

    if (validatedAdminIds.length === 0) {
      // Fallback: se o adminId fornecido for o admin padrão, autoriza
      if (targetIds.has('698dfcdd-7c91-4df5-aaee-eae9e67f15ae')) {
        validatedAdminIds.push('698dfcdd-7c91-4df5-aaee-eae9e67f15ae');
      } else {
        console.log(`[Push Server] Nenhum administrador destinatário válido para o push.`);
        return false;
      }
    }

    // 4. Coletar tokens de colaboradores para garantir que nenhum dispositivo de colaborador receba o push do admin
    const employeeTokens = new Set<string>();
    try {
      const { data: employeeUsers } = await supabaseAdmin
        .from('users')
        .select('fcm_token, whatsapp_settings')
        .eq('role', 'employee');

      (employeeUsers || []).forEach(emp => {
        if (emp.fcm_token) employeeTokens.add(emp.fcm_token);
        if (Array.isArray(emp.whatsapp_settings?.devices)) {
          emp.whatsapp_settings.devices.forEach((d: any) => {
            if (d?.token) employeeTokens.add(d.token);
          });
        }
      });
    } catch (empErr) {
      console.warn('[Push Server] Aviso ao carregar tokens de colaboradores:', empErr);
    }

    // 5. Despacha o push unicamente para o(s) administrador(es) responsável(is), filtrando tokens de colaboradores
    for (const uid of validatedAdminIds) {
      // Busca tokens do admin
      const { data: adminUser } = await supabaseAdmin
        .from('users')
        .select('fcm_token, whatsapp_settings')
        .eq('id', uid)
        .maybeSingle();

      const adminTokens = new Set<string>();
      if (adminUser?.fcm_token) adminTokens.add(adminUser.fcm_token);
      if (Array.isArray(adminUser?.whatsapp_settings?.devices)) {
        adminUser.whatsapp_settings.devices.forEach((d: any) => {
          if (d?.token) adminTokens.add(d.token);
        });
      }

      // Remove tokens que estejam associados a qualquer colaborador
      const cleanTokens = Array.from(adminTokens).filter(tok => !employeeTokens.has(tok));

      if (cleanTokens.length === 0 && adminUser?.fcm_token) {
        cleanTokens.push(adminUser.fcm_token);
      }

      for (const tok of cleanTokens) {
        if (!fcmInitialized) break;
        try {
          await getMessaging().send({
            token: tok,
            notification: {
              title,
              body
            },
            data: {
              title,
              body,
              ...data,
              click_action: 'FCM_PLUGIN_ACTIVITY',
              url: data.url || '/routes',
              channelId: 'atendimentos_v3',
              channel_id: 'atendimentos_v3',
              sound: 'notificacao'
            },
            android: {
              priority: 'high',
              ttl: 2419200,
              directBootOk: true,
              notification: {
                channelId: 'atendimentos_v3',
                title,
                body,
                sound: 'notificacao',
                priority: 'max',
                visibility: 'public',
                defaultVibrateTimings: true,
                localOnly: false,
                notificationCount: 1,
                tag: data.tag || (data.visitId ? `visit_${data.visitId}` : undefined)
              }
            },
            apns: {
              headers: {
                'apns-priority': '10',
                'apns-push-type': 'alert'
              },
              payload: {
                aps: {
                  sound: 'notificacao.mp3',
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
          sent = true;
          console.log(`[Push Server] Push de finalização entregue com sucesso para o token do admin: ${tok.substring(0, 10)}...`);
        } catch (tokErr: any) {
          console.error(`[Push Server] Erro ao enviar push para token ${tok.substring(0, 10)}...:`, tokErr?.message || tokErr);
        }
      }
    }

    return sent;
  }

  // Helper específico para envio de push ao Colaborador
  async function sendPushToEmployee(employeeId: string, title: string, body: string, data: Record<string, string> = {}) {
    return sendPushToUser(employeeId, title, body, data);
  }

  // Sanitizador de registros: remove tokens de colaboradores que foram parar indevidamente no admin
  async function sanitizeDeviceRegistries() {
    try {
      const { data: employees } = await supabaseAdmin
        .from('users')
        .select('id, fcm_token, whatsapp_settings')
        .eq('role', 'employee');

      const employeeTokens = new Set<string>();
      (employees || []).forEach(emp => {
        if (emp.fcm_token) employeeTokens.add(emp.fcm_token);
        if (Array.isArray(emp.whatsapp_settings?.devices)) {
          emp.whatsapp_settings.devices.forEach((d: any) => {
            if (d?.token) employeeTokens.add(d.token);
          });
        }
      });

      const { data: admins } = await supabaseAdmin
        .from('users')
        .select('id, name, fcm_token, whatsapp_settings')
        .eq('role', 'admin');

      for (const adm of (admins || [])) {
        let currentDevices = Array.isArray(adm.whatsapp_settings?.devices) ? adm.whatsapp_settings.devices : [];
        const originalCount = currentDevices.length;
        let cleanedDevices = currentDevices.filter((d: any) => !employeeTokens.has(d?.token));

        // Se a lista de dispositivos do admin ficou vazia mas ele possui fcm_token válido e não pertence ao colaborador
        if (cleanedDevices.length === 0 && adm.fcm_token && !employeeTokens.has(adm.fcm_token)) {
          cleanedDevices.push({
            token: adm.fcm_token,
            deviceId: `dev_${adm.fcm_token.slice(0, 12)}`,
            platform: 'android',
            deviceName: 'Celular Administrador',
            lastSeen: new Date().toISOString()
          });
        }

        if (cleanedDevices.length !== originalCount || (currentDevices.length === 0 && cleanedDevices.length > 0)) {
          console.log(`[Push Sanitizer] Atualizando dispositivos do admin ${adm.name} (${adm.id}) para ${cleanedDevices.length} aparelho(s).`);
          await supabaseAdmin.from('users').update({
            whatsapp_settings: {
              ...adm.whatsapp_settings,
              devices: cleanedDevices
            }
          }).eq('id', adm.id);
        }
      }
    } catch (err: any) {
      console.warn('[Push Sanitizer] Aviso na rotina de sanitização:', err?.message || err);
    }
  }

  // Endpoint to register/update device in the multi-device registry (100% isolado por usuário)
  app.post("/api/notifications/register-device", async (req, res) => {
    try {
      const { userId, token, platform, deviceId, deviceName } = req.body || {};
      if (!userId || !token) {
        return res.status(400).json({ error: "Missing userId or token" });
      }

      // 1. Atualiza users.fcm_token como token principal do usuário
      await supabaseAdmin.from('users').update({ fcm_token: token }).eq('id', userId);

      // 2. Busca informações do usuário
      const { data: userRow } = await supabaseAdmin.from('users').select('id, role, whatsapp_settings').eq('id', userId).maybeSingle();

      const currentSettings = userRow?.whatsapp_settings || {};
      let devices: any[] = Array.isArray(currentSettings.devices) ? currentSettings.devices : [];

      const cleanDevId = deviceId || `dev_${token.slice(0, 16)}`;
      devices = devices.filter((d: any) => d && d.token && d.token !== token && d.deviceId !== cleanDevId);

      devices.unshift({
        token,
        deviceId: cleanDevId,
        platform: platform || 'android',
        deviceName: deviceName || 'Celular Android',
        lastSeen: new Date().toISOString()
      });

      devices = devices.slice(0, 10);

      // Atualiza EXCLUSIVAMENTE o usuário proprietário do aparelho (sem misturar com admin)
      await supabaseAdmin.from('users').update({
        whatsapp_settings: {
          ...currentSettings,
          devices
        }
      }).eq('id', userId);

      console.log(`[Push Server] Dispositivo registrado com sucesso e isolado para o usuário ${userId}.`);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[Push Server] Erro ao registrar dispositivo:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Processador central de finalização de visita / serviço
  async function handleVisitCompleted(visitRecord: any, isOneOffJob = false): Promise<boolean> {
    try {
      if (!visitRecord) return false;
      const visitId = String(visitRecord.id || visitRecord.client_id || Date.now());
      const dedupeKey = isOneOffJob ? `job_${visitId}` : `visit_${visitId}`;

      // Deduplicação inteligente de 10 segundos
      if (!shouldSendPush(dedupeKey)) {
        return false;
      }

      // 1. Identificar o colaborador (Garantindo que o nome do colaborador sempre apareça)
      let empName = (visitRecord.techName || visitRecord.employee_name || '').trim();
      let employeeAdminId: string | null = null;

      if (!empName && visitRecord.employee_id) {
        try {
          const { data: empUser } = await supabaseAdmin
            .from('users')
            .select('id, name, admin_id')
            .eq('id', visitRecord.employee_id)
            .maybeSingle();
          if (empUser?.name) empName = empUser.name.trim();
          if (empUser?.admin_id) employeeAdminId = empUser.admin_id;
        } catch (e) {
          console.warn('[Push Server] Erro ao buscar dados do colaborador:', e);
        }
      }

      if (!empName) {
        empName = 'Colaborador';
      }

      // 2. Identificar o cliente
      let clientName = isOneOffJob ? (visitRecord.client_name || 'Cliente') : 'Cliente';
      let clientAdminId: string | null = null;
      if (!isOneOffJob && visitRecord.client_id) {
        try {
          const { data: cliData } = await supabaseAdmin
            .from('clients')
            .select('id, name, admin_id')
            .eq('id', visitRecord.client_id)
            .maybeSingle();
          if (cliData?.name) clientName = cliData.name;
          if (cliData?.admin_id) clientAdminId = cliData.admin_id;
        } catch (e) {
          console.warn('[Push Server] Erro ao buscar dados do cliente:', e);
        }
      }

      // 3. Determinar o Administrador Responsável pelo Colaborador
      let targetAdminId = visitRecord.admin_id || employeeAdminId || clientAdminId;
      if (!targetAdminId) {
        targetAdminId = '698dfcdd-7c91-4df5-aaee-eae9e67f15ae';
      }

      // Mensagem clara contendo o nome do colaborador e o nome do cliente
      const title = isOneOffJob ? `🏊 Serviço Finalizado: ${clientName}` : `🏊 Visita Finalizada: ${clientName}`;
      const body = `O colaborador ${empName} finalizou o atendimento no cliente ${clientName}.`;

      console.log(`[Online Push Engine] Notificando administrador (${targetAdminId}): "${title}" - "${body}"`);

      const sent = await sendPushToAdmin(
        targetAdminId,
        title,
        body,
        {
          url: '/routes',
          channelId: 'atendimentos_v3',
          type: isOneOffJob ? 'job_completed' : 'visit_completed',
          visitId: String(visitId),
          clientId: String(visitRecord.client_id || ''),
          employeeId: String(visitRecord.employee_id || ''),
          tag: `visit_${visitId}`
        }
      );

      // REGRA ESTRITA DO USUÁRIO: Ao finalizar a visita, fechar o chat e DELETAR todas as mensagens trocadas do banco de dados
      if (visitRecord.client_id) {
        try {
          const { data: clientSessions } = await supabaseAdmin
            .from('chat_sessions')
            .select('id')
            .eq('client_id', visitRecord.client_id);

          if (clientSessions && clientSessions.length > 0) {
            const sIds = clientSessions.map((s: any) => s.id);
            console.log(`[Visit Completed] Finalizando atendimento e deletando mensagens de ${sIds.length} sessões do cliente ${visitRecord.client_id}...`);
            await supabaseAdmin.from('chat_messages').delete().in('session_id', sIds);
            await supabaseAdmin.from('chat_sessions').update({ 
              status: 'closed', 
              closed_at: new Date().toISOString() 
            }).in('id', sIds);
          }
        } catch (chatDelErr) {
          console.warn('[Visit Completed] Erro ao deletar mensagens de chat da visita:', chatDelErr);
        }
      }

      // Se falhar o envio, libera imediatamente a chave de deduplicação para permitir retentativas
      if (!sent) {
        recentPushCache.delete(dedupeKey);
      }

      return sent;
    } catch (err: any) {
      console.error('[Online Push Engine] Erro ao processar finalização de visita:', err);
      const fallbackKey = isOneOffJob ? `job_${visitRecord?.id || visitRecord?.client_id}` : `visit_${visitRecord?.id || visitRecord?.client_id}`;
      recentPushCache.delete(fallbackKey);
      return false;
    }
  }

  // Endpoint to immediately trigger attendance completion push notification (mantido como redundância segura)
  app.post("/api/notifications/notify-visit-completion", async (req, res) => {
    try {
      const { visitId, adminId, employeeId, clientId, clientName, techName, type } = req.body || {};
      const isJob = type === 'job';
      const visitRecord = {
        id: visitId || clientId || `${isJob ? 'job' : 'visit'}_${Date.now()}`,
        admin_id: adminId,
        employee_id: employeeId,
        client_id: clientId,
        client_name: clientName,
        techName: techName || null, // <-- ADICIONADO PARA PRESERVAR O NOME DO TÉCNICO
        status: isJob ? 'concluido' : 'finalizada'
      };

      const sent = await handleVisitCompleted(visitRecord, isJob);
      return res.json({ success: true, sent });
    } catch (err: any) {
      console.error('[Push Server] Erro no endpoint notify-visit-completion:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Webhook universal para eventos do banco de dados Supabase
  app.post(["/api/webhooks/database", "/api/webhooks/visit-completed"], async (req, res) => {
    try {
      const payload = req.body || {};
      const { type, table, record, old_record } = payload;
      const row = record || payload;
      const targetTable = table || (row.client_id !== undefined ? 'visits' : (row.price !== undefined ? 'oneoffjobs' : 'visits'));
      console.log(`[Server Database Webhook] Recebido evento: Tabela ${targetTable}, Tipo ${type || 'direct'}, Status ${row?.status}`);

      if (targetTable === 'visits' && row && (row.status === 'finalizada' || row.status === 'realizada')) {
        await handleVisitCompleted(row, false);
      } else if (targetTable === 'oneoffjobs' && row && row.status === 'concluido') {
        await handleVisitCompleted(row, true);
      }

      return res.json({ success: true, processed: true });
    } catch (e: any) {
      console.error('[Server Webhook Error]:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // Endpoint to send a test push notification to verify Capacitor setup
  app.all("/api/notifications/test-push", async (req, res) => {
    try {
      const { adminId, userId } = req.body || req.query || {};
      let targetId = adminId || userId;

      let user = null;
      if (targetId) {
        const { data: u } = await supabaseAdmin.from('users').select('id, fcm_token, name').eq('id', targetId).maybeSingle();
        user = u;
        if (!user) {
          return res.status(404).json({ success: false, error: `Usuário ${targetId} não foi encontrado.` });
        }
        if (!user.fcm_token) {
          return res.status(400).json({
            success: false,
            targetUserId: targetId,
            error: `O administrador "${user.name || targetId}" ainda não possui dispositivo/token FCM registrado no aplicativo.`
          });
        }
      } else {
        const { data: fallbackUsers } = await supabaseAdmin
          .from('users')
          .select('id, fcm_token, name')
          .eq('role', 'admin')
          .not('fcm_token', 'is', null)
          .limit(1);
        if (fallbackUsers && fallbackUsers.length > 0) {
          user = fallbackUsers[0];
          targetId = user.id;
        } else {
          return res.status(400).json({ success: false, error: 'Nenhum administrador com token FCM encontrado no sistema.' });
        }
      }

      const hasToken = !!user?.fcm_token;

      const sent = await sendPushToAdmin(
        targetId || '',
        '🏊 Teste de Notificação Push',
        'Seu dispositivo está conectado e configurado para receber alertas em tempo real das rotas e cobranças!',
        {
          url: '/routes',
          channelId: 'atendimentos_v2',
          type: 'test_push'
        }
      );

      return res.json({
        success: sent,
        sent,
        targetUserId: targetId,
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

  // Endpoint to manually trigger or test daily 7:00 AM billing reminders (supports both cron and manual calls)
  app.all(["/api/notifications/trigger-due-reminders", "/api/cron/billing-reminders"], async (req, res) => {
    try {
      const filterAdminId = req.query?.adminId || req.body?.adminId || req.query?.userId || req.body?.userId || null;
      const summary = await sendDailyBillingReminders(typeof filterAdminId === 'string' ? filterAdminId : null);
      return res.json({
        success: true,
        timestamp: new Date().toISOString(),
        filterAdminId: filterAdminId || 'all_admins_strictly_isolated',
        summary
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Endpoint autônomo de varredura (Sweep) para checar e notificar visitas recentes pendentes
  app.all(['/api/cron/sync-visits', '/api/notifications/sweep-recent-visits'], async (req, res) => {
    try {
      await runOnlineDatabaseWatcher();
      return res.json({ success: true, processed: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Background listener for Push Notifications (incoming client chat messages, finished visits, one-off jobs)
  supabaseAdmin.channel('push-notifications-db-events')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, async (payload) => {
       const newVisit = payload.new as any;
       if (!newVisit || (newVisit.status !== 'finalizada' && newVisit.status !== 'realizada')) return;
       console.log(`[Realtime DB Event] Visita finalizada/realizada detectada via WebSocket: ${newVisit.id}`);
       await handleVisitCompleted(newVisit, false);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'oneoffjobs' }, async (payload) => {
       const newJob = payload.new as any;
       if (!newJob || newJob.status !== 'concluido') return;
       console.log(`[Realtime DB Event] Serviço avulso concluído detectado via WebSocket: ${newJob.id}`);
       await handleVisitCompleted(newJob, true);
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
            await supabaseAdmin.from('chat_messages').delete().eq('session_id', session.id);
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
  cleanupExpiredAndClosedChatMessages();
  purgeOldChatMessages();
  scheduleMidnightPurge();
  refreshAstraContactsCache();

  /**
   * Rotina Diária das 07:00 da manhã (Horário de Brasília):
   * Envia notificações push para o administrador informando:
   * 1. Clientes com mensalidade vencendo HOJE para realizar a cobrança
   * 2. Clientes com mensalidades já ATRASADAS para realizar a cobrança
   */
  async function sendDailyBillingReminders(filterAdminId: string | null = null): Promise<{ dueTodayCount: number; overdueCount: number; errors: any[] }> {
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

      console.log(`[7AM Billing Reminder] Verificando vencimentos (Data: ${todayStr}, Filtro Admin: ${filterAdminId || 'TODOS'})...`);

      // Buscar todos os clientes ativos com data de vencimento e admin_id definido
      let query = supabaseAdmin
        .from('clients')
        .select('id, name, due_date, monthly_price, admin_id, employee_id, active')
        .not('due_date', 'is', null)
        .not('admin_id', 'is', null);

      if (filterAdminId) {
        query = query.eq('admin_id', filterAdminId);
      }

      const { data: clients, error: clientErr } = await query;

      if (clientErr) {
        console.error('[7AM Billing Reminder] Erro ao buscar clientes:', clientErr.message);
        summary.errors.push(clientErr.message);
        return summary;
      }

      if (!clients || clients.length === 0) {
        console.log('[7AM Billing Reminder] Nenhum cliente encontrado.');
        return summary;
      }

      for (const client of clients) {
        if (!client.due_date) continue;
        if (client.active === false) continue;
        if (!client.admin_id) continue;

        // Se um filtro de admin específico foi solicitado, ignora clientes de outros admins
        if (filterAdminId && client.admin_id !== filterAdminId) continue;

        const targetAdminId = client.admin_id;
        const clientName = client.name || 'Cliente';
        const clientDueDate = client.due_date;

        const isDueToday = clientDueDate === todayStr;
        const isOverdue = clientDueDate < todayStr;

        if (isDueToday) {
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
        } else if (isOverdue) {
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

      console.log(`[7AM Billing Reminder] Concluído exclusivamente para administradores: ${summary.dueTodayCount} vencendo hoje, ${summary.overdueCount} atrasados.`);
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

  // Conjunto de chaves de atendimentos já notificados para prevenir notificações repetidas
  const notifiedVisitKeys = new Set<string>();

  /**
   * Inicialização e carregamento histórico de atendimentos finalizados.
   * Evita disparar notificações em massa para visitas antigas já salvas no banco,
   * preservando visitas dos últimos 10 minutos caso o servidor reinicie.
   */
  async function primeHistoricalVisits() {
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: existingVisits } = await supabaseAdmin
        .from('visits')
        .select('id, date, created_at')
        .in('status', ['finalizada', 'realizada'])
        .lt('created_at', tenMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(100);
      (existingVisits || []).forEach(v => notifiedVisitKeys.add(`visit_${v.id}`));

      const { data: existingJobs } = await supabaseAdmin
        .from('oneoffjobs')
        .select('id, updated_at')
        .eq('status', 'concluido')
        .lt('updated_at', tenMinutesAgo)
        .order('updated_at', { ascending: false })
        .limit(100);
      (existingJobs || []).forEach(j => notifiedVisitKeys.add(`job_${j.id}`));

      console.log(`[Online Push Engine] Inicializado com ${notifiedVisitKeys.size} atendimentos históricos registrados.`);
    } catch (e: any) {
      console.warn('[Online Push Engine] Aviso ao carregar histórico:', e?.message || e);
    }
  }

  /**
   * Monitor online autônomo do banco de dados:
   * Consulta periodicamente novas visitas com status='finalizada' e serviços avulsos status='concluido'.
   * Se o banco de dados receber a visita como concluída, o servidor dispara a notificação para o admin
   * responsável pelo colaborador de forma 100% autônoma e independente do celular do colaborador.
   */
  let isWatcherRunning = false;
  async function runOnlineDatabaseWatcher() {
    if (isWatcherRunning) return;
    isWatcherRunning = true;
    try {
      // 1. Visitas normais finalizadas nos últimos 60 minutos
      // Busca tanto por created_at (visitas novas) quanto por date (visitas pré-agendadas atualizadas para finalizada)
      const sinceDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentVisits, error: vErr } = await supabaseAdmin
        .from('visits')
        .select('id, admin_id, client_id, employee_id, status, created_at, date')
        .in('status', ['finalizada', 'realizada'])
        .or(`created_at.gte.${sinceDate},date.gte.${sinceDate}`)
        .order('date', { ascending: false })
        .limit(30);

      if (!vErr && recentVisits && recentVisits.length > 0) {
        for (const v of recentVisits) {
          const dedupeKey = `visit_${v.id}`;
          if (!notifiedVisitKeys.has(dedupeKey)) {
            console.log(`[Online Database Watcher] Nova visita finalizada detectada no banco: ${v.id}. Disparando notificação para o admin responsável...`);
            notifiedVisitKeys.add(dedupeKey);
            await handleVisitCompleted(v, false);
          }
        }
      }

      // 2. Serviços avulsos concluídos nos últimos 60 minutos
      const { data: recentJobs, error: jErr } = await supabaseAdmin
        .from('oneoffjobs')
        .select('id, admin_id, employee_id, status, client_name, updated_at')
        .eq('status', 'concluido')
        .gte('updated_at', sinceDate)
        .order('updated_at', { ascending: false })
        .limit(30);

      if (!jErr && recentJobs && recentJobs.length > 0) {
        for (const j of recentJobs) {
          const dedupeKey = `job_${j.id}`;
          if (!notifiedVisitKeys.has(dedupeKey)) {
            console.log(`[Online Database Watcher] Novo serviço avulso concluído detectado no banco: ${j.id}. Disparando notificação para o admin responsável...`);
            notifiedVisitKeys.add(dedupeKey);
            await handleVisitCompleted(j, true);
          }
        }
      }
    } catch (err: any) {
      console.error('[Online Database Watcher] Erro no ciclo de monitoramento:', err?.message || err);
    } finally {
      isWatcherRunning = false;
    }
  }

  // Inicialização dos serviços em segundo plano
  primeHistoricalVisits();
  sanitizeDeviceRegistries();
  schedule7AMBillingReminders();
  setInterval(runOnlineDatabaseWatcher, 5000);

  // Vite middleware for development (must be mounted AFTER all API routes)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
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

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Auto-registro do Webhook no AstraCalls
    setTimeout(async () => {
      try {
        const { data: adminUsers } = await supabaseAdmin.from('users').select('whatsapp_settings').not('whatsapp_settings', 'is', null);
        const validAdmin = adminUsers?.find(u => u.whatsapp_settings?.useAstracalls || u.whatsapp_settings?.astracallsUrl);
        const wa = validAdmin?.whatsapp_settings;
        if (wa?.astracallsUrl || wa?.useAstracalls) {
          const astracallsUrl = (wa.astracallsUrl || 'https://calls.rspiscinas.app.br').trim().replace(/\/$/, '');
          const astracallsApiKey = wa.astracallsApiKey || 'rs_piscinas_segredo_2026';
          const sessionId = wa.astracallsSessionId || '8090cca3add0b8eb3e41efb9eec363e4';
          const webhookUrl = `${(process.env.PUBLIC_URL || 'https://www.rspiscinas.app.br')}/api/webhook/astracalls`;

          await fetch(`${astracallsUrl}/api/sessions/${sessionId}/webhook`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': astracallsApiKey
            },
            body: JSON.stringify({ url: webhookUrl, webhook: webhookUrl })
          }).catch(() => null);
        }
      } catch (err) {}
    }, 3000);
  });

  server.on('error', (err: any) => {
    console.error(`[Server Error]:`, err);
  });
}

startServer();
