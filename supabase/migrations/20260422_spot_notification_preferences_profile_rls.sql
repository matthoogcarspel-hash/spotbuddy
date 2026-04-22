alter table public.spot_notification_preferences enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'spot_notification_preferences'
  loop
    execute format('drop policy if exists %I on public.spot_notification_preferences', policy_record.policyname);
  end loop;
end
$$;

create policy spot_notification_preferences_select_owned_profile
on public.spot_notification_preferences
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = spot_notification_preferences.user_id
      and profiles.owner_uid = auth.uid()
  )
);

create policy spot_notification_preferences_insert_owned_profile
on public.spot_notification_preferences
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = spot_notification_preferences.user_id
      and profiles.owner_uid = auth.uid()
  )
);

create policy spot_notification_preferences_update_owned_profile
on public.spot_notification_preferences
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = spot_notification_preferences.user_id
      and profiles.owner_uid = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = spot_notification_preferences.user_id
      and profiles.owner_uid = auth.uid()
  )
);

create policy spot_notification_preferences_delete_owned_profile
on public.spot_notification_preferences
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = spot_notification_preferences.user_id
      and profiles.owner_uid = auth.uid()
  )
);
