import {
  canJoinSlot,
  getDerivedSessionDayFromRealSchema,
  getOwnSessionForSpotDay,
  getSessionDayKey,
  normalizeSessionDay,
  normalizeSessionIdentity,
  REAL_SESSION_SCHEMA_FIELDS,
} from '../../lib/sessionHelpers';
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
  error?.code === '23505' || error?.message?.includes('sessions_one_open_per_user_idx') || false;
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
    session_day: input.day_key,
  }),
  day_key: normalizeSessionDay(input.day_key),
});

const readOwnSessionsForSpotDay = async (input: {
  userId: string;
  spotName: string;
  activeDay: string;
  selectedSpot: string | null;
}) => {
  const derivedDayStrategy = REAL_SESSION_SCHEMA_FIELDS.derivedDayStrategy;
  console.log('REAL_SESSION_SCHEMA_FIELDS', {
    userField: REAL_SESSION_SCHEMA_FIELDS.userField,
    spotField: REAL_SESSION_SCHEMA_FIELDS.spotField,
    startField: REAL_SESSION_SCHEMA_FIELDS.startField,
    endField: REAL_SESSION_SCHEMA_FIELDS.endField,
    derivedDayStrategy,
  });
  console.log('SCHEMA_ALIGNMENT_READ_QUERY', {
    selectedSpot: input.selectedSpot,
    activeDay: input.activeDay,
    usingDayField: false,
    derivedDayStrategy,
  });

  const { data, error } = await supabase
    .from('sessions')
    .select('id, user_id, spot_name, created_at, start_time, end_time')
    .eq('user_id', input.userId)
    .eq('spot_name', input.spotName);

  if (error) {
    return { sessions: [], error };
  }

  const ownSessions = (Array.isArray(data) ? data : []).filter((session) => (
    getDerivedSessionDayFromRealSchema(session) === input.activeDay
  ));

  return { sessions: ownSessions, error: null };
};

const getSessionCreatedAtFromSessionDay = (sessionDay: string | null | undefined) => {
  const normalizedSessionDay = normalizeSessionDay(sessionDay);
  if (!normalizedSessionDay) {
    return null;
  }

  return `${normalizedSessionDay}T12:00:00.000Z`;
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

  const conflictSessions = (Array.isArray(ownSessionsFresh) ? ownSessionsFresh : []).filter((session) => session?.id !== input.editingSessionId);
  if (conflictSessions.length > 0) {
    return withLoggedResult('SCHEMA_ALIGNMENT_PLAN_RESULT', { ok: false, reason: alreadyHasSessionReason });
  }

  const payload = {
    spot_name: sessionIdentity.spot_name,
    user_id: sessionIdentity.user_id,
    start_time: input.startTime,
    end_time: input.endTime,
    status: 'Gaat' as const,
    intent: input.intent,
    checked_in_at: null,
    checked_out_at: null,
    created_at: getSessionCreatedAtFromSessionDay(sessionIdentity.day_key) ?? undefined,
  };
  console.log('WRITE_SESSION_INPUT', {
    user_id: payload.user_id,
    spot_name: payload.spot_name,
    active_day: sessionIdentity.day_key,
  });

  let result;
  if (input.editingSessionId) {
    result = await supabase
      .from('sessions')
      .update({
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
  normalizedStart: string;
  normalizedEnd: string;
  intent: SessionIntent;
  dayKey: string;
  targetGroupHasVisibleRows: boolean;
  alreadyJoinedGroup: boolean;
}): Promise<ServiceSuccess | ServiceFailure> {
  console.log('SCHEMA_ALIGNMENT_JOIN_INPUT', input);
  if (!input.activeProfileId) {
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: 'NO_ACTIVE_PROFILE' });
  }

  if (input.activeDay !== 'today') {
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: 'NON_JOINABLE_DAY' });
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

  const joinEligibility = canJoinSlot({
    activeProfileId: input.activeProfileId,
    ownSessionForSpotDay: { hasOwnSession: existingOwnSessionsForSpotDay.length > 0 },
    targetGroupHasVisibleRows: input.targetGroupHasVisibleRows,
    alreadyJoinedGroup: input.alreadyJoinedGroup,
  });

  if (!joinEligibility.allowed) {
    if (joinEligibility.reason === 'ALREADY_HAS_SESSION_ON_SPOT_DAY') {
      return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: alreadyHasSessionReason });
    }
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: joinEligibility.reason ?? 'JOIN_NOT_ALLOWED' });
  }

  const joinPayload = {
    spot_name: sessionIdentity.spot_name,
    user_id: sessionIdentity.user_id,
    start_time: input.normalizedStart,
    end_time: input.normalizedEnd,
    status: 'Gaat' as const,
    intent: input.intent,
    checked_in_at: null,
    checked_out_at: null,
    created_at: getSessionCreatedAtFromSessionDay(sessionIdentity.day_key) ?? undefined,
  };
  console.log('WRITE_SESSION_INPUT', {
    user_id: joinPayload.user_id,
    spot_name: joinPayload.spot_name,
    active_day: sessionIdentity.day_key,
  });

  const writeResult = await supabase.from('sessions').insert(joinPayload);

  if (writeResult.error) {
    if (isUniqueConstraintError(writeResult.error)) {
      return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: alreadyHasSessionReason });
    }
    return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: false, reason: 'WRITE_FAILED', error: writeResult.error });
  }

  return withLoggedResult('SCHEMA_ALIGNMENT_JOIN_RESULT', { ok: true });
}

export async function cancelSession(input: {
  activeProfileId: string | null;
  selectedDateKey: string;
  session: {
    id: string;
    spot: string;
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
        created_at: input.session.createdAt,
      },
    ],
    userId: input.activeProfileId,
    spotName: input.session.spot,
    dayKey: input.selectedDateKey,
    options: {
      fallbackDayKey: input.selectedDateKey,
      fallbackResolver: (session) => getSessionDayKey(session, { fallbackDayKey: input.selectedDateKey }),
    },
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
