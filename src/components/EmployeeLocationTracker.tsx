import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { fleetRealtimeService, TechnicianTelemetry } from '../lib/fleetRealtime';
import { 
  nativeBackgroundGeolocation, 
  GeoPoint 
} from '../lib/backgroundGeolocationService';
import { Capacitor } from '@capacitor/core';
import { 
  Navigation, 
  ExternalLink, 
  ShieldCheck, 
  ChevronUp, 
  ChevronDown, 
  Radio, 
  Smartphone,
  CheckCircle2
} from 'lucide-react';

export { type TechnicianTelemetry } from '../lib/fleetRealtime';

export default function EmployeeLocationTracker() {
  const { userProfile, isAdmin } = useAuth();
  const lastDbPersistTimeRef = useRef<number>(0);
  const lastCoordsRef = useRef<GeoPoint | null>(null);

  const [coords, setCoords] = useState<GeoPoint | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isPipActive, setIsPipActive] = useState<boolean>(false);
  const [isTrackerRunning, setIsTrackerRunning] = useState<boolean>(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('');

  const isNative = Capacitor.isNativePlatform();
  const canUsePip = nativeBackgroundGeolocation.canUseFloatingWindow();

  useEffect(() => {
    // Apenas colaboradores e gestores transmitem sua frota (e admin caso queira testar a telemetria)
    if (!userProfile?.uid) return;
    if (userProfile.role === 'client') return;

    // Determina o ID do administrador da conta
    const companyAdminId = isAdmin ? userProfile.uid : (userProfile.adminId || userProfile.uid);

    const transmitPresence = async (point: GeoPoint) => {
      lastCoordsRef.current = point;
      setCoords(point);
      setLastUpdateTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

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

    // Escuta mudanças de status do serviço (ex: PiP ativado, GPS ativo)
    const unsubStatus = nativeBackgroundGeolocation.onStatusChange((status) => {
      setIsTrackerRunning(status.isRunning);
      setIsPipActive(status.isPipActive);
      if (status.lastPoint) {
        setCoords(status.lastPoint);
      }
    });

    // Inicia o serviço nativo com Foreground Service e notificação fixa no Android
    nativeBackgroundGeolocation.start((point) => {
      transmitPresence(point);
    }).then(() => {
      setIsTrackerRunning(true);
    }).catch((err) => {
      console.warn('[EmployeeLocationTracker] Falha ao inicializar rastreamento nativo:', err);
    });

    // Limpeza ao desmontar
    return () => {
      window.removeEventListener('active_visit_change', handleActiveVisitChange);
      window.removeEventListener('storage', handleActiveVisitChange);
      unsubStatus();

      nativeBackgroundGeolocation.stop().catch((err) => {
        console.warn('[EmployeeLocationTracker] Falha ao encerrar rastreador nativo:', err);
      });
    };
  }, [userProfile?.uid, userProfile?.adminId, userProfile?.role, userProfile?.name, userProfile?.email, isAdmin]);

  if (!userProfile?.uid || userProfile.role === 'client') {
    return null;
  }

  const handleOpenFloatingWindow = async () => {
    if (isNative) {
      await nativeBackgroundGeolocation.openSettings();
    } else {
      await nativeBackgroundGeolocation.requestFloatingWindow();
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 select-none">
      {/* Janela Flutuante Expandida */}
      {isExpanded ? (
        <div className="bg-slate-900/95 backdrop-blur-md text-white border border-sky-500/40 rounded-2xl shadow-2xl p-4 w-72 sm:w-80 transition-all animate-in fade-in slide-in-from-bottom-2">
          {/* Header do Card */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div>
                <h4 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  RS Piscinas
                </h4>
                <p className="text-[11px] font-semibold text-emerald-400">
                  Serviço em execução
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              title="Recolher janela flutuante"
            >
              <ChevronDown size={18} />
            </button>
          </div>

          {/* Corpo com Informações de Telemetria */}
          <div className="py-3 space-y-2 text-xs">
            <div className="flex items-center justify-between bg-slate-800/60 px-2.5 py-1.5 rounded-lg border border-slate-700/50">
              <span className="text-slate-400">Status do Rastreio:</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 size={13} />
                Ativo em 2º Plano
              </span>
            </div>

            {coords ? (
              <div className="space-y-1 bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Precisão do GPS:</span>
                  <span className="text-sky-300 font-mono">
                    ±{Math.round(coords.accuracy)}m
                  </span>
                </div>
                {coords.speed !== null && coords.speed > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Velocidade:</span>
                    <span className="text-slate-200 font-mono">
                      {Math.round(coords.speed * 3.6)} km/h
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                  <span>Último sinal:</span>
                  <span className="font-mono">{lastUpdateTime || 'Agora'}</span>
                </div>
              </div>
            ) : (
              <div className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-800 text-slate-400 flex items-center gap-2">
                <Radio size={14} className="animate-spin text-sky-400" />
                <span>Buscando sinal de satélite GPS...</span>
              </div>
            )}

            <div className="text-[11px] text-slate-400 bg-sky-950/40 p-2 rounded-lg border border-sky-800/30 flex items-start gap-1.5 leading-relaxed">
              <ShieldCheck size={14} className="text-sky-400 shrink-0 mt-0.5" />
              <span>
                {isNative
                  ? 'Notificação persistente ativa na barra do Android para manter o GPS com tela apagada.'
                  : 'Funciona com tela apagada no celular. Você pode abrir a janela flutuante para garantir que o Android não suspenda.'}
              </span>
            </div>
          </div>

          {/* Botão de Ação: Janela Flutuante / Configurações */}
          <div className="pt-2 border-t border-slate-800">
            {canUsePip && !isNative ? (
              <button
                onClick={handleOpenFloatingWindow}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-medium text-xs shadow-md shadow-sky-500/20 active:scale-95 transition-all"
              >
                <ExternalLink size={14} />
                <span>
                  {isPipActive
                    ? 'Janela Flutuante (PiP) Ativa'
                    : 'Abrir Janela Flutuante (PiP)'}
                </span>
              </button>
            ) : isNative ? (
              <button
                onClick={handleOpenFloatingWindow}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs active:scale-95 transition-all"
              >
                <Smartphone size={14} />
                <span>Configurações do Android</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        /* Chip Flutuante Recolhido */
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-slate-900/90 hover:bg-slate-900 text-white border border-sky-500/40 shadow-xl backdrop-blur-md active:scale-95 transition-all group"
          title="Clique para ver detalhes do rastreamento em segundo plano"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-semibold text-slate-200 group-hover:text-white flex items-center gap-1.5">
            <Navigation size={12} className="text-sky-400" />
            Serviço em execução
          </span>
          <ChevronUp size={14} className="text-slate-400 group-hover:text-slate-200" />
        </button>
      )}
    </div>
  );
}
