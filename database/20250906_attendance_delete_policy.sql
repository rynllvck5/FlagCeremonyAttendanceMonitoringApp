-- Allow admins to delete attendance records (RLS)
-- Idempotent policy creation

DO $$ BEGIN
  CREATE POLICY "Admins can delete attendance"
    ON public.attendance_records FOR DELETE TO authenticated
    USING (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT DELETE ON public.attendance_records TO authenticated;
