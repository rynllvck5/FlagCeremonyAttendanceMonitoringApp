-- Advisory classes (teachers assigned to specific sections) and Class Captain assignment

-- Advisory assignments: which classes a teacher advises
CREATE TABLE IF NOT EXISTS public.advisory_assignments (
  teacher_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  program_code TEXT NOT NULL,
  year_name TEXT NOT NULL,
  section_name TEXT NOT NULL,
  assigned_at timestamptz DEFAULT now(),
  PRIMARY KEY (teacher_id, program_code, year_name, section_name)
);

ALTER TABLE public.advisory_assignments ENABLE ROW LEVEL SECURITY;
-- Anyone authenticated can read (for app UI)
DO $$ BEGIN
  CREATE POLICY "advisory read auth" ON public.advisory_assignments
  FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Only admins can add/remove advisory assignments
DO $$ BEGIN
  CREATE POLICY "advisory insert admin" ON public.advisory_assignments
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "advisory delete admin" ON public.advisory_assignments
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, DELETE ON public.advisory_assignments TO authenticated, service_role;

-- Class captain per class section
CREATE TABLE IF NOT EXISTS public.class_captains (
  program_code TEXT NOT NULL,
  year_name TEXT NOT NULL,
  section_name TEXT NOT NULL,
  captain_user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz DEFAULT now(),
  PRIMARY KEY (program_code, year_name, section_name)
);

ALTER TABLE public.class_captains ENABLE ROW LEVEL SECURITY;
-- Anyone authenticated can read captain
DO $$ BEGIN
  CREATE POLICY "captain read auth" ON public.class_captains
  FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Admins or the adviser of the class can insert/update/delete
DO $$ BEGIN
  CREATE POLICY "captain manage admin" ON public.class_captains
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Adviser (teacher) can manage if they have advisory assignment for the class
DO $$ BEGIN
  CREATE POLICY "captain manage adviser" ON public.class_captains
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.advisory_assignments a
    WHERE a.teacher_id = auth.uid()
      AND a.program_code = class_captains.program_code
      AND a.year_name = class_captains.year_name
      AND a.section_name = class_captains.section_name
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.advisory_assignments a
    WHERE a.teacher_id = auth.uid()
      AND a.program_code = class_captains.program_code
      AND a.year_name = class_captains.year_name
      AND a.section_name = class_captains.section_name
  ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_captains TO authenticated, service_role;
