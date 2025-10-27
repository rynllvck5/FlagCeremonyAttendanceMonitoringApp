-- ==========================================
-- CURRENT DATABASE STATE - Quick Overview
-- ==========================================

-- 1. All Students
SELECT 
  'ALL STUDENTS' as section,
  COUNT(*) as total,
  COUNT(program) as with_program,
  COUNT(year) as with_year,
  COUNT(section) as with_section
FROM user_profiles
WHERE role = 'student';

-- 2. Student Sections (unique combinations)
SELECT 
  'STUDENT SECTIONS' as section,
  program,
  year,
  section,
  COUNT(*) as student_count
FROM user_profiles
WHERE role = 'student'
  AND program IS NOT NULL
  AND year IS NOT NULL
  AND section IS NOT NULL
GROUP BY program, year, section
ORDER BY program, year, section;

-- 3. Flag Days (Last 60 days + Next 30 days)
SELECT 
  'FLAG DAYS' as section,
  date,
  is_flag_day,
  attendance_start,
  on_time_end,
  attendance_end,
  CASE 
    WHEN date < CURRENT_DATE THEN 'Past'
    WHEN date = CURRENT_DATE THEN 'TODAY'
    ELSE 'Future'
  END as time_status
FROM attendance_schedules
WHERE is_flag_day = true
  AND date >= CURRENT_DATE - INTERVAL '60 days'
  AND date <= CURRENT_DATE + INTERVAL '30 days'
ORDER BY date DESC;

-- 4. Required Sections per Flag Day
SELECT 
  'REQUIRED SECTIONS' as section,
  date,
  COUNT(*) as section_count,
  STRING_AGG(program_code || ' ' || year_name || section_name, ', ' ORDER BY program_code, year_name, section_name) as sections
FROM attendance_schedule_required_sections
WHERE date >= CURRENT_DATE - INTERVAL '60 days'
  AND date <= CURRENT_DATE + INTERVAL '30 days'
GROUP BY date
ORDER BY date DESC;

-- 5. Attendance Records (Last 7 days)
SELECT 
  'ATTENDANCE RECORDS (Last 7 days)' as section,
  DATE(created_at) as date,
  COUNT(*) as total_records,
  COUNT(CASE WHEN verified = true THEN 1 END) as verified,
  COUNT(CASE WHEN verified = false THEN 1 END) as unverified
FROM attendance_records
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 6. Today's Status
SELECT 
  'TODAY STATUS' as section,
  CASE 
    WHEN EXISTS (SELECT 1 FROM attendance_schedules WHERE date = CURRENT_DATE AND is_flag_day = true)
    THEN '✅ YES'
    ELSE '❌ NO'
  END as is_today_flag_day,
  COALESCE((
    SELECT COUNT(DISTINCT program_code || year_name || section_name)
    FROM attendance_schedule_required_sections
    WHERE date = CURRENT_DATE
  ), 0) as required_sections_today,
  COALESCE((
    SELECT COUNT(DISTINCT user_id)
    FROM attendance_records
    WHERE DATE(created_at) = CURRENT_DATE
  ), 0) as students_recorded_today,
  COALESCE((
    SELECT COUNT(DISTINCT user_id)
    FROM attendance_records
    WHERE DATE(created_at) = CURRENT_DATE AND verified = true
  ), 0) as students_verified_today;

-- 7. Problem Detection
SELECT 
  'PROBLEMS DETECTED' as section,
  problem,
  count
FROM (
  SELECT 
    'Students without program/year/section' as problem,
    COUNT(*) as count
  FROM user_profiles
  WHERE role = 'student'
    AND (program IS NULL OR year IS NULL OR section IS NULL)
  
  UNION ALL
  
  SELECT 
    'Flag days without required sections' as problem,
    COUNT(*) as count
  FROM attendance_schedules s
  WHERE s.is_flag_day = true
    AND s.date >= CURRENT_DATE - INTERVAL '60 days'
    AND NOT EXISTS (
      SELECT 1 FROM attendance_schedule_required_sections r
      WHERE r.date = s.date
    )
) problems
WHERE count > 0;
