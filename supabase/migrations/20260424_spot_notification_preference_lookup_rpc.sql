begin;

create or replace function public.get_spot_session_joined_notification_preference(
  lookup_user_id uuid,
  lookup_spot_name text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  mode_value text;
begin
  if not exists (
    select 1
    from public.profiles
    where profiles.owner_uid = auth.uid()
  ) then
    raise exception 'AUTH_PROFILE_NOT_FOUND';
  end if;

  select preference.session_joined_notification_mode
  into mode_value
  from public.spot_notification_preferences preference
  where preference.user_id = lookup_user_id
    and preference.spot_name = lookup_spot_name
  limit 1;

  return mode_value;
end;
$$;

revoke all on function public.get_spot_session_joined_notification_preference(uuid, text) from public;
grant execute on function public.get_spot_session_joined_notification_preference(uuid, text) to authenticated;

commit;
