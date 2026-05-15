-- Update RPCs to also notify spot followers (users without sessions who follow the spot)

-- 1. Chat notification: notify session participants + followers
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
  r_id uuid;
  pref_mode text;
BEGIN
  FOR r_id IN
    SELECT DISTINCT user_id FROM (
      -- Users with active sessions at this spot today
      SELECT s.user_id FROM sessions s
      WHERE lower(s.spot_name) = lower(spot_name_param)
        AND s.session_day = session_day_param::date
        AND s.user_id != actor_profile_id
        AND s.checked_out_at IS NULL
        AND s.status NOT IN ('finished', 'Uitchecken')
      UNION
      -- Users who follow this spot
      SELECT sf.user_id FROM spot_followers sf
      WHERE lower(sf.spot_name) = lower(spot_name_param)
        AND sf.user_id != actor_profile_id
    ) recipients
  LOOP
    SELECT COALESCE(
      (SELECT snp.chat_notification_mode FROM spot_notification_preferences snp
       WHERE snp.user_id = r_id AND lower(snp.spot_name) = lower(spot_name_param) LIMIT 1),
      'everyone'
    ) INTO pref_mode;
    CONTINUE WHEN pref_mode = 'off';
    INSERT INTO notifications (user_id, type, actor_user_id, data, created_at, read)
    VALUES (r_id, 'chat_message', actor_profile_id,
      jsonb_build_object('spot_name', spot_name_param, 'session_day', session_day_param, 'message_preview', LEFT(message_preview_param, 80)),
      NOW(), false);
    recipient_profile_id := r_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 2. Check-in notification: notify session participants + followers
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
  r_id uuid;
  pref_mode text;
BEGIN
  FOR r_id IN
    SELECT DISTINCT user_id FROM (
      SELECT s.user_id FROM sessions s
      WHERE lower(s.spot_name) = lower(spot_name_param)
        AND s.session_day = session_day_param::date
        AND s.user_id != actor_profile_id
        AND s.checked_out_at IS NULL
        AND s.status NOT IN ('finished', 'Uitchecken')
      UNION
      SELECT sf.user_id FROM spot_followers sf
      WHERE lower(sf.spot_name) = lower(spot_name_param)
        AND sf.user_id != actor_profile_id
    ) recipients
  LOOP
    SELECT COALESCE(
      (SELECT snp.checkin_notification_mode FROM spot_notification_preferences snp
       WHERE snp.user_id = r_id AND lower(snp.spot_name) = lower(spot_name_param) LIMIT 1),
      'everyone'
    ) INTO pref_mode;
    CONTINUE WHEN pref_mode = 'off';
    INSERT INTO notifications (user_id, type, actor_user_id, data, created_at, read)
    VALUES (r_id, 'checkin', actor_profile_id,
      jsonb_build_object('spot_name', spot_name_param, 'session_day', session_day_param),
      NOW(), false);
    recipient_profile_id := r_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 3. Session planning notification: notify session participants + followers
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
  r_id uuid;
  pref_mode text;
BEGIN
  FOR r_id IN
    SELECT DISTINCT user_id FROM (
      SELECT s.user_id FROM sessions s
      WHERE lower(s.spot_name) = lower(spot_name_param)
        AND s.session_day = session_day_param::date
        AND s.user_id != actor_profile_id
      UNION
      SELECT sf.user_id FROM spot_followers sf
      WHERE lower(sf.spot_name) = lower(spot_name_param)
        AND sf.user_id != actor_profile_id
    ) recipients
  LOOP
    SELECT COALESCE(
      (SELECT snp.session_planning_notification_mode FROM spot_notification_preferences snp
       WHERE snp.user_id = r_id AND lower(snp.spot_name) = lower(spot_name_param) LIMIT 1),
      'everyone'
    ) INTO pref_mode;
    CONTINUE WHEN pref_mode = 'off';
    INSERT INTO notifications (user_id, type, actor_user_id, data, created_at, read)
    VALUES (r_id, 'session_planned', actor_profile_id,
      jsonb_build_object('spot_name', spot_name_param, 'session_day', session_day_param, 'session_id', session_id_param::text),
      NOW(), false);
    recipient_profile_id := r_id;
    RETURN NEXT;
  END LOOP;
END;
$$;
