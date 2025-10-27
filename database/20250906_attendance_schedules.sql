-- Attendance schedules to configure flag ceremony days and time windows
-- Idempotent migration

CREATE TABLE IF NOT EXISTS public.attendance_schedules (
  date date PRIMARY KEY,
  is_flag_day boolean NOT NULL DEFAULT false,
  attendance_start time,
  on_time_end time,
  attendance_end time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Row Level Security
ALTER TABLE public.attendance_schedules ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$ BEGIN
  CREATE POLICY "Anyone authenticated can read schedules"
    ON public.attendance_schedules FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can upsert schedules"
    ON public.attendance_schedules FOR INSERT TO authenticated
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update schedules"
    ON public.attendance_schedules FOR UPDATE TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Optional: simple trigger to update updated_at
DO $$ BEGIN
  CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER AS $fn$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $fn$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trg_attendance_schedules_updated_at ON public.attendance_schedules;
  CREATE TRIGGER trg_attendance_schedules_updated_at
  BEFORE UPDATE ON public.attendance_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN undefined_table THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE ON public.attendance_schedules TO authenticated;
