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

import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
let fcmInitialized = false;
try {
  // Try to initialize Firebase Admin if service account exists
  if (fs.existsSync('./service-account.json')) {
    const serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));
    initializeApp({
      credential: cert(serviceAccount)
    });
    fcmInitialized = true;
    console.log("Firebase Admin Initialized for Push Notifications");
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({
      credential: cert(serviceAccount)
    });
    fcmInitialized = true;
    console.log("Firebase Admin Initialized from ENV");
  } else {
    console.log("Firebase Admin NOT initialized. Missing service-account.json");
  }
} catch (e) {
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
const processedMessageClientIds = new Map<string, { timestamp: number; externalId: string; messageId?: string }>();

// Clean up stale idempotency records periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of processedMessageClientIds.entries()) {
    if (now - val.timestamp > 120000) {
      processedMessageClientIds.delete(key);
    }
  }
}, 60000);

  app.post("/api/chat/close", async (req, res) => {
    try {
      const { clientId } = req.body;
      if (!clientId) return res.status(400).json({ error: "Missing clientId" });
      await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('client_id', clientId).eq('status', 'open');
      return res.json({ success: true });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/chat/send", async (req, res) => {
    try {
      let { text, clientPhone, waSettings, messageId, sessionId, senderName, message_client_id } = req.body;
      if (!text || !clientPhone) return res.status(400).json({ error: "Missing fields" });

      const cleanDigits = String(clientPhone).replace(/\D/g, '');
      const targetNumber = cleanDigits.startsWith('55') ? cleanDigits : `55${cleanDigits}`;

      // Gerar ou sanitizar message_client_id para controle estrito de idempotência
      const clientMsgId = String(message_client_id || req.headers['x-idempotency-key'] || (messageId ? `mid_${messageId}` : `txt_${targetNumber}_${text.trim().substring(0, 30)}`));
      const now = Date.now();

      // 1. Verificação de Idempotência em Memória (< 30 segundos)
      if (processedMessageClientIds.has(clientMsgId)) {
        const cached = processedMessageClientIds.get(clientMsgId)!;
        if (now - cached.timestamp < 30000) {
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

      // 2. Verificação de Idempotência no Banco de Dados (< 30 segundos)
      const thirtySecondsAgo = new Date(now - 30000).toISOString();
      try {
        const { data: recentMatching } = await supabaseAdmin
          .from('chat_messages')
          .select('id, media_url, created_at')
          .gte('created_at', thirtySecondsAgo)
          .eq('sender_type', 'tech')
          .ilike('media_url', `%"message_client_id":"${clientMsgId}"%`)
          .limit(1);

        if (recentMatching && recentMatching.length > 0) {
          let existingMeta: any = {};
          try { existingMeta = JSON.parse(recentMatching[0].media_url); } catch(e) {}
          
          const isSameUnsentRecord = messageId && recentMatching[0].id === messageId && !existingMeta.external_id && existingMeta.status !== 'sent';
          if (!isSameUnsentRecord) {
            console.log(`[Idempotência] Ignorando envio duplicado (Banco de Dados): ${clientMsgId}`);
            processedMessageClientIds.set(clientMsgId, {
              timestamp: now,
              externalId: existingMeta.external_id || '',
              messageId: recentMatching[0].id
            });
            return res.json({
              success: true,
              duplicated: true,
              externalId: existingMeta.external_id || undefined,
              messageId: recentMatching[0].id,
              message_client_id: clientMsgId
            });
          }
        }
      } catch (dbCheckErr) {
        console.warn("[Idempotência] Erro ao consultar duplicidade no banco:", dbCheckErr);
      }

      // Registra lock provisório para evitar concorrência simultânea (cliques duplos em < 100ms)
      processedMessageClientIds.set(clientMsgId, {
        timestamp: now,
        externalId: '',
        messageId: messageId || ''
      });

      // Se waSettings não estiver completo, buscar configurações do admin no banco
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

      let externalId = '';
      let sendSuccess = false;
      let lastSendError = '';

      // Send via Evolution API (Single attempt to exact number, NO textMessage duplicate field)
      if (waSettings?.useEvolutionApi && waSettings?.evolutionApiUrl && waSettings?.evolutionApiKey && waSettings?.evolutionInstanceName) {
        let baseUrl = waSettings.evolutionApiUrl.trim().replace(/\/$/, '');
        if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;

        try {
          const response = await fetch(`${baseUrl}/message/sendText/${waSettings.evolutionInstanceName}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': waSettings.evolutionApiKey
            },
            body: JSON.stringify({
              number: targetNumber,
              text: text,
              options: { delay: 500, presence: 'composing', linkPreview: false }
            })
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
      } else if (waSettings?.useMetaApi) {
        if (!waSettings.metaToken) throw new Error("Token Meta obrigatório");
        
        let baseUrl = (waSettings.metaServerUrl || 'https://graph.facebook.com/v19.0').trim().replace(/\/$/, '');
        if (!baseUrl.startsWith('http')) {
          baseUrl = 'https://' + baseUrl;
        }
        const isWame = baseUrl && !baseUrl.includes('graph.facebook.com');
        
        let url, headers, body;
        if (isWame) {
           url = `${baseUrl}/${waSettings.metaToken}/message/text`;
           headers = { 'Content-Type': 'application/json' };
           body = JSON.stringify({
             to: targetNumber,
             text: text,
             linkPreview: false,
             preview_url: false,
             previewUrl: false,
             options: { linkPreview: false }
           });
        } else {
           const phoneId = waSettings.metaPhoneNumberId ? `/${waSettings.metaPhoneNumberId}` : '';
           url = `${baseUrl}${phoneId}/messages`;
           headers = {
              'Authorization': `Bearer ${waSettings.metaToken}`,
              'Content-Type': 'application/json'
           };
           body = JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: targetNumber,
              type: "text",
              text: { preview_url: false, body: text }
           });
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
        sent_at: sendSuccess ? new Date().toISOString() : undefined,
        error: sendSuccess ? undefined : (lastSendError || 'Falha no envio')
      };

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

          await supabaseAdmin
            .from('chat_messages')
            .update({
              media_url: JSON.stringify({
                ...meta,
                ...mediaPayload
              })
            })
            .eq('id', messageId);
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
              sender_name: senderName || 'Colaborador',
              content: text,
              media_url: JSON.stringify(mediaPayload)
            })
            .select()
            .single();
          if (created) messageId = created.id;
        } catch (dbErr) {
          console.error("[/api/chat/send] Erro ao inserir mensagem no banco:", dbErr);
        }
      } else if (req.body.clientId) {
        try {
          const { data: existingSessions } = await supabaseAdmin
            .from('chat_sessions')
            .select('id')
            .eq('client_id', req.body.clientId)
            .order('created_at', { ascending: false })
            .limit(1);

          let sessId = existingSessions?.[0]?.id;
          if (!sessId) {
            const { data: clientRow } = await supabaseAdmin.from('clients').select('admin_id, name').eq('id', req.body.clientId).single();
            const { data: createdSess } = await supabaseAdmin.from('chat_sessions').insert({
              client_id: req.body.clientId,
              admin_id: clientRow?.admin_id || null,
              employee_id: clientRow?.admin_id || null,
              client_name: clientRow?.name || null,
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
                sender_name: senderName || 'Colaborador',
                content: text,
                media_url: JSON.stringify(mediaPayload)
              })
              .select()
              .single();
            if (created) messageId = created.id;
          }
        } catch (dbErr) {
          console.error("[/api/chat/send] Erro ao associar sessão/mensagem de relatório no banco:", dbErr);
        }
      }

      // Atualiza o cache com a resposta definitiva
      processedMessageClientIds.set(clientMsgId, {
        timestamp: Date.now(),
        externalId: externalId || '',
        messageId: messageId || ''
      });

      res.json({
        success: sendSuccess,
        externalId: externalId || undefined,
        messageId,
        message_client_id: clientMsgId,
        error: sendSuccess ? undefined : lastSendError
      });
    } catch(e: any) {
      console.error("[/api/chat/send] Erro:", e);
      res.status(500).json({ error: e.message });
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
            if (waSettings?.useMetaApi && waSettings?.metaToken) {
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

  // Helper to extract message status updates across Meta, WAME and Evolution formats
  function extractStatusUpdates(body: any): Array<{ id: string; status: 'sent' | 'delivered' | 'read' }> {
    const results: Array<{ id: string; status: 'sent' | 'delivered' | 'read' }> = [];
    if (!body) return results;

    const mapStatus = (raw: any): 'sent' | 'delivered' | 'read' | null => {
      if (raw === undefined || raw === null) return null;
      const str = String(raw).toUpperCase().trim();
      if (str === '4' || str === '5' || str === 'READ' || str === 'PLAYED' || str === 'READ_RECEIPT' || str === 'VIEWED') {
        return 'read';
      }
      if (str === '3' || str === 'DELIVERY_ACK' || str === 'DELIVERED' || str === 'RECEIVED') {
        return 'delivered';
      }
      if (str === '2' || str === 'SERVER_ACK' || str === 'SENT') {
        return 'sent';
      }
      return null;
    };

    const isReceiptEvent = String(body?.event || '').toLowerCase().includes('receipt');

    const inspectItem = (item: any) => {
      if (!item || typeof item !== 'object') return;
      const id = item?.key?.id || item?.id || item?.keyId || item?.messageId || item?.update?.key?.id || item?.data?.key?.id;
      if (!id) return;

      if (isReceiptEvent || item?.receipt?.readTimestamp || item?.update?.readTimestamp) {
        results.push({ id: String(id), status: 'read' });
        return;
      }

      const rawStatus = item?.update?.status ?? item?.status ?? item?.ack ?? item?.update?.ack ?? item?.statusLabel ?? item?.update?.statusLabel ?? item?.receipt?.status;
      const mapped = mapStatus(rawStatus);
      if (mapped) {
        results.push({ id: String(id), status: mapped });
      }
    };

    if (body.entry && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        if (entry.changes && Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            const val = change.value;
            if (val?.statuses && Array.isArray(val.statuses)) {
              for (const st of val.statuses) {
                const mapped = mapStatus(st.status);
                if (st.id && mapped) {
                  results.push({ id: String(st.id), status: mapped });
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
          results.push({ id: String(st.id), status: mapped });
        }
      }
    }

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
    }

    return results;
  }

  async function processStatusUpdates(body: any): Promise<boolean> {
    const updates = extractStatusUpdates(body);
    if (updates.length === 0) return false;

    for (const update of updates) {
      const { id: externalId, status: newStatus } = update;
      if (!externalId) continue;

      let { data: foundMsgs } = await supabaseAdmin
        .from('chat_messages')
        .select('id, media_url, sender_type')
        .eq('sender_type', 'tech')
        .ilike('media_url', `%${externalId}%`);

      if (!foundMsgs || foundMsgs.length === 0) {
        if (externalId.length > 8) {
          const shortId = externalId.slice(-12);
          const { data: fallback } = await supabaseAdmin
            .from('chat_messages')
            .select('id, media_url, sender_type')
            .eq('sender_type', 'tech')
            .ilike('media_url', `%${shortId}%`);
          foundMsgs = fallback;
        }
      }

      if (foundMsgs && foundMsgs.length > 0) {
        for (const fm of foundMsgs) {
          let existing: any = {};
          try {
            existing = JSON.parse(fm.media_url);
          } catch(e) {}

          if (existing.status === 'read' && newStatus !== 'read') {
            continue;
          }

          await supabaseAdmin
            .from('chat_messages')
            .update({
              media_url: JSON.stringify({
                ...existing,
                status: newStatus,
                external_id: externalId,
                status_updated_at: new Date().toISOString()
              })
            })
            .eq('id', fm.id);
        }
      }
    }
    return true;
  }

  // Webhook for WAME / Meta API
  const recentProcessedMsgIds = new Map<string, number>();

  function isDuplicateIncomingMsg(uniqueKey: string): boolean {
    const now = Date.now();
    // Limpar chaves antigas (> 30s)
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

  app.get("/api/webhook/wame", (req, res) => {
    const mode = req.query["hub.mode"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && challenge) {
      return res.status(200).send(challenge);
    }
    return res.status(200).send("OK");
  });

  app.post("/api/webhook/wame", async (req, res) => {
    try {
      console.log("Wame/Meta Webhook Received:", JSON.stringify(req.body));
      const body = req.body;

      // 1. Process status updates (delivered / read / sent)
      const hadStatus = await processStatusUpdates(body);
      if (hadStatus) {
        return res.status(200).send("EVENT_RECEIVED");
      }

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
      
      // Native WAME format: { event: "messages.upsert", data: { key: { remoteJid, id }, message: { conversation } } }
      const nativeItem = Array.isArray(body.data) ? body.data[0] : (body.data || body);
      if (nativeItem && (nativeItem.key || nativeItem.message)) {
        if (nativeItem.key?.fromMe) {
          return res.status(200).send("EVENT_RECEIVED");
        }
        if (nativeItem.key?.remoteJid) {
          phone = String(nativeItem.key.remoteJid).split('@')[0];
        }
        if (nativeItem.key?.id) {
          externalMsgId = String(nativeItem.key.id);
        }
        if (nativeItem.message?.conversation) {
          content = nativeItem.message.conversation;
        } else if (nativeItem.message?.extendedTextMessage?.text) {
          content = nativeItem.message.extendedTextMessage.text;
        } else if (nativeItem.message?.audioMessage) {
          content = "🎵 Mensagem de Áudio";
        } else if (nativeItem.message?.imageMessage) {
          content = "📷 Imagem";
        }
      }

      // Meta Cloud API format
      if (!phone && (body.object === "whatsapp_business_account" || body.object === "wame") && body.entry && body.entry[0]?.changes) {
         const value = body.entry[0].changes[0].value;
         if (value.messages && value.messages.length > 0) {
            const msg = value.messages[0];
            if (msg.from_me) {
              return res.status(200).send("EVENT_RECEIVED");
            }
            phone = msg.from;
            externalMsgId = msg.id || "";
            if (msg.type === "text" && msg.text) {
               content = msg.text.body;
            } else if (msg.type === "audio") {
               content = "🎵 Mensagem de Áudio";
            } else if (msg.type === "image") {
               content = "📷 Imagem";
            }
         }
      } else if (!phone && body.phone && body.message) {
          phone = body.phone;
          content = body.message;
      } else if (!phone && body.contact && body.message) {
          phone = body.contact;
          content = body.message;
      } else if (!phone && body.from && body.body) {
          phone = body.from;
          content = body.body;
      }
      
      if (!phone || !content) return res.status(200).send("EVENT_RECEIVED");
      phone = phone.replace(/\D/g, '');

      // Deduplicação de mensagens recebidas
      const dedupKey = externalMsgId ? `msg_${externalMsgId}` : `txt_${phone}_${content}`;
      if (isDuplicateIncomingMsg(dedupKey)) {
        console.log("Ignorando mensagem duplicada recebida no webhook:", dedupKey);
        return res.status(200).send("EVENT_RECEIVED");
      }
      
      const { data: clients } = await supabaseAdmin.from('clients').select('id, phone, local_phone, admin_id, employee_id');
      const matchedClient = clients?.find(c => {
         const cp = (c.phone || '').replace(/\D/g, '');
         const lp = (c.local_phone || '').replace(/\D/g, '');
         if (!cp && !lp) return false;
         const getCore = (num: string) => num.length >= 8 ? num.slice(-8) : num;
         const webhookCore = getCore(phone);
         let matchPhone = false;
         if (cp.length > 5) matchPhone = cp.includes(phone) || phone.includes(cp) || getCore(cp) === webhookCore;
         let matchLocal = false;
         if (lp.length > 5) matchLocal = lp.includes(phone) || phone.includes(lp) || getCore(lp) === webhookCore;
         return matchPhone || matchLocal;
      });
      
      if (!matchedClient) return res.status(200).send("EVENT_RECEIVED");

      const { data: sessions } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('client_id', matchedClient.id)
        .order('created_at', { ascending: false });
        
      let activeSession = sessions && sessions.length > 0 ? sessions[0] : null;
      const now = new Date().getTime();

      if (activeSession) {
        const createdTime = new Date(activeSession.created_at).getTime();
        // Se a sessão expirou (> 30 min), fecha a anterior e cria uma nova
        if (now - createdTime > 30 * 60 * 1000 || activeSession.status === 'closed') {
          if (activeSession.status !== 'closed') {
            await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
          }
          const { data: newSess } = await supabaseAdmin
            .from('chat_sessions')
            .insert({
              client_id: matchedClient.id,
              admin_id: matchedClient.admin_id,
              status: 'open',
              created_at: new Date().toISOString()
            })
            .select()
            .single();
          if (newSess) activeSession = newSess;
        }
      } else {
        // Se não existia nenhuma sessão para o cliente, cria uma sessão imediatamente
        const { data: newSess } = await supabaseAdmin
          .from('chat_sessions')
          .insert({
            client_id: matchedClient.id,
            admin_id: matchedClient.admin_id,
            status: 'open',
            created_at: new Date().toISOString()
          })
          .select()
          .single();
        if (newSess) activeSession = newSess;
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
      
      return res.status(200).send("EVENT_RECEIVED");
    } catch(e) {
      console.error("Webhook Error:", e);
      return res.status(500).send("Error");
    }
  });

  app.post("/api/webhook/evolution", async (req, res) => {
    try {
      console.log("Evolution Webhook Received:", JSON.stringify(req.body));
      const body = req.body;

      // 1. Process status updates (delivered / read / sent)
      const hadStatus = await processStatusUpdates(body);
      if (hadStatus) {
        return res.status(200).send("OK");
      }

      const msgData = body.data || body;
      
      if (!msgData || !msgData.key || !msgData.message) return res.status(200).send("OK");
      if (msgData.key.fromMe) return res.status(200).send("OK");

      let remoteJid = msgData.key.remoteJid || "";
      if (!remoteJid) return res.status(200).send("OK");
      
      let phone = remoteJid.split('@')[0].replace('55', '');
      let externalMsgId = msgData.key.id || "";
      
      let content = "";
      if (msgData.message.conversation) content = msgData.message.conversation;
      else if (msgData.message.extendedTextMessage) content = msgData.message.extendedTextMessage.text;
      
      let mediaUrl = "";
      if (msgData.message.audioMessage) content = "🎵 Mensagem de Áudio";
      else if (msgData.message.imageMessage) content = "📷 Imagem";

      if (!content && !mediaUrl) return res.status(200).send("OK");

      // Deduplicação
      const dedupKey = externalMsgId ? `evo_${externalMsgId}` : `evo_txt_${phone}_${content}`;
      if (isDuplicateIncomingMsg(dedupKey)) {
        console.log("Ignorando mensagem duplicada Evolution:", dedupKey);
        return res.status(200).send("OK");
      }

      const { data: clients } = await supabaseAdmin.from('clients').select('id, phone, local_phone, admin_id, employee_id');
      if (!clients) return res.status(200).send("OK");
      
      const matchedClient = clients.find(c => {
         const cp = (c.phone || '').replace(/\D/g, '');
         const lp = (c.local_phone || '').replace(/\D/g, '');
         if (!cp && !lp) return false;
         
         const getCore = (num) => num.length >= 8 ? num.slice(-8) : num;
         const webhookCore = getCore(phone);
         
         let matchPhone = false;
         if (cp.length > 5) {
            matchPhone = cp.includes(phone) || phone.includes(cp) || getCore(cp) === webhookCore;
         }
         
         let matchLocal = false;
         if (lp.length > 5) {
            matchLocal = lp.includes(phone) || phone.includes(lp) || getCore(lp) === webhookCore;
         }
         
         return matchPhone || matchLocal;
      });
      
      if (!matchedClient) return res.status(200).send("OK");

      const { data: sessions } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('client_id', matchedClient.id)
        .order('created_at', { ascending: false });
        
      let activeSession = sessions && sessions.length > 0 ? sessions[0] : null;
      const now = new Date().getTime();

      if (activeSession) {
        const createdTime = new Date(activeSession.created_at).getTime();
        // Se a sessão expirou (> 30 min), fecha a anterior e cria uma nova
        if (now - createdTime > 30 * 60 * 1000 || activeSession.status === 'closed') {
          if (activeSession.status !== 'closed') {
            await supabaseAdmin.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', activeSession.id);
          }
          const { data: newSess } = await supabaseAdmin
            .from('chat_sessions')
            .insert({
              client_id: matchedClient.id,
              admin_id: matchedClient.admin_id,
              status: 'open',
              created_at: new Date().toISOString()
            })
            .select()
            .single();
          if (newSess) activeSession = newSess;
        }
      } else {
        // Se não existia nenhuma sessão para o cliente, cria uma sessão imediatamente
        const { data: newSess } = await supabaseAdmin
          .from('chat_sessions')
          .insert({
            client_id: matchedClient.id,
            admin_id: matchedClient.admin_id,
            status: 'open',
            created_at: new Date().toISOString()
          })
          .select()
          .single();
        if (newSess) activeSession = newSess;
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
      
      return res.status(200).send("OK");
    } catch(e) {
      console.error("Webhook Error:", e);
      return res.status(500).send("Error");
    }
  });

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

  app.get('/api/test-env', (req, res) => {
    res.json({
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        hasAnonKey: !!process.env.VITE_SUPABASE_ANON_KEY
    });
  });

  // Helper to send push notification to all devices registered for an admin
  async function sendPushToAdmin(adminId: string, title: string, body: string, data: Record<string, string> = {}) {
    try {
      if (!adminId) return false;
      const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id, name, fcm_token')
        .eq('id', adminId);

      let tokens = (users || []).map(u => u.fcm_token).filter(Boolean);

      // Fallback: se o adminId não possuir tokens, buscar administradores do sistema com token ativo
      if (tokens.length === 0) {
        const { data: fallbackAdmins } = await supabaseAdmin
          .from('users')
          .select('id, name, fcm_token')
          .eq('role', 'admin')
          .not('fcm_token', 'is', null);
        if (fallbackAdmins && fallbackAdmins.length > 0) {
          tokens = fallbackAdmins.map(u => u.fcm_token).filter(Boolean);
        }
      }

      if (tokens.length === 0) {
        console.log(`[Push Server] Nenhum token FCM registrado no momento para admin ${adminId}.`);
        return false;
      }

      console.log(`[Push Server] Disparando push notification para ${tokens.length} dispositivo(s): "${title}"`);

      let sentCount = 0;
      for (const token of tokens) {
        if (fcmInitialized) {
          try {
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
                url: data.url || '/routes',
                channelId: data.channelId || 'atendimentos_v2',
                channel_id: data.channelId || 'atendimentos_v2',
                sound: 'notificacao'
              },
              android: {
                priority: 'high',
                ttl: 2419200,
                directBootOk: true,
                notification: {
                  channelId: data.channelId || 'atendimentos_v2',
                  title,
                  body,
                  sound: 'notificacao',
                  priority: 'max',
                  visibility: 'public',
                  defaultSound: false,
                  defaultVibrateTimings: true,
                  localOnly: false,
                  notificationCount: 1
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

  // Cache para evitar notificações duplicadas (chave -> timestamp)
  const recentPushCache = new Map<string, number>();
  function shouldSendPush(key: string): boolean {
    const now = Date.now();
    // Limpa chaves antigas com mais de 2 minutos
    for (const [k, time] of recentPushCache.entries()) {
      if (now - time > 120000) recentPushCache.delete(k);
    }
    if (recentPushCache.has(key) && (now - recentPushCache.get(key)!) < 15000) {
      console.log(`[Push Server] Notificação suprimida por deduplicação recente: ${key}`);
      return false;
    }
    recentPushCache.set(key, now);
    return true;
  }

  // Endpoint to immediately trigger attendance completion push notification
  app.post("/api/notifications/notify-visit-completion", async (req, res) => {
    try {
      const { adminId, employeeId, clientId, clientName, techName, type, visitId } = req.body;

      const dedupeKey = `push_${type || 'visit'}_${clientId || ''}_${visitId || ''}`;
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
        return res.status(400).json({ error: "Missing adminId and clientId" });
      }

      const isJob = type === 'job';
      const title = isJob ? '🏊 Serviço Avulso Finalizado' : '🏊 Visita Finalizada!';
      const body = `O colaborador ${empName} finalizou o atendimento no cliente ${resolvedClientName}.`;

      const sent = await sendPushToAdmin(targetAdminId, title, body, {
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
      const { adminId } = req.body;
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

  // Background listener for Database changes (Visits, OneOffJobs, Chat Messages)
  supabaseAdmin.channel('push-notifications-db-events')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, async (payload) => {
       const newVisit = payload.new as any;
       if (!newVisit || newVisit.status !== 'finalizada') return;

       const dedupeKey = `push_visit_${newVisit.client_id}_${newVisit.id}`;
       if (!shouldSendPush(dedupeKey)) return;

       if (newVisit.admin_id && newVisit.admin_id !== newVisit.employee_id) {
           const { data: empData } = await supabaseAdmin.from('users').select('name').eq('id', newVisit.employee_id).single();
           const { data: cliData } = await supabaseAdmin.from('clients').select('name').eq('id', newVisit.client_id).single();

           const empName = empData?.name || 'Colaborador';
           const cliName = cliData?.name || 'Cliente';

           await sendPushToAdmin(
             newVisit.admin_id,
             '🏊 Visita Finalizada!',
             `O colaborador ${empName} finalizou o atendimento no cliente ${cliName}.`,
             {
               url: '/routes',
               channelId: 'atendimentos_v2',
               type: 'visit_completed',
               visitId: String(newVisit.id || ''),
               clientId: String(newVisit.client_id || '')
             }
           );
       }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'oneoffjobs' }, async (payload) => {
       const newJob = payload.new as any;
       if (!newJob || newJob.status !== 'concluido') return;

       const dedupeKey = `push_job_${newJob.id}`;
       if (!shouldSendPush(dedupeKey)) return;

       if (newJob.admin_id && newJob.admin_id !== newJob.employee_id) {
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
               jobId: String(newJob.id || '')
             }
           );
       }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
       const newMsg = payload.new as any;
       if (newMsg.sender_type === 'client') {
          const { data: session } = await supabaseAdmin
            .from('chat_sessions')
            .select('id, admin_id, client_id, client_name, status, created_at, closed_at')
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

          if (session && session.admin_id) {
             await sendPushToAdmin(
               session.admin_id,
               `💬 ${session.client_name || 'Cliente'}`,
               newMsg.content || 'Mensagem de texto recebida',
               {
                 url: '/messages',
                 channelId: 'chat_messages',
                 type: 'chat_message',
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

  // Endpoint manual caso o admin deseje forçar a limpeza ou chamar via cron webhook
  app.post("/api/chat/purge-midnight", async (req, res) => {
    try {
      await purgeOldChatMessages();
      return res.json({ success: true, message: "Mensagens anteriores à meia-noite de hoje foram deletadas." });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
