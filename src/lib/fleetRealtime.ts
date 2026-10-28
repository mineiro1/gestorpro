import { supabase } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface TechnicianTelemetry {
  userId: string;
  name: string;
  email: string;
  role: string;
  lat: number;
  lng: number;
  speedKmH: number;
  heading: number | null;
  accuracy: number;
  status: 'deslocamento' | 'em_atendimento' | 'pausado';
  currentClientName: string | null;
  updatedAt: string;
}

type PresenceListener = (technicians: Record<string, TechnicianTelemetry>) => void;

class FleetRealtimeService {
  private channel: RealtimeChannel | null = null;
  private currentAdminId: string | null = null;
  private listeners: Set<PresenceListener> = new Set();
  private isSubscribed: boolean = false;
  private latestTelemetry: TechnicianTelemetry | null = null;
  private currentPresenceState: Record<string, TechnicianTelemetry> = {};
  private activeSubscribersCount: number = 0;

  /**
   * Inicializa o canal singleton para a empresa.
   * Garante que os callbacks de presença (.on) sejam SEMPRE registrados ANTES de .subscribe(),
   * evitando a exceção "cannot add presence callbacks after subscribe()".
   */
  public initChannel(companyAdminId: string, userKey?: string): RealtimeChannel {
    if (this.channel && this.currentAdminId === companyAdminId) {
      return this.channel;
    }

    // Se já havia um canal ativo para outro admin ou estado anterior, limpa antes
    if (this.channel) {
      this.forceCleanup();
    }

    this.currentAdminId = companyAdminId;
    const channelName = `fleet_tracking_${companyAdminId}`;

    // Remove qualquer canal prévio com esse mesmo tópico registrado na instância do Supabase
    try {
      const existingChannels = supabase.getChannels();
      const existing = existingChannels.find((c) => c.topic === `realtime:${channelName}`);
      if (existing) {
        supabase.removeChannel(existing);
      }
    } catch (e) {
      console.warn('[FleetRealtime] Aviso ao inspecionar canais existentes:', e);
    }

    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: userKey || 'fleet_viewer',
        },
      },
    });

    // CRUCIAL: Todos os callbacks .on('presence') DEVEM ser anexados ANTES de .subscribe()
    channel
      .on('presence', { event: 'sync' }, () => {
        try {
          const state = channel.presenceState();
          const activeMap: Record<string, TechnicianTelemetry> = {};

          Object.keys(state).forEach((key) => {
            const presences = state[key] as unknown as TechnicianTelemetry[];
            if (presences && presences.length > 0) {
              activeMap[key] = presences[presences.length - 1];
            }
          });

          this.currentPresenceState = activeMap;
          this.notifyListeners();
        } catch (err) {
          console.error('[FleetRealtime] Erro ao sincronizar estado de presença:', err);
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        try {
          delete this.currentPresenceState[key];
          this.notifyListeners();
        } catch (err) {
          console.error('[FleetRealtime] Erro ao processar evento leave de presença:', err);
        }
      });

    // Agora sim executa o subscribe no canal configurado
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        this.isSubscribed = true;
        console.log(`[FleetRealtime] Canal conectado com sucesso: ${channelName}`);
        
        // Transmite a telemetria pendente, se houver
        if (this.latestTelemetry) {
          try {
            await channel.track(this.latestTelemetry);
          } catch (trackErr) {
            console.warn('[FleetRealtime] Falha ao enviar telemetria após subscribe:', trackErr);
          }
        }
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        this.isSubscribed = false;
      }
    });

    this.channel = channel;
    return channel;
  }

  /**
   * Assina atualizações do estado da frota
   */
  public subscribeListener(listener: PresenceListener): () => void {
    this.listeners.add(listener);
    this.activeSubscribersCount++;

    // Fornece imediatamente os dados atuais em cache se já existirem
    if (Object.keys(this.currentPresenceState).length > 0) {
      try {
        listener(this.currentPresenceState);
      } catch (err) {
        console.error('[FleetRealtime] Falha ao despachar estado inicial:', err);
      }
    }

    return () => {
      this.listeners.delete(listener);
      this.activeSubscribersCount = Math.max(0, this.activeSubscribersCount - 1);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentPresenceState);
      } catch (err) {
        console.error('[FleetRealtime] Falha ao notificar listener de presença:', err);
      }
    });
  }

  /**
   * Envia a telemetria do técnico via WebSocket Presence
   */
  public async track(companyAdminId: string, telemetry: TechnicianTelemetry): Promise<void> {
    this.latestTelemetry = telemetry;

    if (!this.channel || this.currentAdminId !== companyAdminId) {
      this.initChannel(companyAdminId, telemetry.userId);
    }

    if (this.channel && this.isSubscribed) {
      try {
        await this.channel.track(telemetry);
      } catch (err) {
        console.warn('[FleetRealtime] Falha ao atualizar presença:', err);
      }
    }
  }

  public getPresenceState(): Record<string, TechnicianTelemetry> {
    return this.currentPresenceState;
  }

  private forceCleanup() {
    if (this.channel) {
      try {
        this.channel.untrack();
      } catch {}
      try {
        supabase.removeChannel(this.channel);
      } catch {}
      this.channel = null;
    }
    this.isSubscribed = false;
    this.currentPresenceState = {};
    this.currentAdminId = null;
  }

  public releaseSubscription() {
    this.activeSubscribersCount = Math.max(0, this.activeSubscribersCount - 1);
    // Se não há mais ninguém visualizando ou transmitindo, limpa
    if (this.activeSubscribersCount === 0 && !this.latestTelemetry) {
      this.forceCleanup();
    }
  }
}

export const fleetRealtimeService = new FleetRealtimeService();
