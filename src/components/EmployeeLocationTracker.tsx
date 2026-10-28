import React, { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { RealtimeChannel } from '@supabase/supabase-js';
import { 
  startForegroundTrackingNotification, 
  stopForegroundTrackingNotification 
} from '../lib/pushNotifications';

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

export default function EmployeeLocationTracker() {
  const { userProfile, isAdmin } = useAuth();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastDbPersistTimeRef = useRef<number>(0);
  const lastCoordsRef = useRef<GeolocationCoordinates | null>(null);

  useEffect(() => {
    // Apenas colaboradores e gestores transmitem sua frota (e admin caso queira testar a telemetria)
    if (!userProfile?.uid) return;
    if (userProfile.role === 'client') return;

    // Determina o canal exclusivo da empresa com base no adminId
    const companyAdminId = isAdmin ? userProfile.uid : (userProfile.adminId || userProfile.uid);
    const channelName = `fleet_tracking_${companyAdminId}`;

    // Ativa a notificação persistente no Android: "RS Piscinas - Sistema em execução."
    startForegroundTrackingNotification().catch((err) => {
      console.warn('[EmployeeLocationTracker] Falha ao iniciar notificação em segundo plano:', err);
    });

    // 1. Inicializa o canal WebSocket de Presença
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: userProfile.uid,
        },
      },
    });

    channelRef.current = channel;

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[FleetTracker] Conectado ao canal WebSocket de frota: ${channelName}`);
        // Se já tivermos uma coordenada capturada, sincroniza imediatamente
        if (lastCoordsRef.current) {
          await transmitPresence(lastCoordsRef.current);
        }
      }
    });

    let watchId: number;

    const transmitPresence = async (coords: GeolocationCoordinates) => {
      if (!channelRef.current) return;
      lastCoordsRef.current = coords;

      const activeClientName = localStorage.getItem('active_visit_client_name') || null;
      const speedKmH = coords.speed !== null && coords.speed > 0 
        ? Math.round(coords.speed * 3.6) 
        : 0;

      const telemetry: TechnicianTelemetry = {
        userId: userProfile.uid,
        name: userProfile.name || 'Técnico',
        email: userProfile.email || '',
        role: userProfile.role || 'employee',
        lat: coords.latitude,
        lng: coords.longitude,
        speedKmH: speedKmH,
        heading: coords.heading,
        accuracy: coords.accuracy,
        status: activeClientName ? 'em_atendimento' : 'deslocamento',
        currentClientName: activeClientName,
        updatedAt: new Date().toISOString(),
      };

      // A) Transmissão em memória RAM via WebSocket (Custo 0 de banco)
      try {
        await channelRef.current.track(telemetry);
      } catch (err) {
        console.warn('[FleetTracker] Falha ao sincronizar presença no WebSocket:', err);
      }

      // B) Checkpoint Persistente no Banco de Dados a cada 10 minutos (600.000 ms)
      const now = Date.now();
      if (now - lastDbPersistTimeRef.current >= 600000 && navigator.onLine) {
        lastDbPersistTimeRef.current = now;
        try {
          await supabase.from('users').update({
            last_location: {
              lat: coords.latitude,
              lng: coords.longitude,
              accuracy: coords.accuracy,
            },
            location_updated_at: new Date().toISOString(),
          }).eq('id', userProfile.uid);
        } catch (dbErr) {
          // Ignora falha do checkpoint secundário
        }
      }
    };

    // Ouvinte para mudanças de atendimento em tempo real
    const handleActiveVisitChange = () => {
      if (lastCoordsRef.current) {
        transmitPresence(lastCoordsRef.current);
      }
    };
    window.addEventListener('active_visit_change', handleActiveVisitChange);
    window.addEventListener('storage', handleActiveVisitChange);

    // 2. Inicia o monitoramento de GPS de alta precisão
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => transmitPresence(pos.coords),
        (err) => console.warn('[FleetTracker] Posição inicial indisponível:', err?.message),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );

      watchId = navigator.geolocation.watchPosition(
        (pos) => transmitPresence(pos.coords),
        (err) => console.warn('[FleetTracker] Erro ao rastrear GPS contínuo:', err?.message),
        {
          enableHighAccuracy: true,
          maximumAge: 10000,
          timeout: 20000,
        }
      );
    }

    // 3. Limpeza ao desmontar
    return () => {
      window.removeEventListener('active_visit_change', handleActiveVisitChange);
      window.removeEventListener('storage', handleActiveVisitChange);

      if (watchId !== undefined && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userProfile?.uid, userProfile?.adminId, userProfile?.role, isAdmin]);

  return null;
}
