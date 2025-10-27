-- Update a specific student's profile with program, year, and section
-- Replace 'student@example.com' with the actual student email
UPDATE user_profiles 
SET 
  program = 'BSCS',  -- Change to actual program code
  year = '1',        -- Change to actual year
  section = 'A'      -- Change to actual section
WHERE email = 'student@example.com' AND role = 'student';

-- Verify the update
SELECT id, email, first_name, last_name, role, program, year, section 
FROM user_profiles 
WHERE role = 'student';
