import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase } from './supabase';
import { getApiUrl } from './apiConfig';

export interface PushNotificationHandlers {
  onNavigate?: (url: string) => void;
  onVisitCompleted?: (data: any) => void;
}

let isInitialized = false;
let activeListeners: Array<{ remove: () => Promise<void> }> = [];

/**
 * Configure high-priority notification channels on Android
 */
export async function setupPushNotificationChannels(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const channels = [
      {
        id: 'atendimentos_v3',
        name: 'Atendimentos das Rotas (Alerta Prioritário)',
        description: 'Notificações em tempo real com som personalizado e tela bloqueada quando um colaborador finalizar um atendimento',
        importance: 5 as const, // High / Max importance (heads-up banner)
        visibility: 1 as const, // Public on lockscreen
        sound: 'notificacao',
        vibration: true,
        lights: true,
        lightColor: '#10b981',
      },
      {
        id: 'atendimentos_v2',
        name: 'Atendimentos das Rotas (Legado)',
        description: 'Notificações de atendimento',
        importance: 5 as const,
        visibility: 1 as const,
        sound: 'notificacao',
        vibration: true,
        lights: true,
        lightColor: '#10b981',
      },
      {
        id: 'fcm_default_channel',
        name: 'Notificações Gerais',
        description: 'Canal padrão do aplicativo',
        importance: 5 as const,
        visibility: 1 as const,
        sound: 'notificacao',
        vibration: true,
        lights: true,
        lightColor: '#10b981',
      },
      {
        id: 'chat_messages',
        name: 'Mensagens do Chat',
        description: 'Notificações de mensagens recebidas de clientes',
        importance: 5 as const,
        visibility: 1 as const,
        sound: 'chat_notification',
        vibration: true,
        lights: true,
        lightColor: '#2563eb',
      },
      {
        id: 'cobrancas',
        name: 'Cobranças e Vencimentos',
        description: 'Alertas diários de mensalidades a vencer e cobranças automáticas',
        importance: 5 as const,
        visibility: 1 as const,
        sound: 'notificacao',
        vibration: true,
        lights: true,
        lightColor: '#f59e0b',
      }
    ];

    for (const ch of channels) {
      try {
        await PushNotifications.createChannel(ch);
      } catch (err) {
        console.warn(`[Capacitor Push] Erro ao criar canal Push ${ch.id}:`, err);
      }

      try {
        await LocalNotifications.createChannel({
          id: ch.id,
          name: ch.name,
          description: ch.description,
          importance: ch.importance,
          visibility: ch.visibility,
          sound: `${ch.sound}.mp3`,
          vibration: ch.vibration,
          lights: ch.lights,
          lightColor: ch.lightColor
        });
      } catch (err) {
        console.warn(`[Capacitor Push] Erro ao criar canal Local ${ch.id}:`, err);
      }
    }

    console.log('[Capacitor Push] Todos os canais de alta prioridade (atendimentos_v3) foram configurados.');
  } catch (err) {
    console.error('[Capacitor Push] Falha global ao configurar canais:', err);
  }
}

/**
 * Synchronizes the cached FCM token with Supabase users table and multi-device registry
 */
export async function syncStoredFcmToken(userId?: string | null, adminId?: string | null, role?: string | null): Promise<boolean> {
  if (!userId || role === 'client') return false;
  const token = localStorage.getItem('fcm_token');
  if (!token) return false;

  try {
    // 1. Enviar para a API /api/notifications/register-device para salvar na lista de múltiplos dispositivos
    fetch(getApiUrl('/api/notifications/register-device'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        adminId: adminId || null,
        token,
        platform: Capacitor.getPlatform() || 'android',
        deviceId: `dev_${token.slice(0, 12)}`,
        deviceName: 'Celular Android'
      }),
      keepalive: true
    }).catch(() => {});

    // 2. Atualizar users.fcm_token no Supabase
    const { error } = await supabase.from('users').update({ fcm_token: token }).eq('id', userId);
    if (error) {
      console.warn('[Capacitor Push] Erro ao gravar token FCM:', error.message);
      return false;
    }
    console.log('[Capacitor Push] Token FCM sincronizado com sucesso para o usuário:', userId);
    return true;
  } catch (e) {
    console.error('[Capacitor Push] Falha ao sincronizar token:', e);
    return false;
  }
}

/**
 * Request Push Notifications permissions and register device
 */
export async function requestPushPermissions(): Promise<'granted' | 'denied' | 'default'> {
  if (Capacitor.isNativePlatform()) {
    try {
      await setupPushNotificationChannels();
      const localStatus = await LocalNotifications.requestPermissions();
      const pushStatus = await PushNotifications.requestPermissions();

      if (pushStatus.receive === 'granted') {
        await PushNotifications.register();
        return 'granted';
      }
      return pushStatus.receive === 'denied' ? 'denied' : 'default';
    } catch (err) {
      console.error('[Push] Error requesting native permissions:', err);
      return 'denied';
    }
  } else {
    // Web Fallback
    if (typeof Notification !== 'undefined') {
      try {
        const perm = await Notification.requestPermission();
        return perm;
      } catch (e) {
        return 'denied';
      }
    }
    return 'default';
  }
}

/**
 * Initialize Capacitor Push Notifications for the current user session
 */
export async function initCapacitorPushNotifications(
  userProfile: { uid: string; role?: string; name?: string; adminId?: string; admin_id?: string } | null,
  handlers?: PushNotificationHandlers
): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) {
    // Web / Browser support
    return () => {};
  }

  // Clear existing listeners if re-initializing
  for (const listener of activeListeners) {
    try {
      await listener.remove();
    } catch (e) {}
  }
  activeListeners = [];

  try {
    await setupPushNotificationChannels();

    const pushCheck = await PushNotifications.checkPermissions();
    if (pushCheck.receive !== 'granted') {
      await PushNotifications.requestPermissions();
    }

    const currentPerm = await PushNotifications.checkPermissions();
    if (currentPerm.receive === 'granted') {
      await PushNotifications.register();
    }

    // Sincroniza token em cache imediatamente se já disponível (apenas administradores e colaboradores)
    const cachedToken = localStorage.getItem('fcm_token');
    if (cachedToken && userProfile?.uid && userProfile.role !== 'client') {
      try {
        await supabase.from('users').update({ fcm_token: cachedToken }).eq('id', userProfile.uid);
        console.log('[Capacitor Push] Token FCM em cache sincronizado com sucesso');
      } catch (err) {
        console.warn('[Capacitor Push] Aviso ao sincronizar token em cache:', err);
      }
    }

    // 1. Listen for device token registration
    const regListener = await PushNotifications.addListener('registration', async (token: Token) => {
      console.log('[Capacitor Push] Token recebido com sucesso:', token.value);
      localStorage.setItem('fcm_token', token.value);
      localStorage.setItem('fcm_token_time', new Date().toISOString());

      if (userProfile?.uid && userProfile.role !== 'client') {
        try {
          // 1. Enviar para a API de registro de múltiplos dispositivos
          fetch(getApiUrl('/api/notifications/register-device'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: userProfile.uid,
              adminId: userProfile.adminId || userProfile.admin_id || null,
              token: token.value,
              platform: Capacitor.getPlatform() || 'android',
              deviceId: `dev_${token.value.slice(0, 12)}`,
              deviceName: 'Celular Android'
            }),
            keepalive: true
          }).catch(() => {});

          // 2. Atualizar tabela users
          await supabase.from('users').update({
            fcm_token: token.value,
          }).eq('id', userProfile.uid);
          console.log('[Capacitor Push] Token FCM atualizado no perfil do usuário no Supabase');
        } catch (dbErr) {
          console.error('[Capacitor Push] Falha ao gravar fcm_token no Supabase:', dbErr);
        }
      }
    });
    activeListeners.push(regListener);

    // 2. Listen for registration errors
    const errListener = await PushNotifications.addListener('registrationError', (error: any) => {
      console.error('[Capacitor Push] Erro no registro de Push:', error);
    });
    activeListeners.push(errListener);

    // 3. Listen for push notification received while app is OPEN (foreground)
    const recListener = await PushNotifications.addListener(
      'pushNotificationReceived',
      async (notification: PushNotificationSchema) => {
        console.log('[Capacitor Push] Notificação recebida em primeiro plano:', notification);

        // Se quem está logado for o colaborador que acabou de concluir o atendimento, NÃO exibe o alerta
        const notificationEmployeeId = notification.data?.employeeId || notification.data?.employee_id;
        if (userProfile?.role === 'employee' && notificationEmployeeId === userProfile.uid) {
          console.log('[Capacitor Push] Notificação ignorada: colaborador é o autor da finalização.');
          return;
        }

        const isChat = notification.data?.channelId === 'chat_messages' || notification.data?.type === 'chat_message';
        const isBilling = notification.data?.channelId === 'cobrancas' || (typeof notification.data?.type === 'string' && notification.data.type.startsWith('billing'));
        const notifTitle = notification.title || notification.data?.title || (isChat ? '💬 Nova Mensagem' : (isBilling ? '💰 Aviso de Cobrança' : '✅ Atendimento Finalizado'));
        const notifBody = notification.body || notification.data?.body || '';
        const targetChannel = notification.data?.channelId || (isChat ? 'chat_messages' : (isBilling ? 'cobrancas' : 'atendimentos_v3'));
        const targetUrl = notification.data?.url || (isChat ? '/messages' : (isBilling ? '/billing' : '/routes'));

        // Play audio alert (differentiates chat messages from visit completions)
        try {
          const soundSrc = isChat ? '/chat_notification.mp3' : '/notificacao.mp3';
          const audio = new Audio(soundSrc);
          audio.play().catch(() => {});
        } catch (e) {}

        // Schedule visual banner notification on Android system bar
        if (Capacitor.isNativePlatform()) {
          try {
            await LocalNotifications.schedule({
              notifications: [
                {
                  id: Math.floor(Math.random() * 1000000) + 1,
                  title: notifTitle,
                  body: notifBody,
                  channelId: targetChannel,
                  schedule: { at: new Date(Date.now() + 50) },
                  sound: isChat ? 'chat_notification.mp3' : 'notificacao.mp3',
                  extra: {
                    url: targetUrl,
                    channelId: targetChannel,
                    ...notification.data,
                  },
                },
              ],
            });
          } catch (localErr) {
            console.warn('[Capacitor Push] Erro ao exibir banner local:', localErr);
          }
        }

        // Notify app components (e.g. invalidate routes query)
        if (handlers?.onVisitCompleted) {
          handlers.onVisitCompleted(notification.data);
        }
      }
    );
    activeListeners.push(recListener);

    // 4. Listen for user tapping on notification in device system tray
    const actionListener = await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (notification: ActionPerformed) => {
        console.log('[Capacitor Push] Notificação clicada pelo usuário:', notification);
        const targetUrl = notification.notification?.data?.url || (notification.notification?.data?.channelId === 'cobrancas' ? '/billing' : '/routes');
        if (handlers?.onNavigate) {
          handlers.onNavigate(targetUrl);
        } else {
          window.location.href = targetUrl;
        }
      }
    );
    activeListeners.push(actionListener);

    // 5. Also listen to LocalNotifications click
    const localActionListener = await LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (action) => {
        console.log('[Capacitor Push] Notificação local clicada:', action);
        const targetUrl = action.notification?.extra?.url || (action.notification?.extra?.channelId === 'cobrancas' ? '/billing' : '/routes');
        if (handlers?.onNavigate) {
          handlers.onNavigate(targetUrl);
        } else {
          window.location.href = targetUrl;
        }
      }
    );
    activeListeners.push(localActionListener);

    // 6. Guarantee token is always fresh on resume/focus
    const handleReSync = () => {
      syncStoredFcmToken(userProfile?.uid, userProfile?.adminId || userProfile?.admin_id);
      if (Capacitor.isNativePlatform()) {
        PushNotifications.register().catch(() => {});
      }
    };
    window.addEventListener('focus', handleReSync);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') handleReSync();
    });

    isInitialized = true;
  } catch (initErr) {
    console.error('[Capacitor Push] Erro na inicialização do plugin:', initErr);
  }

  return () => {
    for (const listener of activeListeners) {
      listener.remove().catch(() => {});
    }
    activeListeners = [];
    isInitialized = false;
  };
}

/**
 * Direct call to server API to notify administrator of an attendance completion
 */
export async function notifyAdminAttendanceFinished(params: {
  adminId: string;
  employeeId: string;
  clientId?: string;
  clientName?: string;
  techName?: string;
  visitId?: string;
  type?: 'visit' | 'job';
  notes?: string;
}): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(getApiUrl('/api/notifications/notify-visit-completion'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      keepalive: true,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const json = await res.json();
    return json.success || false;
  } catch (e) {
    console.error('[Push] Falha ao chamar endpoint de notificação:', e);
    return false;
  }
}

/**
 * Send a test push notification to verify Capacitor push setup
 */
export async function sendTestPushNotification(adminId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(getApiUrl('/api/notifications/test-push'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId, userId: adminId }),
    });
    return await res.json();
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}
