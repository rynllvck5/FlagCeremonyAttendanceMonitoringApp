-- Storage bucket and RLS policies for profile pictures (idempotent)
-- Creates/updates the 'profile-pictures' bucket as public, and allows:
--  - Public read of avatars (for getPublicUrl)
--  - Authenticated users to upload/update only within their own folder: <uid>/*
--  - Admins to upload/update any student's avatar (uses public.is_admin(auth.uid()))

BEGIN;

-- Ensure bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-pictures', 'profile-pictures', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Note: RLS is enabled by default on storage.objects in Supabase.
-- Avoid altering table-level settings or dropping policies to prevent ownership errors.

-- Optional: allow public read access for this bucket (so getPublicUrl works)
DO $$ BEGIN
  CREATE POLICY "Public read access to profile-pictures"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'profile-pictures');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow authenticated users to upload/update only inside their own folder
-- e.g., path must start with their user id: <uid>/*
DO $$ BEGIN
  CREATE POLICY "Users can upload own avatars"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'profile-pictures'
      AND name LIKE auth.uid()::text || '/%'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own avatars"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
      bucket_id = 'profile-pictures'
      AND name LIKE auth.uid()::text || '/%'
    )
    WITH CHECK (
      bucket_id = 'profile-pictures'
      AND name LIKE auth.uid()::text || '/%'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow admins to upload/update any student's avatar within the bucket
-- Relies on public.is_admin(uid) defined in database/20240901_qr_features.sql
DO $$ BEGIN
  CREATE POLICY "Admins can upload avatars for anyone"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'profile-pictures'
      AND public.is_admin(auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update avatars for anyone"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
      bucket_id = 'profile-pictures'
      AND public.is_admin(auth.uid())
    )
    WITH CHECK (
      bucket_id = 'profile-pictures'
      AND public.is_admin(auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
