-- Crypto Identity + Attendance Sessions
-- Idempotent migration; safe to re-run

-- Extensions
create extension if not exists pgcrypto;

-- user_profiles additions
alter table public.user_profiles
  add column if not exists public_key text,
  add column if not exists device_id text,
  add column if not exists crypto_identity_created_at timestamptz;

-- Sessions table
create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  lat double precision not null,
  lng double precision not null,
  radius_m integer not null default 50,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.attendance_sessions enable row level security;

dO $$ BEGIN
  CREATE POLICY "Admins manage sessions"
  ON public.attendance_sessions
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create index if not exists idx_attendance_sessions_token on public.attendance_sessions(token);
create index if not exists idx_attendance_sessions_expires on public.attendance_sessions(expires_at);
