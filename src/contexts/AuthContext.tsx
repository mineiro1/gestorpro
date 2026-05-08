import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  role: 'admin' | 'employee' | 'manager' | 'client';
  name: string;
  phone: string;
  email: string;
  adminId: string;
  createdAt: any;
  subscriptionStatus?: 'trial' | 'active' | 'expired';
  subscriptionExpiresAt?: any;
  adminSubscriptionExpired?: boolean;
  customProducts?: { name: string; defaultUnit: string }[];
  whatsappSettings?: {
    reminderDays: number;
    reminderMessage: string;
    delayedMessage: string;
    autoScheduleTime: string;
    useEvolutionApi?: boolean;
    evolutionApiUrl?: string;
    evolutionApiKey?: string;
    evolutionInstanceName?: string;
  };
}

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isEmployee: boolean;
  isManager: boolean;
  isClient: boolean;
  isSubscriptionExpired: boolean;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userProfile: null,
  loading: true,
  isAdmin: false,
  isEmployee: false,
  isManager: false,
  isClient: false,
  isSubscriptionExpired: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeAdmin: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }
      if (unsubscribeAdmin) {
        unsubscribeAdmin();
        unsubscribeAdmin = null;
      }

      if (user) {
        // Fetch user profile
        unsubscribeProfile = onSnapshot(
          doc(db, 'users', user.uid),
          (docSnap) => {
            if (docSnap.exists()) {
              const profileData = { id: docSnap.id, uid: user.uid, ...docSnap.data() } as UserProfile;
              
              if (user.email === 'servincg@gmail.com' && (profileData.name !== 'Renivaldo Servin dos Santos' || profileData.subscriptionStatus !== 'active')) {
                import('firebase/firestore').then(({ setDoc, Timestamp, doc }) => {
                  setDoc(doc(db, 'users', user.uid), {
                    name: 'Renivaldo Servin dos Santos',
                    subscriptionStatus: 'active',
                    subscriptionExpiresAt: Timestamp.fromDate(new Date('2099-12-31'))
                  }, { merge: true }).catch(console.error);
                }).catch(console.error);
              }
              
              if (profileData.role !== 'admin' && profileData.adminId) {
                // Immediately set the profile, keep previous whatsappSettings if we had them
                setUserProfile(prev => ({
                  ...profileData,
                  whatsappSettings: prev?.whatsappSettings
                }));

                if (unsubscribeAdmin) {
                  unsubscribeAdmin();
                }
                unsubscribeAdmin = onSnapshot(
                  doc(db, 'users', profileData.adminId),
                  (adminSnap) => {
                    if (adminSnap.exists()) {
                      const adminData = adminSnap.data();
                      
                      let adminExpired = false;
                      if (adminData.subscriptionExpiresAt) {
                        const expiry = adminData.subscriptionExpiresAt.toDate ? adminData.subscriptionExpiresAt.toDate() : new Date(adminData.subscriptionExpiresAt);
                        adminExpired = new Date() > expiry;
                      }
                      if (adminData.subscriptionStatus === 'expired') adminExpired = true;

                      setUserProfile(prev => {
                        if (!prev) return prev; // If logged out meanwhile
                        return { 
                          ...prev, 
                          whatsappSettings: adminData.whatsappSettings,
                          adminSubscriptionExpired: adminExpired
                        };
                      });
                    }
                    setLoading(false);
                  },
                  (error) => {
                    handleFirestoreError(error, OperationType.GET, `users/${profileData.adminId}`);
                    setUserProfile(profileData);
                    setLoading(false);
                  }
                );
              } else {
                setUserProfile(profileData);
                setLoading(false);
              }
            } else {
              setUserProfile(null);
              setLoading(false);
            }
          },
          (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
            setLoading(false);
          }
        );
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
      if (unsubscribeAdmin) {
        unsubscribeAdmin();
      }
    };
  }, []);

  let isExp = false;
  if (userProfile && userProfile.email !== 'servincg@gmail.com') {
    if (userProfile.role === 'admin') {
      if (userProfile.subscriptionExpiresAt) {
        const expiry = userProfile.subscriptionExpiresAt.toDate ? userProfile.subscriptionExpiresAt.toDate() : new Date(userProfile.subscriptionExpiresAt);
        isExp = new Date() > expiry;
      }
      if (userProfile.subscriptionStatus === 'expired') isExp = true;
    } else if (userProfile.role !== 'client') {
      isExp = !!userProfile.adminSubscriptionExpired;
    }
  }

  const value = {
    currentUser,
    userProfile,
    loading,
    isAdmin: userProfile?.role === 'admin',
    isEmployee: userProfile?.role === 'employee',
    isManager: userProfile?.role === 'manager',
    isClient: userProfile?.role === 'client',
    isSubscriptionExpired: isExp,
  };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};
