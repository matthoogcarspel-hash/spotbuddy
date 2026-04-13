alter table public.spot_notification_preferences
  add column if not exists session_planning_notification_mode text,
  add column if not exists checkin_notification_mode text,
  add column if not exists chat_notification_mode text;

update public.spot_notification_preferences
set
  session_planning_notification_mode = case
    when coalesce(session_planning_notifications_enabled, false) then 'everyone'
    else 'off'
  end,
  checkin_notification_mode = case
    when coalesce(checkin_notifications_enabled, false) then 'everyone'
    else 'off'
  end,
  chat_notification_mode = case
    when coalesce(chat_notifications_enabled, false) then 'everyone'
    else 'off'
  end
where
  session_planning_notification_mode is null
  or checkin_notification_mode is null
  or chat_notification_mode is null;

update public.spot_notification_preferences
set
  session_planning_notification_mode = 'off'
where session_planning_notification_mode is null;

update public.spot_notification_preferences
set
  checkin_notification_mode = 'off'
where checkin_notification_mode is null;

update public.spot_notification_preferences
set
  chat_notification_mode = 'off'
where chat_notification_mode is null;

alter table public.spot_notification_preferences
  alter column session_planning_notification_mode set default 'off',
  alter column checkin_notification_mode set default 'off',
  alter column chat_notification_mode set default 'off';

alter table public.spot_notification_preferences
  alter column session_planning_notification_mode set not null,
  alter column checkin_notification_mode set not null,
  alter column chat_notification_mode set not null;

alter table public.spot_notification_preferences
  drop constraint if exists spot_notification_preferences_session_planning_notification_mode_check,
  drop constraint if exists spot_notification_preferences_checkin_notification_mode_check,
  drop constraint if exists spot_notification_preferences_chat_notification_mode_check;

alter table public.spot_notification_preferences
  add constraint spot_notification_preferences_session_planning_notification_mode_check
    check (session_planning_notification_mode in ('off', 'following', 'everyone')),
  add constraint spot_notification_preferences_checkin_notification_mode_check
    check (checkin_notification_mode in ('off', 'following', 'everyone')),
  add constraint spot_notification_preferences_chat_notification_mode_check
    check (chat_notification_mode in ('off', 'following', 'everyone'));
