# spot_notification_preferences strict diagnosis (no implementation)

Date: 2026-04-23 (UTC)

## 1) Exact current table / policy contract (from repository migrations)

### Table contract
From migrations currently in the repo:

- `user_id` is required (`NOT NULL`).
- `spot_name` is required (`NOT NULL`).
- Unique constraint `spot_notification_preferences_user_spot_unique` exists on `(user_id, spot_name)`.
- Notification mode columns:
  - `session_planning_notification_mode` (`NOT NULL`, default `'off'`, check in `('off','following','everyone')`)
  - `checkin_notification_mode` (`NOT NULL`, default `'off'`, check in `('off','following','everyone')`)
  - `chat_notification_mode` (`NOT NULL`, default `'off'`, check in `('off','following','everyone')`)
- RLS is explicitly enabled on `public.spot_notification_preferences`.

### Effective policy contract (latest repo migration touching this table)
`20260423_spot_notification_preferences_rls_owner_check.sql` defines function:

- `public.spot_notification_preferences_is_owner(profile_id uuid)` returns true only when a row exists in `public.profiles` where:
  - `profiles.id = profile_id`
  - and (`profiles.owner_uid = auth.uid()` OR `profiles.id = auth.uid()`).

Policies applied:

- SELECT: `using (public.spot_notification_preferences_is_owner(user_id))`
- INSERT: `with check (public.spot_notification_preferences_is_owner(user_id))`
- UPDATE: `using (...) with check (...)`
- DELETE: `using (...)`

## 2) Exact save-path identity contract in app code

In `App.tsx` save/load path:

- `activeAppUserId = activeProfile?.id ?? null`
- `persistedUserId = activeProfile?.id ?? null`
- save payload writes `payload.user_id = persistedUserId`
- upsert uses `onConflict: 'user_id,spot_name'`
- load/readback also queries by `.eq('user_id', persistedUserId)`

So app writes and reads **profile id** in `spot_notification_preferences.user_id`.

App diagnostics already emit these identities per save:

- `authUserId`
- `activeAppUserId`
- `activeProfileId`
- `persistedUserId`
- save result (`code/message/details/hint`)

## 3) Real data findings for Matt/Admin/SpotBuddy

### What is provable from this repo alone
Not available in repository files:

- live `spot_notification_preferences` rows
- live `profiles` rows for Matt/Admin/SpotBuddy
- live auth identities for current sessions

Therefore, I cannot truthfully claim exact row-level findings for Matt/Admin/SpotBuddy from repo-only inspection.

### Exact SQL required to produce those findings
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

-- PK/UNIQUE
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

-- FK target for user_id (profiles vs auth.users)
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

-- Exact policies
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'spot_notification_preferences'
order by policyname;

-- Matt/Admin/SpotBuddy profile rows + prefs rows
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

## 4) Proven root cause classification

Based on **strictly available evidence** (migrations + app save path), the proven root-cause class is:

- **G. multiple identity systems are mixed**

Why this is proven from code/contract:

- App writes `profile.id` to `spot_notification_preferences.user_id`.
- Policy ownership gate depends on matching `auth.uid()` through `profiles.owner_uid` (or a direct `profiles.id = auth.uid()` escape hatch).
- If any active profile selection, row history, or ownership mapping uses a different identity basis, RLS can allow one account and reject another.

From repo-only evidence, A/B/C/D/E/F cannot be conclusively isolated without live data rows and live auth session identity checks.

## 5) Safest fix path (do not implement yet)

Single source of truth should be:

- `spot_notification_preferences.user_id` = **`profiles.id`** (profile identity), consistently.

Then align all layers:

1. Frontend should send `activeProfile.id` only.
2. RLS should verify ownership via `profiles.id = spot_notification_preferences.user_id AND profiles.owner_uid = auth.uid()` (or approved equivalent bridge if legacy ids remain).
3. Existing rows should be backfilled/migrated if any row currently stores auth user ids instead of profile ids.
4. Keep upsert `(user_id, spot_name)` as correct conflict key once identity alignment is clean.

## 6) If I were fixing this tomorrow morning, I would do these 3 steps first

1. Run the SQL above in the target environment and capture exact Matt/Admin/SpotBuddy row-level facts (`profiles.id`, `profiles.owner_uid`, prefs `user_id`, spots, policy text).
2. Produce a one-time migration script to normalize all `spot_notification_preferences.user_id` values to `profiles.id` and remove/repair orphaned rows.
3. Freeze one policy contract around `profiles.owner_uid = auth.uid()` and validate with two real accounts (Matt + Admin) using save/readback logs already present in `App.tsx`.
