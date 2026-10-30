import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { fleetRealtimeService, TechnicianTelemetry } from '../lib/fleetRealtime';
import { 
  nativeBackgroundGeolocation, 
  GeoPoint 
} from '../lib/backgroundGeolocationService';

export { type TechnicianTelemetry } from '../lib/fleetRealtime';

// Cálculo de distância em metros (Haversine) de altíssima performance
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Raio da Terra em metros
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function EmployeeLocationTracker() {
  const { userProfile, isAdmin } = useAuth();
  const [isServiceActive, setIsServiceActive] = useState(false);

  // Armazena referências estáveis para evitar reinicializações desnecessárias do efeito
  const userProfileRef = useRef(userProfile);
  userProfileRef.current = userProfile;
  const isAdminRef = useRef(isAdmin);
  isAdminRef.current = isAdmin;

  const lastCoordsRef = useRef<GeoPoint | null>(null);
  const lastTransmitTimeRef = useRef<number>(0);
  const lastPointRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastDbPersistTimeRef = useRef<number>(0);
  const isTransmittingRef = useRef<boolean>(false);

  useEffect(() => {
    // Apenas colaboradores e gestores transmitem sua frota (e admin caso queira testar a telemetria)
    const currentUid = userProfile?.uid;
    const currentRole = userProfile?.role;
    if (!currentUid || currentRole === 'client') {
      setIsServiceActive(false);
      return;
    }

    let isMounted = true;

    const transmitPresence = async (point: GeoPoint, force = false) => {
      if (isTransmittingRef.current && !force) return;
      lastCoordsRef.current = point;

      const now = Date.now();
      const timeSinceLast = now - lastTransmitTimeRef.current;

      let distanceMoved = 999;
      if (lastPointRef.current) {
        distanceMoved = calculateDistanceMeters(
          lastPointRef.current.lat,
          lastPointRef.current.lng,
          point.latitude,
          point.longitude
        );
      }

      // THROTTLING INTELIGENTE (Zero travamento do navegador):
      // 1. Limite mínimo de 8 segundos entre transmissões WebSocket
      if (!force && timeSinceLast < 8000) {
        return;
      }

      // 2. Se moveu menos de 10 metros, envia no máximo uma vez a cada 30 segundos (heartbeat suave)
      if (!force && distanceMoved < 10 && timeSinceLast < 30000) {
        return;
      }

      lastTransmitTimeRef.current = now;
      lastPointRef.current = { lat: point.latitude, lng: point.longitude };
      isTransmittingRef.current = true;

      try {
        const prof = userProfileRef.current;
        const isAdm = isAdminRef.current;
        const companyAdminId = isAdm ? prof?.uid : (prof?.adminId || prof?.uid);

        if (!companyAdminId || !prof?.uid) {
          isTransmittingRef.current = false;
          return;
        }

        const activeClientName = localStorage.getItem('active_visit_client_name') || null;
        const speedKmH = point.speed !== null && point.speed > 0 
          ? Math.round(point.speed * 3.6) 
          : 0;

        const telemetry: TechnicianTelemetry = {
          userId: prof.uid,
          name: prof.name || 'Técnico',
          email: prof.email || '',
          role: prof.role || 'employee',
          lat: point.latitude,
          lng: point.longitude,
          speedKmH: speedKmH,
          heading: point.bearing,
          accuracy: point.accuracy,
          status: activeClientName ? 'em_atendimento' : 'deslocamento',
          currentClientName: activeClientName,
          updatedAt: new Date().toISOString(),
        };

        // A) Transmissão em memória via Realtime WebSocket
        await fleetRealtimeService.track(companyAdminId, telemetry);

        // B) Checkpoint no banco a cada 10 minutos (600.000 ms)
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
            }).eq('id', prof.uid);
          } catch {}
        }
      } catch (err) {
        console.warn('[FleetTracker] Falha ao sincronizar presença no WebSocket:', err);
      } finally {
        isTransmittingRef.current = false;
      }
    };

    // Ouvinte para mudanças de atendimento em tempo real
    const handleActiveVisitChange = () => {
      if (lastCoordsRef.current) {
        transmitPresence(lastCoordsRef.current, true);
      }
    };
    window.addEventListener('active_visit_change', handleActiveVisitChange);
    window.addEventListener('storage', handleActiveVisitChange);

    // Inicia o serviço com Foreground Service nativo e notificação contínua
    nativeBackgroundGeolocation.start((point) => {
      if (isMounted) {
        setIsServiceActive(true);
        transmitPresence(point);
      }
    }).catch((err) => {
      console.warn('[EmployeeLocationTracker] Falha ao inicializar rastreamento nativo:', err);
    });

    return () => {
      isMounted = false;
      setIsServiceActive(false);
      window.removeEventListener('active_visit_change', handleActiveVisitChange);
      window.removeEventListener('storage', handleActiveVisitChange);

      nativeBackgroundGeolocation.stop().catch((err) => {
        console.warn('[EmployeeLocationTracker] Falha ao encerrar rastreador nativo:', err);
      });
    };
  }, [userProfile?.uid, userProfile?.role]);

  // Exibe a janela flutuante informativa no telefone apenas para colaboradores/técnicos em serviço
  if (!isServiceActive || userProfile?.role === 'client') {
    return null;
  }

  return (
    <div 
      className="fixed bottom-20 left-4 z-40 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md text-white text-[11px] font-semibold px-3 py-1.5 rounded-full shadow-lg border border-slate-700/80 pointer-events-none select-none transition-all duration-300 animate-in fade-in"
      title="Rastreamento em segundo plano ativo"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <span className="text-slate-200 tracking-wide">Serviço em execução</span>
    </div>
  );
}
