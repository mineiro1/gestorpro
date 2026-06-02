import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin } from 'lucide-react';

// Fix Leaflet's default icon path issues
delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface EmployeeLocation {
  id: string;
  name: string;
  email: string;
  role?: string;
  lastLocation?: {
    lat: number;
    lng: number;
  };
  locationUpdatedAt?: any; // Timestamp
}

export default function EmployeeMap({ 
  clients = [], 
  highlightedClientId = null 
}: { 
  clients?: Array<any>; 
  highlightedClientId?: string | null; 
} = {}) {
  const { userProfile, isAdmin, isManager } = useAuth();
  const [employees, setEmployees] = useState<EmployeeLocation[]>([]);
  const [map, setMap] = useState<L.Map | null>(null);

  useEffect(() => {
    if (!userProfile?.uid || (!isAdmin && !isManager)) return;

    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
    
    // We fetch all users belonging to this admin, plus the admin themselves
    const fetchEmployees = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`admin_id.eq.${adminId},id.eq.${adminId}`);
        
      if (error) {
        console.error('Error fetching users:', error);
        return;
      }
      
      const emps = data.map((doc: any) => {
        let lat: number | null = null;
        let lng: number | null = null;
        
        if (doc.last_location) {
           if (typeof doc.last_location === 'object' && doc.last_location !== null) {
              lat = parseFloat(doc.last_location.lat);
              lng = parseFloat(doc.last_location.lng);
           } else if (typeof doc.last_location === 'string') {
              try {
                 const parsed = JSON.parse(doc.last_location);
                 if (parsed && parsed.lat) {
                    lat = parseFloat(parsed.lat);
                    lng = parseFloat(parsed.lng);
                 } else {
                    const parts = doc.last_location.split(',');
                    if (parts.length >= 2) {
                       lat = parseFloat(parts[0]);
                       lng = parseFloat(parts[1]);
                    }
                 }
              } catch(e) {
                 const parts = doc.last_location.split(',');
                 if (parts.length >= 2) {
                    lat = parseFloat(parts[0]);
                    lng = parseFloat(parts[1]);
                 }
              }
           }
        }
        
        return {
          id: doc.id,
          name: doc.name,
          email: doc.email,
          role: doc.role,
          lastLocation: (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) ? { lat, lng } : undefined,
          locationUpdatedAt: doc.location_updated_at,
        };
      });
      setEmployees(emps);
    }
    
    let fallbackInterval: any;

    fetchEmployees();

    // Set up realtime subscription
    const channel = supabase
      .channel('users_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        (payload: any) => {
          // Verify if it's relevant to our session
          if (payload.new && (payload.new.admin_id === adminId || payload.new.id === adminId)) {
            fetchEmployees();
          }
        }
      )
      .subscribe();

    // Fallback polling every 5 minutes just in case realtime isn't enabled on the table
    fallbackInterval = setInterval(() => {
        fetchEmployees();
    }, 300000);

    return () => {
      supabase.removeChannel(channel);
      if (fallbackInterval) {
         clearInterval(fallbackInterval);
      }
    };
  }, [userProfile, isAdmin, isManager]);

  useEffect(() => {
    if (map && highlightedClientId) {
      const highlightedClient = clients.find(c => c.id === highlightedClientId);
      if (highlightedClient && highlightedClient.lat && highlightedClient.lng) {
        map.flyTo([highlightedClient.lat, highlightedClient.lng], 15, { duration: 1.5 });
      }
    }
  }, [highlightedClientId, map, clients]);

  if (!isAdmin && !isManager) return null;

  const activeEmployees = employees.filter(e => e.lastLocation);
  
  // Clients with lat/lng
  const activeClients = clients.filter(c => c.lat && c.lng);

  // Default center: Brazil
  const defaultCenter = { lat: -14.235, lng: -51.925 };
  
  // Calculate bounds to fit all active employees if there are any
  const mapCenter = activeEmployees.length > 0 
    ? activeEmployees[0].lastLocation! 
    : (activeClients.length > 0 ? { lat: activeClients[0].lat, lng: activeClients[0].lng } : defaultCenter);

  const zoom = (activeEmployees.length > 0 || activeClients.length > 0) ? 10 : 4;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 mt-8">
      <div className="flex items-center mb-4">
        <MapPin className="text-primary mr-2" size={24} />
        <h2 className="text-xl font-bold text-gray-800">Localização dos Colaboradores</h2>
      </div>
      
      {activeEmployees.length === 0 && activeClients.length === 0 ? (
        <div className="bg-gray-50 border border-gray-100 rounded-lg p-8 text-center text-gray-500">
          Nenhum dado com localização para exibir no mapa.
        </div>
      ) : (
        <div className="h-[400px] w-full rounded-lg overflow-hidden border border-gray-200">
          <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={zoom} style={{ height: '100%', width: '100%' }} ref={setMap}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {activeEmployees.map(emp => (
              <Marker key={`emp-${emp.id}`} position={[emp.lastLocation!.lat, emp.lastLocation!.lng]}>
                <Popup>
                  <div className="font-semibold text-gray-800">
                    {emp.name} 
                    <span className="text-xs ml-1 bg-blue-100 text-blue-800 px-1 rounded">
                      {emp.role === 'admin' ? 'Administrador' : emp.role === 'manager' ? 'Gestor' : 'Colaborador'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">{emp.email}</div>
                  <div className="text-xs text-blue-500 mt-1">
                    Última att: {emp.locationUpdatedAt ? new Date(emp.locationUpdatedAt).toLocaleString('pt-BR') : 'Desconhecida'}
                  </div>
                </Popup>
              </Marker>
            ))}
            {activeClients.map(client => (
              <Marker 
                key={`client-${client.id}`} 
                position={[client.lat, client.lng]}
                icon={
                  highlightedClientId === client.id 
                    ? L.divIcon({
                        className: 'custom-highlight-marker',
                        html: `
                          <div class="relative flex items-center justify-center w-8 h-8">
                            <div class="absolute inline-flex w-full h-full rounded-full bg-purple-500 opacity-75 animate-ping"></div>
                            <div class="relative inline-flex rounded-full w-4 h-4 bg-purple-600"></div>
                          </div>
                        `,
                        iconSize: [32, 32],
                        iconAnchor: [16, 16],
                        popupAnchor: [0, -16]
                      })
                    : L.icon({
                        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41],
                        className: 'hue-rotate-180'
                      })
                }
              >
                <Popup>
                  <div className="font-semibold text-gray-800">{client.name} <span className="text-xs ml-1 bg-green-100 text-green-800 px-1 rounded">Cliente</span></div>
                  <div className="text-sm text-gray-500">{client.address}</div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
