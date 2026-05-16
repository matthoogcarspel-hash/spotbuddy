-- spot_name en session_day nullable maken voor DM berichten
ALTER TABLE messages
  ALTER COLUMN spot_name DROP NOT NULL,
  ALTER COLUMN session_day DROP NOT NULL;
