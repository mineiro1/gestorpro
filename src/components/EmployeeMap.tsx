import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
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
  lastLocation?: {
    lat: number;
    lng: number;
  };
  locationUpdatedAt?: any; // Timestamp
}

export default function EmployeeMap() {
  const { userProfile, isAdmin, isManager } = useAuth();
  const [employees, setEmployees] = useState<EmployeeLocation[]>([]);

  useEffect(() => {
    if (!userProfile?.uid || (!isAdmin && !isManager)) return;

    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
    
    // We fetch all users belonging to this admin
    const q = query(
      collection(db, 'users'),
      where('adminId', '==', adminId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const emps: EmployeeLocation[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.role === 'employee' || data.role === 'manager') {
          emps.push({
            id: doc.id,
            name: data.name,
            email: data.email,
            lastLocation: data.lastLocation,
            locationUpdatedAt: data.locationUpdatedAt,
          });
        }
      });
      setEmployees(emps);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    return () => unsubscribe();
  }, [userProfile, isAdmin, isManager]);

  if (!isAdmin && !isManager) return null;

  const activeEmployees = employees.filter(e => e.lastLocation);

  // Default center: Brazil
  const defaultCenter = { lat: -14.235, lng: -51.925 };
  
  // Calculate bounds to fit all active employees if there are any
  const mapCenter = activeEmployees.length > 0 
    ? activeEmployees[0].lastLocation! 
    : defaultCenter;

  const zoom = activeEmployees.length > 0 ? 10 : 4;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 mt-8">
      <div className="flex items-center mb-4">
        <MapPin className="text-primary mr-2" size={24} />
        <h2 className="text-xl font-bold text-gray-800">Localização dos Colaboradores</h2>
      </div>
      
      {activeEmployees.length === 0 ? (
        <div className="bg-gray-50 border border-gray-100 rounded-lg p-8 text-center text-gray-500">
          Nenhum colaborador com localização ativa no momento.
        </div>
      ) : (
        <div className="h-[400px] w-full rounded-lg overflow-hidden border border-gray-200">
          <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={zoom} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {activeEmployees.map(emp => (
              <Marker key={emp.id} position={[emp.lastLocation!.lat, emp.lastLocation!.lng]}>
                <Popup>
                  <div className="font-semibold text-gray-800">{emp.name}</div>
                  <div className="text-sm text-gray-500">{emp.email}</div>
                  <div className="text-xs text-blue-500 mt-1">
                    Última att: {emp.locationUpdatedAt ? new Date(emp.locationUpdatedAt.toDate()).toLocaleString('pt-BR') : 'Desconhecida'}
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
