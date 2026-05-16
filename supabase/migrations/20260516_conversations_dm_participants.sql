-- Add participant columns for DM conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS participant_a_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS participant_b_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Allow users to see their own DMs (and spot/group chats which already had access)
-- Drop any overly restrictive policy first if needed
DROP POLICY IF EXISTS "Users can view their DMs" ON conversations;

CREATE POLICY "Users can view their DMs"
  ON conversations FOR SELECT TO authenticated
  USING (
    type IN ('spot', 'group') OR
    participant_a_id = auth.uid() OR
    participant_b_id = auth.uid()
  );

-- Allow authenticated users to insert DM conversations
DROP POLICY IF EXISTS "Users can create DMs" ON conversations;
CREATE POLICY "Users can create DMs"
  ON conversations FOR INSERT TO authenticated
  WITH CHECK (
    type IN ('spot', 'group') OR
    participant_a_id = auth.uid() OR
    participant_b_id = auth.uid()
  );
