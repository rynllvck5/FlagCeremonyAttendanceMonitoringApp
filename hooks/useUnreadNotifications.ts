import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useUnreadNotifications() {
  const { profile } = useAuth();
  // Module-level global state to synchronize across all hook instances (tabs, screens)
  const g: any = globalThis as any;
  if (!g.__unreadStore) {
    g.__unreadStore = { count: 0, listeners: new Set<((n: number) => void)>() };
  }
  const store = g.__unreadStore as { count: number; listeners: Set<(n: number) => void> };
  const [unreadCount, setUnreadCount] = useState<number>(store.count || 0);
  const [loading, setLoading] = useState(true);

  const fetchUnreadCount = useCallback(async () => {
    if (!profile?.id) {
      store.count = 0;
      store.listeners.forEach((fn) => fn(0));
      setLoading(false);
      return;
    }

    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('is_read', false);

      if (error) throw error;
      const next = count || 0;
      store.count = next;
      store.listeners.forEach((fn) => fn(next));
    } catch (e) {
      console.error('[useUnreadNotifications] Failed to fetch count', e);
      store.count = 0;
      store.listeners.forEach((fn) => fn(0));
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) {
      store.count = 0;
      store.listeners.forEach((fn) => fn(0));
      setLoading(false);
      return;
    }

    // Subscribe this component to global store updates
    const listener = (n: number) => setUnreadCount(n);
    store.listeners.add(listener);
    // Initialize from current global value
    setUnreadCount(store.count || 0);

    fetchUnreadCount();

    // Subscribe to changes
    const channel = supabase
      .channel('notifications_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          console.log('[useUnreadNotifications] Notification change detected, refetching...');
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      store.listeners.delete(listener);
    };
  }, [profile?.id, fetchUnreadCount]);

  return { unreadCount, loading, refetch: fetchUnreadCount };
}
