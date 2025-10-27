export type UserRole = 'student' | 'teacher' | 'admin' | 'superadmin';

export interface UserProfile {
  id: string;
  email: string;
  first_name: string | null;
  middle_name?: string | null;
  last_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
  profile_picture?: string | null;
  qr_code?: string | null;
  biometric_enabled?: boolean;
  biometric_registered_at?: string | null;
  biometric_device_id?: string | null;
  public_key?: string | null;
  device_id?: string | null;
  crypto_identity_created_at?: string | null;
  program?: string | null;
  year?: string | null;
  section?: string | null;
  position?: string | null;
  college?: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: {
    first_name?: string;
    middle_name?: string;
    last_name?: string;
  };
}

export interface UserSession {
  user: AuthUser | null;
  profile: UserProfile | null;
  role: UserRole | null;
  isLoading: boolean;
  error: string | null;
}
