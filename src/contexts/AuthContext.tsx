import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';

export interface UserProfile {
  uid: string;
  role: 'admin' | 'employee' | 'manager' | 'client';
  name: string;
  phone: string;
  email: string;
  adminId: string;
  createdAt: any;
  clientId?: string;
  subscriptionStatus?: 'trial' | 'active' | 'expired';
  subscriptionExpiresAt?: any;
  adminSubscriptionExpired?: boolean;
  customProducts?: { name: string; defaultUnit: string }[];
  whatsappSettings?: {
    companyName?: string;
    companyLogo?: string;
    reminderDays: number;
    reminderMessage: string;
    delayedMessage: string;
    autoScheduleTime: string;
    reportMessage1?: string;
    reportMessage2?: string;
    partnerStores?: { name: string; phone: string }[];
    partnerTechnicians?: { name: string; phone: string }[];
    provider?: string;
    useAstracalls?: boolean;
    astracallsUrl?: string;
    astracallsApiKey?: string;
    astracallsSessionId?: string;
    useEvolutionApi?: boolean;
    evolutionApiUrl?: string;
    evolutionApiKey?: string;
    evolutionInstanceName?: string;
    useMetaApi?: boolean;
    metaToken?: string;
    metaServerUrl?: string;
    metaPhoneNumberId?: string;
    wavoipEnabled?: boolean;
    wavoipDeviceId?: string;
    wavoipApiKey?: string;
    wavoipApiUrl?: string;
  };
}

import { getBrazilianPhoneVariations } from '../lib/phoneUtils';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isEmployee: boolean;
  isManager: boolean;
  isClient: boolean;
  isSubscriptionExpired: boolean;
  handleUserChange: (user: User | null) => Promise<UserProfile | null>;
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
  handleUserChange: async () => null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshTrigger = useRealtimeUpdates(['users'], 'id', currentUser?.id);
  useEffect(() => {
    if (currentUser && refreshTrigger > 0) {
      handleUserChange(currentUser, true);
    }
  }, [refreshTrigger]);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) console.error('Error getting session:', error.message);
      handleUserChange(session?.user ?? null, false);
    }).catch(err => {
      console.error('Session fetch error:', err);
      handleUserChange(null, false);
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleUserChange(session?.user ?? null, true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleUserChange = async (user: User | null, silent = false): Promise<UserProfile | null> => {
    setCurrentUser(user);
    if (!user) {
      setUserProfile(null);
      localStorage.removeItem('cachedUserProfile');
      setLoading(false);
      return null;
    }

    // Only activate blocking full-screen loading state on initial load when userProfile is null
    if (!silent && !userProfile) {
      setLoading(true);
    }

    try {
      let { data: profileData, error: profileErr } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      // If offline or request failed, fallback directly to cached user profile
      if ((!profileData || profileErr) && (!navigator.onLine || profileErr)) {
        const cached = localStorage.getItem('cachedUserProfile');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed && (parsed.uid === user.id || parsed.email === user.email)) {
              console.log('[Auth] Usuário autenticado com sucesso via cache local (Modo Offline)');
              setUserProfile(parsed);
              setLoading(false);
              return parsed;
            }
          } catch (e) {}
        }
      }

      // Se não encontrou na tabela users, verifica se existe cliente correspondente na tabela clients
      if (!profileData && user.email) {
        const phoneCandidate = user.email.split('@')[0].replace(/\D/g, '');
        if (phoneCandidate) {
          const variations = getBrazilianPhoneVariations(phoneCandidate).all;
          const { data: allClients } = await supabase.from('clients').select('*');
          const matchedClient = allClients?.find(c => {
            const cPhone = (c.phone || '').replace(/\D/g, '');
            return variations.includes(cPhone);
          });

          if (matchedClient) {
            profileData = {
              id: user.id,
              name: matchedClient.name,
              email: user.email,
              phone: matchedClient.phone,
              role: 'client',
              client_id: matchedClient.id,
              admin_id: matchedClient.admin_id,
              active: true,
              created_at: matchedClient.created_at || new Date().toISOString()
            };
            try {
              await supabase.from('users').upsert(profileData);
            } catch (e) {}
          }
        }
      }

      if (profileData) {
        if (profileData.active === false) {
           await supabase.auth.signOut();
           setUserProfile(null);
           localStorage.removeItem('cachedUserProfile');
           setLoading(false);
           return null;
        }

        const mappedProfile: UserProfile = {
          uid: profileData.id,
          role: profileData.role,
          name: profileData.name,
          phone: profileData.phone,
          email: profileData.email,
          adminId: profileData.admin_id,
          clientId: profileData.client_id,
          createdAt: profileData.created_at,
          subscriptionStatus: profileData.subscription_status,
          subscriptionExpiresAt: profileData.subscription_expires_at,
          whatsappSettings: profileData.whatsapp_settings,
        };

        if (user.email === 'servincg@gmail.com' && (mappedProfile.name !== 'Renivaldo Servin dos Santos' || mappedProfile.subscriptionStatus !== 'active')) {
          await supabase.from('users').update({
            name: 'Renivaldo Servin dos Santos',
            subscription_status: 'active',
            subscription_expires_at: new Date('2099-12-31').toISOString(),
          }).eq('id', user.id);
          mappedProfile.name = 'Renivaldo Servin dos Santos';
          mappedProfile.subscriptionStatus = 'active';
          mappedProfile.subscriptionExpiresAt = new Date('2099-12-31').toISOString();
        }

        if (mappedProfile.role !== 'admin' && mappedProfile.adminId) {
          const { data: adminData } = await supabase
            .from('users')
            .select('*')
            .eq('id', mappedProfile.adminId)
            .maybeSingle();

          if (adminData) {
            let adminExpired = false;
            if (adminData.subscription_expires_at) {
              adminExpired = new Date() > new Date(adminData.subscription_expires_at);
            }
            if (adminData.subscription_status === 'expired') adminExpired = true;

            mappedProfile.whatsappSettings = adminData.whatsapp_settings;
            mappedProfile.adminSubscriptionExpired = adminExpired;
          }
        }

        setUserProfile((prev: UserProfile | null) => {
          if (!prev) return mappedProfile;
          const prevStr = JSON.stringify(prev);
          const newStr = JSON.stringify(mappedProfile);
          return prevStr === newStr ? prev : mappedProfile;
        });

        localStorage.setItem('cachedUserProfile', JSON.stringify(mappedProfile));
        setLoading(false);
        return mappedProfile;
      } else {
         // Se não há dados no servidor mas o dispositivo está offline ou falhou a rede, preserva perfil em cache
         const cached = localStorage.getItem('cachedUserProfile');
         if (cached && (!navigator.onLine || profileErr)) {
           try {
             const parsed = JSON.parse(cached);
             setUserProfile(parsed);
             setLoading(false);
             return parsed;
           } catch(e) {}
         }
         setUserProfile(null);
         localStorage.removeItem('cachedUserProfile');
         setLoading(false);
         return null;
      }
    } catch (err) {
      console.error('Error fetching user profile, attempting to use cached profile:', err);
      let recovered: UserProfile | null = null;
      const cached = localStorage.getItem('cachedUserProfile');
      if (cached) {
        try {
          recovered = JSON.parse(cached);
          setUserProfile(recovered);
        } catch (e) {
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
      return recovered;
    }
  };

  let isExp = false;
  if (userProfile && userProfile.email !== 'servincg@gmail.com') {
    if (userProfile.role === 'admin') {
      if (userProfile.subscriptionExpiresAt) {
        isExp = new Date() > new Date(userProfile.subscriptionExpiresAt);
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
    handleUserChange,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
