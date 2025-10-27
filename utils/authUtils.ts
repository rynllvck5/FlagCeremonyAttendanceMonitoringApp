import { supabase } from '../lib/supabase';

// Safe client-side check that avoids querying restricted auth tables.
// - Uses supabase.auth APIs for session/user info
// - Uses public.user_profiles for profile (RLS protected)
export const checkAuthSettings = async () => {
  try {
    // Current session and user (safe)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    // Attempt to read the caller's own profile (allowed by RLS policy)
    let profile = null as any;
    let profileError = null as any;
    if (user?.id) {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      profile = data ?? null;
      profileError = error ?? null;
    }

    return {
      hasSession: !!session,
      userId: user?.id ?? null,
      profile,
      error: sessionError || userError || profileError || null,
    };
  } catch (error) {
    console.error('Error checking auth settings (safe):', error);
    return { error };
  }
};
