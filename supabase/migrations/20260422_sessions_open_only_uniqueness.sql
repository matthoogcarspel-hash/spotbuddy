-- Enforce one open session per user/spot/day while allowing multiple finished sessions.

-- Legacy unique constraint name observed in production.
alter table public.sessions
  drop constraint if exists sessions_unique;

-- Remove prior full-day unique index so finished sessions no longer block new plans.
drop index if exists sessions_user_spot_session_day_unique_idx;

-- New rule: only open (non-finished) rows participate in uniqueness.
create unique index if not exists sessions_one_open_per_user_idx
  on public.sessions (user_id, spot_name, session_day)
  where checked_out_at is null
    and coalesce(lower(status), '') not in ('finished', 'uitchecken');
