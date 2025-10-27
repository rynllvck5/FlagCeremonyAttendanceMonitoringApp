-- Fix is_admin to avoid recursion by not referencing user_profiles
-- Determine admin via JWT email claims
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT (auth.jwt() ->> 'email') IN ('admin@example.com','superadmin@dmmmsu.edu.ph');
$$;
