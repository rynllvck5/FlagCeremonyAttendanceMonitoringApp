-- Fix handle_new_user trigger function: column/value mismatch caused user creation to fail
-- Safe to run multiple times; replaces the function definition.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (
    id,
    email,
    first_name,
    middle_name,
    last_name,
    role,
    profile_picture
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'middle_name',
    NEW.raw_user_meta_data->>'last_name',
    CASE 
      WHEN NEW.email = 'superadmin@dmmmsu.edu.ph' THEN 'superadmin'::user_role
      WHEN NEW.email LIKE '%@dmmmsu.edu.ph' THEN 'teacher'::user_role
      ELSE 'student'::user_role
    END,
    NULL
  )
  ON CONFLICT (id) DO NOTHING; -- avoid duplicate insert if another process created it

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure trigger remains in place
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
