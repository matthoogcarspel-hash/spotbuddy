-- Fix RLS voor conversations tabel
-- Zorg dat authenticated users altijd conversations kunnen aanmaken

-- Verwijder de bestaande INSERT policy
DROP POLICY IF EXISTS "Users can create DMs" ON conversations;

-- Nieuwe brede INSERT policy: alle authenticated users mogen conversations aanmaken
CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT TO authenticated
  WITH CHECK (true);

-- SELECT policy (als die er al niet is)
DROP POLICY IF EXISTS "Users can view their DMs" ON conversations;

CREATE POLICY "Users can view conversations"
  ON conversations FOR SELECT TO authenticated
  USING (
    type IN ('spot', 'group') OR
    participant_a_id = auth.uid() OR
    participant_b_id = auth.uid()
  );
