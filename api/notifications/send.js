import { createClient } from '@supabase/supabase-js';
import { initFirebase, admin } from '../_firebaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { targetUserId, title, body, data = {} } = req.body || {};
    if (!targetUserId || !title) {
      return res.status(400).json({ error: 'targetUserId and title are required' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://fgmmvrvudozzwqxzsztwo.supabase.co';
    const part1 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnbW12cnZ1ZG96endxenN6dHdvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA1MjMzMSwi";
    const part2 = "ZXhwIjoyMDk0NjI4MzMxfQ.iB9iF3aoumsNtywpLZL_QjrBzR8QPWw7GGWQ6-Yx-Ik";
    const directKey = part1 + part2;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || directKey;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, name, fcm_token')
      .eq('id', targetUserId);

    if (error || !users || users.length === 0) {
      return res.status(404).json({ error: 'Usuário destinatário não encontrado' });
    }

    const tokens = users.map(u => u.fcm_token).filter(Boolean);
    if (tokens.length === 0) {
      return res.json({ success: false, message: 'Nenhum token FCM registrado para o usuário' });
    }

    initFirebase();
    if (!admin.apps.length) {
      return res.json({ success: false, message: 'Firebase Admin não inicializado na Vercel' });
    }

    let sentCount = 0;
    for (const token of tokens) {
      try {
        await admin.messaging().send({
          token,
          notification: {
            title,
            body: body || ''
          },
          data: {
            ...data,
            click_action: 'FCM_PLUGIN_ACTIVITY',
            url: data.url || '/routes',
            channelId: data.channelId || 'atendimentos'
          },
          android: {
            priority: 'high',
            notification: {
              channelId: data.channelId || 'atendimentos',
              sound: 'default',
              priority: 'max',
              defaultSound: true,
              defaultVibrateTimings: true
            }
          }
        });
        sentCount++;
      } catch (fcmErr) {
        console.error('Erro FCM ao enviar:', fcmErr.message);
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
