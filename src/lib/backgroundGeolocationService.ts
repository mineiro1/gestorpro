import { registerPlugin, Capacitor } from '@capacitor/core';
import type { BackgroundGeolocationPlugin, Location } from '@capacitor-community/background-geolocation';

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

  /**
   * Inicia o monitoramento de GPS com suporte a segundo plano mesmo com a tela bloqueada.
   * No Android (Capacitor), executa o serviço nativo com notificação contínua.
   * No navegador web, executa o watchPosition com WakeLock.
   */
  public async start(callback: LocationCallback): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. Execução nativa no Android / iOS via Capacitor
    if (Capacitor.isNativePlatform()) {
      try {
        console.log('[NativeGeo] Inicializando Foreground Service nativo de GPS no Android...');
        this.watcherId = await BackgroundGeolocation.addWatcher(
          {
            backgroundTitle: 'RS Piscinas',
            backgroundMessage: 'Sistema em execução.',
            requestPermissions: true,
            stale: false,
            distanceFilter: 10, // Atualiza a cada 10 metros de deslocamento
          },
          (position?: Location, error?: any) => {
            if (error) {
              console.warn('[NativeGeo] Notificação do watcher nativo:', error?.message || error);
              return;
            }
            if (position) {
              callback({
                latitude: position.latitude,
                longitude: position.longitude,
                accuracy: position.accuracy,
                speed: position.speed,
                bearing: position.bearing,
                altitude: position.altitude,
                time: position.time,
              });
            }
          }
        );
        console.log(`[NativeGeo] Foreground Service nativo ativo com sucesso. Watcher ID: ${this.watcherId}`);
        return;
      } catch (nativeErr) {
        console.warn('[NativeGeo] Falha ao acionar watcher nativo, utilizando fallback web:', nativeErr);
      }
    }

    // 2. Fallback Web / PWA
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
      } catch {}
    }

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          callback({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
            bearing: pos.coords.heading,
            altitude: pos.coords.altitude,
            time: pos.timestamp,
          });
        },
        (err) => console.warn('[WebGeo] Posição inicial:', err.message),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );

      this.webWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          callback({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
            bearing: pos.coords.heading,
            altitude: pos.coords.altitude,
            time: pos.timestamp,
          });
        },
        (err) => console.warn('[WebGeo] Watch error:', err.message),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
      );
    }
  }

  /**
   * Encerra o serviço nativo de segundo plano e libera a CPU
   */
  public async stop(): Promise<void> {
    this.isRunning = false;

    if (this.watcherId) {
      try {
        await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
        console.log('[NativeGeo] Serviço nativo de geolocalização encerrado.');
      } catch (err) {
        console.warn('[NativeGeo] Erro ao remover watcher nativo:', err);
      }
      this.watcherId = null;
    }

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
