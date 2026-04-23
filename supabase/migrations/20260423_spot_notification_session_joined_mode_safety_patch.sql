-- Safety patch: guarantees the session_joined_notification_mode contract even if prior migration was skipped.
alter table public.spot_notification_preferences
  add column if not exists session_joined_notification_mode text;

alter table public.spot_notification_preferences
  alter column session_joined_notification_mode set default 'off';

update public.spot_notification_preferences
set session_joined_notification_mode = 'off'
where session_joined_notification_mode is null
   or session_joined_notification_mode not in ('off', 'following', 'everyone');

alter table public.spot_notification_preferences
  alter column session_joined_notification_mode set not null;

alter table public.spot_notification_preferences
  drop constraint if exists spot_notification_preferences_session_joined_notification_mode_check;

alter table public.spot_notification_preferences
  add constraint spot_notification_preferences_session_joined_notification_mode_check
  check (session_joined_notification_mode in ('off', 'following', 'everyone'));
