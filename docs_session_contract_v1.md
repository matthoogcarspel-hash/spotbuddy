# Session Contract v1

## 1) Canonical session model (final)

**Table:** `public.sessions`

**Field list (canonical runtime contract):**
1. `id` (uuid) — immutable session identifier.
2. `user_id` (uuid) — owner profile id; exactly one owner per row.
3. `spot_name` (text) — canonical spot name for this row.
4. `session_day` (date, generated) — local day bucket used for one-row-per-user-per-spot-per-day uniqueness.
5. `start_time` (text `HH:mm`) — planned start time in local display format.
6. `end_time` (text `HH:mm`) — planned end time in local display format.
7. `status` (text enum in app layer: `Gaat` | `Is er al` | `Uitchecken`) — lifecycle marker.
8. `intent` (text enum: `maybe` | `likely` | `definitely`) — confidence for planned attendance.
9. `created_at` (timestamptz) — creation timestamp and source for `session_day` generation.
10. `checked_in_at` (timestamptz nullable) — check-in event timestamp.
11. `checked_out_at` (timestamptz nullable) — checkout event timestamp.

## 2) Field meaning and invariants

- A session row is always **single-owner** (`user_id`), never a shared participant container.
- `session_day` is the canonical day dimension for uniqueness and spot/day lookup.
- `status` transitions are linear:
  - `Gaat` (planned)
  - `Is er al` (checked in / live)
  - `Uitchecken` (checked out / closed)
- `checked_in_at` must be non-null only after transition to `Is er al`.
- `checked_out_at` must be non-null only after transition to `Uitchecken`.
- `start_time/end_time` define planning slot and timeline placement; `end_time` must be strictly after `start_time`.

## 3) Deprecated immediately

Deprecated now (no new business logic):
- `sessions.participants` JSON array semantics.
- `session_participants` table as source of truth.
- Any operation that mutates another user’s row when “joining”.
- Any “participant count” logic derived from shared-row membership.

## 4) Temporarily supported (backward compatibility)

Temporary compatibility window:
- Read tolerance for rows where `participants` still exists physically.
- Existing RLS / schema objects for `session_participants` remain deployed but are treated as legacy and not used by new flows.
- Existing status aliases (`live`, `finished`) may be interpreted during reads but never written by v1 operations.

## 5) Removed later

Planned removal after rollout verification:
- Drop `participants` column from `sessions`.
- Drop `session_participants` table and related policies/migrations.
- Remove status alias handling for `live` and `finished` in app logic.
- Delete all shared-session join/update code paths.

---

# 5 Core Operations

## 1) `planSession`

**Input**
- `userId`
- `spotName`
- `sessionDay` (derived from selected local day)
- `startTime` (`HH:mm`)
- `endTime` (`HH:mm`)
- `intent`

**Output**
- `{ ok: true, sessionId }` or `{ ok: false, reason }`

**Rules**
- Create/update only the caller’s own row.
- Enforce one row per `(user_id, spot_name, session_day)`.
- Start/end must be valid window (`08:00`-`22:00`) and `end > start`.
- For “today”, start cannot be in the past.

**Critical edge cases**
- Unique-constraint collision -> return deterministic `ALREADY_HAS_SESSION_FOR_SPOT_DAY`.
- Editing existing row -> ignore self in duplicate check.
- Invalid day parse -> `INVALID_SESSION_DAY`.

## 2) `joinSession`

**Input**
- `userId`
- `spotName`
- `sessionDay`
- `startTime`
- `endTime`
- optional `intent` (defaults to `likely`)

**Output**
- `{ ok: true, sessionId }` or `{ ok: false, reason }`

**Rules**
- **Create your own row in same time slot**.
- No participant logic.
- No shared session mutation.
- Same uniqueness guard as `planSession`.

**Critical edge cases**
- Already owns a row for same spot/day -> `ALREADY_HAS_SESSION_FOR_SPOT_DAY`.
- Source slot disappears between read/write -> still valid if write succeeds; join is slot-copy only.
- Attempt to join non-today day (current product policy) -> `NON_JOINABLE_DAY`.

## 3) `cancelSession`

**Input**
- `userId`
- `sessionId`

**Output**
- `{ ok: true }` or `{ ok: false, reason }`

**Rules**
- Can cancel only own row.
- Only planned/open rows (`Gaat`, no check-in/out timestamps).
- Implement as delete (current behavior), not participant removal.

**Critical edge cases**
- Session already checked in/out -> `SESSION_NOT_CANCELLABLE`.
- Session not found/foreign owner -> `NOT_FOUND_OR_FORBIDDEN`.

## 4) `checkIn`

**Input**
- `userId`
- `spotName`
- optional `sessionId` (if checking in planned row)
- `nowIso`

**Output**
- `{ ok: true, spot }` or `{ ok: false, reason }`

**Rules**
- User can have only one active checked-in session at a time.
- If own planned row exists for same spot/day, update that row to `Is er al` and set `checked_in_at`.
- Else insert own direct check-in row (`status=Is er al`, start=now, end=quick-end).
- Never mutate another user’s row.

**Critical edge cases**
- Already checked in at other spot -> `ALREADY_CHECKED_IN_OTHER_SPOT`.
- Already checked in same spot -> idempotent no-op or `ALREADY_CHECKED_IN_SAME_SPOT`.
- Location/radius failure handled before operation -> `OUT_OF_RANGE`.

## 5) `checkOut`

**Input**
- `userId`
- optional `sessionId` (defaults to latest open checked-in row)
- `nowIso`

**Output**
- `{ ok: true }` or `{ ok: false, reason }`

**Rules**
- Close only own checked-in row.
- Set `status=Uitchecken` and `checked_out_at=nowIso`.
- Do not alter planned rows of other spots.

**Critical edge cases**
- No active checked-in row -> `NO_ACTIVE_CHECKIN`.
- Row already checked out -> idempotent success.

---

# Shared Helpers (final list)

## 1) `sessionState`
- **Input:** session row + `now`.
- **Output:** `'planned' | 'active' | 'finished'`.
- **Responsibility:** Single deterministic state resolver used by all screens.
- **Currently duplicated in:** `getSessionState`, `isLiveSession`, `getTimelineState`, timeline filters in `App.tsx`, and ad-hoc status checks in `src/screens/SpotDetailScreen.tsx`.

## 2) `sessionDay`
- **Input:** session row (prefer `session_day`, fallback timestamps) + active day selector.
- **Output:** normalized day key (local date key).
- **Responsibility:** One consistent day-bucketing rule.
- **Currently duplicated in:** `isSessionOnActiveDay`, `isSessionForLocalDate`, `getCurrentLocalDateKey/getTomorrowLocalDateKey` usage branches, and multiple per-day filters in `App.tsx`.

## 3) `ownSessionForSpotDay`
- **Input:** sessions array, `userId`, `spotName`, `day`.
- **Output:** `{ session | null, hasOwnSession: boolean }`.
- **Responsibility:** Canonical lookup for “do I already have my row for this spot/day?”.
- **Currently duplicated in:** `ownSessionsForSelectedSpotDay`, join pre-check query/filters, plan duplicate checks, and top CTA gating in `App.tsx`.

## 4) `canJoinSlot`
- **Input:** actor context + target slot (`spot/day/start/end`) + own-session lookup result.
- **Output:** `{ allowed: boolean, reason?: string }`.
- **Responsibility:** Centralize join eligibility without side effects.
- **Currently duplicated in:** `joinSessionViaSessionsModel` guard clauses, timeline join-button gating, and selected-day checks in `App.tsx`.

## 5) `timelineAggregation`
- **Input:** sessions, active day/date window, follow filter, current profile id.
- **Output:** deterministic timeline rows/groups (sorted, deduped).
- **Responsibility:** Produce one source of truth for timeline rendering data.
- **Currently duplicated in:** `timelineSessions` useMemo, `TimelineRows`, `SessionRow` grouping/sorting logic, and `SpotDetailScreen` timeline preprocessing.

## 6) `spotStatus`
- **Input:** spot sessions + day + `sessionState` resolver.
- **Output:** status object `{ key,label,variant,counts,intensity }`.
- **Responsibility:** Single home/detail badge decision.
- **Currently duplicated in:** `src/lib/spotStatus.ts`, plus momentum/status labeling logic (`getSpotMomentumLabelForDay`, `getSessionDisplayState`) in `App.tsx`, and planned/live counters in `src/screens/HomeScreen.tsx`.

---

# Safe Refactor Plan (no breakage)

## STEP 1
Create a `session-contract-v1` doc in-repo and treat it as binding for all new session changes.
- Test: team review sign-off, no runtime change.

## STEP 2
Introduce pure helper module skeletons (`sessionState`, `sessionDay`, `ownSessionForSpotDay`) that wrap existing logic; keep old call sites untouched.
- Test: unit tests for helper outputs against current behavior snapshots.

## STEP 3
Switch read-only selectors to new helpers in one place at a time (start with own-session CTA gating).
- Test: manually verify spot header CTA states for today/tomorrow and with/without existing own row.

## STEP 4
Switch join pre-check to `canJoinSlot` while keeping existing write path.
- Test: join success path + duplicate join rejection + non-today rejection.

## STEP 5
Extract timeline aggregation into `timelineAggregation` and route `App.tsx` timeline rendering through it; keep UI unchanged.
- Test: deterministic ordering snapshot for mixed live/planned sessions and buddy filter toggles.

## STEP 6
Switch spot status chips/badges to `spotStatus` + `sessionState` and remove local ad-hoc counters from one screen (Home first).
- Test: home spot cards show same counts/labels before and after migration.

## STEP 7
Switch detail timeline preprocessing (SpotDetailScreen path) to shared timeline helper outputs.
- Test: timeline bars and labels remain identical for representative fixtures.

## STEP 8
Unify operation handlers (`planSession`, `joinSession`, `cancelSession`, `checkIn`, `checkOut`) behind thin service functions that call Supabase; UI invokes only service layer.
- Test: operation-level integration tests with mocked Supabase responses.

## STEP 9
Delete dead duplicated branches only after parity checks pass on all migrated screens.
- Test: grep-based guard (`rg`) confirms removed legacy helpers/call sites.

## STEP 10
Run cleanup migration plan (legacy participant artifacts) behind a feature flag/release checkpoint.
- Test: staging validation + migration dry run, then production rollout.

---

# Freeze now

## Features frozen
- No new session features (invites, groups, participant UX, reaction mechanics).
- No expansion of day modes beyond today/tomorrow during refactor.

## Files frozen for feature edits (bug fixes only)
- `App.tsx` visual redesigns and non-session product work.
- `src/screens/SpotDetailScreen.tsx` new UX branches.
- `src/screens/HomeScreen.tsx` non-status UI additions.

## Logic areas frozen
- Location prompt behavior unrelated to check-in correctness.
- Chat feature behavior.
- Account/profile switching behavior.

---

# Success criteria (measurable)

1. **Join determinism:** 100% of joins create a new row owned by caller; zero writes update foreign/shared rows.
2. **Duplicate control:** zero duplicate rows for `(user_id, spot_name, session_day)` in production (DB unique index + zero violations in logs).
3. **Single state engine:** all timeline, CTA, and spot status reads call shared `sessionState` (verified by no remaining alternative state calculators).
4. **CTA consistency:** for same fixture data, Home + Spot detail + timeline actions produce identical allowed/blocked actions.
5. **Deterministic timeline:** same input dataset always yields same sorted grouped timeline output across screens (snapshot tests stable across reruns).

---

# If you follow this plan, here is what will stop breaking immediately

- Join behavior stops oscillating between participant mutation and own-row creation.
- Duplicate/ghost session bugs shrink because one uniqueness rule governs all writes.
- CTA conflicts reduce because “do I already have my session for this spot/day?” is computed once.
- Home/detail/timeline status mismatches disappear as they share one state/day resolver.
- Future session changes become safer because operation boundaries are explicit and testable.
