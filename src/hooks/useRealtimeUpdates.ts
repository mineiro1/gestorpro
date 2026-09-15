import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useRealtimeUpdates(tables: string[], filterColumn?: string, filterValue?: string) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!tables || tables.length === 0) return;

    const channels = tables.map(table => {
      const filterObj: any = { event: '*', schema: 'public', table };
      if (filterColumn && filterValue) {
        filterObj.filter = `${filterColumn}=eq.${filterValue}`;
      }

      const channelName = `realtime-${table}-${filterValue || 'all'}-${Math.random().toString(36).substring(7)}`;

      return supabase.channel(channelName)
        .on('postgres_changes', filterObj, () => {
          setRefreshTrigger(t => t + 1);
        })
        .subscribe();
    });

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [JSON.stringify(tables), filterColumn, filterValue]);

  return refreshTrigger;
}
