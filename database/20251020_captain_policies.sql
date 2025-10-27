-- Captain policies: allow class captains to view classmates, view classmates' attendance,
-- and disable biometrics of classmates (cannot enable or register)

-- 1) Captains can view their classmates' profiles
DO $$ BEGIN
  CREATE POLICY "captain view classmates"
  ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    user_profiles.role = 'student'::user_role AND EXISTS (
      SELECT 1 FROM public.class_captains c
      WHERE c.captain_user_id = auth.uid()
        AND c.program_code = user_profiles.program
        AND c.year_name = user_profiles.year
        AND c.section_name = user_profiles.section
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Captains can read attendance of their classmates
DO $$ BEGIN
  CREATE POLICY "captain read classmates attendance"
  ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.class_captains c
        ON c.program_code = up.program
       AND c.year_name = up.year
       AND c.section_name = up.section
      WHERE up.id = attendance_records.user_id
        AND c.captain_user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Captains can disable (but not enable) classmates' biometrics
DO $$ BEGIN
  CREATE POLICY "captain disable classmates biometrics"
  ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (
    user_profiles.role = 'student'::user_role
    AND user_profiles.id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.class_captains c
      WHERE c.captain_user_id = auth.uid()
        AND c.program_code = user_profiles.program
        AND c.year_name = user_profiles.year
        AND c.section_name = user_profiles.section
    )
  )
  WITH CHECK (
    biometric_enabled = false
    AND biometric_registered_at IS NULL
    AND biometric_device_id IS NULL
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
