import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export type ThemeMode = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  card: string;
  text: string;
  mutedText: string;
  border: string;
  primary: string;
  danger: string;
  tabBarBg: string;
  tabIconActive: string;
  tabIconInactive: string;
  badgeBg: string;
  badgeText: string;
};

const LightColors: ThemeColors = {
  background: '#f8f9fc',
  card: '#ffffff',
  text: '#2d3748',
  mutedText: '#6c757d',
  border: '#e9ecef',
  primary: '#007AFF',
  danger: '#e03131',
  tabBarBg: '#ffffff',
  tabIconActive: '#007AFF',
  tabIconInactive: '#8e8e93',
  badgeBg: '#e03131',
  badgeText: '#ffffff',
};

const DarkColors: ThemeColors = {
  background: '#0f1115',
  card: '#151922',
  text: '#e6e6e6',
  mutedText: '#9aa3b2',
  border: '#2a2f3a',
  primary: '#4ea1ff',
  danger: '#ff6b6b',
  tabBarBg: '#0f1115',
  tabIconActive: '#4ea1ff',
  tabIconInactive: '#6b7280',
  badgeBg: '#ff6b6b',
  badgeText: '#0f1115',
};

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');
  const colors = useMemo(() => (mode === 'dark' ? DarkColors : LightColors), [mode]);
  
  // Load initial preference from Supabase auth user metadata
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const initial = (user?.user_metadata as any)?.dark_mode === true ? 'dark' : 'light';
        setMode(initial);
      } catch {}
    })();
  }, []);

  const setAndPersist = async (next: ThemeMode) => {
    setMode(next);
    try {
      await supabase.auth.updateUser({ data: { dark_mode: next === 'dark' } });
    } catch {}
  };

  const value = useMemo(
    () => ({ mode, colors, setMode: setAndPersist, toggle: () => setAndPersist(mode === 'dark' ? 'light' : 'dark') }),
    [mode, colors]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
