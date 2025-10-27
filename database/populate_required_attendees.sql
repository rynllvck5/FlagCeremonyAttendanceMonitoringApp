-- First, check what flag days exist
SELECT date, is_flag_day, attendance_start, on_time_end, attendance_end 
FROM attendance_schedules 
WHERE is_flag_day = true 
ORDER BY date DESC 
LIMIT 10;

-- Check if any required sections are configured
SELECT * FROM attendance_schedule_required_sections ORDER BY date DESC LIMIT 10;

-- Check if any required students are configured
SELECT * FROM attendance_schedule_required_students ORDER BY date DESC LIMIT 10;

-- Example: Add all BSCS Year 1 Section A students as required for a specific date
-- Replace '2025-10-24' with your actual flag day date
INSERT INTO attendance_schedule_required_sections (date, program_code, year_name, section_name)
VALUES (DATE '2025-10-24', 'BSCS', '1', 'A')
ON CONFLICT (date, program_code, year_name, section_name) DO NOTHING;

-- If you want ALL students required for a flag day (for testing), 
-- you can add all sections like this:
-- Get unique program/year/section combinations from existing students
INSERT INTO attendance_schedule_required_sections (date, program_code, year_name, section_name)
SELECT DISTINCT 
  DATE '2025-10-24' as date,  -- Change this to your flag day
  program as program_code,
  year as year_name,
  section as section_name
FROM user_profiles
WHERE role = 'student' 
  AND program IS NOT NULL 
  AND year IS NOT NULL 
  AND section IS NOT NULL
ON CONFLICT (date, program_code, year_name, section_name) DO NOTHING;
