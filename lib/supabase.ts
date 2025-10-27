import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type User } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';

// Configuration (read from env)
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_URL = supabaseUrl;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Validate configuration
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase URL or Anon Key. Please check your .env file.');
}

// Initialize Supabase client
const options = {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    debug: true, // Enable debug logging
  },
};

// Regular client for client-side operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey, options);

// Helper to read values from Expo config extras (dev/prod safe-ish)
const getExtra = (key: string): string | undefined => {
  try {
    // expoConfig is available in dev; manifest.extra is available in some prod builds
    const extra: any = (Constants?.expoConfig?.extra ?? (Constants as any)?.manifest?.extra);
    return extra?.[key];
  } catch {
    return undefined;
  }
};

// Admin client for server-side operations (use with caution)
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY ||
  getExtra('SUPABASE_SERVICE_ROLE_KEY') ||
  getExtra('EXPO_PUBLIC_SUPABASE_SERVICE_KEY') ||
  '';
export const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      ...options,
      auth: {
        ...options.auth,
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

console.log('Supabase client initialized successfully');
console.log(`[Supabase] Admin client ${supabaseAdmin ? 'ENABLED' : 'DISABLED'} (service key ${supabaseAdmin ? 'present' : 'missing'})`);

// Enhanced error handling for auth operations
export const handleAuthError = (error: any, context: string) => {
  console.error(`Auth error in ${context}:`, {
    message: error.message,
    status: error.status,
    code: error.code,
    details: error.error_description || error.message,
  });
  return error;
};

// Helper function to check if user is authenticated with better error handling
export const isUserAuthenticated = async (): Promise<boolean> => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      handleAuthError(error, 'isUserAuthenticated');
      return false;
    }
    
    console.log('Current session:', {
      hasSession: !!session,
      userId: session?.user?.id,
      expiresAt: session?.expires_at,
    });
    
    return !!session?.user;
  } catch (error) {
    handleAuthError(error, 'isUserAuthenticated catch');
    return false;
  }
};

// Helper to get the current user with type safety
export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      handleAuthError(error, 'getCurrentUser');
      return null;
    }
    
    return user;
  } catch (error) {
    handleAuthError(error, 'getCurrentUser catch');
    return null;
  }
};