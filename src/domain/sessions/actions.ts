import {
  buildCreatedAtForDayKey,
  getDayBoundsForDayKey,
  getJoinState,
  getOwnSessionForSpotDay,
  isSessionBlockingOwnSession,
  normalizeSessionIdentity,
  normalizeSpotName,
  REAL_SESSION_SCHEMA_FIELDS,
} from '../../lib/sessionHelpers';
import { buildSpotNotificationPreferenceKey, normalizeSpotNotificationMode } from '../../lib/spotNotificationPreferences';

import { supabase } from '../../lib/supabase';

type SessionIntent = 'maybe' | 'likely' | 'definitely';
type ActiveDay = 'today' | 'tomorrow';
type SessionStatus = 'Is er al' | 'Gaat' | 'Uitchecken' | 'live' | 'finished';

type SessionRecord = {
  id?: string | null;
  user_id?: string | null;
  spot_name?: string | null;
  created_at?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  status?: string | null;
};

type ServiceFailure = { ok: false; reason: string; error?: unknown };
type ServiceSuccess<T = undefined> = T extends undefined
  ? { ok: true; sessionId?: string }
  : { ok: true; data: T; sessionId?: string };

const isUniqueConstraintError = (error: { code?: string; message?: string } | null | undefined) =>
  error?.code === '23505'
  || error?.message?.includes('sessions_one_open_per_user_idx')
  || error?.message?.includes('sessions_unique')
  || false;
const alreadyHasSessionReason = 'USER_ALREADY_HAS_SESSION_ON_SPOT_DAY';

const withLoggedResult = <T extends ServiceSuccess<{ id: string }> | ServiceSuccess | ServiceFailure>(
  label: 'SCHEMA_ALIGNMENT_PLAN_RESULT' | 'SCHEMA_ALIGNMENT_JOIN_RESULT',
  result: T,
) => {
  return result;
};

const getRealSchemaIdentity = (input: {
  user_id: string | null | undefined;
  spot_name: string | null | undefined;
  day_key: string | null | undefined;
}) => ({
  ...normalizeSessionIdentity({
    user_id: input.user_id,
    spot_name: input.spot_name,
    day_key: input.day_key,
  }),
});

const readOwnSessionsForSpotDay = async (input: {
  userId: string;
  spotName: string;
  activeDay: string;
  selectedSpot: string | null;
}) => {

  const selectedSpot = input.selectedSpot as { name?: string | null } | string | null;
  const activeDay = input.activeDay;


  const dayBounds = getDayBoundsForDayKey(input.activeDay);
  if (!dayBounds) {
    const invalidDayError = { message: 'INVALID_DAY_KEY' };
    return { sessions: [], error: invalidDayError };
  }

  const { data: sessionRecords, error } = await supabase
    .from('sessions')
    .select('id, user_id, spot_name, created_at, start_time, end_time, status, checked_out_at')
    .eq('user_id', input.userId)
    .eq('spot_name', input.spotName)
    .gte('created_at', dayBounds.start)
    .lt('created_at', dayBounds.endExclusive);


  if (error) {
    return { sessions: [], error };
  }

  return { sessions: Array.isArray(sessionRecords) ? sessionRecords : [], error: null };
};

export async function planSession(input: {
  activeProfileId: string | null;
  selectedSpot: string;
  activeDay: ActiveDay;
  selectedPlanningDateKey: string;
  startTime: string;
  endTime: string;
  intent: SessionIntent;
  editingSessionId?: string | null;
}): Promise<ServiceSuccess<{ id: string }> | ServiceFailure> {
  if (!input.activeProfileId) {
    return withLoggedResult('SCHEMA_ALIGNMENT_PLAN_RESULT', { ok: false, reason: 'MISSING_ACTIVE_PROFILE' });
  }

  const sessionIdentity = getRealSchemaIdentity({
    user_id: input.activeProfileId,
    spot_name: input.selectedSpot,
    day_key: input.selectedPlanningDateKey,
  });
  if (!sessionIdentity.user_id || !sessionIdentity.spot_name || !sessionIdentity.day_key) {
    return withLoggedResult('SCHEMA_ALIGNMENT_PLAN_RESULT', { ok: false, reason: 'INVALID_SESSION_IDENTITY' });
  }

  const { sessions: ownSessionsFresh, error: ownSessionsFreshError } = await readOwnSessionsForSpotDay({
    userId: sessionIdentity.user_id,
    spotName: sessionIdentity.spot_name,
    activeDay: sessionIdentity.day_key,
    selectedSpot: input.selectedSpot,
  });

  if (ownSessionsFreshError) {
    return withLoggedResult('SCHEMA_ALIGNMENT_PLAN_RESULT', { ok: false, reason: 'OWN_SESSIONS_QUERY_FAILED', error: ownSessionsFreshError });
  }

  const conflictSessions = (Array.isArray(ownSessionsFresh) ? ownSessionsFresh : [])
    .filter((session) => session?.id !== input.editingSessionId)
    .filter((session) => isSessionBlockingOwnSession(session));

  const toMinutes = (value?: string | null) => {
    if (!value) return null;
    const [hourRaw, minuteRaw] = value.split(':');
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  };

  const newStart = toMinutes(input.startTime);
  const newEnd = toMinutes(input.endTime);
  const hasOverlap = newStart !== null && newEnd !== null && conflictSessions.some((session) => {
    const existingStart = toMinutes(session.start_time);
    const existingEnd = toMinutes(session.end_time);
    if (existingStart === null || existingEnd === null) return false;
    return newStart < existingEnd && newEnd > existingStart;
  });


  if (hasOverlap) {
    return withLoggedResult('SCHEMA_ALIGNMENT_PLAN_RESULT', { ok: false, reason: alreadyHasSessionReason });
  }

  // Cross-spot overlap: check all other spots for this day
  if (newStart !== null && newEnd !== null) {
    const crossSpotBounds = getDayBoundsForDayKey(input.selectedPlanningDateKey);
    if (crossSpotBounds) {
      const { data: otherSpotSessions } = await supabase
        .from('sessions')
        .select('id, start_time, end_time, status, checked_out_at')
        .eq('user_id', sessionIdentity.user_id)
        .neq('spot_name', sessionIdentity.spot_name)
        .gte('created_at', crossSpotBounds.start)
        .lt('created_at', crossSpotBounds.endExclusive);

      const hasCrossSpotOverlap = (otherSpotSessions ?? [])
        .filter((s) => s?.id !== input.editingSessionId)
        .filter((s) => !s?.checked_out_at && s?.status !== 'finished' && s?.status !== 'Uitchecken')
        .some((s) => {
          const existingStart = toMinutes(s.start_time);
          const existingEnd = toMinutes(s.end_time);
          if (existingStart === null || existingEnd === null) return false;
          return newStart < existingEnd && newEnd > existingStart;
        });

      if (hasCrossSpotOverlap) {
        return withLoggedResult('SCHEMA_ALIGNMENT_PLAN_RESULT', { ok: false, reason: 'USER_ALREADY_HAS_SESSION_SAME_TIME_OTHER_SPOT' });
      }
    }
  }

  const payload = {
    spot_name: sessionIdentity.spot_name,
    user_id: sessionIdentity.user_id,
    created_at: buildCreatedAtForDayKey(sessionIdentity.day_key),
    session_day: sessionIdentity.day_key,
    start_time: input.startTime,
    end_time: input.endTime,
    status: 'Gaat' as const,
    intent: input.intent,
    checked_in_at: null,
    checked_out_at: null,
    source_session_id: null,
  };

  let result;
  if (input.editingSessionId) {
    result = await supabase
      .from('sessions')
      .update({
        created_at: payload.created_at,
        start_time: payload.start_time,
        end_time: payload.end_time,
        intent: payload.intent,
      })
      .eq('id', input.editingSessionId)
      .eq('user_id', payload.user_id)
      .select('id, spot_name, start_time, end_time, checked_in_at, checked_out_at, status, intent')
      .single();
  } else {
    result = await supabase
      .from('sessions')
      .insert(payload)
      .select('id, spot_name, start_time, end_time, checked_in_at, checked_out_at, status, user_id, intent')
      .single();
  }

  if (result.error) {
    if (isUniqueConstraintError(result.error)) {
      return withLoggedResult('SCHEMA_ALIGNMENT_PLAN_RESULT', { ok: false, reason: alreadyHasSessionReason });
    }
    return withLoggedResult('SCHEMA_ALIGNMENT_PLAN_RESULT', { ok: false, reason: 'WRITE_FAILED', error: result.error });
  }

  return withLoggedResult('SCHEMA_ALIGNMENT_PLAN_RESULT', { ok: true, data: { id: result.data.id }, sessionId: result.data.id });
}

export async function joinSession(input: {
  activeProfileId: string | null;
  activeDay: ActiveDay;
  selectedSpot: string | null;
  sessionId: string;
  sessionDay: string | null;
  sessionStatus: string | null;
  normalizedStart: string;
  normalizedEnd: string;
  intent: SessionIntent;
  dayKey: string;
  targetGroupHasVisibleRows: boolean;
  alreadyJoinedGroup: boolean;
}): Promise<ServiceSuccess | ServiceFailure> {
  if (!input.activeProfileId) {
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: 'NO_ACTIVE_PROFILE' });
  }

  const isSameDayAsActiveDay = input.sessionDay === input.dayKey;
  if (!isSameDayAsActiveDay) {
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: 'NON_JOINABLE_DAY' });
  }
  if (input.sessionStatus === 'finished') {
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: 'SESSION_FINISHED' });
  }

  if (!input.selectedSpot) {
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: 'NO_SELECTED_SPOT' });
  }
  const sessionIdentity = getRealSchemaIdentity({
    user_id: input.activeProfileId,
    spot_name: input.selectedSpot,
    day_key: input.dayKey,
  });
  if (!sessionIdentity.user_id || !sessionIdentity.spot_name || !sessionIdentity.day_key) {
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: 'INVALID_SESSION_IDENTITY' });
  }

  const { sessions: ownSessionsFresh, error: ownSessionsFreshError } = await readOwnSessionsForSpotDay({
    userId: sessionIdentity.user_id,
    spotName: sessionIdentity.spot_name,
    activeDay: sessionIdentity.day_key,
    selectedSpot: input.selectedSpot,
  });

  if (ownSessionsFreshError) {
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: 'OWN_SESSIONS_QUERY_FAILED', error: ownSessionsFreshError });
  }

  const existingOwnSessionsForSpotDay = Array.isArray(ownSessionsFresh) ? ownSessionsFresh : [];
  const hasOwnSession = existingOwnSessionsForSpotDay.some((session) => session.id === input.sessionId);

  const joinEligibility = getJoinState({
    session: {
      id: input.sessionId,
      sessionDay: input.sessionDay,
      status: input.sessionStatus,
    },
    ownSessionForSpotDay: { hasOwnSession },
    activeDayKey: input.dayKey,
  });

  if (!joinEligibility.allowed && joinEligibility.reason !== 'ALREADY_HAS_SESSION') {
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: joinEligibility.reason ?? 'JOIN_NOT_ALLOWED' });
  }

  // Gebruik session_day i.p.v. created_at bounds — created_at kan op een andere dag vallen
  // (bijv. bij buildCreatedAtForDayKey of wanneer de join de dag vóór wordt uitgevoerd)
  const { data: ownSessionsForDay, error: ownSessionsForDayError } = await supabase
    .from('sessions')
    .select('id, user_id, spot_name, session_day, start_time, end_time, status, checked_out_at')
    .eq('user_id', sessionIdentity.user_id)
    .eq('session_day', sessionIdentity.day_key);

  if (ownSessionsForDayError) {
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: 'OWN_DAY_SESSIONS_QUERY_FAILED', error: ownSessionsForDayError });
  }
  const toMinutes = (value: string | null | undefined) => {
    if (!value) return null;
    const time = value.includes('T') ? value.slice(11, 16) : value.slice(0, 5);
    const [hours, minutes] = time.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  };

  const joinStartMinutes = toMinutes(input.normalizedStart);
  const joinEndMinutes = toMinutes(input.normalizedEnd);

  // Verwijder ALLE eigen sessies op dezelfde spot+dag (unique constraint: 1 sessie per user/spot/dag)
  // plus tijdoverlappende sessies op andere spots.
  const sessionsToDeleteIds = (ownSessionsForDay ?? [])
    .filter((session) => {
      if (!session?.id || session.id === input.sessionId) return false;
      if (session.checked_out_at || ['finished', 'uitchecken'].includes(String(session.status ?? '').toLowerCase())) return false;

      // Zelfde spot: altijd verwijderen (unique constraint)
      if (normalizeSpotName(session.spot_name) === normalizeSpotName(sessionIdentity.spot_name)) return true;

      // Andere spot: alleen bij tijdoverlap
      const start = toMinutes(session.start_time);
      const end = toMinutes(session.end_time);
      if (joinStartMinutes === null || joinEndMinutes === null || start === null || end === null) return false;
      return Math.max(start, joinStartMinutes) < Math.min(end, joinEndMinutes);
    })
    .map((session) => session.id);

  if (sessionsToDeleteIds.length > 0) {
    const deleteResult = await supabase
      .from('sessions')
      .delete()
      .eq('user_id', sessionIdentity.user_id)
      .in('id', sessionsToDeleteIds);

    if (deleteResult.error) {
      return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: 'DELETE_OVERLAPPING_OWN_SESSIONS_FAILED', error: deleteResult.error });
    }
  }


  const { data: sourceSessionForJoin, error: sourceSessionForJoinError } = await supabase
    .from('sessions')
    .select('intent, source_session_id')
    .eq('id', input.sessionId)
    .maybeSingle();

  if (sourceSessionForJoinError) {
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: 'SOURCE_SESSION_QUERY_FAILED', error: sourceSessionForJoinError });
  }

  const inheritedIntent: SessionIntent = sourceSessionForJoin?.intent === 'maybe' ? 'maybe' : 'definitely';
  // Altijd de ROOT sessie als source gebruiken (niet een joiner sessie)
  const rootSessionId = (sourceSessionForJoin as any)?.source_session_id ?? input.sessionId;

  const { data: existingJoinedSession, error: existingJoinedSessionError } = await supabase
    .from('sessions')
    .select('id')
    .eq('user_id', sessionIdentity.user_id)
    .eq('source_session_id', rootSessionId)
    .maybeSingle();

  if (existingJoinedSessionError) {
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', {
      ok: false,
      reason: 'EXISTING_JOIN_QUERY_FAILED',
      error: existingJoinedSessionError,
    });
  }

  if (existingJoinedSession?.id) {
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', {
      ok: true,
      sessionId: existingJoinedSession.id,
    });
  }

  const joinPayload = {
    spot_name: sessionIdentity.spot_name,
    user_id: sessionIdentity.user_id,
    created_at: new Date().toISOString(),
    session_day: sessionIdentity.day_key,
    start_time: input.normalizedStart,
    end_time: input.normalizedEnd,
    status: 'Gaat' as const,
    intent: inheritedIntent,
    checked_in_at: null,
    checked_out_at: null,
    source_session_id: rootSessionId,
  };

  const writeResult = await supabase
    .from('sessions')
    .insert(joinPayload)
    .select('id')
    .single();

  if (writeResult.error) {
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: 'WRITE_FAILED', error: writeResult.error });
  }


  const { data: sourceSession } = await supabase
    .from('sessions')
    .select('user_id, spot_name')
    .eq('id', input.sessionId)
    .maybeSingle();
  const sessionOwnerId = sourceSession?.user_id ?? null;
  const sourceSessionSpotName = sourceSession?.spot_name ?? null;
  const joinedUserId = sessionIdentity.user_id;


  if (!sessionOwnerId || sessionOwnerId === joinedUserId) {
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: true });
  }

  const { data: ownerProfileById } = await supabase
    .from('profiles')
    .select('id, owner_uid')
    .eq('id', sessionOwnerId)
    .maybeSingle();
  const { data: ownerProfileByOwnerUid } = ownerProfileById
    ? { data: null }
    : await supabase
        .from('profiles')
        .select('id, owner_uid')
        .eq('owner_uid', sessionOwnerId)
        .maybeSingle();

  const { spotName: querySpotName } = buildSpotNotificationPreferenceKey({
    userId: sessionOwnerId,
    spotName: sourceSessionSpotName,
  });
  const ownerPreferenceUserId = ownerProfileById?.id
    ?? ownerProfileByOwnerUid?.id
    ?? sessionOwnerId;
  const preferenceLookupUserIds = Array.from(new Set([
    ownerPreferenceUserId,
    sessionOwnerId,
    ownerProfileById?.id ?? null,
    ownerProfileByOwnerUid?.id ?? null,
  ].map((value) => (value ?? '').trim()).filter(Boolean)));

  let resolvedMode: string | null = null;
  const preferenceFetchAttempts: { lookupUserId: string; result: string | null; error: string | null }[] = [];
  for (const lookupUserId of preferenceLookupUserIds) {
    const { data, error } = await supabase.rpc('get_spot_session_joined_notification_preference', {
      lookup_user_id: lookupUserId,
      lookup_spot_name: querySpotName,
    });
    preferenceFetchAttempts.push({
      lookupUserId,
      result: typeof data === 'string' ? data : null,
      error: error?.message ?? null,
    });
    if (error || data === null) {
      continue;
    }

    const normalizedMode = normalizeSpotNotificationMode(data);
    if (normalizedMode === 'off' && lookupUserId !== ownerPreferenceUserId) {
      continue;
    }
    if (typeof data === 'string' && data.trim().toLowerCase() !== normalizedMode) {
      continue;
    }
    resolvedMode = normalizedMode;
    break;
  }
  if (resolvedMode === null) {
    resolvedMode = 'everyone';
  }
  const shouldSend = resolvedMode !== 'off';
  const spotName = querySpotName;


  if (shouldSend) {
    const { data: joinerProfile } = await supabase.from('profiles').select('display_name').eq('id', joinedUserId).maybeSingle();
    const joinerName = joinerProfile?.display_name?.trim() || 'Someone';

    const { error: notificationRpcError } = await supabase.rpc('create_session_joined_notification', {
      recipient_profile_id: sessionOwnerId,
      actor_profile_id: joinedUserId,
      session_id: input.sessionId,
      spot_name: spotName,
    });
    if (!notificationRpcError && sessionOwnerId) {
      supabase.rpc('send_push_to_users', {
        recipient_ids: [sessionOwnerId],
        title: `${joinerName} joined your session`,
        body: spotName ? `${joinerName} is joining you at ${spotName}.` : `${joinerName} joined your session.`,
        data: { type: 'session_joined', sessionId: input.sessionId, spotName, actorName: joinerName },
      }).then(({ error }) => { if (error) console.error('JOIN_PUSH_ERROR', error); });
    }


  }

  return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: true });
}

export async function cancelSession(input: {
  activeProfileId: string | null;
  selectedDateKey: string;
  session: {
    id: string;
    spot: string;
    sessionDay: string | null;
    userId: string;
    status: SessionStatus;
    checkedInAt: string | null;
    checkedOutAt: string | null;
    createdAt: string | null;
  };
  resolvedSessionActorProfileId: string | null;
}): Promise<ServiceSuccess | ServiceFailure> {
  if (!input.activeProfileId) {
    return { ok: false, reason: 'MISSING_ACTIVE_PROFILE' };
  }

  const ownSessionForSpotDay = getOwnSessionForSpotDay({
    sessions: [
      {
        id: input.session.id,
        user_id: input.session.userId,
        spot_name: input.session.spot,
        created_at: buildCreatedAtForDayKey(input.session.sessionDay),
      },
    ],
    userId: input.activeProfileId,
    spotName: input.session.spot,
    dayKey: input.selectedDateKey,
  });

  const isCancelable = Boolean(
    input.resolvedSessionActorProfileId === input.activeProfileId
      && ownSessionForSpotDay.hasOwnSession
      && input.session.status !== 'finished'
      && input.session.status !== 'Uitchecken',
  );

  if (!isCancelable) {
    return { ok: false, reason: 'CANCEL_NOT_ALLOWED' };
  }

  // Check of dit een root-sessie is met joiners — gebruik RPC voor atomaire promotie
  const { data: hasJoiner } = await supabase
    .from('sessions')
    .select('id')
    .eq('source_session_id', input.session.id)
    .limit(1)
    .maybeSingle();

  if (hasJoiner) {
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('leave_group_session', { root_session_id: input.session.id });
    if (rpcError) return { ok: false, reason: 'DELETE_FAILED', error: rpcError };
    const result = rpcResult as { ok: boolean; reason?: string } | null;
    if (!result?.ok) return { ok: false, reason: result?.reason ?? 'RPC_FAILED' };
    return { ok: true, sessionId: input.session.id };
  }

  // Geen joiners: gewoon verwijderen
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', input.session.id)
    .eq('user_id', input.activeProfileId);

  if (error) {
    return { ok: false, reason: 'DELETE_FAILED', error };
  }

  return { ok: true, sessionId: input.session.id };
}

export const sessionActions = {
  planSession,
  joinSession,
  cancelSession,
};
