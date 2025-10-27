-- Add extra varchar fields to user_profiles for roles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='user_profiles' AND column_name='program'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN program TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='user_profiles' AND column_name='year'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN year TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='user_profiles' AND column_name='section'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN section TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='user_profiles' AND column_name='position'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN position TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='user_profiles' AND column_name='college'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN college TEXT;
  END IF;
END $$;

-- Basic grants already exist via previous schema; columns inherit
