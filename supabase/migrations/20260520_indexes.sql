-- sessions: meest bevraagde tabel, elke fetchSharedData doet twee full-scans
CREATE INDEX IF NOT EXISTS idx_sessions_session_day
  ON sessions (session_day);

CREATE INDEX IF NOT EXISTS idx_sessions_session_day_created_at
  ON sessions (session_day, created_at);

-- sessions zonder session_day → created_at range query
CREATE INDEX IF NOT EXISTS idx_sessions_created_at
  ON sessions (created_at)
  WHERE session_day IS NULL;

-- notifications: elke app-open leest notificaties per user
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at
  ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read
  ON notifications (user_id, read)
  WHERE read = false;

-- profiles: vaak opgezocht via owner_uid (auth koppeling)
CREATE INDEX IF NOT EXISTS idx_profiles_owner_uid
  ON profiles (owner_uid);

-- user_follows: buddies systeem, meerdere queries per richting
CREATE INDEX IF NOT EXISTS idx_user_follows_follower_id_status
  ON user_follows (follower_id, status);

CREATE INDEX IF NOT EXISTS idx_user_follows_following_id_status
  ON user_follows (following_id, status);

-- conversations: spot chat lookup per type + spot + dag
CREATE INDEX IF NOT EXISTS idx_conversations_spot_day
  ON conversations (type, spot_name, session_day);

-- messages: chat ophalen per conversation, gesorteerd op tijd
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON messages (conversation_id, created_at ASC);

-- spot_followers: delete + upsert op user+spot combinatie
CREATE INDEX IF NOT EXISTS idx_spot_followers_user_spot
  ON spot_followers (user_id, spot_name);
