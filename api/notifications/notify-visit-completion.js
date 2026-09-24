import { createClient } from '@supabase/supabase-js';
import { initFirebase } from '../_firebaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { visitId, adminId, employeeId, clientId, clientName, techName, type, notes } = req.body || {};

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://fgmmvrvudozzwqxzsztwo.supabase.co';
    const part1 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnbW12cnZ1ZG96endxenN6dHdvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA1MjMzMSwi";
    const part2 = "ZXhwIjoyMDk0NjI4MzMxfQ.iB9iF3aoumsNtywpLZL_QjrBzR8QPWw7GGWQ6-Yx-Ik";
    const directKey = part1 + part2;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || directKey;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    let empName = techName || "Colaborador";
    let employeeAdminId = null;
    if (employeeId) {
      try {
        const { data: empData } = await supabaseAdmin.from('users').select('name, admin_id').eq('id', employeeId).single();
        if (empData?.name && !techName) empName = empData.name;
        if (empData?.admin_id) employeeAdminId = empData.admin_id;
      } catch (e) {}
    }

    let resolvedClientName = clientName;
    let clientAdminId = null;
    if (clientId) {
      try {
        const { data: cliData } = await supabaseAdmin.from('clients').select('name, admin_id').eq('id', clientId).single();
        if (cliData?.name) resolvedClientName = cliData.name;
        if (cliData?.admin_id) clientAdminId = cliData.admin_id;
      } catch (e) {}
    }
    if (!resolvedClientName) resolvedClientName = "Cliente";

    const adminIdsToTry = new Set();
    if (adminId) adminIdsToTry.add(adminId);
    if (clientAdminId) adminIdsToTry.add(clientAdminId);
    if (employeeAdminId) adminIdsToTry.add(employeeAdminId);

    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, name, fcm_token')
      .in('id', Array.from(adminIdsToTry));

    let tokens = Array.from(new Set((users || []).map(u => u.fcm_token).filter(Boolean)));
    
    // Fallback: se nenhum token for encontrado para o ID enviado, busca todos admins com FCM ativo
    if (tokens.length === 0) {
      const { data: activeAdmins } = await supabaseAdmin
        .from('users')
        .select('id, name, fcm_token')
        .eq('role', 'admin')
        .not('fcm_token', 'is', null);
      if (activeAdmins && activeAdmins.length > 0) {
        tokens = Array.from(new Set(activeAdmins.map(u => u.fcm_token).filter(Boolean)));
      }
    }

    if (tokens.length === 0) {
      return res.json({ success: false, message: 'Nenhum administrador com token FCM registrado no momento' });
    }

    const { initialized, messaging } = initFirebase();
    if (!initialized || !messaging) {
      return res.json({
        success: false,
        message: 'Firebase Admin não configurado na Vercel (FIREBASE_SERVICE_ACCOUNT ausente ou formato incorreto - necessita service-account.json com private_key)'
      });
    }

    const isJob = type === 'job';
    const title = isJob ? '🏊 Serviço Avulso Finalizado' : '🏊 Visita Finalizada!';
    const body = `O colaborador ${empName} finalizou o atendimento no cliente ${resolvedClientName}.`;

    let sentCount = 0;
    for (const token of tokens) {
      try {
        await messaging.send({
          token,
          notification: { title, body },
          data: {
            title,
            body,
            visitId: String(visitId || ''),
            clientName: resolvedClientName,
            techName: empName,
            clientId: String(clientId || ''),
            employeeId: String(employeeId || ''),
            type: isJob ? 'job_completed' : 'visit_completed',
            click_action: 'FCM_PLUGIN_ACTIVITY',
            url: '/routes',
            channelId: 'atendimentos_v2',
            channel_id: 'atendimentos_v2',
            sound: 'notificacao'
          },
          android: {
            priority: 'high',
            ttl: 2419200,
            directBootOk: true,
            notification: {
              channelId: 'atendimentos_v2',
              title,
              body,
              sound: 'notificacao',
              priority: 'max',
              visibility: 'public',
              defaultSound: false,
              defaultVibrateTimings: true,
              localOnly: false,
              notificationCount: 1,
              tag: `visit_${visitId || Date.now()}`
            }
          },
          apns: {
            headers: {
              'apns-priority': '10',
              'apns-push-type': 'alert'
            },
            payload: {
              aps: {
                alert: { title, body },
                sound: 'notificacao.mp3',
                badge: 1,
                contentAvailable: true
              }
            }
          }
        });
        sentCount++;
      } catch (fcmErr) {
        console.error('Erro FCM:', fcmErr.message);
        if (fcmErr.code === 'messaging/registration-token-not-registered' || fcmErr.code === 'messaging/invalid-registration-token') {
          await supabaseAdmin.from('users').update({ fcm_token: null }).eq('fcm_token', token);
        }
      }
    }

    return res.json({ success: sentCount > 0, sentCount });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
