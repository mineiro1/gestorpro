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

class NativeBackgroundGeolocationService {
  private watcherId: string | null = null;
  private webWatchId: number | null = null;
  private wakeLock: any = null;
  private isRunning: boolean = false;
  private lastPoint: GeoPoint | null = null;
  private subscribers: Set<LocationCallback> = new Set();
  
  // Recursos para manter a execução em segundo plano com tela apagada na Web / PWA
  private silentAudio: HTMLAudioElement | null = null;
  private pipVideo: HTMLVideoElement | null = null;
  private pipCanvas: HTMLCanvasElement | null = null;
  private pipInterval: any = null;
  private isPipActive: boolean = false;
  private onStatusChangeListeners: Set<(status: { isRunning: boolean; isPipActive: boolean; lastPoint: GeoPoint | null }) => void> = new Set();

  /**
   * Inicia o monitoramento de GPS com suporte a segundo plano mesmo com a tela bloqueada.
   * No Android Nativo (Capacitor), aciona o Foreground Service com notificação contínua:
   * "RS Piscinas - Serviço em execução"
   * No Web / PWA, inicia watchPosition, WakeLock e mecanismo de áudio/janela flutuante.
   */
  public async start(callback: LocationCallback): Promise<void> {
    this.subscribers.add(callback);

    if (this.isRunning) {
      if (this.lastPoint) callback(this.lastPoint);
      return;
    }
    this.isRunning = true;
    this.notifyStatus();

    // 1. Execução nativa no Android / iOS via Capacitor
    if (Capacitor.isNativePlatform()) {
      try {
        console.log('[NativeGeo] Ativando Foreground Service e notificação fixa no Android...');

        // Inicia a notificação persistente na barra de status do Android
        await startForegroundTrackingNotification().catch((e) => {
          console.warn('[NativeGeo] Aviso ao acionar notificação foreground:', e);
        });

        // Habilita plugin backgroundMode nativo caso disponível no APK
        if ((window as any).cordova?.plugins?.backgroundMode) {
          try {
            const bgMode = (window as any).cordova.plugins.backgroundMode;
            bgMode.enable();
            bgMode.setDefaults({
              title: 'RS Piscinas',
              text: 'Serviço em execução',
              icon: 'ic_stat_icon_config_sample',
              color: '0284c7',
              resume: true,
              hidden: false,
              silent: false,
            });
            if (typeof bgMode.disableWebViewOptimizations === 'function') {
              bgMode.disableWebViewOptimizations();
            }
          } catch (bgErr) {
            console.warn('[NativeGeo] Aviso backgroundMode:', bgErr);
          }
        }

        // Registra o Watcher do BackgroundGeolocation nativo
        this.watcherId = await BackgroundGeolocation.addWatcher(
          {
            backgroundTitle: 'RS Piscinas',
            backgroundMessage: 'Serviço em execução',
            requestPermissions: true,
            stale: false,
            distanceFilter: 5, // Atualiza a cada 5 metros de deslocamento
          },
          (position?: Location, error?: any) => {
            if (error) {
              console.warn('[NativeGeo] Notificação do watcher nativo:', error?.message || error);
              return;
            }
            if (position) {
              const point: GeoPoint = {
                latitude: position.latitude,
                longitude: position.longitude,
                accuracy: position.accuracy,
                speed: position.speed,
                bearing: position.bearing,
                altitude: position.altitude,
                time: position.time,
              };
              this.lastPoint = point;
              this.dispatch(point);
            }
          }
        );

        console.log(`[NativeGeo] Foreground Service nativo ativo com sucesso. Watcher ID: ${this.watcherId}`);
        return;
      } catch (nativeErr) {
        console.warn('[NativeGeo] Falha ao acionar watcher nativo, utilizando fallback web:', nativeErr);
      }
    }

    // 2. Execução Web / PWA no navegador (Chrome Mobile, Safari, etc.)
    await this.initWebKeepAlive();

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const pt: GeoPoint = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
            bearing: pos.coords.heading,
            altitude: pos.coords.altitude,
            time: pos.timestamp,
          };
          this.lastPoint = pt;
          this.dispatch(pt);
        },
        (err) => console.warn('[WebGeo] Posição inicial:', err.message),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );

      this.webWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          const pt: GeoPoint = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
            bearing: pos.coords.heading,
            altitude: pos.coords.altitude,
            time: pos.timestamp,
          };
          this.lastPoint = pt;
          this.dispatch(pt);
          this.updateFloatingCanvas();
        },
        (err) => console.warn('[WebGeo] Watch error:', err.message),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
      );
    }
  }

  /**
   * Inicializa recursos Web para impedir que o navegador Android/iOS congele a aba quando a tela for bloqueada
   */
  private async initWebKeepAlive(): Promise<void> {
    // A) Screen WakeLock
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        try {
          this.wakeLock = await (navigator as any).wakeLock.request('screen');
          this.wakeLock.addEventListener('release', () => {
            this.wakeLock = null;
          });
        } catch {}
      }
    };
    await requestWakeLock();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.wakeLock && this.isRunning) {
        requestWakeLock();
      }
    });

    // B) Silent Audio Keeper (Mantém a thread de mídia ativa no Android para o Chrome não matar o GPS)
    try {
      if (!this.silentAudio) {
        // Áudio mudo de 1 segundo em base64 WAV em loop contínuo
        const silentWavBase64 = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
        this.silentAudio = new Audio(silentWavBase64);
        this.silentAudio.loop = true;
        this.silentAudio.volume = 0.01;
        this.silentAudio.play().catch(() => {
          // Os navegadores exigem interação do usuário antes do áudio, ouvimos o primeiro toque
          const startAudioOnInteraction = () => {
            if (this.silentAudio && this.isRunning) {
              this.silentAudio.play().catch(() => {});
            }
            window.removeEventListener('click', startAudioOnInteraction);
            window.removeEventListener('touchstart', startAudioOnInteraction);
          };
          window.addEventListener('click', startAudioOnInteraction, { once: true });
          window.addEventListener('touchstart', startAudioOnInteraction, { once: true });
        });
      }
    } catch (e) {
      console.warn('[WebGeo] Falha ao inicializar keep-alive de áudio:', e);
    }

    // C) Notificação no Navegador
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification('RS Piscinas', {
              body: 'Serviço em execução',
              tag: 'rs_piscinas_tracking',
              icon: '/Rs_Piscinas-removebg-preview.png',
              badge: '/Rs_Piscinas-removebg-preview.png',
              silent: true,
            });
          }).catch(() => {});
        }
      } catch {}
    }
  }

  /**
   * Prepara o Canvas e Vídeo para a Janela Flutuante (Picture-in-Picture)
   */
  private ensurePipElements(): { canvas: HTMLCanvasElement; video: HTMLVideoElement } {
    if (!this.pipCanvas) {
      this.pipCanvas = document.createElement('canvas');
      this.pipCanvas.width = 320;
      this.pipCanvas.height = 180;
    }

    if (!this.pipVideo) {
      this.pipVideo = document.createElement('video');
      this.pipVideo.muted = true;
      this.pipVideo.playsInline = true;
      this.pipVideo.autoplay = true;
      this.pipVideo.style.position = 'fixed';
      this.pipVideo.style.top = '-9999px';
      this.pipVideo.style.left = '-9999px';
      this.pipVideo.style.width = '1px';
      this.pipVideo.style.height = '1px';
      this.pipVideo.style.opacity = '0';
      this.pipVideo.style.pointerEvents = 'none';
      document.body.appendChild(this.pipVideo);

      this.pipVideo.addEventListener('leavepictureinpicture', () => {
        this.isPipActive = false;
        this.notifyStatus();
      });

      this.pipVideo.addEventListener('enterpictureinpicture', () => {
        this.isPipActive = true;
        this.notifyStatus();
      });
    }

    return { canvas: this.pipCanvas, video: this.pipVideo };
  }

  /**
   * Desenha a interface da "Janela Flutuante" exibindo "RS Piscinas • Serviço em execução"
   */
  public updateFloatingCanvas(): void {
    if (!this.pipCanvas) return;
    const ctx = this.pipCanvas.getContext('2d');
    if (!ctx) return;

    // Fundo elegante escuro
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 320, 180);

    // Borda e efeito sutil
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 312, 172);

    // Gradiente de destaque
    const grad = ctx.createLinearGradient(0, 0, 320, 0);
    grad.addColorStop(0, '#0284c7');
    grad.addColorStop(1, '#06b6d4');
    ctx.fillStyle = grad;
    ctx.fillRect(4, 4, 312, 38);

    // Título Principal
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RS PISCINAS', 160, 29);

    // Indicador Pulsante
    const now = Date.now();
    const isBlink = Math.floor(now / 500) % 2 === 0;
    ctx.beginPath();
    ctx.arc(38, 76, 7, 0, Math.PI * 2);
    ctx.fillStyle = isBlink ? '#10b981' : '#059669';
    ctx.fill();

    // Texto: "Serviço em execução"
    ctx.font = 'bold 17px sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.fillText('Serviço em execução', 56, 82);

    // Subtítulo: Rastreamento Ativo
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('• GPS e telemetria ativos', 56, 108);

    // Detalhe de precisão / horário
    const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    ctx.font = '12px monospace';
    ctx.fillStyle = '#94a3b8';
    if (this.lastPoint) {
      const acc = Math.round(this.lastPoint.accuracy || 0);
      ctx.fillText(`GPS: ±${acc}m | Atualizado: ${timeStr}`, 30, 142);
    } else {
      ctx.fillText(`Sincronizando satélites... ${timeStr}`, 30, 142);
    }

    // Rodapé de segurança
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('Mantenha esta janela aberta para rastreio contínuo', 160, 166);
  }

  /**
   * Abre a Janela Flutuante no celular (Picture-in-Picture)
   * Isso cria uma janela flutuante no Android exibindo "Serviço em execução"
   * e impede que o navegador durma quando a tela for desligada.
   */
  public async requestFloatingWindow(): Promise<boolean> {
    try {
      const { canvas, video } = this.ensurePipElements();
      this.updateFloatingCanvas();

      if (!video.srcObject) {
        const stream = (canvas as any).captureStream ? (canvas as any).captureStream(10) : null;
        if (!stream) {
          console.warn('[FloatingWindow] captureStream não suportado neste navegador');
          return false;
        }
        video.srcObject = stream;
        await video.play().catch(() => {});
      }

      if (this.pipInterval) clearInterval(this.pipInterval);
      this.pipInterval = setInterval(() => {
        this.updateFloatingCanvas();
      }, 1000);

      if (document.pictureInPictureElement) {
        return true;
      }

      if (typeof (video as any).requestPictureInPicture === 'function') {
        await (video as any).requestPictureInPicture();
        this.isPipActive = true;
        this.notifyStatus();
        console.log('[FloatingWindow] Janela flutuante "Serviço em execução" aberta com sucesso!');
        return true;
      }
    } catch (err) {
      console.warn('[FloatingWindow] Não foi possível abrir a janela flutuante:', err);
    }
    return false;
  }

  /**
   * Verifica se o navegador suporta Picture-in-Picture
   */
  public canUseFloatingWindow(): boolean {
    return typeof document !== 'undefined' && ('pictureInPictureEnabled' in document || 'requestPictureInPicture' in HTMLVideoElement.prototype);
  }

  public getIsPipActive(): boolean {
    return this.isPipActive;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public getLastPoint(): GeoPoint | null {
    return this.lastPoint;
  }

  public onStatusChange(listener: (status: { isRunning: boolean; isPipActive: boolean; lastPoint: GeoPoint | null }) => void): () => void {
    this.onStatusChangeListeners.add(listener);
    listener({ isRunning: this.isRunning, isPipActive: this.isPipActive, lastPoint: this.lastPoint });
    return () => {
      this.onStatusChangeListeners.delete(listener);
    };
  }

  private notifyStatus(): void {
    const status = { isRunning: this.isRunning, isPipActive: this.isPipActive, lastPoint: this.lastPoint };
    this.onStatusChangeListeners.forEach((l) => l(status));
  }

  private dispatch(point: GeoPoint): void {
    this.subscribers.forEach((cb) => {
      try {
        cb(point);
      } catch (e) {
        console.error('[BackgroundGeo] Erro no callback de geolocalização:', e);
      }
    });
    this.notifyStatus();
  }

  /**
   * Encerra o serviço de segundo plano, a notificação fixa e libera a CPU
   */
  public async stop(callback?: LocationCallback): Promise<void> {
    if (callback) {
      this.subscribers.delete(callback);
    }
    if (this.subscribers.size > 0 && callback) {
      return;
    }

    this.isRunning = false;
    this.notifyStatus();

    // 1. Encerramento nativo
    if (Capacitor.isNativePlatform()) {
      if (this.watcherId) {
        try {
          await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
          console.log('[NativeGeo] Serviço nativo de geolocalização encerrado.');
        } catch (err) {
          console.warn('[NativeGeo] Erro ao remover watcher nativo:', err);
        }
        this.watcherId = null;
      }
      await stopForegroundTrackingNotification().catch(() => {});
    }

    // 2. Encerramento Web
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

    if (this.silentAudio) {
      try {
        this.silentAudio.pause();
        this.silentAudio.currentTime = 0;
      } catch {}
      this.silentAudio = null;
    }

    if (this.pipInterval) {
      clearInterval(this.pipInterval);
      this.pipInterval = null;
    }

    if (document.pictureInPictureElement && typeof document.exitPictureInPicture === 'function') {
      try {
        await document.exitPictureInPicture();
      } catch {}
    }
    this.isPipActive = false;
  }

  /**
   * Abre a tela nativa de configurações de permissões do aplicativo no Android
   */
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
