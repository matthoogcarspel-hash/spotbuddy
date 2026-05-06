-- Allow multiple open sessions per user/spot/day when time slots differ.
-- Keep protection against exact duplicate open sessions.

drop index if exists sessions_one_open_per_user_idx;

create unique index if not exists sessions_one_open_timeslot_per_user_idx
  on public.sessions (user_id, spot_name, session_day, start_time, end_time)
  where checked_out_at is null
    and coalesce(lower(status), '') not in ('finished', 'uitchecken');
