# Current Task

DEBUG: Fix RPC PGRST202 in notification flow

Status:
- Join flow werkt
- RPC wordt aangeroepen
- Geen row in notifications table
- Error: PGRST202 (function signature mismatch)

Hypothese:
- Mismatch tussen RPC payload en Postgres function parameters

Volgende stap:
- Exacte function signature ophalen en vergelijken met payload
