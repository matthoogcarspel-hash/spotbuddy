-- Phase 1 hardening: enforce one row per (user_id, spot_name) for reliable upsert/select.

delete from public.spot_notification_preferences
where user_id is null
  or spot_name is null;

with ranked_rows as (
  select
    ctid,
    row_number() over (
      partition by user_id, spot_name
      order by ctid desc
    ) as row_number
  from public.spot_notification_preferences
)
delete from public.spot_notification_preferences preference
using ranked_rows
where preference.ctid = ranked_rows.ctid
  and ranked_rows.row_number > 1;

alter table public.spot_notification_preferences
  alter column user_id set not null,
  alter column spot_name set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'spot_notification_preferences_user_spot_unique'
      and conrelid = 'public.spot_notification_preferences'::regclass
  ) then
    alter table public.spot_notification_preferences
      add constraint spot_notification_preferences_user_spot_unique
      unique (user_id, spot_name);
  end if;
end
$$;
