-- FINAL FIX: Admin college scoping without recursion + proper helper functions
-- This completely replaces the previous admin college scoping attempt

-- Step 1: Add college field to user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS college TEXT REFERENCES public.colleges(code) ON UPDATE CASCADE ON DELETE SET NULL;

-- Step 2: Update get_user_college helper (already exists from previous migration)
-- This bypasses RLS by using SECURITY DEFINER
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

-- Step 3: Drop and recreate admin policies to avoid recursion
-- Use ONLY helper functions, never direct column references in policies

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.user_profiles FOR SELECT
  USING (
    public.is_admin(auth.uid()) AND (
      -- Superadmins see everything
      public.get_user_role(auth.uid()) = 'superadmin'
      -- Regular admins see only users in their college's programs
      OR (
        public.get_user_role(auth.uid()) = 'admin'
        AND public.get_user_college(auth.uid()) IS NOT NULL
        AND (
          -- See admins/teachers in same college
          (
            public.get_user_role(user_profiles.id) IN ('admin', 'teacher')
            AND public.get_user_college(user_profiles.id) = public.get_user_college(auth.uid())
          )
          -- See students whose program belongs to admin's college
          OR (
            public.get_user_role(user_profiles.id) = 'student'
            AND EXISTS (
              SELECT 1 FROM public.programs p
              WHERE p.code = user_profiles.program
              AND p.college_code = public.get_user_college(auth.uid())
            )
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;
CREATE POLICY "Admins can update all profiles"
  ON public.user_profiles FOR UPDATE
  USING (
    public.is_admin(auth.uid()) AND (
      -- Superadmins can update anyone
      public.get_user_role(auth.uid()) = 'superadmin'
      -- Regular admins can update users in their college (but not self)
      OR (
        public.get_user_role(auth.uid()) = 'admin'
        AND user_profiles.id <> auth.uid() -- Cannot update self
        AND public.get_user_college(auth.uid()) IS NOT NULL
        AND (
          -- Update admins/teachers in same college
          (
            public.get_user_role(user_profiles.id) IN ('admin', 'teacher')
            AND public.get_user_college(user_profiles.id) = public.get_user_college(auth.uid())
          )
          -- Update students in college's programs
          OR (
            public.get_user_role(user_profiles.id) = 'student'
            AND EXISTS (
              SELECT 1 FROM public.programs p
              WHERE p.code = user_profiles.program
              AND p.college_code = public.get_user_college(auth.uid())
            )
          )
        )
      )
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
  );

-- Step 4: Colleges CRUD policies (superadmin only)
ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_manage_colleges" ON public.colleges;
CREATE POLICY "superadmin_manage_colleges"
  ON public.colleges
  USING (public.get_user_role(auth.uid()) = 'superadmin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'superadmin');

DROP POLICY IF EXISTS "authenticated_view_colleges" ON public.colleges;
CREATE POLICY "authenticated_view_colleges"
  ON public.colleges FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Step 5: Programs policies (scoped by college for regular admins)
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_view_programs" ON public.programs;
CREATE POLICY "admins_view_programs"
  ON public.programs FOR SELECT
  USING (
    public.is_admin(auth.uid()) AND (
      public.get_user_role(auth.uid()) = 'superadmin'
      OR college_code = public.get_user_college(auth.uid())
    )
  );

DROP POLICY IF EXISTS "admins_manage_programs" ON public.programs;
CREATE POLICY "admins_manage_programs"
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

-- Step 6: Program Years policies
ALTER TABLE public.program_years ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_view_program_years" ON public.program_years;
CREATE POLICY "admins_view_program_years"
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

DROP POLICY IF EXISTS "admins_manage_program_years" ON public.program_years;
CREATE POLICY "admins_manage_program_years"
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

-- Step 7: Program Sections policies
ALTER TABLE public.program_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_view_program_sections" ON public.program_sections;
CREATE POLICY "admins_view_program_sections"
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

DROP POLICY IF EXISTS "admins_manage_program_sections" ON public.program_sections;
CREATE POLICY "admins_manage_program_sections"
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

-- Step 8: Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colleges TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_years TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_sections TO authenticated;

-- Verification notice
DO $$
BEGIN
  RAISE NOTICE 'Admin college scoping applied. Superadmin can now assign colleges to admins.';
  RAISE NOTICE 'Example: UPDATE public.user_profiles SET college = ''CCS'' WHERE id = ''ADMIN_ID'' AND role = ''admin'';';
END $$;
