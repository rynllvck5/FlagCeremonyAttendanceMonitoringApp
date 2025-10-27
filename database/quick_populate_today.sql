-- ==============================================
-- QUICK: Make ALL students required for TODAY
-- ==============================================

-- First, check if today is a flag day
SELECT 
  'CHECKING TODAY' as step,
  CURRENT_DATE as today,
  is_flag_day,
  attendance_start,
  on_time_end,
  attendance_end
FROM attendance_schedules
WHERE date = CURRENT_DATE;

-- Add all student sections as required for today
-- (Only runs if today is a flag day)
INSERT INTO attendance_schedule_required_sections (date, program_code, year_name, section_name)
SELECT DISTINCT 
  CURRENT_DATE,
  program,
  year,
  section
FROM user_profiles
WHERE role = 'student' 
  AND program IS NOT NULL 
  AND year IS NOT NULL 
  AND section IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM attendance_schedules 
    WHERE date = CURRENT_DATE AND is_flag_day = true
  )
ON CONFLICT (date, program_code, year_name, section_name) DO NOTHING;

-- Verify what was added
SELECT 
  'REQUIRED SECTIONS FOR TODAY' as result,
  date,
  program_code,
  year_name,
  section_name
FROM attendance_schedule_required_sections
WHERE date = CURRENT_DATE;
