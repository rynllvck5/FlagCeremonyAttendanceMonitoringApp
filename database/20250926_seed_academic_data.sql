-- Seed data for academic structures and teacher positions
-- Colleges
INSERT INTO public.colleges (code, name) VALUES
  ('CCS', 'College of Computer Science'),
  ('CE', 'College of Education'),
  ('CAS', 'College of Arts and Sciences'),
  ('CCHAMS', 'College of Community Health and Allied Medical Sciences'),
  ('CF', 'College of Fisheries'),
  ('CA', 'College of Agriculture')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- Programs
INSERT INTO public.programs (code, name, college_code) VALUES
  ('BSCS', 'Bachelor of Science in Computer Science', 'CCS')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, college_code = EXCLUDED.college_code;

-- Program Years for BSCS
INSERT INTO public.program_years (program_code, year_name) VALUES
  ('BSCS', 'First'),
  ('BSCS', 'Second'),
  ('BSCS', 'Third'),
  ('BSCS', 'Fourth')
ON CONFLICT (program_code, year_name) DO NOTHING;

-- Sections for BSCS First Year (A–H)
INSERT INTO public.program_sections (program_code, year_name, section_name) VALUES
  ('BSCS', 'First', 'A'),
  ('BSCS', 'First', 'B'),
  ('BSCS', 'First', 'C'),
  ('BSCS', 'First', 'D'),
  ('BSCS', 'First', 'E'),
  ('BSCS', 'First', 'F'),
  ('BSCS', 'First', 'G'),
  ('BSCS', 'First', 'H')
ON CONFLICT (program_code, year_name, section_name) DO NOTHING;

-- Sections for BSCS Second Year (A–J)
INSERT INTO public.program_sections (program_code, year_name, section_name) VALUES
  ('BSCS', 'Second', 'A'),
  ('BSCS', 'Second', 'B'),
  ('BSCS', 'Second', 'C'),
  ('BSCS', 'Second', 'D'),
  ('BSCS', 'Second', 'E'),
  ('BSCS', 'Second', 'F'),
  ('BSCS', 'Second', 'G'),
  ('BSCS', 'Second', 'H'),
  ('BSCS', 'Second', 'I'),
  ('BSCS', 'Second', 'J')
ON CONFLICT (program_code, year_name, section_name) DO NOTHING;

-- Teacher Positions
INSERT INTO public.teacher_positions (name) VALUES
  ('Professor'),
  ('Associate Professor'),
  ('Assistant Professor'),
  ('Instructor')
ON CONFLICT (name) DO NOTHING;
