-- Admin College Scoping: Add college field to admins and update RLS policies
-- Admins can only manage programs/students within their assigned college
-- Superadmins can manage everything and assign admins to colleges

-- Step 1: Add college field to user_profiles for admins
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS college TEXT REFERENCES public.colleges(code) ON UPDATE CASCADE ON DELETE SET NULL;

-- Step 2: Helper function to get user's college (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_user_college(uid uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_college text;
BEGIN
  SELECT college INTO user_college FROM public.user_profiles WHERE id = uid;
  RETURN user_college;
END;
$$;

-- Step 3: Update admin view policy to scope by college for regular admins
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.user_profiles FOR SELECT
  USING (
    public.is_admin(auth.uid()) AND (
      -- Superadmins see all
      public.get_user_role(auth.uid()) = 'superadmin'
      -- Regular admins see users in their college's programs
      OR (
        public.get_user_role(auth.uid()) = 'admin'
        AND (
          -- See all users in same college
          user_profiles.role IN ('admin', 'teacher')
          AND user_profiles.college = public.get_user_college(auth.uid())
          -- See students in programs belonging to admin's college
          OR (
            user_profiles.role = 'student'
            AND user_profiles.program IN (
              SELECT code FROM public.programs 
              WHERE college_code = public.get_user_college(auth.uid())
            )
          )
        )
      )
    )
  );

-- Step 4: Update admin update policy to scope by college
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;
CREATE POLICY "Admins can update all profiles"
  ON public.user_profiles FOR UPDATE
  USING (
    public.is_admin(auth.uid()) AND (
      -- Superadmins can update all
      public.get_user_role(auth.uid()) = 'superadmin'
      -- Regular admins can update users in their college
      OR (
        public.get_user_role(auth.uid()) = 'admin'
        AND user_profiles.id <> auth.uid() -- Cannot update self college
        AND (
          -- Update admins/teachers in same college (but cannot change their college)
          (
            user_profiles.role IN ('admin', 'teacher')
            AND user_profiles.college = public.get_user_college(auth.uid())
          )
          -- Update students in programs belonging to admin's college
          OR (
            user_profiles.role = 'student'
            AND user_profiles.program IN (
              SELECT code FROM public.programs 
              WHERE college_code = public.get_user_college(auth.uid())
            )
          )
        )
      )
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid()) AND (
      -- Superadmins can set any values
      public.get_user_role(auth.uid()) = 'superadmin'
      -- Regular admins cannot change college field (only superadmin can)
      OR (
        public.get_user_role(auth.uid()) = 'admin'
        AND (
          -- If updating college field, it must remain unchanged for non-superadmins
          user_profiles.college IS NOT DISTINCT FROM (
            SELECT college FROM public.user_profiles WHERE id = user_profiles.id
          )
        )
      )
    )
  );

-- Step 5: Programs/Years/Sections policies (admins can only manage their college's academic structures)
-- Programs: Admins can SELECT programs in their college
DROP POLICY IF EXISTS "admins_view_college_programs" ON public.programs;
CREATE POLICY "admins_view_college_programs"
  ON public.programs FOR SELECT
  USING (
    public.is_admin(auth.uid()) AND (
      public.get_user_role(auth.uid()) = 'superadmin'
      OR college_code = public.get_user_college(auth.uid())
    )
  );

-- Programs: Admins can INSERT/UPDATE/DELETE programs in their college
DROP POLICY IF EXISTS "admins_manage_college_programs" ON public.programs;
CREATE POLICY "admins_manage_college_programs"
  ON public.programs
  USING (
    public.is_admin(auth.uid()) AND (
      public.get_user_role(auth.uid()) = 'superadmin'
      OR college_code = public.get_user_college(auth.uid())
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid()) AND (
      public.get_user_role(auth.uid()) = 'superadmin'
      OR college_code = public.get_user_college(auth.uid())
    )
  );

-- Program Years: Admins can SELECT years for their college's programs
DROP POLICY IF EXISTS "admins_view_college_program_years" ON public.program_years;
CREATE POLICY "admins_view_college_program_years"
  ON public.program_years FOR SELECT
  USING (
    public.is_admin(auth.uid()) AND (
      public.get_user_role(auth.uid()) = 'superadmin'
      OR program_code IN (
        SELECT code FROM public.programs 
        WHERE college_code = public.get_user_college(auth.uid())
      )
    )
  );

-- Program Years: Admins can INSERT/UPDATE/DELETE years for their college's programs
DROP POLICY IF EXISTS "admins_manage_college_program_years" ON public.program_years;
CREATE POLICY "admins_manage_college_program_years"
  ON public.program_years
  USING (
    public.is_admin(auth.uid()) AND (
      public.get_user_role(auth.uid()) = 'superadmin'
      OR program_code IN (
        SELECT code FROM public.programs 
        WHERE college_code = public.get_user_college(auth.uid())
      )
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid()) AND (
      public.get_user_role(auth.uid()) = 'superadmin'
      OR program_code IN (
        SELECT code FROM public.programs 
        WHERE college_code = public.get_user_college(auth.uid())
      )
    )
  );

-- Program Sections: Admins can SELECT sections for their college's programs
DROP POLICY IF EXISTS "admins_view_college_program_sections" ON public.program_sections;
CREATE POLICY "admins_view_college_program_sections"
  ON public.program_sections FOR SELECT
  USING (
    public.is_admin(auth.uid()) AND (
      public.get_user_role(auth.uid()) = 'superadmin'
      OR program_code IN (
        SELECT code FROM public.programs 
        WHERE college_code = public.get_user_college(auth.uid())
      )
    )
  );

-- Program Sections: Admins can INSERT/UPDATE/DELETE sections for their college's programs
DROP POLICY IF EXISTS "admins_manage_college_program_sections" ON public.program_sections;
CREATE POLICY "admins_manage_college_program_sections"
  ON public.program_sections
  USING (
    public.is_admin(auth.uid()) AND (
      public.get_user_role(auth.uid()) = 'superadmin'
      OR program_code IN (
        SELECT code FROM public.programs 
        WHERE college_code = public.get_user_college(auth.uid())
      )
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid()) AND (
      public.get_user_role(auth.uid()) = 'superadmin'
      OR program_code IN (
        SELECT code FROM public.programs 
        WHERE college_code = public.get_user_college(auth.uid())
      )
    )
  );

-- Step 6: Enable RLS on academic structure tables if not already enabled
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_sections ENABLE ROW LEVEL SECURITY;

-- Step 7: Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_years TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_sections TO authenticated;

-- Note: Superadmin must manually assign college to admin accounts via:
-- UPDATE public.user_profiles SET college = 'COLLEGE_CODE' WHERE id = 'ADMIN_USER_ID' AND role = 'admin';
