import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Navigation, Radio, Clock, ShieldCheck } from 'lucide-react';
import { fleetRealtimeService, TechnicianTelemetry } from '../lib/fleetRealtime';

// Correção dos caminhos padrão dos ícones do Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export interface TechnicianMarkerData {
  id: string;
  name: string;
  email: string;
  role: string;
  lat: number;
  lng: number;
  speedKmH: number;
  heading: number | null;
  status: 'deslocamento' | 'em_atendimento' | 'offline';
  currentClientName: string | null;
  updatedAt: string;
  isLive: boolean;
}

export default function EmployeeMap({ 
  clients = [], 
  highlightedClientId = null 
}: { 
  clients?: Array<any>; 
  highlightedClientId?: string | null; 
} = {}) {
  const { userProfile, isAdmin, isManager } = useAuth();
  const [liveTechnicians, setLiveTechnicians] = useState<Record<string, TechnicianTelemetry>>({});
  const [offlineEmployees, setOfflineEmployees] = useState<TechnicianMarkerData[]>([]);
  const [map, setMap] = useState<L.Map | null>(null);

  const companyAdminId = isAdmin ? userProfile?.uid : (userProfile?.adminId || userProfile?.uid);

  // 1. Carrega o estado histórico do banco de dados para técnicos que estiverem offline
  useEffect(() => {
    if (!companyAdminId || (!isAdmin && !isManager)) return;

    const fetchHistoricalUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, email, role, last_location, location_updated_at')
          .or(`admin_id.eq.${companyAdminId},id.eq.${companyAdminId}`);

        if (error || !data) return;

        const fallbackList: TechnicianMarkerData[] = [];

        data.forEach((u: any) => {
          let lat: number | null = null;
          let lng: number | null = null;

          if (u.last_location) {
            if (typeof u.last_location === 'object' && u.last_location !== null) {
              lat = parseFloat(u.last_location.lat);
              lng = parseFloat(u.last_location.lng);
            } else if (typeof u.last_location === 'string') {
              try {
                const parsed = JSON.parse(u.last_location);
                lat = parseFloat(parsed.lat);
                lng = parseFloat(parsed.lng);
              } catch {
                const parts = u.last_location.split(',');
                if (parts.length >= 2) {
                  lat = parseFloat(parts[0]);
                  lng = parseFloat(parts[1]);
                }
              }
            }
          }

          if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
            fallbackList.push({
              id: u.id,
              name: u.name || 'Colaborador',
              email: u.email || '',
              role: u.role || 'employee',
              lat,
              lng,
              speedKmH: 0,
              heading: null,
              status: 'offline',
              currentClientName: null,
              updatedAt: u.location_updated_at || '',
              isLive: false,
            });
          }
        });

        setOfflineEmployees(fallbackList);
      } catch (err) {
        console.warn('[EmployeeMap] Erro ao carregar posições históricas:', err);
      }
    };

    fetchHistoricalUsers();
  }, [companyAdminId, isAdmin, isManager]);

  // 2. Assinatura do Canal Realtime Presence (Ao Vivo via FleetRealtimeService)
  useEffect(() => {
    if (!companyAdminId || (!isAdmin && !isManager)) return;

    // Inicializa o canal singleton de forma segura com callbacks registrados antes do subscribe
    fleetRealtimeService.initChannel(companyAdminId, userProfile?.uid);

    // Registra o ouvinte para sincronizações de presença em tempo real
    const unsubscribe = fleetRealtimeService.subscribeListener((activeMap) => {
      setLiveTechnicians({ ...activeMap });
    });

    return () => {
      unsubscribe();
      fleetRealtimeService.releaseSubscription();
    };
  }, [companyAdminId, isAdmin, isManager, userProfile?.uid]);

  // 3. Mescla técnicos ao vivo (Presence) com os que estão offline (Banco de dados)
  const combinedTechnicians = useMemo(() => {
    const list: TechnicianMarkerData[] = [];
    const liveUserIds = new Set<string>();

    // Primeiro, adiciona todos que estão com WebSocket conectado em tempo real
    Object.values(liveTechnicians).forEach((tel) => {
      liveUserIds.add(tel.userId);
      list.push({
        id: tel.userId,
        name: tel.name,
        email: tel.email,
        role: tel.role,
        lat: tel.lat,
        lng: tel.lng,
        speedKmH: tel.speedKmH,
        heading: tel.heading,
        status: tel.status === 'em_atendimento' ? 'em_atendimento' : 'deslocamento',
        currentClientName: tel.currentClientName,
        updatedAt: tel.updatedAt,
        isLive: true,
      });
    });

    // Em seguida, adiciona quem está offline caso tenha registro histórico salvo
    offlineEmployees.forEach((emp) => {
      if (!liveUserIds.has(emp.id)) {
        list.push(emp);
      }
    });

    return list;
  }, [liveTechnicians, offlineEmployees]);

  // 4. Centraliza no cliente quando solicitado
  useEffect(() => {
    if (map && highlightedClientId) {
      const client = clients.find((c) => c.id === highlightedClientId);
      if (client && client.lat && client.lng) {
        map.flyTo([client.lat, client.lng], 16, { duration: 1.2 });
      }
    }
  }, [highlightedClientId, map, clients]);

  // Extrai coordenadas do cliente suportando múltiplos formatos (lat/lng, latitude/longitude, location string/json)
  const parseClientCoords = (client: any): { lat: number; lng: number } | null => {
    if (!client) return null;
    if (client.lat && client.lng && !isNaN(Number(client.lat)) && !isNaN(Number(client.lng))) {
      return { lat: Number(client.lat), lng: Number(client.lng) };
    }
    if (client.latitude && client.longitude && !isNaN(Number(client.latitude)) && !isNaN(Number(client.longitude))) {
      return { lat: Number(client.latitude), lng: Number(client.longitude) };
    }
    if (client.location) {
      if (typeof client.location === 'object' && client.location.lat && client.location.lng) {
        const lat = parseFloat(client.location.lat);
        const lng = parseFloat(client.location.lng);
        if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
      } else if (typeof client.location === 'string') {
        try {
          const parsed = JSON.parse(client.location);
          if (parsed && parsed.lat && parsed.lng) {
            const lat = parseFloat(parsed.lat);
            const lng = parseFloat(parsed.lng);
            if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
          }
        } catch {
          const parts = client.location.split(',');
          if (parts.length >= 2) {
            const lat = parseFloat(parts[0]);
            const lng = parseFloat(parts[1]);
            if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
          }
        }
      }
    }
    return null;
  };

  const activeClients = useMemo(() => {
    return clients
      .map((c) => {
        const coords = parseClientCoords(c);
        return coords ? { ...c, lat: coords.lat, lng: coords.lng } : null;
      })
      .filter(Boolean) as Array<any>;
  }, [clients]);

  const defaultCenter = { lat: -20.4697, lng: -54.6201 }; // Campo Grande - MS

  const mapCenter = combinedTechnicians.length > 0
    ? { lat: combinedTechnicians[0].lat, lng: combinedTechnicians[0].lng }
    : (activeClients.length > 0 ? { lat: activeClients[0].lat, lng: activeClients[0].lng } : defaultCenter);

  // Criador de ícone dinâmico baseado no status ao vivo do técnico
  const createTechnicianIcon = (tech: TechnicianMarkerData) => {
    if (tech.isLive) {
      const isWorking = tech.status === 'em_atendimento';
      const bgColor = isWorking ? 'bg-amber-500' : 'bg-emerald-500';
      const pingColor = isWorking ? 'bg-amber-400' : 'bg-emerald-400';

      return L.divIcon({
        className: 'custom-tech-marker',
        html: `
          <div class="relative flex items-center justify-center w-10 h-10">
            <div class="absolute inline-flex w-full h-full rounded-full ${pingColor} opacity-75 animate-ping"></div>
            <div class="relative inline-flex items-center justify-center w-8 h-8 rounded-full ${bgColor} text-white shadow-lg border-2 border-white font-bold text-xs">
              ${isWorking ? '🏊' : '🚗'}
            </div>
            ${tech.speedKmH > 5 ? `
              <div class="absolute -bottom-2 bg-slate-900 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold shadow">
                ${tech.speedKmH}km/h
              </div>
            ` : ''}
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20],
      });
    }

    // Ícone para técnico offline
    return L.divIcon({
      className: 'custom-tech-offline',
      html: `
        <div class="relative flex items-center justify-center w-7 h-7 rounded-full bg-slate-400 text-white shadow border-2 border-white text-xs opacity-75">
          👤
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14],
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mt-8">
      {/* Cabeçalho de Status com Contador em Tempo Real */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
            <Navigation size={24} className="animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              Rastreamento da Frota em Tempo Real
              <span className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Presence Ativo
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <ShieldCheck size={13} className="text-emerald-600" />
              Notificação do Android ativa: <strong className="text-slate-700">RS Piscinas • Serviço em execução.</strong>
            </p>
          </div>
        </div>

        {/* Indicadores rápidos de contagem */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-200">
            <Radio size={14} className="text-emerald-600 animate-pulse" />
            {Object.keys(liveTechnicians).length} Online agora
          </span>
          <span 
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
              activeClients.length > 0
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
            title="Quantidade de piscinas da rota com coordenadas GPS cadastradas. As piscinas sem GPS ganham coordenadas automaticamente assim que o técnico finaliza a primeira visita."
          >
            📍 {activeClients.length} de {clients.length} piscinas no mapa
          </span>
        </div>
      </div>

      {/* Lista rápida de técnicos para focar com um clique */}
      {combinedTechnicians.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-3 scrollbar-thin">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
            Focar Técnico:
          </span>
          {combinedTechnicians.map((t) => (
            <button
              key={`focus-${t.id}`}
              onClick={() => {
                if (map) {
                  map.flyTo([t.lat, t.lng], 16, { duration: 1.2 });
                }
              }}
              className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                t.isLive
                  ? t.status === 'em_atendimento'
                    ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {t.isLive ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              ) : (
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
              )}
              {t.name}
              {t.isLive && t.speedKmH > 0 && (
                <span className="text-[10px] text-slate-500 font-bold">({t.speedKmH} km/h)</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Container do Mapa */}
      {combinedTechnicians.length === 0 && activeClients.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-500">
          Nenhuma localização de técnico ou cliente encontrada para exibir no mapa.
        </div>
      ) : (
        <div className="h-[460px] w-full rounded-xl overflow-hidden border border-slate-200 shadow-inner">
          <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={11} style={{ height: '100%', width: '100%' }} ref={setMap}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Marcadores dos Técnicos */}
            {combinedTechnicians.map((tech) => (
              <Marker key={`tech-${tech.id}`} position={[tech.lat, tech.lng]} icon={createTechnicianIcon(tech)}>
                <Popup>
                  <div className="p-1 min-w-[200px]">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                      <span className="font-bold text-slate-800 text-sm">{tech.name}</span>
                      {tech.isLive ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Ao Vivo
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 text-slate-600">
                          Offline
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600">
                      {tech.isLive && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Status:</span>
                            <span className="font-semibold text-slate-700">
                              {tech.status === 'em_atendimento' ? '🏊 Em Atendimento' : '🚗 Em Deslocamento'}
                            </span>
                          </div>
                          {tech.currentClientName && (
                            <div className="bg-blue-50 p-1.5 rounded border border-blue-100">
                              <span className="text-blue-700 text-[10px] font-medium block">Piscina Atual:</span>
                              <span className="font-bold text-blue-900 text-xs block">{tech.currentClientName}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Velocidade:</span>
                            <span className="font-bold text-slate-800">{tech.speedKmH} km/h</span>
                          </div>
                        </>
                      )}

                      <div className="flex items-center gap-1 text-[10px] text-slate-400 pt-1">
                        <Clock size={11} />
                        {tech.updatedAt ? new Date(tech.updatedAt).toLocaleTimeString('pt-BR') : 'Sem registro'}
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Marcadores dos Clientes / Piscinas */}
            {activeClients.map((client) => (
              <Marker
                key={`client-${client.id}`}
                position={[client.lat, client.lng]}
                icon={
                  highlightedClientId === client.id
                    ? L.divIcon({
                        className: 'highlight-client-marker',
                        html: `
                          <div class="relative flex items-center justify-center w-8 h-8">
                            <div class="absolute inline-flex w-full h-full rounded-full bg-blue-500 opacity-75 animate-ping"></div>
                            <div class="relative inline-flex rounded-full w-4 h-4 bg-blue-600 border-2 border-white"></div>
                          </div>
                        `,
                        iconSize: [32, 32],
                        iconAnchor: [16, 16],
                      })
                    : L.icon({
                        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                        iconSize: [20, 32],
                        iconAnchor: [10, 32],
                        popupAnchor: [0, -28],
                        className: 'hue-rotate-180 brightness-90',
                      })
                }
              >
                <Popup>
                  <div className="p-1">
                    <div className="font-bold text-slate-800 text-sm">{client.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{client.address}</div>
                    <div className="mt-2 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded inline-block">
                      Piscina Registrada
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
