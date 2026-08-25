import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

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
    reminderDays: number;
    reminderMessage: string;
    delayedMessage: string;
    autoScheduleTime: string;
    reportMessage1?: string;
    reportMessage2?: string;
    useEvolutionApi?: boolean;
    evolutionApiUrl?: string;
    evolutionApiKey?: string;
    evolutionInstanceName?: string;
    useMetaApi?: boolean;
    metaToken?: string;
    metaPhoneNumberId?: string;
  };
}

interface AuthContextType {
  currentUser: User | null;
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useAutoRefresh(() => {
    if (currentUser) {
      handleUserChange(currentUser);
    }
  }, 60000); // 1 minute refresh for auth context

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) console.error('Error getting session:', error.message);
      handleUserChange(session?.user ?? null);
    }).catch(err => {
      console.error('Session fetch error:', err);
      handleUserChange(null);
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleUserChange(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleUserChange = async (user: User | null) => {
    setCurrentUser(user);
    if (!user) {
      setUserProfile(null);
      setLoading(false);
      return;
    }

    // Fetch user profile from Supabase
    try {
      const { data: profileData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        throw error;
      }

      if (profileData) {
        if (profileData.active === false) {
           await supabase.auth.signOut();
           setUserProfile(null);
           localStorage.removeItem('cachedUserProfile');
           setLoading(false);
           return;
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
            .single();

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

        setUserProfile(mappedProfile);
        localStorage.setItem('cachedUserProfile', JSON.stringify(mappedProfile));
      } else {
         setUserProfile(null);
         localStorage.removeItem('cachedUserProfile');
      }
    } catch (err) {
      console.error('Error fetching user profile, attempting to use cached profile:', err);
      const cached = localStorage.getItem('cachedUserProfile');
      if (cached) {
        try {
          setUserProfile(JSON.parse(cached));
        } catch (e) {
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
    }
    setLoading(false);
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
  };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};
