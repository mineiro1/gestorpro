import React, { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { fleetRealtimeService, TechnicianTelemetry } from '../lib/fleetRealtime';
import { 
  nativeBackgroundGeolocation, 
  GeoPoint 
} from '../lib/backgroundGeolocationService';

export { type TechnicianTelemetry } from '../lib/fleetRealtime';

export default function EmployeeLocationTracker() {
  const { userProfile, isAdmin } = useAuth();
  const lastDbPersistTimeRef = useRef<number>(0);
  const lastCoordsRef = useRef<GeoPoint | null>(null);

  useEffect(() => {
    // Apenas colaboradores e gestores transmitem sua frota (e admin caso queira testar a telemetria)
    if (!userProfile?.uid) return;
    if (userProfile.role === 'client') return;

    // Determina o ID do administrador da conta
    const companyAdminId = isAdmin ? userProfile.uid : (userProfile.adminId || userProfile.uid);

    const transmitPresence = async (point: GeoPoint) => {
      lastCoordsRef.current = point;

      const activeClientName = localStorage.getItem('active_visit_client_name') || null;
      const speedKmH = point.speed !== null && point.speed > 0 
        ? Math.round(point.speed * 3.6) 
        : 0;

      const telemetry: TechnicianTelemetry = {
        userId: userProfile.uid,
        name: userProfile.name || 'Técnico',
        email: userProfile.email || '',
        role: userProfile.role || 'employee',
        lat: point.latitude,
        lng: point.longitude,
        speedKmH: speedKmH,
        heading: point.bearing,
        accuracy: point.accuracy,
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
              lat: point.latitude,
              lng: point.longitude,
              accuracy: point.accuracy,
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

    // Inicia o serviço nativo com Foreground Service e notificação fixa no Android
    nativeBackgroundGeolocation.start((point) => {
      transmitPresence(point);
    }).catch((err) => {
      console.warn('[EmployeeLocationTracker] Falha ao inicializar rastreamento nativo:', err);
    });

    // Limpeza ao desmontar
    return () => {
      window.removeEventListener('active_visit_change', handleActiveVisitChange);
      window.removeEventListener('storage', handleActiveVisitChange);

      nativeBackgroundGeolocation.stop().catch((err) => {
        console.warn('[EmployeeLocationTracker] Falha ao encerrar rastreador nativo:', err);
      });
    };
  }, [userProfile?.uid, userProfile?.adminId, userProfile?.role, userProfile?.name, userProfile?.email, isAdmin]);

  return null;
}
