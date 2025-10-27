-- QR Features schema updates (idempotent)
-- Requires: Supabase Postgres with pgcrypto extension available

-- Enable pgcrypto for gen_random_uuid (safe if already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add qr_code column for user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS qr_code text;

-- Ensure profile_picture column exists (harmless if already present)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS profile_picture text;

-- Unique index on qr_code when present
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_qr_code
  ON public.user_profiles (qr_code)
  WHERE qr_code IS NOT NULL;

-- Update is_admin to rely on the role stored in user_profiles
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = uid AND p.role IN ('admin','superadmin')
  );
$$;

-- Keep existing RLS policies on user_profiles. Ensure admins can read all profiles.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.user_profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Create scan_logs table for admin scanning activity
CREATE TABLE IF NOT EXISTS public.scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  scanned_by uuid REFERENCES auth.users(id),
  scanned_user uuid REFERENCES public.user_profiles(id)
);

ALTER TABLE public.scan_logs ENABLE ROW LEVEL SECURITY;

-- Allow admins to write and read scan logs
DROP POLICY IF EXISTS "Admins can insert scan logs" ON public.scan_logs;
CREATE POLICY "Admins can insert scan logs"
  ON public.scan_logs FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can read scan logs" ON public.scan_logs;
CREATE POLICY "Admins can read scan logs"
  ON public.scan_logs FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Grant basic privileges (RLS still enforces row access)
GRANT SELECT, INSERT ON public.scan_logs TO authenticated;
