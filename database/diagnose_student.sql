-- ========================================
-- DIAGNOSE: What should a student see?
-- ========================================
-- Replace 'student@example.com' with your test student's email in ALL queries below

-- Step 1: Student Profile
SELECT 
  '=== STUDENT PROFILE ===' as step,
  id,
  email,
  first_name,
  last_name,
  role,
  program,
  year,
  section,
  CASE 
    WHEN program IS NULL OR year IS NULL OR section IS NULL 
    THEN '⚠️ INCOMPLETE - Missing program/year/section!'
    ELSE '✅ Complete'
  END as status
FROM user_profiles
WHERE email = 'student@example.com';  -- ⬅️ CHANGE THIS EMAIL

-- Step 2: Flag days in last 60 days
SELECT 
  '=== FLAG DAYS (Last 60 days) ===' as step,
  COUNT(*) as total_flag_days
FROM attendance_schedules
WHERE is_flag_day = true
  AND date >= CURRENT_DATE - INTERVAL '60 days'
  AND date <= CURRENT_DATE;

-- Step 3: Check if student is required for these flag days
WITH student_info AS (
  SELECT id, program, year, section
  FROM user_profiles
  WHERE email = 'student@example.com'  -- ⬅️ CHANGE THIS EMAIL
),
flag_days AS (
  SELECT date
  FROM attendance_schedules
  WHERE is_flag_day = true
    AND date >= CURRENT_DATE - INTERVAL '60 days'
    AND date <= CURRENT_DATE
)
SELECT 
  '=== REQUIRED DAYS FOR STUDENT ===' as step,
  f.date,
  CASE 
    -- Check section match
    WHEN EXISTS (
      SELECT 1 FROM attendance_schedule_required_sections r, student_info s
      WHERE r.date = f.date
        AND LOWER(TRIM(r.program_code)) = LOWER(TRIM(s.program))
        AND LOWER(TRIM(r.year_name)) = LOWER(TRIM(s.year))
        AND LOWER(TRIM(r.section_name)) = LOWER(TRIM(s.section))
    ) THEN '✅ REQUIRED (section match)'
    -- Check explicit student
    WHEN EXISTS (
      SELECT 1 FROM attendance_schedule_required_students r, student_info s
      WHERE r.date = f.date AND r.student_id = s.id
    ) THEN '✅ REQUIRED (explicit)'
    ELSE '❌ NOT REQUIRED'
  END as requirement_status,
  -- Check attendance record
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM attendance_records ar, student_info s
      WHERE ar.user_id = s.id
        AND DATE(ar.created_at) = f.date
        AND ar.verified = true
    ) THEN '✅ Verified'
    WHEN EXISTS (
      SELECT 1 FROM attendance_records ar, student_info s
      WHERE ar.user_id = s.id
        AND DATE(ar.created_at) = f.date
        AND ar.verified = false
    ) THEN '⏳ Pending/Unverified'
    ELSE '❌ Absent'
  END as attendance_status
FROM flag_days f
ORDER BY f.date DESC;

-- Step 4: Summary counts
WITH student_info AS (
  SELECT id, program, year, section
  FROM user_profiles
  WHERE email = 'student@example.com'  -- ⬅️ CHANGE THIS EMAIL
),
required_dates AS (
  SELECT DISTINCT s.date
  FROM attendance_schedules s
  CROSS JOIN student_info si
  WHERE s.is_flag_day = true
    AND s.date >= CURRENT_DATE - INTERVAL '60 days'
    AND s.date <= CURRENT_DATE
    AND (
      -- Section match
      EXISTS (
        SELECT 1 FROM attendance_schedule_required_sections r
        WHERE r.date = s.date
          AND LOWER(TRIM(r.program_code)) = LOWER(TRIM(si.program))
          AND LOWER(TRIM(r.year_name)) = LOWER(TRIM(si.year))
          AND LOWER(TRIM(r.section_name)) = LOWER(TRIM(si.section))
      )
      OR
      -- Explicit match
      EXISTS (
        SELECT 1 FROM attendance_schedule_required_students r
        WHERE r.date = s.date AND r.student_id = si.id
      )
    )
),
attended_dates AS (
  SELECT DISTINCT DATE(ar.created_at) as date, ar.verified
  FROM attendance_records ar, student_info si
  WHERE ar.user_id = si.id
    AND ar.created_at >= CURRENT_DATE - INTERVAL '60 days'
)
SELECT 
  '=== SUMMARY ===' as step,
  (SELECT COUNT(*) FROM required_dates) as total_required_days,
  (SELECT COUNT(*) FROM required_dates rd 
   WHERE EXISTS (
     SELECT 1 FROM attended_dates ad 
     WHERE ad.date = rd.date AND ad.verified = true
   )) as verified_present_days,
  (SELECT COUNT(*) FROM required_dates rd 
   WHERE EXISTS (
     SELECT 1 FROM attended_dates ad 
     WHERE ad.date = rd.date AND ad.verified = false
   )) as unverified_days,
  (SELECT COUNT(*) FROM required_dates rd 
   WHERE rd.date < CURRENT_DATE
     AND NOT EXISTS (
       SELECT 1 FROM attended_dates ad WHERE ad.date = rd.date
   )) as absent_days,
  CASE 
    WHEN (SELECT COUNT(*) FROM required_dates) > 0
    THEN ROUND(
      (SELECT COUNT(*) FROM required_dates rd 
       WHERE EXISTS (
         SELECT 1 FROM attended_dates ad 
         WHERE ad.date = rd.date AND ad.verified = true
       ))::numeric 
      / (SELECT COUNT(*) FROM required_dates)::numeric 
      * 100, 2
    )
    ELSE 0
  END as attendance_percentage;

-- Step 5: Show which sections are configured as required
SELECT 
  '=== REQUIRED SECTIONS IN DB ===' as step,
  date,
  program_code,
  year_name,
  section_name
FROM attendance_schedule_required_sections
WHERE date >= CURRENT_DATE - INTERVAL '60 days'
  AND date <= CURRENT_DATE
ORDER BY date DESC, program_code, year_name, section_name;
