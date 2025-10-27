import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserProfile, UserSession, AuthUser } from '../types/user';

// --- Global session state and listeners to broadcast updates across hook instances ---
const initialSession: UserSession = {
  user: null,
  profile: null,
  role: null,
  isLoading: true,
  error: null,
};

type SessionListener = (s: UserSession) => void;
const sessionListeners = new Set<SessionListener>();
let globalSession: UserSession = { ...initialSession };

function notifyAll(next: UserSession) {
  globalSession = next;
  sessionListeners.forEach((cb) => {
    try { cb(globalSession); } catch (e) { /* no-op */ }
  });
}

// Ensure we only initialize Supabase auth listener once globally (survives Fast Refresh)
const g: any = globalThis as any;
g.__useAuth = g.__useAuth || { initialized: false, unsubscribe: null as null | (() => void) };

const setInterimSignedIn = (userId: string, email?: string) => {
  const next: UserSession = {
    user: { id: userId, email: email ?? '' } as AuthUser,
    profile: null,
    role: null,
    isLoading: true,
    error: null,
  };
  notifyAll(next);
};

const setSignedOut = () => {
  const next: UserSession = {
    user: null,
    profile: null,
    role: null,
    isLoading: false,
    error: null,
  };
  notifyAll(next);
};

const loadUserProfile = async (userId: string) => {
  try {
    console.log('[useAuth] fetchUserProfile for userId:', userId);

    // Ensure we also fetch the current auth user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error('[useAuth] Error getting auth user:', userError);
    }

    let { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    // If no profile exists yet, create it (edge cases where trigger didn't run)
    if (error && (error as any).code === 'PGRST116') {
      console.warn('[useAuth] No profile found. Creating one for user:', userId);
      const email = user?.email ?? '';
      const meta = (user?.user_metadata as any) || {};
      const first_name = meta.first_name ?? null;
      const middle_name = meta.middle_name ?? null;
      const last_name = meta.last_name ?? null;
      const { error: insertError } = await supabase
        .from('user_profiles')
        .insert({ id: userId, email, first_name, middle_name, last_name });
      if (insertError) throw insertError;
      const res = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
      profile = res.data as any;
      error = res.error as any;
    }

    if (error) throw error;

    const next: UserSession = {
      user: user ? ({ id: user.id, email: user.email ?? '' } as AuthUser) : null,
      profile,
      role: profile.role,
      isLoading: false,
      error: null,
    };
    notifyAll(next);
  } catch (error: any) {
    console.error('[useAuth] Error fetching user profile:', {
      message: error?.message,
      code: error?.code,
      details: error?.details || error?.error_description,
    });
    const next = {
      ...globalSession,
      isLoading: false,
      error: 'Failed to load user profile',
    } as UserSession;
    notifyAll(next);
  }
};

const initAuthListener = () => {
  if (g.__useAuth.initialized) return;
  g.__useAuth.initialized = true;

  // Initial session
  (async () => {
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (authSession?.user) {
        console.log('[useAuth] Initial session found. Fetching profile for user:', authSession.user.id);
        setInterimSignedIn(authSession.user.id, authSession.user.email ?? '');
        loadUserProfile(authSession.user.id).catch((e) =>
          console.warn('[useAuth] loadUserProfile (initial) warning:', e)
        );
      } else {
        setSignedOut();
      }
    } catch (error) {
      console.error('Error getting initial session:', error);
      notifyAll({ ...globalSession, isLoading: false, error: 'Failed to get session' } as UserSession);
    }
  })();

  // Auth state change subscription (singleton)
  // Clean up any previous subscription if it somehow exists
  if (typeof g.__useAuth.unsubscribe === 'function') {
    try { g.__useAuth.unsubscribe(); } catch {}
    g.__useAuth.unsubscribe = null;
  }

  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, authSession) => {
      if (event === 'SIGNED_IN') {
        console.log('[useAuth] Auth state changed: SIGNED_IN user:', authSession?.user?.id);
        if (authSession?.user) {
          setInterimSignedIn(authSession.user.id, authSession.user.email ?? '');
          loadUserProfile(authSession.user.id).catch((e) =>
            console.warn('[useAuth] loadUserProfile (auth change) warning:', e)
          );
        }
      } else if (event === 'SIGNED_OUT') {
        console.log('[useAuth] Auth state changed: SIGNED_OUT');
        setSignedOut();
      } else {
        // Ignore INITIAL_SESSION, TOKEN_REFRESHED, and other events to prevent loops
      }
    }
  );
  g.__useAuth.unsubscribe = () => subscription?.unsubscribe && subscription.unsubscribe();
};

export function useAuth() {
  const [session, setSession] = useState<UserSession>(globalSession);

  // Keep this hook instance in sync with global session
  useEffect(() => {
    const listener: SessionListener = (s) => setSession(s);
    sessionListeners.add(listener);
    return () => {
      sessionListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    initAuthListener();
  }, []);

  const fetchUserProfile = async (userId: string) => {
    await loadUserProfile(userId);
  };

  const signUp = async (email: string, password: string, userData: Partial<UserProfile>) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: userData.first_name,
            middle_name: (userData as any).middle_name,
            last_name: userData.last_name,
          },
        },
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Sign up error:', error);
      return { data: null, error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      console.log('Attempting to sign in with:', { email });
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log('Sign in response:', { data, error });
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return { data: null, error };
    }
  };

  const signOut = async () => {
    try {
      // If there's no active session, consider the user signed out
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSignedOut();
        return;
      }
      const { error } = await supabase.auth.signOut();
      if (error) {
        // Swallow missing session error as non-fatal
        const msg = (error as any)?.message || '';
        const name = (error as any)?.name || '';
        if (name.includes('AuthSessionMissingError') || msg.includes('Auth session missing')) {
          setSignedOut();
          return;
        }
        throw error;
      }
      setSignedOut();
    } catch (error) {
      console.error('Error signing out:', error);
      // Do not rethrow; ensure app state reflects signed out to avoid user-facing error loops
      setSignedOut();
    }
  };

  // Public method to refresh the current user's profile
  const refreshProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        await fetchUserProfile(user.id);
      }
    } catch (error) {
      console.error('[useAuth] refreshProfile error:', error);
    }
  };

  return {
    ...session,
    signUp,
    signIn,
    signOut,
    refreshProfile,
  };
}
