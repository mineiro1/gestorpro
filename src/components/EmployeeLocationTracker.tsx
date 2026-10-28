import React, { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { fleetRealtimeService, TechnicianTelemetry } from '../lib/fleetRealtime';
import { 
  startForegroundTrackingNotification, 
  stopForegroundTrackingNotification 
} from '../lib/pushNotifications';

export { type TechnicianTelemetry } from '../lib/fleetRealtime';

export default function EmployeeLocationTracker() {
  const { userProfile, isAdmin } = useAuth();
  const lastDbPersistTimeRef = useRef<number>(0);
  const lastCoordsRef = useRef<GeolocationCoordinates | null>(null);

  useEffect(() => {
    // Apenas colaboradores e gestores transmitem sua frota (e admin caso queira testar a telemetria)
    if (!userProfile?.uid) return;
    if (userProfile.role === 'client') return;

    // Determina o ID do administrador da conta
    const companyAdminId = isAdmin ? userProfile.uid : (userProfile.adminId || userProfile.uid);

    // Ativa a notificação persistente no Android: "RS Piscinas - Sistema em execução."
    startForegroundTrackingNotification().catch((err) => {
      console.warn('[EmployeeLocationTracker] Falha ao iniciar notificação em segundo plano:', err);
    });

    let watchId: number;

    const transmitPresence = async (coords: GeolocationCoordinates) => {
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

      // A) Transmissão em memória RAM via FleetRealtimeService (Custo 0 de banco)
      try {
        await fleetRealtimeService.track(companyAdminId, telemetry);
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

    // Inicia o monitoramento de GPS de alta precisão
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

    // Limpeza ao desmontar
    return () => {
      window.removeEventListener('active_visit_change', handleActiveVisitChange);
      window.removeEventListener('storage', handleActiveVisitChange);

      if (watchId !== undefined && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [userProfile?.uid, userProfile?.adminId, userProfile?.role, userProfile?.name, userProfile?.email, isAdmin]);

  return null;
}
