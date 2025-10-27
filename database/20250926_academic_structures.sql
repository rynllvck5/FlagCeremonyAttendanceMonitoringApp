-- Dynamic academic structures for colleges, programs, years, sections, and teacher positions
-- All fields are VARCHAR/TEXT as requested

-- Colleges
CREATE TABLE IF NOT EXISTS public.colleges (
  code TEXT PRIMARY KEY, -- e.g., 'CCS'
  name TEXT NOT NULL UNIQUE, -- e.g., 'College of Computer Science'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Programs belong to a College
CREATE TABLE IF NOT EXISTS public.programs (
  code TEXT PRIMARY KEY, -- e.g., 'BSCS'
  name TEXT NOT NULL UNIQUE, -- e.g., 'Bachelor of Science in Computer Science'
  college_code TEXT NOT NULL REFERENCES public.colleges(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (college_code, name)
);

-- Program Years belong to a Program. Using TEXT for year_name (e.g., 'First', 'Second', 'Third', 'Fourth')
CREATE TABLE IF NOT EXISTS public.program_years (
  program_code TEXT NOT NULL REFERENCES public.programs(code) ON UPDATE CASCADE ON DELETE CASCADE,
  year_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (program_code, year_name)
);

-- Sections belong to a Program + Year
CREATE TABLE IF NOT EXISTS public.program_sections (
  program_code TEXT NOT NULL,
  year_name TEXT NOT NULL,
  section_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (program_code, year_name, section_name),
  FOREIGN KEY (program_code, year_name) REFERENCES public.program_years(program_code, year_name) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Teacher positions (dynamic list)
CREATE TABLE IF NOT EXISTS public.teacher_positions (
  name TEXT PRIMARY KEY, -- e.g., 'Professor', 'Associate Professor', 'Assistant Professor'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Basic grants for selecting these tables (RLS off; metadata)
ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_positions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='colleges' AND policyname='Allow read to all'
  ) THEN
    CREATE POLICY "Allow read to all" ON public.colleges FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='programs' AND policyname='Allow read to all'
  ) THEN
    CREATE POLICY "Allow read to all" ON public.programs FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='program_years' AND policyname='Allow read to all'
  ) THEN
    CREATE POLICY "Allow read to all" ON public.program_years FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='program_sections' AND policyname='Allow read to all'
  ) THEN
    CREATE POLICY "Allow read to all" ON public.program_sections FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='teacher_positions' AND policyname='Allow read to all'
  ) THEN
    CREATE POLICY "Allow read to all" ON public.teacher_positions FOR SELECT USING (true);
  END IF;
END $$;

GRANT SELECT ON public.colleges, public.programs, public.program_years, public.program_sections, public.teacher_positions TO anon, authenticated, service_role;
