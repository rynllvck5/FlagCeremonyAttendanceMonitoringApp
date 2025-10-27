-- Add venue and description fields to attendance_schedules
-- Idempotent migration safe to re-run

ALTER TABLE IF NOT EXISTS public.attendance_schedules
  ADD COLUMN IF NOT EXISTS venue text,
  ADD COLUMN IF NOT EXISTS description text;
