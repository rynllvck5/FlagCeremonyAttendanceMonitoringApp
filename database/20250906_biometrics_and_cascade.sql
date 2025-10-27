-- Biometric support and cascade deletes for scan_logs
-- Idempotent migration

-- 1) Add biometric columns to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS biometric_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS biometric_registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS biometric_device_id text;

-- 2) Allow students to verify their own unverified attendance when biometrics enabled
-- Enable pgcrypto if needed
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Policy to let a student mark their own record as verified (only when biometric is enabled)
DO $$ BEGIN
  CREATE POLICY "Student can verify own attendance (biometric)"
    ON public.attendance_records FOR UPDATE TO authenticated
    USING (
      user_id = auth.uid()
      AND NOT verified
      AND EXISTS (
        SELECT 1 FROM public.user_profiles p
        WHERE p.id = auth.uid() AND p.biometric_enabled = true
      )
    )
    WITH CHECK (
      user_id = auth.uid()
      AND verified = true
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Update scan_logs foreign keys to support cascade on scanned_user and safe null on scanned_by
DO $$ BEGIN
  ALTER TABLE public.scan_logs DROP CONSTRAINT IF EXISTS scan_logs_scanned_user_fkey;
  ALTER TABLE public.scan_logs
    ADD CONSTRAINT scan_logs_scanned_user_fkey
    FOREIGN KEY (scanned_user)
    REFERENCES public.user_profiles(id)
    ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- 5) Allow admins to update user profiles (to toggle biometrics)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;
  CREATE POLICY "Admins can update all profiles"
    ON public.user_profiles FOR UPDATE TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.scan_logs DROP CONSTRAINT IF EXISTS scan_logs_scanned_by_fkey;
  ALTER TABLE public.scan_logs
    ADD CONSTRAINT scan_logs_scanned_by_fkey
    FOREIGN KEY (scanned_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Helpful index (no-op if already exists)
CREATE INDEX IF NOT EXISTS idx_scan_logs_user ON public.scan_logs (scanned_user);

-- 4) Make attendance_records created_by/verified_by tolerant to user deletions
DO $$ BEGIN
  ALTER TABLE public.attendance_records DROP CONSTRAINT IF EXISTS attendance_records_created_by_fkey;
  ALTER TABLE public.attendance_records
    ADD CONSTRAINT attendance_records_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.attendance_records DROP CONSTRAINT IF EXISTS attendance_records_verified_by_fkey;
  ALTER TABLE public.attendance_records
    ADD CONSTRAINT attendance_records_verified_by_fkey
    FOREIGN KEY (verified_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
