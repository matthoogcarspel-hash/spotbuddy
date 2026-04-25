import {
  buildCreatedAtForDayKey,
  getDayBoundsForDayKey,
  getJoinState,
  getOwnSessionForSpotDay,
  isSessionBlockingOwnSession,
  normalizeSessionIdentity,
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
  console.log(label, result);
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
  console.log('REAL_SESSION_SCHEMA_FIELDS', {
    userField: REAL_SESSION_SCHEMA_FIELDS.userField,
    spotField: REAL_SESSION_SCHEMA_FIELDS.spotField,
    dayDerivedFromField: REAL_SESSION_SCHEMA_FIELDS.dayDerivedFromField,
    startField: REAL_SESSION_SCHEMA_FIELDS.startField,
    endField: REAL_SESSION_SCHEMA_FIELDS.endField,
  });
  console.log('SCHEMA_ALIGNMENT_READ_QUERY', {
    selectedSpot: input.selectedSpot,
    activeDay: input.activeDay,
    usingDayField: true,
    dayDerivedFromField: REAL_SESSION_SCHEMA_FIELDS.dayDerivedFromField,
  });

  const selectedSpot = input.selectedSpot as { name?: string | null } | string | null;
  const activeDay = input.activeDay;
  console.log("NO_SESSION_DAY_RUNTIME_PATH", {
    selectedSpot: selectedSpot?.name ?? selectedSpot ?? null,
    activeDay,
    dayStrategy: "derived-from-real-schema"
  });

  console.log("OWN_SESSIONS_QUERY_INPUT", {
    selectedSpot: selectedSpot?.name ?? selectedSpot ?? null,
    activeDay
  });

  const dayBounds = getDayBoundsForDayKey(input.activeDay);
  if (!dayBounds) {
    const invalidDayError = { message: 'INVALID_DAY_KEY' };
    console.log("OWN_SESSIONS_QUERY_RESULT", {
      ok: false,
      count: 0,
      error: invalidDayError.message,
    });
    return { sessions: [], error: invalidDayError };
  }

  const { data: sessionRecords, error } = await supabase
    .from('sessions')
    .select('id, user_id, spot_name, created_at, start_time, end_time, status, checked_out_at')
    .eq('user_id', input.userId)
    .eq('spot_name', input.spotName)
    .gte('created_at', dayBounds.start)
    .lt('created_at', dayBounds.endExclusive);

  console.log("OWN_SESSIONS_QUERY_RESULT", {
    ok: !error,
    count: sessionRecords?.length ?? 0,
    error: error?.message ?? null,
  });

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
  console.log('SCHEMA_ALIGNMENT_PLAN_INPUT', input);
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
  console.log("SESSION_DUPLICATE_DB_CHECK", {
    userId: sessionIdentity.user_id,
    spot: sessionIdentity.spot_name,
    dayKey: sessionIdentity.day_key,
    existingSessions: ownSessionsFresh,
  });
  console.log("SESSION_DUPLICATE_FILTERED", {
    blockingSessions: conflictSessions,
  });
  if (conflictSessions.length > 0) {
    return withLoggedResult('SCHEMA_ALIGNMENT_PLAN_RESULT', { ok: false, reason: alreadyHasSessionReason });
  }

  const payload = {
    spot_name: sessionIdentity.spot_name,
    user_id: sessionIdentity.user_id,
    created_at: buildCreatedAtForDayKey(sessionIdentity.day_key),
    start_time: input.startTime,
    end_time: input.endTime,
    status: 'Gaat' as const,
    intent: input.intent,
    checked_in_at: null,
    checked_out_at: null,
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
  console.log('SCHEMA_ALIGNMENT_JOIN_INPUT', input);
  console.log('WEB_NOTIFICATION_FLOW_START', {
    sessionId: input.sessionId,
    selectedSpot: input.selectedSpot,
  });
  if (!input.activeProfileId) {
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: 'NO_ACTIVE_PROFILE' });
  }

  const isSameDayAsActiveDay = input.sessionDay === input.dayKey;
  console.log("JOIN_DAY_CHECK", {
    sessionId: input.sessionId,
    sessionDay: input.sessionDay,
    activeDayKey: input.dayKey,
    matches: isSameDayAsActiveDay,
  });
  if (!isSameDayAsActiveDay) {
    console.log("JOIN_PRECHECK_RESULT", {
      allowed: false,
      reason: 'NON_JOINABLE_DAY',
    });
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: 'NON_JOINABLE_DAY' });
  }
  if (input.sessionStatus === 'finished') {
    console.log("JOIN_PRECHECK_RESULT", {
      allowed: false,
      reason: 'SESSION_FINISHED',
    });
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
  const blockingOwnSessionsForSpotDay = existingOwnSessionsForSpotDay.filter((session) => isSessionBlockingOwnSession(session));
  const hasOwnSession = blockingOwnSessionsForSpotDay.length > 0;
  console.log("JOIN_ELIGIBILITY_CONTEXT", {
    hasOwnSession,
    sessionDay: input.sessionDay,
    activeDayKey: input.dayKey,
    isVisibleOnTimeline: true,
  });

  const joinEligibility = getJoinState({
    session: {
      id: input.sessionId,
      sessionDay: input.sessionDay,
      status: input.sessionStatus,
    },
    ownSessionForSpotDay: { hasOwnSession },
    activeDayKey: input.dayKey,
  });
  console.log("JOIN_PRECHECK_RESULT", {
    allowed: joinEligibility.allowed,
    reason: joinEligibility.reason ?? null,
  });

  if (!joinEligibility.allowed) {
    if (joinEligibility.reason === 'ALREADY_HAS_SESSION') {
      return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: alreadyHasSessionReason });
    }
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: joinEligibility.reason ?? 'JOIN_NOT_ALLOWED' });
  }

  const joinPayload = {
    spot_name: sessionIdentity.spot_name,
    user_id: sessionIdentity.user_id,
    created_at: buildCreatedAtForDayKey(sessionIdentity.day_key),
    start_time: input.normalizedStart,
    end_time: input.normalizedEnd,
    status: 'Gaat' as const,
    intent: input.intent,
    checked_in_at: null,
    checked_out_at: null,
  };

  const writeResult = await supabase.from('sessions').insert(joinPayload);

  if (writeResult.error) {
    if (isUniqueConstraintError(writeResult.error)) {
      return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: alreadyHasSessionReason });
    }
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: 'WRITE_FAILED', error: writeResult.error });
  }

  console.log("JOIN_EVENT_TRIGGERED", {
    sessionId: input.sessionId,
    joinedUserId: sessionIdentity.user_id,
  });

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
  const preferenceLookupUserIds = Array.from(new Set([
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

    resolvedMode = normalizeSpotNotificationMode(data);
    break;
  }
  if (resolvedMode === null) {
    resolvedMode = 'everyone';
  }
  const shouldSend = resolvedMode === 'everyone';
  const spotName = querySpotName;
  console.log('WEB_NOTIFICATION_FETCH_RESULT', {
    sessionId: input.sessionId,
    ownerId: sessionOwnerId,
    attempts: preferenceFetchAttempts,
    resolvedMode,
    shouldSend,
  });

  console.log("JOIN_NOTIFICATION_DECISION", {
    resolvedMode,
    shouldSend,
    sessionOwnerId,
    joinedUserId,
  });

  if (shouldSend) {
    console.log("NOTIFICATION_RPC_INPUT", {
      recipientProfileId: sessionOwnerId,
      actorProfileId: joinedUserId,
      sessionId: input.sessionId,
      spotName
    });

    const { error: notificationRpcError } = await supabase.rpc('create_session_joined_notification', {
      recipient_profile_id: sessionOwnerId,
      actor_profile_id: joinedUserId,
      session_id: input.sessionId,
      spot_name: spotName,
    });
    console.log('WEB_NOTIFICATION_CREATED', {
      sessionId: input.sessionId,
      recipientProfileId: sessionOwnerId,
      actorProfileId: joinedUserId,
      ok: !notificationRpcError,
      error: notificationRpcError?.message ?? null,
    });
    if (!notificationRpcError) {
      console.log('WEB_NOTIFICATION_RENDERED', {
        sessionId: input.sessionId,
        recipientProfileId: sessionOwnerId,
      });
    }

    console.log("NOTIFICATION_RPC_RESULT", {
      ok: !notificationRpcError,
      error: notificationRpcError ?? null
    });

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
      && !input.session.checkedInAt
      && !input.session.checkedOutAt
      && input.session.status !== 'finished'
      && input.session.status !== 'Uitchecken',
  );

  if (!isCancelable) {
    return { ok: false, reason: 'CANCEL_NOT_ALLOWED' };
  }

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
