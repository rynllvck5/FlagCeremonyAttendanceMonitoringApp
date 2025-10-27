-- Fix is_admin function to recognize admin role from user_profiles table
-- This fixes the issue where newly created admin accounts get RLS policy violations

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Check if user has admin or superadmin role
  -- Using SECURITY DEFINER bypasses RLS to avoid recursion
  RETURN (
    SELECT COALESCE(
      (SELECT role IN ('admin', 'superadmin') FROM public.user_profiles WHERE id = uid),
      false
    )
  );
END;
$$;

-- Also ensure get_user_college function exists
CREATE OR REPLACE FUNCTION public.get_user_college(uid uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_college text;
BEGIN
  -- Direct query bypassing RLS via SECURITY DEFINER
  SELECT college INTO user_college FROM public.user_profiles WHERE id = uid;
  RETURN user_college;
END;
$$;
