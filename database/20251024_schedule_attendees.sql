-- Per-date required teachers and students + templates per college
-- Safe/idempotent migration

-- Required teachers for a given schedule date
CREATE TABLE IF NOT EXISTS public.attendance_schedule_required_teachers (
  date date NOT NULL REFERENCES public.attendance_schedules(date) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (date, teacher_id)
);

ALTER TABLE public.attendance_schedule_required_teachers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth read schedule required teachers"
    ON public.attendance_schedule_required_teachers FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin manage schedule required teachers insert"
    ON public.attendance_schedule_required_teachers FOR INSERT TO authenticated
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin manage schedule required teachers update"
    ON public.attendance_schedule_required_teachers FOR UPDATE TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin manage schedule required teachers delete"
    ON public.attendance_schedule_required_teachers FOR DELETE TO authenticated
    USING (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_schedule_required_teachers TO authenticated, service_role;

-- Required students for a given schedule date
CREATE TABLE IF NOT EXISTS public.attendance_schedule_required_students (
  date date NOT NULL REFERENCES public.attendance_schedules(date) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (date, student_id)
);

ALTER TABLE public.attendance_schedule_required_students ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth read schedule required students"
    ON public.attendance_schedule_required_students FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin manage schedule required students insert"
    ON public.attendance_schedule_required_students FOR INSERT TO authenticated
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin manage schedule required students update"
    ON public.attendance_schedule_required_students FOR UPDATE TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin manage schedule required students delete"
    ON public.attendance_schedule_required_students FOR DELETE TO authenticated
    USING (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_schedule_required_students TO authenticated, service_role;

-- Template: last used required teachers per college
CREATE TABLE IF NOT EXISTS public.flag_template_teachers (
  college_code TEXT NOT NULL REFERENCES public.colleges(code) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (college_code, teacher_id)
);
ALTER TABLE public.flag_template_teachers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth read template teachers"
    ON public.flag_template_teachers FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin manage template teachers insert"
    ON public.flag_template_teachers FOR INSERT TO authenticated
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin manage template teachers update"
    ON public.flag_template_teachers FOR UPDATE TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin manage template teachers delete"
    ON public.flag_template_teachers FOR DELETE TO authenticated
    USING (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flag_template_teachers TO authenticated, service_role;

-- Template: last used required students per college
CREATE TABLE IF NOT EXISTS public.flag_template_students (
  college_code TEXT NOT NULL REFERENCES public.colleges(code) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (college_code, student_id)
);
ALTER TABLE public.flag_template_students ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth read template students"
    ON public.flag_template_students FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin manage template students insert"
    ON public.flag_template_students FOR INSERT TO authenticated
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin manage template students update"
    ON public.flag_template_students FOR UPDATE TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin manage template students delete"
    ON public.flag_template_students FOR DELETE TO authenticated
    USING (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flag_template_students TO authenticated, service_role;
