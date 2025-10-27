-- Grant teachers read access to student profiles in their advisory classes
-- and allow reading attendance for those advisees.
-- Safe to run multiple times.

-- user_profiles: allow teachers to SELECT students they advise
DO $$ BEGIN
  CREATE POLICY "teacher view advisees"
  ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    user_profiles.role = 'student'::user_role AND EXISTS (
      SELECT 1 FROM public.advisory_assignments a
      WHERE a.teacher_id = auth.uid()
        AND a.program_code = user_profiles.program
        AND a.year_name = user_profiles.year
        AND a.section_name = user_profiles.section
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- attendance_records: allow teachers to SELECT attendance for students they advise
DO $$ BEGIN
  CREATE POLICY "teacher read advisee attendance"
  ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.advisory_assignments a
        ON a.program_code = up.program
       AND a.year_name = up.year
       AND a.section_name = up.section
      WHERE up.id = attendance_records.user_id
        AND a.teacher_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
