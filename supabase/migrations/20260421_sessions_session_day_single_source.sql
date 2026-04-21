do $$
declare
  is_generated_column text;
begin
  select c.is_generated
  into is_generated_column
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'sessions'
    and c.column_name = 'session_day';

  if is_generated_column = 'ALWAYS' then
    alter table public.sessions drop column session_day;
  end if;
end $$;

alter table public.sessions
  add column if not exists session_day date;

update public.sessions
set session_day = (created_at at time zone 'utc')::date
where session_day is null;

alter table public.sessions
  alter column session_day set not null;

drop index if exists sessions_user_spot_session_day_unique_idx;
create unique index if not exists sessions_user_spot_session_day_unique_idx
  on public.sessions (user_id, spot_name, session_day);
