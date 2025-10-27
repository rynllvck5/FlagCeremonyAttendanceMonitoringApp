-- ==============================================================
-- POPULATE ALL FLAG DAYS (Last 60 days + Future) with ALL students
-- ==============================================================

-- Step 1: Show all flag days that need population
SELECT 
  'FLAG DAYS TO POPULATE' as step,
  date,
  is_flag_day,
  attendance_start,
  on_time_end,
  attendance_end,
  (SELECT COUNT(*) 
   FROM attendance_schedule_required_sections r 
   WHERE r.date = attendance_schedules.date) as currently_required_sections
FROM attendance_schedules
WHERE is_flag_day = true
  AND date >= CURRENT_DATE - INTERVAL '60 days'
ORDER BY date DESC;

-- Step 2: Add ALL student sections as required for ALL flag days
-- This makes every student section required for every flag day
INSERT INTO attendance_schedule_required_sections (date, program_code, year_name, section_name)
SELECT DISTINCT 
  s.date,
  p.program,
  p.year,
  p.section
FROM attendance_schedules s
CROSS JOIN (
  SELECT DISTINCT program, year, section
  FROM user_profiles
  WHERE role = 'student' 
    AND program IS NOT NULL 
    AND year IS NOT NULL 
    AND section IS NOT NULL
) p
WHERE s.is_flag_day = true
  AND s.date >= CURRENT_DATE - INTERVAL '60 days'
ON CONFLICT (date, program_code, year_name, section_name) DO NOTHING;

-- Step 3: Show results
SELECT 
  'POPULATED RESULTS' as step,
  date,
  COUNT(*) as required_sections_count,
  STRING_AGG(program_code || ' ' || year_name || section_name, ', ' ORDER BY program_code, year_name, section_name) as sections
FROM attendance_schedule_required_sections
WHERE date >= CURRENT_DATE - INTERVAL '60 days'
GROUP BY date
ORDER BY date DESC;

-- Step 4: Count affected students
WITH student_sections AS (
  SELECT program, year, section, COUNT(*) as student_count
  FROM user_profiles
  WHERE role = 'student'
    AND program IS NOT NULL
    AND year IS NOT NULL
    AND section IS NOT NULL
  GROUP BY program, year, section
)
SELECT 
  'STUDENTS PER SECTION' as step,
  ss.program || ' ' || ss.year || ss.section as section,
  ss.student_count,
  COUNT(DISTINCT r.date) as required_days
FROM student_sections ss
LEFT JOIN attendance_schedule_required_sections r
  ON r.program_code = ss.program
  AND r.year_name = ss.year
  AND r.section_name = ss.section
  AND r.date >= CURRENT_DATE - INTERVAL '60 days'
GROUP BY ss.program, ss.year, ss.section, ss.student_count
ORDER BY ss.program, ss.year, ss.section;
