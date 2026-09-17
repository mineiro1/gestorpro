import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useRealtimeUpdates(tables: string[], filterColumn?: string, filterValue?: string) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!tables || tables.length === 0) return;

    // Use a single channel name for the component instance
    const channelName = `realtime-multi-${filterValue || 'all'}-${Math.random().toString(36).substring(7)}`;
    const channel = supabase.channel(channelName);

    // Bind each table to the same channel
    tables.forEach(table => {
      const filterObj: any = { event: '*', schema: 'public', table };
      if (filterColumn && filterValue) {
        filterObj.filter = `${filterColumn}=eq.${filterValue}`;
      }
      channel.on('postgres_changes', filterObj, () => {
        setRefreshTrigger(t => t + 1);
      });
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [JSON.stringify(tables), filterColumn, filterValue]);

  return refreshTrigger;
}
