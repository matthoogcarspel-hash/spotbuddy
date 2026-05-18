-- Sta toe dat gebruikers hun eigen sessies kunnen verwijderen
-- Nodig voor joinSession action die overlappende eigen sessies wil verwijderen

CREATE POLICY sessions_delete_owned_profile
ON public.sessions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = sessions.user_id
      AND profiles.owner_uid = auth.uid()
  )
);
