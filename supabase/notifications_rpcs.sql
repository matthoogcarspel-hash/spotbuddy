-- Run this in the Supabase SQL editor

-- 1. Chat message notification
-- Notifies all other users with a session at this spot on this day
-- who have chat_notification_mode != 'off'
CREATE OR REPLACE FUNCTION create_chat_notification(
  actor_profile_id uuid,
  spot_name_param text,
  session_day_param text,
  message_preview_param text
)
RETURNS TABLE(recipient_profile_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recipient_id uuid;
  pref_mode text;
BEGIN
  FOR recipient_id IN
    SELECT DISTINCT s.user_id
    FROM sessions s
    WHERE s.spot_name = spot_name_param
      AND s.session_day = session_day_param
      AND s.user_id != actor_profile_id
      AND s.checked_out_at IS NULL
      AND s.status NOT IN ('finished', 'Uitchecken')
  LOOP
    SELECT COALESCE(
      (SELECT snp.chat_notification_mode
       FROM spot_notification_preferences snp
       WHERE snp.user_id = recipient_id
         AND snp.spot_name = spot_name_param
       LIMIT 1),
      'everyone'
    ) INTO pref_mode;

    CONTINUE WHEN pref_mode = 'off';

    INSERT INTO notifications (user_id, type, actor_user_id, data, created_at, read)
    VALUES (
      recipient_id,
      'chat_message',
      actor_profile_id,
      jsonb_build_object(
        'spot_name', spot_name_param,
        'session_day', session_day_param,
        'message_preview', LEFT(message_preview_param, 80)
      ),
      NOW(),
      false
    );

    RETURN NEXT recipient_id;
  END LOOP;
END;
$$;

-- 2. Check-in notification
-- Notifies all other users with a session at this spot on this day
-- who have checkin_notification_mode != 'off'
CREATE OR REPLACE FUNCTION create_checkin_notification(
  actor_profile_id uuid,
  spot_name_param text,
  session_day_param text
)
RETURNS TABLE(recipient_profile_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recipient_id uuid;
  pref_mode text;
BEGIN
  FOR recipient_id IN
    SELECT DISTINCT s.user_id
    FROM sessions s
    WHERE s.spot_name = spot_name_param
      AND s.session_day = session_day_param
      AND s.user_id != actor_profile_id
      AND s.checked_out_at IS NULL
      AND s.status NOT IN ('finished', 'Uitchecken')
  LOOP
    SELECT COALESCE(
      (SELECT snp.checkin_notification_mode
       FROM spot_notification_preferences snp
       WHERE snp.user_id = recipient_id
         AND snp.spot_name = spot_name_param
       LIMIT 1),
      'everyone'
    ) INTO pref_mode;

    CONTINUE WHEN pref_mode = 'off';

    INSERT INTO notifications (user_id, type, actor_user_id, data, created_at, read)
    VALUES (
      recipient_id,
      'checkin',
      actor_profile_id,
      jsonb_build_object(
        'spot_name', spot_name_param,
        'session_day', session_day_param
      ),
      NOW(),
      false
    );

    RETURN NEXT recipient_id;
  END LOOP;
END;
$$;

-- 3. Session planning notification
-- Notifies all other users who already have a session at this spot on this day
-- who have session_planning_notification_mode != 'off'
CREATE OR REPLACE FUNCTION create_session_planning_notification(
  actor_profile_id uuid,
  spot_name_param text,
  session_day_param text,
  session_id_param uuid
)
RETURNS TABLE(recipient_profile_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recipient_id uuid;
  pref_mode text;
BEGIN
  FOR recipient_id IN
    SELECT DISTINCT s.user_id
    FROM sessions s
    WHERE s.spot_name = spot_name_param
      AND s.session_day = session_day_param
      AND s.user_id != actor_profile_id
  LOOP
    SELECT COALESCE(
      (SELECT snp.session_planning_notification_mode
       FROM spot_notification_preferences snp
       WHERE snp.user_id = recipient_id
         AND snp.spot_name = spot_name_param
       LIMIT 1),
      'everyone'
    ) INTO pref_mode;

    CONTINUE WHEN pref_mode = 'off';

    INSERT INTO notifications (user_id, type, actor_user_id, data, created_at, read)
    VALUES (
      recipient_id,
      'session_planned',
      actor_profile_id,
      jsonb_build_object(
        'spot_name', spot_name_param,
        'session_day', session_day_param,
        'session_id', session_id_param::text
      ),
      NOW(),
      false
    );

    RETURN NEXT recipient_id;
  END LOOP;
END;
$$;
