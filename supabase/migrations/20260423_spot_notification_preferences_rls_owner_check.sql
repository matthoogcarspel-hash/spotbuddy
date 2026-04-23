alter table public.spot_notification_preferences enable row level security;

create or replace function public.spot_notification_preferences_is_owner(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = profile_id
      and (
        profiles.owner_uid = auth.uid()
        or profiles.id = auth.uid()
      )
  );
$$;

revoke all on function public.spot_notification_preferences_is_owner(uuid) from public;
grant execute on function public.spot_notification_preferences_is_owner(uuid) to authenticated;

drop policy if exists spot_notification_preferences_select_owned_profile on public.spot_notification_preferences;
drop policy if exists spot_notification_preferences_insert_owned_profile on public.spot_notification_preferences;
drop policy if exists spot_notification_preferences_update_owned_profile on public.spot_notification_preferences;
drop policy if exists spot_notification_preferences_delete_owned_profile on public.spot_notification_preferences;

create policy spot_notification_preferences_select_owned_profile
on public.spot_notification_preferences
for select
to authenticated
using (public.spot_notification_preferences_is_owner(user_id));

create policy spot_notification_preferences_insert_owned_profile
on public.spot_notification_preferences
for insert
to authenticated
with check (public.spot_notification_preferences_is_owner(user_id));

create policy spot_notification_preferences_update_owned_profile
on public.spot_notification_preferences
for update
to authenticated
using (public.spot_notification_preferences_is_owner(user_id))
with check (public.spot_notification_preferences_is_owner(user_id));

create policy spot_notification_preferences_delete_owned_profile
on public.spot_notification_preferences
for delete
to authenticated
using (public.spot_notification_preferences_is_owner(user_id));
