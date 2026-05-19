-- Allow organizer to delete joiner sessions when cancelling a group session
CREATE POLICY sessions_delete_as_source_session_owner ON public.sessions
FOR DELETE TO authenticated
USING (
  source_session_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.sessions src
    JOIN public.profiles p ON p.id = src.user_id
    WHERE src.id = sessions.source_session_id
      AND p.owner_uid = auth.uid()
  )
);
