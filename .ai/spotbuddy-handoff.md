# Spotbuddy Handoff

## Project
Mobiele app voor het joinen van sessies (kitesurfen) met realtime notificaties.

## Stack
- React Native (Expo)
- TypeScript
- Supabase (Postgres + RPC)

## Architectuur
Frontend → Supabase RPC → Postgres → notifications table

## Core flow
User joint session → RPC → notification row → owner notified

## Huidige status
- Join flow werkt
- RPC wordt aangeroepen
- ❌ Notifications worden niet opgeslagen
- ❌ PGRST202 error

## Focus nu
Fix RPC → daarna door met feature development
