alter table public.sessions
  add column if not exists session_day date
  generated always as ((created_at at time zone 'utc')::date) stored;

create unique index if not exists sessions_user_spot_session_day_unique_idx
  on public.sessions (user_id, spot_name, session_day);
