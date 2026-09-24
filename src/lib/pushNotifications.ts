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
        id: 'atendimentos_v2',
        name: 'Atendimentos das Rotas (Alerta Sonoro)',
        description: 'Notificações em tempo real com som personalizado quando um colaborador finalizar um atendimento',
        importance: 5 as const, // High / Max importance (heads-up banner)
        visibility: 1 as const, // Public on lockscreen
        sound: 'notificacao',
        vibration: true,
        lights: true,
        lightColor: '#10b981',
      },
      {
        id: 'atendimentos',
        name: 'Atendimentos Gerais',
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
        sound: 'chat_notification.mp3',
        vibration: true,
        lights: true,
        lightColor: '#2563eb',
      }
    ];

    for (const ch of channels) {
      await PushNotifications.createChannel(ch).catch(() => {});
      await LocalNotifications.createChannel(ch).catch(() => {});
    }
  } catch (err) {
    console.warn('[Push] Notification channel creation warning:', err);
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
  userProfile: { uid: string; role?: string; name?: string } | null,
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

    // 1. Listen for device token registration
    const regListener = await PushNotifications.addListener('registration', async (token: Token) => {
      console.log('[Capacitor Push] Token recebido com sucesso:', token.value);
      localStorage.setItem('fcm_token', token.value);
      localStorage.setItem('fcm_token_time', new Date().toISOString());

      if (userProfile?.uid) {
        try {
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

        // Play audio alert (differentiates chat messages from visit completions)
        try {
          const isChat = notification.data?.channelId === 'chat_messages' || notification.data?.type === 'chat_message';
          const soundSrc = isChat ? '/chat_notification.mp3' : '/notificacao.mp3';
          const audio = new Audio(soundSrc);
          audio.play().catch(() => {});
        } catch (e) {}

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
        const targetUrl = notification.notification?.data?.url || '/routes';
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
        const targetUrl = action.notification?.extra?.url || '/routes';
        if (handlers?.onNavigate) {
          handlers.onNavigate(targetUrl);
        } else {
          window.location.href = targetUrl;
        }
      }
    );
    activeListeners.push(localActionListener);

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
    const res = await fetch(getApiUrl('/api/notifications/notify-visit-completion'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
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
      body: JSON.stringify({ adminId }),
    });
    return await res.json();
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}
