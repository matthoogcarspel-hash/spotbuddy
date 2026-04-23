alter table public.spot_notification_preferences enable row level security;

drop policy if exists spot_notification_preferences_select_owned_profile on public.spot_notification_preferences;
drop policy if exists spot_notification_preferences_insert_owned_profile on public.spot_notification_preferences;
drop policy if exists spot_notification_preferences_update_owned_profile on public.spot_notification_preferences;
drop policy if exists spot_notification_preferences_delete_owned_profile on public.spot_notification_preferences;

create policy spot_notification_preferences_select_owned_profile
on public.spot_notification_preferences
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = spot_notification_preferences.user_id
      and (
        profiles.owner_uid = auth.uid()
        or profiles.id = auth.uid()
      )
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
      and (
        profiles.owner_uid = auth.uid()
        or profiles.id = auth.uid()
      )
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
      and (
        profiles.owner_uid = auth.uid()
        or profiles.id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = spot_notification_preferences.user_id
      and (
        profiles.owner_uid = auth.uid()
        or profiles.id = auth.uid()
      )
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
      and (
        profiles.owner_uid = auth.uid()
        or profiles.id = auth.uid()
      )
  )
);
