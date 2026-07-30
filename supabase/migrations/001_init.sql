-- Apex initial schema (spec §7)
create extension if not exists "uuid-ossp";

create table public.users (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid references auth.users(id) on delete cascade,
  strava_athlete_id bigint unique,
  created_at timestamptz not null default now(),
  sex text check (sex in ('M','F')),
  dob date,
  weight_kg numeric,
  resting_hr int,
  max_hr int,
  max_hr_is_estimated boolean not null default false,
  hr_zones jsonb,
  units_pref text not null default 'mi_f' check (units_pref in ('mi_f','km_c')),
  onboarding_completed_at timestamptz,
  strava_access_token text,
  strava_refresh_token text,
  strava_token_expires_at timestamptz,
  strava_connection_status text not null default 'disconnected'
    check (strava_connection_status in ('connected','needs_reauth','disconnected')),
  last_synced_at timestamptz
);

create table public.activities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  strava_activity_id bigint unique,
  start_time timestamptz not null,
  start_lat double precision,
  start_lng double precision,
  distance_m numeric not null,
  moving_time_s int not null,
  elapsed_time_s int not null,
  elevation_gain_m numeric not null default 0,
  avg_speed_ms numeric,
  avg_hr numeric,
  max_hr numeric,
  avg_cadence numeric,
  pace_cv numeric,
  type text,
  is_run boolean not null default true,
  is_race_tagged boolean not null default false,
  is_treadmill boolean not null default false,
  name text,
  quality_flags jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index on public.activities (user_id, start_time desc);

create table public.activity_weather (
  activity_id uuid primary key references public.activities(id) on delete cascade,
  temp_c numeric,
  humidity_pct numeric,
  dewpoint_c numeric,
  wind_ms numeric,
  source text not null default 'open-meteo',
  fetched_at timestamptz not null default now()
);

create table public.activity_metrics (
  activity_id uuid primary key references public.activities(id) on delete cascade,
  trimp numeric,
  efficiency_factor numeric,
  vo2max_estimate numeric,
  adjusted_pace_s_per_km numeric,
  workout_type text check (workout_type in ('easy','tempo','interval','long','race')),
  workout_type_source text not null default 'auto_detected'
    check (workout_type_source in ('auto_detected','user_corrected')),
  computed_at timestamptz not null default now(),
  formula_version int not null default 1
);

create table public.daily_load (
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  acute_load_7d numeric,
  chronic_load_28d numeric,
  acwr numeric,
  primary key (user_id, date)
);

create table public.courses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  distance_m numeric not null,
  elevation_gain_m numeric not null default 0,
  race_date date,
  expected_temp_c numeric,
  expected_humidity_pct numeric,
  elevation_profile jsonb,
  key_features jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table public.projections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  distance text not null,
  horizon_days int not null,
  scenario text not null check (scenario in ('conservative','target','stretch')),
  time_low_s numeric not null,
  time_high_s numeric not null,
  computed_at timestamptz not null default now(),
  formula_version int not null default 1
);

-- RLS: owner-only access on every table; tokens only via service role
alter table public.users enable row level security;
alter table public.activities enable row level security;
alter table public.activity_weather enable row level security;
alter table public.activity_metrics enable row level security;
alter table public.daily_load enable row level security;
alter table public.courses enable row level security;
alter table public.projections enable row level security;

create policy "own user row" on public.users
  for select using (auth.uid() = auth_user_id);
create policy "update own user row" on public.users
  for update using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

create policy "own activities" on public.activities
  for all using (user_id in (select id from public.users where auth_user_id = auth.uid()));
create policy "own weather" on public.activity_weather
  for all using (activity_id in (
    select a.id from public.activities a
    join public.users u on u.id = a.user_id
    where u.auth_user_id = auth.uid()));
create policy "own metrics" on public.activity_metrics
  for all using (activity_id in (
    select a.id from public.activities a
    join public.users u on u.id = a.user_id
    where u.auth_user_id = auth.uid()));
create policy "own daily load" on public.daily_load
  for all using (user_id in (select id from public.users where auth_user_id = auth.uid()));
create policy "own courses" on public.courses
  for all using (user_id in (select id from public.users where auth_user_id = auth.uid()));
create policy "own projections" on public.projections
  for all using (user_id in (select id from public.users where auth_user_id = auth.uid()));

-- Strava token columns must never reach the client: revoke column-level select
revoke select (strava_access_token, strava_refresh_token) on public.users from anon, authenticated;
