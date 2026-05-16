-- RPC die conversation aanmaakt of ophaalt — SECURITY DEFINER bypast RLS
-- session_day wordt als text opgeslagen (geen date cast!)

CREATE OR REPLACE FUNCTION get_or_create_conversation(
  p_type text,
  p_spot_name text DEFAULT NULL,
  p_session_day text DEFAULT NULL,
  p_group_key text DEFAULT NULL,
  p_other_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_id uuid := auth.uid();
  conv_id uuid;
BEGIN
  IF p_type = 'dm' THEN
    SELECT id INTO conv_id FROM conversations
    WHERE type = 'dm' AND (
      (participant_a_id = my_id AND participant_b_id = p_other_user_id)
      OR (participant_a_id = p_other_user_id AND participant_b_id = my_id)
    ) LIMIT 1;
    IF conv_id IS NULL THEN
      INSERT INTO conversations (type, participant_a_id, participant_b_id)
      VALUES ('dm', my_id, p_other_user_id) RETURNING id INTO conv_id;
    END IF;

  ELSIF p_type = 'group' THEN
    SELECT id INTO conv_id FROM conversations
    WHERE type = 'group'
      AND spot_name = p_spot_name
      AND session_day::text = p_session_day
      AND group_key = p_group_key
    LIMIT 1;
    IF conv_id IS NULL THEN
      INSERT INTO conversations (type, spot_name, session_day, group_key)
      VALUES ('group', p_spot_name, p_session_day, p_group_key)
      RETURNING id INTO conv_id;
    END IF;

  ELSIF p_type = 'spot' THEN
    SELECT id INTO conv_id FROM conversations
    WHERE type = 'spot'
      AND spot_name = p_spot_name
      AND session_day::text = p_session_day
    LIMIT 1;
    IF conv_id IS NULL THEN
      INSERT INTO conversations (type, spot_name, session_day)
      VALUES ('spot', p_spot_name, p_session_day)
      RETURNING id INTO conv_id;
    END IF;
  END IF;

  RETURN conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_conversation TO authenticated;
