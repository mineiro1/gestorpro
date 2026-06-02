import React, { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function EmployeeLocationTracker() {
  const { userProfile, isAdmin } = useAuth();

  useEffect(() => {
    // Only track if user profile is ready
    if (!userProfile?.uid) return;

    let watchId: number;

    if ('geolocation' in navigator) {
      // First, let's get the current position manually once to ensure fast first load
      navigator.geolocation.getCurrentPosition(
        async (position) => {
             try {
               await supabase.from('users').update({
                 last_location: {
                   lat: position.coords.latitude,
                   lng: position.coords.longitude,
                   accuracy: position.coords.accuracy,
                 },
                 location_updated_at: new Date().toISOString(),
               }).eq('id', userProfile.uid);
             } catch (error) {}
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );

      watchId = navigator.geolocation.watchPosition(
        async (position) => {
          try {
            const { error } = await supabase.from('users').update({
              last_location: {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy,
              },
              location_updated_at: new Date().toISOString(),
            }).eq('id', userProfile.uid);
            
            if (error) {
              console.error('Error updating location in Supabase:', error);
            }
          } catch (error) {
            console.error('Error in location update process:', error);
          }
        },
        (error) => {
          console.error('Error watching location:', error);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 10000,
          timeout: 10000,
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
