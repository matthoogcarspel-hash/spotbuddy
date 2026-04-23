# Notification preference identity / RLS diagnosis (no implementation)

Date: 2026-04-23

## Scope checked
- `spot_notification_preferences` migration history.
- Notification preference load/save path in `App.tsx`.
- Profile ownership hydration path in `App.tsx`.

No UI patching or React refactors were performed.

## 1) Current table/policy contract from repo migrations

### Table constraints observed in migrations
- `user_id` and `spot_name` are required (`NOT NULL`).
- Unique constraint exists on `(user_id, spot_name)` named `spot_notification_preferences_user_spot_unique`.
- Notification mode columns exist with default `'off'`, `NOT NULL`, and value checks in `('off','following','everyone')`:
  - `session_planning_notification_mode`
  - `checkin_notification_mode`
  - `chat_notification_mode`
- RLS is enabled on `public.spot_notification_preferences`.

### Effective policy logic (latest migration in repo)
Latest migration file for this table’s RLS is `20260423_spot_notification_preferences_rls_owner_check.sql`.

It defines `public.spot_notification_preferences_is_owner(profile_id uuid)` as:
- true iff `profiles.id = profile_id`
- and (`profiles.owner_uid = auth.uid()` OR `profiles.id = auth.uid()`).

Policies then apply:
- SELECT: `using (spot_notification_preferences_is_owner(user_id))`
- INSERT: `with check (spot_notification_preferences_is_owner(user_id))`
- UPDATE: `using (...) with check (...)`
- DELETE: `using (...)`

## 2) Identity values used by save path (code)

In app runtime:
- `activeAppUserId = activeProfile?.id`.
- Save payload writes `payload.user_id = persistedUserId` where `persistedUserId = activeProfile?.id`.
- Upsert key is `(user_id, spot_name)`.
- Diagnostic logs include: `authUserId`, `activeAppUserId`, `activeProfileId`, `persistedUserId`, and save result code/message.

So the save path is profile-id based, not auth-user-id based.

## 3) Profile ownership source used by app

Profile hydration and switcher queries load profiles by:
- `.eq('owner_uid', authUser.id)`

That means selected active profiles are expected to be owned by the currently authenticated user via `profiles.owner_uid`.

## 4) What cannot be proven from repo-only inspection

The following require live database inspection and cannot be read from this repository alone:
- Actual `spot_notification_preferences` column list including legacy columns and FK targets.
- Whether `user_id` FK points to `profiles(id)` or `auth.users(id)` (or no FK).
- Actual rows for Matt/Admin/SpotBuddy (`user_id`, `spot_name`).
- Whether Admin failures are INSERT-policy failures, UPDATE-policy failures, or FK failures.

## 5) Most likely root-cause pattern from available evidence

From code + migrations, the strongest likely pattern is mixed identity systems:
- App now writes `profile.id` into `spot_notification_preferences.user_id`.
- If table legacy contract still expects auth user ids (or has legacy auth-owned rows), Matt can work by coincidence when ids align while Admin fails when they differ.

Candidate classification: **G (multiple identity systems mixed)**, often manifesting as **A/C** depending on live data.

## 6) SQL to run in production/staging for strict proof

```sql
-- Contract: columns/defaults/nullability
select
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'spot_notification_preferences'
order by ordinal_position;

-- PK/unique constraints
select
  tc.constraint_name,
  tc.constraint_type,
  string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as columns
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
where tc.table_schema = 'public'
  and tc.table_name = 'spot_notification_preferences'
  and tc.constraint_type in ('PRIMARY KEY', 'UNIQUE')
group by tc.constraint_name, tc.constraint_type
order by tc.constraint_type, tc.constraint_name;

-- Foreign keys for user_id target confirmation
select
  tc.constraint_name,
  kcu.column_name,
  ccu.table_schema as foreign_table_schema,
  ccu.table_name as foreign_table,
  ccu.column_name as foreign_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema = tc.table_schema
where tc.table_schema = 'public'
  and tc.table_name = 'spot_notification_preferences'
  and tc.constraint_type = 'FOREIGN KEY';

-- RLS enabled?
select relrowsecurity, relforcerowsecurity
from pg_class
where oid = 'public.spot_notification_preferences'::regclass;

-- Exact RLS policies
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'spot_notification_preferences'
order by policyname;

-- Rows for target profiles by display name (Matt/Admin/SpotBuddy)
with target_profiles as (
  select id, display_name, owner_uid
  from public.profiles
  where lower(display_name) in ('matt', 'admin', 'spotbuddy')
)
select
  tp.display_name,
  tp.id as profile_id,
  tp.owner_uid,
  snp.user_id,
  snp.spot_name,
  snp.session_planning_notification_mode,
  snp.checkin_notification_mode,
  snp.chat_notification_mode
from target_profiles tp
left join public.spot_notification_preferences snp
  on snp.user_id = tp.id
order by tp.display_name, snp.spot_name;
```

