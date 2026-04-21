import { canJoinSlot, getOwnSessionForSpotDay, getSessionDayKey, normalizeSpotName } from '../../lib/sessionHelpers';
import { supabase } from '../../lib/supabase';

type SessionIntent = 'maybe' | 'likely' | 'definitely';
type ActiveDay = 'today' | 'tomorrow';
type SessionStatus = 'Is er al' | 'Gaat' | 'Uitchecken' | 'live' | 'finished';

type SessionRecord = {
  id?: string | null;
  user_id?: string | null;
  spot_name?: string | null;
  session_day?: string | null;
  created_at?: string | null;
  start_time?: string | null;
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

const getIsoDateFromLocalDateKey = (localDateKey: string) => {
  const [yearPart, monthPart, dayPart] = localDateKey.split('-').map((value) => Number.parseInt(value ?? '', 10));
  if (!yearPart || !monthPart || !dayPart) {
    return null;
  }

  const isoDate = new Date();
  isoDate.setFullYear(yearPart, monthPart - 1, dayPart);
  isoDate.setHours(12, 0, 0, 0);
  return isoDate.toISOString();
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
    return { ok: false, reason: 'MISSING_ACTIVE_PROFILE' };
  }

  const canonicalSelectedSpot = normalizeSpotName(input.selectedSpot);
  const { data: ownSessionsFresh, error: ownSessionsFreshError } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', input.activeProfileId);

  if (ownSessionsFreshError) {
    return { ok: false, reason: 'OWN_SESSIONS_QUERY_FAILED', error: ownSessionsFreshError };
  }

  const safeOwnSessionsFresh = Array.isArray(ownSessionsFresh) ? ownSessionsFresh : [];
  const ownSessionForSpotDay = getOwnSessionForSpotDay({
    sessions: safeOwnSessionsFresh,
    userId: input.activeProfileId,
    spotName: canonicalSelectedSpot,
    dayKey: input.selectedPlanningDateKey,
    options: {
      fallbackDayKey: input.selectedPlanningDateKey,
      fallbackResolver: (session) => getSessionDayKey(session, { fallbackDayKey: input.selectedPlanningDateKey }),
    },
  });

  const conflictSessions = ownSessionForSpotDay.ownSessions.filter((session) => session?.id !== input.editingSessionId);
  if (conflictSessions.length > 0) {
    return { ok: false, reason: alreadyHasSessionReason };
  }

  const payload = {
    spot_name: canonicalSelectedSpot,
    user_id: input.activeProfileId,
    start_time: input.startTime,
    end_time: input.endTime,
    status: 'Gaat' as const,
    intent: input.intent,
    checked_in_at: null,
    checked_out_at: null,
    created_at: getIsoDateFromLocalDateKey(input.selectedPlanningDateKey) ?? undefined,
  };

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
      return { ok: false, reason: alreadyHasSessionReason };
    }
    return { ok: false, reason: 'WRITE_FAILED', error: result.error };
  }

  return { ok: true, data: { id: result.data.id }, sessionId: result.data.id };
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
  if (!input.activeProfileId) {
    return { ok: false, reason: 'NO_ACTIVE_PROFILE' };
  }

  if (input.activeDay !== 'today') {
    return { ok: false, reason: 'NON_JOINABLE_DAY' };
  }

  if (!input.selectedSpot) {
    return { ok: false, reason: 'NO_SELECTED_SPOT' };
  }
  const canonicalSelectedSpot = normalizeSpotName(input.selectedSpot);

  const { data: ownSessionsFresh, error: ownSessionsFreshError } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', input.activeProfileId);

  if (ownSessionsFreshError) {
    return { ok: false, reason: 'OWN_SESSIONS_QUERY_FAILED', error: ownSessionsFreshError };
  }

  const safeOwnSessionsFresh = Array.isArray(ownSessionsFresh) ? ownSessionsFresh : [];
  const ownSessionForSpotDay = getOwnSessionForSpotDay({
    sessions: safeOwnSessionsFresh,
    userId: input.activeProfileId,
    spotName: canonicalSelectedSpot,
    dayKey: input.dayKey,
    options: {
      fallbackDayKey: input.dayKey,
      fallbackResolver: (session) => getSessionDayKey(session, { fallbackDayKey: input.dayKey }),
    },
  });
  const existingOwnSessionsForSpotDay = ownSessionForSpotDay.ownSessions;

  const joinEligibility = canJoinSlot({
    activeProfileId: input.activeProfileId,
    ownSessionForSpotDay,
    targetGroupHasVisibleRows: input.targetGroupHasVisibleRows,
    alreadyJoinedGroup: input.alreadyJoinedGroup,
  });

  if (!joinEligibility.allowed) {
    if (joinEligibility.reason === 'ALREADY_HAS_SESSION_ON_SPOT_DAY') {
      return { ok: false, reason: alreadyHasSessionReason };
    }
    return { ok: false, reason: joinEligibility.reason ?? 'JOIN_NOT_ALLOWED' };
  }

  const joinPayload = {
    spot_name: canonicalSelectedSpot,
    user_id: input.activeProfileId,
    start_time: input.normalizedStart,
    end_time: input.normalizedEnd,
    status: 'Gaat' as const,
    intent: input.intent,
    checked_in_at: null,
    checked_out_at: null,
    created_at: getIsoDateFromLocalDateKey(input.dayKey) ?? undefined,
  };

  const writeResult = await supabase.from('sessions').insert(joinPayload);

  if (writeResult.error) {
    if (isUniqueConstraintError(writeResult.error)) {
      return { ok: false, reason: alreadyHasSessionReason };
    }
    return { ok: false, reason: 'WRITE_FAILED', error: writeResult.error };
  }

  return { ok: true };
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
