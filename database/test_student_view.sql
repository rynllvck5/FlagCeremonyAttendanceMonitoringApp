-- Test what a specific student should see
-- Replace 'student@example.com' with actual student email

-- 1. Get student profile
SELECT 
  'STUDENT PROFILE' as section,
  id, email, first_name, last_name, program, year, section
FROM user_profiles
WHERE email = 'student@example.com';

-- 2. Get flag days in last 60 days
WITH student_info AS (
  SELECT id, program, year, section
  FROM user_profiles
  WHERE email = 'student@example.com'
)
SELECT 
  'FLAG DAYS (Last 60)' as section,
  s.date,
  s.attendance_start,
  s.on_time_end,
  s.attendance_end,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM attendance_schedule_required_sections r
      WHERE r.date = s.date
        AND LOWER(TRIM(r.program_code)) = LOWER(TRIM((SELECT program FROM student_info)))
        AND LOWER(TRIM(r.year_name)) = LOWER(TRIM((SELECT year FROM student_info)))
        AND LOWER(TRIM(r.section_name)) = LOWER(TRIM((SELECT section FROM student_info)))
    ) THEN 'REQUIRED (section)'
    WHEN EXISTS (
      SELECT 1 FROM attendance_schedule_required_students r
      WHERE r.date = s.date
        AND r.student_id = (SELECT id FROM student_info)
    ) THEN 'REQUIRED (explicit)'
    ELSE 'NOT REQUIRED'
  END as requirement_status
FROM attendance_schedules s
WHERE s.is_flag_day = true
  AND s.date >= CURRENT_DATE - INTERVAL '60 days'
  AND s.date <= CURRENT_DATE
ORDER BY s.date DESC;

-- 3. Get student's attendance records in last 60 days
SELECT 
  'ATTENDANCE RECORDS' as section,
  DATE(created_at) as date,
  TO_CHAR(created_at, 'HH24:MI:SS') as time,
  verified,
  method
FROM attendance_records
WHERE user_id = (SELECT id FROM user_profiles WHERE email = 'student@example.com')
  AND created_at >= CURRENT_DATE - INTERVAL '60 days'
ORDER BY created_at DESC;
