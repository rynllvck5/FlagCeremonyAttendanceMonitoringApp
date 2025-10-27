-- Extend schedules with college and per-date required sections + template per college

-- Add college and require_teachers to schedules
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='attendance_schedules' AND column_name='college_code'
  ) THEN
    ALTER TABLE public.attendance_schedules ADD COLUMN college_code TEXT REFERENCES public.colleges(code);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='attendance_schedules' AND column_name='require_teachers'
  ) THEN
    ALTER TABLE public.attendance_schedules ADD COLUMN require_teachers boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Required sections for a given schedule date
CREATE TABLE IF NOT EXISTS public.attendance_schedule_required_sections (
  date date NOT NULL REFERENCES public.attendance_schedules(date) ON DELETE CASCADE,
  program_code TEXT NOT NULL,
  year_name TEXT NOT NULL,
  section_name TEXT NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (date, program_code, year_name, section_name)
);

ALTER TABLE public.attendance_schedule_required_sections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Anyone authenticated can read schedule requirements"
    ON public.attendance_schedule_required_sections FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins can modify schedule requirements (insert)"
    ON public.attendance_schedule_required_sections FOR INSERT TO authenticated
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins can modify schedule requirements (update/delete)"
    ON public.attendance_schedule_required_sections FOR UPDATE TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_schedule_required_sections TO authenticated, service_role;

-- Saved template per college (last used requirements)
CREATE TABLE IF NOT EXISTS public.flag_templates (
  college_code TEXT PRIMARY KEY REFERENCES public.colleges(code),
  require_teachers boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.flag_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Anyone authenticated can read templates"
    ON public.flag_templates FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins can upsert templates"
    ON public.flag_templates FOR INSERT TO authenticated
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins can update templates"
    ON public.flag_templates FOR UPDATE TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, UPDATE ON public.flag_templates TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.flag_template_sections (
  college_code TEXT NOT NULL REFERENCES public.colleges(code) ON DELETE CASCADE,
  program_code TEXT NOT NULL,
  year_name TEXT NOT NULL,
  section_name TEXT NOT NULL,
  PRIMARY KEY (college_code, program_code, year_name, section_name)
);
ALTER TABLE public.flag_template_sections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Anyone authenticated can read template sections"
    ON public.flag_template_sections FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins can modify template sections (insert/delete)"
    ON public.flag_template_sections FOR INSERT TO authenticated
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins can modify template sections (update/delete)"
    ON public.flag_template_sections FOR UPDATE TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flag_template_sections TO authenticated, service_role;
