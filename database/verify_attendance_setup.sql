-- ============================================
-- COMPREHENSIVE ATTENDANCE SETUP VERIFICATION
-- ============================================

-- 1. Check Student Profiles (ensure program/year/section are populated)
SELECT 
  '1. STUDENT PROFILES' as check_name,
  COUNT(*) as total_students,
  COUNT(program) as with_program,
  COUNT(year) as with_year,
  COUNT(section) as with_section
FROM user_profiles
WHERE role = 'student';

-- Show sample students with incomplete profiles
SELECT 
  '   Students missing program/year/section:' as note,
  id, email, first_name, last_name, program, year, section
FROM user_profiles
WHERE role = 'student'
  AND (program IS NULL OR year IS NULL OR section IS NULL)
LIMIT 5;

-- 2. Check Flag Days in Last 60 Days
SELECT 
  '2. FLAG DAYS (Last 60 days)' as check_name,
  COUNT(*) as total_flag_days
FROM attendance_schedules
WHERE is_flag_day = true
  AND date >= CURRENT_DATE - INTERVAL '60 days'
  AND date <= CURRENT_DATE;

-- Show recent flag days
SELECT 
  '   Recent flag days:' as note,
  date, attendance_start, on_time_end, attendance_end, venue
FROM attendance_schedules
WHERE is_flag_day = true
  AND date >= CURRENT_DATE - INTERVAL '60 days'
  AND date <= CURRENT_DATE
ORDER BY date DESC
LIMIT 5;

-- 3. Check Required Sections
SELECT 
  '3. REQUIRED SECTIONS' as check_name,
  COUNT(*) as total_required_sections
FROM attendance_schedule_required_sections
WHERE date >= CURRENT_DATE - INTERVAL '60 days';

-- Show sample required sections
SELECT 
  '   Sample required sections:' as note,
  date, program_code, year_name, section_name
FROM attendance_schedule_required_sections
WHERE date >= CURRENT_DATE - INTERVAL '60 days'
ORDER BY date DESC
LIMIT 5;

-- 4. Check Required Students (explicit)
SELECT 
  '4. EXPLICIT REQUIRED STUDENTS' as check_name,
  COUNT(*) as total_explicit_students
FROM attendance_schedule_required_students
WHERE date >= CURRENT_DATE - INTERVAL '60 days';

-- 5. Check Required Teachers
SELECT 
  '5. REQUIRED TEACHERS' as check_name,
  COUNT(*) as total_required_teachers
FROM attendance_schedule_required_teachers
WHERE date >= CURRENT_DATE - INTERVAL '60 days';

-- 6. Check Attendance Records
SELECT 
  '6. ATTENDANCE RECORDS (Last 60 days)' as check_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN verified = true THEN 1 END) as verified_records
FROM attendance_records
WHERE created_at >= CURRENT_DATE - INTERVAL '60 days';

-- 7. Match Check: Students vs Required Sections
WITH student_sections AS (
  SELECT DISTINCT program, year, section
  FROM user_profiles
  WHERE role = 'student'
    AND program IS NOT NULL
    AND year IS NOT NULL
    AND section IS NOT NULL
),
required_today AS (
  SELECT DISTINCT program_code, year_name, section_name
  FROM attendance_schedule_required_sections
  WHERE date = CURRENT_DATE
)
SELECT 
  '7. TODAY MATCH CHECK' as check_name,
  COUNT(DISTINCT s.program || s.year || s.section) as student_sections,
  COUNT(DISTINCT r.program_code || r.year_name || r.section_name) as required_sections,
  COUNT(CASE 
    WHEN LOWER(TRIM(s.program)) = LOWER(TRIM(r.program_code))
     AND LOWER(TRIM(s.year)) = LOWER(TRIM(r.year_name))
     AND LOWER(TRIM(s.section)) = LOWER(TRIM(r.section_name))
    THEN 1 
  END) as matching_sections
FROM student_sections s
FULL OUTER JOIN required_today r 
  ON LOWER(TRIM(s.program)) = LOWER(TRIM(r.program_code))
 AND LOWER(TRIM(s.year)) = LOWER(TRIM(r.year_name))
 AND LOWER(TRIM(s.section)) = LOWER(TRIM(r.section_name));

-- 8. Show mismatches (if any)
SELECT 
  '   Student sections not in required:' as note,
  program, year, section, COUNT(*) as student_count
FROM user_profiles
WHERE role = 'student'
  AND program IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM attendance_schedule_required_sections r
    WHERE r.date = CURRENT_DATE
      AND LOWER(TRIM(r.program_code)) = LOWER(TRIM(user_profiles.program))
      AND LOWER(TRIM(r.year_name)) = LOWER(TRIM(user_profiles.year))
      AND LOWER(TRIM(r.section_name)) = LOWER(TRIM(user_profiles.section))
  )
GROUP BY program, year, section;
