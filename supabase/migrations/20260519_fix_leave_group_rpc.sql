-- Fix ownership check: use EXISTS+JOIN instead of LIMIT 1 (handles multiple profiles per auth UID)
CREATE OR REPLACE FUNCTION leave_group_session(root_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  joiners uuid[];
  new_root uuid;
BEGIN
  -- Verify caller owns the root session (any profile belonging to this auth UID)
  IF NOT EXISTS (
    SELECT 1 FROM public.sessions s
    JOIN public.profiles p ON p.id = s.user_id
    WHERE s.id = root_session_id AND p.owner_uid = auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_OWNER');
  END IF;

  -- Collect active joiner session IDs (ordered by creation time)
  SELECT array_agg(id ORDER BY created_at)
  INTO joiners
  FROM public.sessions
  WHERE source_session_id = root_session_id;

  IF joiners IS NULL OR array_length(joiners, 1) = 0 THEN
    DELETE FROM public.sessions WHERE id = root_session_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF array_length(joiners, 1) = 1 THEN
    UPDATE public.sessions SET source_session_id = NULL WHERE id = joiners[1];
    DELETE FROM public.sessions WHERE id = root_session_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- 2+ joiners: promote first to new root, re-point others
  new_root := joiners[1];
  UPDATE public.sessions SET source_session_id = NULL WHERE id = new_root;
  UPDATE public.sessions
    SET source_session_id = new_root
    WHERE id = ANY(joiners[2:array_length(joiners, 1)]);
  DELETE FROM public.sessions WHERE id = root_session_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION leave_group_session(uuid) TO authenticated;
