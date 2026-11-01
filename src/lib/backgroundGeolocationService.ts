import { registerPlugin, Capacitor } from '@capacitor/core';
import type { BackgroundGeolocationPlugin, Location } from '@capacitor-community/background-geolocation';
import { startForegroundTrackingNotification, stopForegroundTrackingNotification } from './pushNotifications';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  bearing: number | null;
  altitude: number | null;
  time?: number | null;
}

export type LocationCallback = (point: GeoPoint) => void;

/**
 * Âncora de Áudio Silencioso e MediaSession para manter o navegador acordado
 * mesmo com a tela do celular desligada ou aplicativo em segundo plano.
 */
class BackgroundAudioKeepAlive {
  private audio: HTMLAudioElement | null = null;
  private isRunning: boolean = false;
  private boundUserInteractionHandler: (() => void) | null = null;

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // Pequeno áudio WAV silencioso codificado em base64 (1 segundo de silêncio)
      const silentWavBase64 = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      const audio = new Audio(silentWavBase64);
      audio.loop = true;
      audio.volume = 0.01; // Quase inaudível, mas garante canal de áudio aberto no SO

      const attemptPlay = () => {
        audio.play().then(() => {
          this.setupMediaSession();
        }).catch((err) => {
          console.warn('[AudioKeepAlive] Autoplay aguardando interação do usuário:', err?.message || err);
        });
      };

      attemptPlay();

      // Interação do usuário caso o navegador exija gesto para iniciar áudio
      const onUserInteraction = () => {
        if (this.isRunning && audio.paused) {
          audio.play().then(() => this.setupMediaSession()).catch(() => {});
        }
      };
      this.boundUserInteractionHandler = onUserInteraction;
      window.addEventListener('click', onUserInteraction, { passive: true });
      window.addEventListener('touchstart', onUserInteraction, { passive: true });

      this.audio = audio;
    } catch (err) {
      console.warn('[AudioKeepAlive] Erro ao iniciar áudio de segundo plano:', err);
    }
  }

  private setupMediaSession() {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'RS Piscinas',
          artist: 'Serviço em execução',
          album: 'Rastreamento em Tempo Real Ativo',
          artwork: [
            { src: '/Rs_Piscinas-removebg-preview.png', sizes: '96x96', type: 'image/png' },
            { src: '/Rs_Piscinas-removebg-preview.png', sizes: '192x192', type: 'image/png' }
          ]
        });
        navigator.mediaSession.playbackState = 'playing';

        // Mantém a notificação ativa no Android mesmo que o usuário pressione botões de controle
        navigator.mediaSession.setActionHandler('play', () => {
          this.audio?.play();
          navigator.mediaSession.playbackState = 'playing';
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          // Não pausa o áudio de serviço para não derrubar o GPS em segundo plano
          this.audio?.play();
          navigator.mediaSession.playbackState = 'playing';
        });
      } catch (e) {
        console.warn('[AudioKeepAlive] Erro ao configurar MediaSession:', e);
      }
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.boundUserInteractionHandler) {
      window.removeEventListener('click', this.boundUserInteractionHandler);
      window.removeEventListener('touchstart', this.boundUserInteractionHandler);
      this.boundUserInteractionHandler = null;
    }
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.src = '';
      } catch {}
      this.audio = null;
    }
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
      } catch {}
    }
  }
}

class NativeBackgroundGeolocationService {
  private watcherId: string | null = null;
  private webWatchId: number | null = null;
  private wakeLock: any = null;
  private isRunning: boolean = false;
  private lastCallbackTime: number = 0;
  private audioKeepAlive = new BackgroundAudioKeepAlive();
  private timerWorker: Worker | null = null;

  /**
   * Inicia o monitoramento de GPS contínuo garantido com suporte a tela desligada
   * e aplicativo em segundo plano tanto em navegadores/PWA quanto em APK nativo.
   */
  public async start(callback: LocationCallback): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. Ativa a âncora de áudio e MediaSession ("Serviço em execução")
    this.audioKeepAlive.start();

    // 2. Execução nativa no Android / iOS via Capacitor (se for APK)
    if (Capacitor.isNativePlatform()) {
      try {
        await startForegroundTrackingNotification();

        this.watcherId = await BackgroundGeolocation.addWatcher(
          {
            backgroundTitle: 'RS Piscinas',
            backgroundMessage: 'Serviço em execução',
            requestPermissions: true,
            stale: false,
            distanceFilter: 10,
          },
          (position?: Location, error?: any) => {
            if (error) {
              console.warn('[NativeGeo] Notificação do watcher nativo:', error?.message || error);
              return;
            }
            if (position) {
              this.handleNewPoint(position, callback);
            }
          }
        );
        console.log(`[NativeGeo] Foreground Service nativo ativo. Watcher ID: ${this.watcherId}`);
      } catch (nativeErr) {
        console.warn('[NativeGeo] Falha ao acionar watcher nativo, utilizando fallback web:', nativeErr);
      }
    }

    // 3. Fallback Web / PWA robusto (WakeLock)
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
        document.addEventListener('visibilitychange', async () => {
          if (this.isRunning && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
            try {
              this.wakeLock = await (navigator as any).wakeLock.request('screen');
            } catch {}
          }
        });
      } catch {}
    }

    // 4. Inicia Web Worker para ticks de segundo plano não bloqueados pelo navegador
    try {
      const workerBlob = new Blob([`
        let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'START') {
            if (timer) clearInterval(timer);
            timer = setInterval(function() {
              self.postMessage('TICK');
            }, 10000); // 10 segundos
          } else if (e.data === 'STOP') {
            if (timer) clearInterval(timer);
            timer = null;
          }
        };
      `], { type: 'application/javascript' });

      const workerUrl = URL.createObjectURL(workerBlob);
      const worker = new Worker(workerUrl);

      worker.onmessage = () => {
        if (!this.isRunning) return;
        // Se já se passaram mais de 8 segundos desde o último fix de GPS, força uma leitura ativa
        const now = Date.now();
        if (now - this.lastCallbackTime >= 8000 && 'geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => this.handleNewPoint(pos.coords, callback),
            (err) => console.warn('[BackgroundWorker] Leitura periódica:', err?.message || err),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
          );
        }
      };

      worker.postMessage('START');
      this.timerWorker = worker;
    } catch (workerErr) {
      console.warn('[BackgroundWorker] Não foi possível instanciar Worker de segundo plano:', workerErr);
    }

    // 5. WatchPosition contínuo padrão
    if ('geolocation' in navigator) {
      // Primeira coordenada imediata
      navigator.geolocation.getCurrentPosition(
        (pos) => this.handleNewPoint(pos.coords, callback),
        (err) => console.warn('[WebGeo] Posição inicial:', err.message),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );

      this.webWatchId = navigator.geolocation.watchPosition(
        (pos) => this.handleNewPoint(pos.coords, callback),
        (err) => console.warn('[WebGeo] Watch error:', err.message),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
      );
    }
  }

  private handleNewPoint(coords: any, callback: LocationCallback) {
    const now = Date.now();
    // Limite mínimo de 4 segundos entre disparos para não sobrecarregar
    if (now - this.lastCallbackTime < 4000) {
      return;
    }
    this.lastCallbackTime = now;

    callback({
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      speed: coords.speed ?? null,
      bearing: coords.heading ?? coords.bearing ?? null,
      altitude: coords.altitude ?? null,
      time: coords.time ?? coords.timestamp ?? now,
    });
  }

  /**
   * Encerra todos os serviços de segundo plano, áudio e libera recursos
   */
  public async stop(): Promise<void> {
    this.isRunning = false;

    // Para áudio keep-alive e MediaSession
    this.audioKeepAlive.stop();

    // Para Web Worker
    if (this.timerWorker) {
      try {
        this.timerWorker.postMessage('STOP');
        this.timerWorker.terminate();
      } catch {}
      this.timerWorker = null;
    }

    if (this.watcherId) {
      try {
        await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
      } catch (err) {
        console.warn('[NativeGeo] Erro ao remover watcher nativo:', err);
      }
      this.watcherId = null;
    }

    try {
      await stopForegroundTrackingNotification();
    } catch {}

    if (this.webWatchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(this.webWatchId);
      this.webWatchId = null;
    }

    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
      } catch {}
      this.wakeLock = null;
    }
  }

  public async openSettings(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await BackgroundGeolocation.openSettings();
      } catch (e) {
        console.warn('[NativeGeo] Erro ao abrir configurações:', e);
      }
    }
  }
}

export const nativeBackgroundGeolocation = new NativeBackgroundGeolocationService();
