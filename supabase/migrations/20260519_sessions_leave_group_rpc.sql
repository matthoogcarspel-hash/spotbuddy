-- 1. Change FK from CASCADE to SET NULL so organizer can leave without cascade-deleting joiners
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_source_session_id_fkey;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_source_session_id_fkey
  FOREIGN KEY (source_session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;

-- 2. RPC: leave_group_session
--    Organizer leaves: promote first joiner to new root (2+ remain → group stays),
--    or clear source_session_id (1 remains → becomes individual).
CREATE OR REPLACE FUNCTION leave_group_session(root_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_profile_id uuid;
  joiners uuid[];
  new_root uuid;
BEGIN
  -- Resolve caller's profile via owner_uid
  SELECT id INTO caller_profile_id
  FROM public.profiles
  WHERE owner_uid = auth.uid()
  LIMIT 1;

  IF caller_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NO_PROFILE');
  END IF;

  -- Verify caller owns the root session
  IF NOT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE id = root_session_id AND user_id = caller_profile_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_OWNER');
  END IF;

  -- Collect active joiner session IDs (ordered by creation time)
  SELECT array_agg(id ORDER BY created_at)
  INTO joiners
  FROM public.sessions
  WHERE source_session_id = root_session_id;

  IF joiners IS NULL OR array_length(joiners, 1) = 0 THEN
    -- No joiners: just delete the root
    DELETE FROM public.sessions WHERE id = root_session_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF array_length(joiners, 1) = 1 THEN
    -- 1 joiner: clear source_session_id → becomes individual, then delete root
    UPDATE public.sessions SET source_session_id = NULL WHERE id = joiners[1];
    DELETE FROM public.sessions WHERE id = root_session_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- 2+ joiners: promote first joiner to new root, re-point others
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
