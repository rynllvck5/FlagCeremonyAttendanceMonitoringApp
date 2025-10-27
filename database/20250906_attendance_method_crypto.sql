-- Allow 'crypto' method in attendance_records.method
DO $$
DECLARE
  cname text;
BEGIN
  -- Only proceed if the column exists
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'attendance_records'
      AND column_name = 'method'
  ) THEN
    -- Drop default to avoid dependency issues during constraint changes
    ALTER TABLE public.attendance_records
      ALTER COLUMN method DROP DEFAULT;

    -- Drop any existing CHECK constraints that reference method IN (...)
    FOR cname IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.attendance_records'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%check%method%in%'
    LOOP
      EXECUTE format('ALTER TABLE public.attendance_records DROP CONSTRAINT %I', cname);
    END LOOP;

    -- Ensure our named constraint is not present
    EXECUTE 'ALTER TABLE public.attendance_records DROP CONSTRAINT IF EXISTS attendance_records_method_check';

    -- Add the desired constraint
    ALTER TABLE public.attendance_records
      ADD CONSTRAINT attendance_records_method_check
      CHECK (method IN ('crypto','qr','manual'));

    -- Restore default
    ALTER TABLE public.attendance_records
      ALTER COLUMN method SET DEFAULT 'qr';
  END IF;
END $$;