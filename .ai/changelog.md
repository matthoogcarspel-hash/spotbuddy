# Changelog

## 2026-04-27

- Join flow werkend gekregen
- Supabase RPC call geïmplementeerd voor notifications
- Profile ID resolving toegevoegd (user → profiles.id)
- RPC payload aangepast naar:
  - p_session_id
  - p_actor_user_id
  - p_recipient_profile_id
- Debug logging toegevoegd (RPC input + result)

## Issues

- PGRST202 error bij RPC call
- Geen insert in notifications table
