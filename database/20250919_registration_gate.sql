-- Registration gate: admin-issued tokens and anonymous-usable session starter
-- Safe/idempotent
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tokens table (managed by admins)
CREATE TABLE IF NOT EXISTS public.registration_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_by uuid REFERENCES auth.users(id),
  used_at timestamptz
);

ALTER TABLE public.registration_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins manage reg tokens"
    ON public.registration_tokens FOR ALL TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_registration_tokens_token ON public.registration_tokens(token);
CREATE INDEX IF NOT EXISTS idx_registration_tokens_expires ON public.registration_tokens(expires_at);

-- Sessions table (created for anonymous users via SECURITY DEFINER function)
CREATE TABLE IF NOT EXISTS public.registration_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE(token)
);

-- Functions to start and complete registration (bypass RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.start_registration_session(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tok record;
  sid uuid;
BEGIN
  SELECT * INTO tok
  FROM public.registration_tokens
  WHERE token = p_token
    AND (used_by IS NULL)
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired token';
  END IF;

  -- Create or refresh a session linked to this token
  INSERT INTO public.registration_sessions(token, expires_at)
  VALUES (p_token, now() + interval '15 minutes')
  ON CONFLICT (token) DO UPDATE SET expires_at = EXCLUDED.expires_at
  RETURNING id INTO sid;

  RETURN sid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_registration_session(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_registration_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  sess record;
  uid uuid;
BEGIN
  -- Caller must be authenticated
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO sess FROM public.registration_sessions WHERE id = p_session_id;
  IF NOT FOUND OR sess.expires_at <= now() THEN
    RAISE EXCEPTION 'Invalid or expired registration session';
  END IF;

  -- Mark token as used by this user (idempotent OK)
  UPDATE public.registration_tokens
  SET used_by = uid,
      used_at = now()
  WHERE token = sess.token
    AND (used_by IS NULL OR used_by = uid);

  -- Clean up the session
  DELETE FROM public.registration_sessions WHERE id = p_session_id;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_registration_session(uuid) TO authenticated;

-- Admin-only: generate registration token and return JSON { token, expires_at }
CREATE OR REPLACE FUNCTION public.generate_registration_token(p_ttl_minutes integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid;
  ttl integer;
  tok text;
  exp timestamptz;
BEGIN
  uid := auth.uid();
  IF uid IS NULL OR NOT public.is_admin(uid) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  ttl := GREATEST(COALESCE(p_ttl_minutes, 10), 1);
  tok := 'reg_' || md5(random()::text || clock_timestamp()::text);
  exp := now() + make_interval(mins => ttl);

  INSERT INTO public.registration_tokens(token, created_by, expires_at)
  VALUES (tok, uid, exp);

  RETURN json_build_object('token', tok, 'expires_at', exp);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_registration_token(integer) TO authenticated;
