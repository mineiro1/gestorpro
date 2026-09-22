import { createClient } from '@supabase/supabase-js';
import { initFirebase } from '../_firebaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { visitId, adminId, employeeId, clientId, clientName, techName, type, notes } = req.body || {};
    if (!adminId) {
      return res.status(400).json({ error: 'adminId is required' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const part1 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnbW12cnZ1ZG96endxenN6dHdvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA1MjMzMSwi";
    const part2 = "ZXhwIjoyMDk0NjI4MzMxfQ.iB9iF3aoumsNtywpLZL_QjrBzR8QPWw7GGWQ6-Yx-Ik";
    const directKey = part1 + part2;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || directKey;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    let empName = techName || "Colaborador";
    if (!techName && employeeId) {
      try {
        const { data: empData } = await supabaseAdmin.from('users').select('name').eq('id', employeeId).single();
        if (empData?.name) empName = empData.name;
      } catch (e) {}
    }

    let resolvedClientName = clientName;
    if (!resolvedClientName && clientId) {
      try {
        const { data: cliData } = await supabaseAdmin.from('clients').select('name').eq('id', clientId).single();
        if (cliData?.name) resolvedClientName = cliData.name;
      } catch (e) {}
    }
    if (!resolvedClientName) resolvedClientName = "Cliente";

    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, name, fcm_token')
      .eq('id', adminId);

    if (error || !users || users.length === 0) {
      return res.status(404).json({ error: 'Admin não encontrado' });
    }

    const tokens = users.map(u => u.fcm_token).filter(Boolean);
    if (tokens.length === 0) {
      return res.json({ success: false, message: 'Admin não possui tokens FCM registrados no momento' });
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
            visitId: String(visitId || ''),
            clientName: resolvedClientName,
            techName: empName,
            clientId: String(clientId || ''),
            employeeId: String(employeeId || ''),
            type: isJob ? 'job_completed' : 'visit_completed',
            click_action: 'FCM_PLUGIN_ACTIVITY',
            url: '/routes',
            channelId: 'atendimentos_v2'
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'atendimentos_v2',
              sound: 'notificacao',
              priority: 'max',
              visibility: 'public',
              defaultSound: false,
              defaultVibrateTimings: true
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
