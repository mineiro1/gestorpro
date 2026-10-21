import React, { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function EmployeeLocationTracker() {
  const { userProfile, isAdmin } = useAuth();

  useEffect(() => {
    // Only track if user profile is ready
    if (!userProfile?.uid) return;

    let watchId: number;

    let lastSentTime = 0;

    const sendLocation = async (coords: GeolocationCoordinates) => {
      const now = Date.now();
      if (now - lastSentTime < 45000) return; // Envia no máximo a cada 45 segundos
      lastSentTime = now;

      if (!navigator.onLine) return; // Não tenta salvar se offline

      try {
        await supabase.from('users').update({
          last_location: {
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
          },
          location_updated_at: new Date().toISOString(),
        }).eq('id', userProfile.uid);
      } catch (error) {
        // Silently ignore
      }
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          sendLocation(position.coords);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
      );

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          sendLocation(position.coords);
        },
        (error) => {
          console.warn('Geolocation watch notice:', error?.message);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 30000,
          timeout: 20000,
        }
      );
    }

    return () => {
      if (watchId !== undefined && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [isAdmin, userProfile?.uid]);

  return null;
}
