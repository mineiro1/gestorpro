import React, { useEffect } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export default function EmployeeLocationTracker() {
  const { userProfile, isAdmin } = useAuth();

  useEffect(() => {
    // Only track employees and if user profile is ready
    if (isAdmin || !userProfile?.uid) return;

    let watchId: number;
    let lastUpdateTime = 0;

    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        async (position) => {
          const now = Date.now();
          // Update at most once every 2 minutes (120000 ms) to save quota
          if (now - lastUpdateTime > 120000) {
            try {
              await updateDoc(doc(db, 'users', userProfile.uid), {
                lastLocation: {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                  accuracy: position.coords.accuracy,
                },
                lastLocationAt: serverTimestamp(),
              });
              lastUpdateTime = now;
            } catch (error) {
              console.error('Error updating location:', error);
            }
          }
        },
        (error) => {
          console.error('Error getting location:', error);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 60000,
          timeout: 27000,
        }
      );
    }

    return () => {
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [isAdmin, userProfile?.uid]);

  return null;
}
