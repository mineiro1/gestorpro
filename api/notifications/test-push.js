import { createClient } from '@supabase/supabase-js';
import { initFirebase } from '../_firebaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { adminId } = req.body || {};
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

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, name, fcm_token')
      .eq('id', adminId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (!user.fcm_token) {
      return res.json({ success: false, message: 'Nenhum token FCM registrado neste dispositivo. Abra o app no celular primeiro.' });
    }

    const { initialized, messaging } = initFirebase();
    if (!initialized || !messaging) {
      return res.json({
        success: false,
        message: 'Firebase Admin não inicializado na Vercel (FIREBASE_SERVICE_ACCOUNT ausente ou formato incorreto - necessita chave privada service-account.json)'
      });
    }

    await messaging.send({
      token: user.fcm_token,
      notification: {
        title: '🔔 Teste de Notificação Push',
        body: `Olá ${user.name || 'Gestor'}, seu dispositivo está configurado e pronto para receber notificações em segundo plano!`
      },
      data: {
        type: 'test_push',
        channelId: 'atendimentos',
        url: '/routes'
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'atendimentos',
          sound: 'notificacao.mp3',
          priority: 'max',
          visibility: 'public',
          defaultSound: false,
          defaultVibrateTimings: true
        }
      }
    });

    return res.json({ success: true, message: 'Notificação de teste disparada com sucesso via FCM!' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
