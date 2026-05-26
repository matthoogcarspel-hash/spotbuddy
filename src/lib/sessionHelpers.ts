type SessionLike = {
  id?: string | null;
  userId?: string | null;
  user_id?: string | null;
  sessionDay?: string | null;
  session_day?: string | null;
  spot?: string | null;
  spot_name?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  start?: string | null;
  start_time?: string | null;
  end?: string | null;
  end_time?: string | null;
  status?: string | null;
  checkedOutAt?: string | null;
  checked_out_at?: string | null;
};

export const REAL_SESSION_SCHEMA_FIELDS = {
  userField: 'user_id',
  spotField: 'spot_name',
  startField: 'start_time',
  endField: 'end_time',
  dayDerivedFromField: 'created_at',
} as const;

export const normalizeSpotName = (value: string | null | undefined) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
const sessionDayPattern = /^\d{4}-\d{2}-\d{2}$/;
export const normalizeSessionDay = (value: string | null | undefined) => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return null;
  }

  if (sessionDayPattern.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
};

export const buildCreatedAtForDayKey = (dayKey: string | null | undefined) => {
  const normalizedDay = normalizeSessionDay(dayKey);
  if (!normalizedDay) {
    return null;
  }

  const now = new Date();
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const minute = String(now.getUTCMinutes()).padStart(2, '0');
  const second = String(now.getUTCSeconds()).padStart(2, '0');
  const millis = String(now.getUTCMilliseconds()).padStart(3, '0');
  return `${normalizedDay}T${hour}:${minute}:${second}.${millis}Z`;
};

export const getDayBoundsForDayKey = (dayKey: string | null | undefined) => {
  const normalizedDay = normalizeSessionDay(dayKey);
  if (!normalizedDay) {
    return null;
  }

  const start = `${normalizedDay}T00:00:00.000Z`;
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) {
    return null;
  }
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 1);

  return {
    start,
    endExclusive: endDate.toISOString(),
  };
};

export const normalizeSessionIdentity = (input: {
  user_id: string | null | undefined;
  spot_name: string | null | undefined;
  day_key: string | null | undefined;
}) => ({
  user_id: (input.user_id ?? '').trim() || null,
  spot_name: normalizeSpotName(input.spot_name),
  day_key: normalizeSessionDay(input.day_key),
});
const getSessionUserId = (session: SessionLike | null | undefined) => session?.user_id ?? session?.userId ?? null;
export const getSessionSpot = (session: SessionLike | null | undefined) => session?.spot_name ?? session?.spot ?? null;
export const getSelectedSpotName = (spot: { name?: string | null } | string | null | undefined) =>
  typeof spot === 'string' ? spot : (spot?.name ?? null);
export const sameSpot = (
  session: SessionLike | null | undefined,
  selectedSpot: { name?: string | null } | string | null | undefined,
) => {
  const selectedSpotName = getSelectedSpotName(selectedSpot);
  if (!selectedSpotName) {
    return true;
  }
  return normalizeSpotName(getSessionSpot(session)) === normalizeSpotName(selectedSpotName);
};

export const getSessionDayKey = (session: SessionLike | null | undefined) => {
  const rawSessionDay = typeof session?.session_day === 'string'
    ? session.session_day.trim()
    : (typeof session?.sessionDay === 'string' ? session.sessionDay.trim() : '');
  const normalizedSessionDay = normalizeSessionDay(rawSessionDay);
  if (normalizedSessionDay) {
    return normalizedSessionDay;
  }

  const rawCreatedAt = typeof session?.created_at === 'string'
    ? session.created_at.trim()
    : (typeof session?.createdAt === 'string' ? session.createdAt.trim() : '');

  return normalizeSessionDay(rawCreatedAt);
};

const parseSessionDateTimeForDay = (dayKey: string | null | undefined, value: string | null | undefined) => {
  const normalizedDay = normalizeSessionDay(dayKey);
  const normalizedValue = (value ?? '').trim();
  if (!normalizedDay || !normalizedValue) {
    return null;
  }

  const parsedDirect = new Date(normalizedValue);
  if (!Number.isNaN(parsedDirect.getTime())) {
    return parsedDirect;
  }

  const parsedLocalWithDay = new Date(`${normalizedDay}T${normalizedValue}:00`);
  if (!Number.isNaN(parsedLocalWithDay.getTime())) {
    return parsedLocalWithDay;
  }

  return null;
};

export const getSessionState = (session: SessionLike | null | undefined, now = new Date()) => {
  if (!session) {
    return 'finished' as const;
  }

  const status = typeof session.status === 'string' ? session.status.trim().toLowerCase() : '';
  const checkedOutAt = session.checked_out_at ?? session.checkedOutAt ?? null;
  if (checkedOutAt || status === 'finished' || status === 'uitchecken') {
    return 'finished' as const;
  }

  const dayKey = getSessionDayKey(session);
  const start = parseSessionDateTimeForDay(dayKey, session.start_time ?? session.start ?? null);
  const end = parseSessionDateTimeForDay(dayKey, session.end_time ?? session.end ?? null);
  if (end && end <= now) {
    return 'finished' as const;
  }
  if (start && end && start <= now && now <= end) {
    return 'active' as const;
  }
  return 'planned' as const;
};

export const isSessionBlockingOwnSession = (session: SessionLike | null | undefined, now = new Date()) =>
  getSessionState(session, now) !== 'finished';

type OwnSessionArgs = {
  sessions: SessionLike[];
  userId: string | null | undefined;
  spotName: string | null | undefined;
  dayKey: string | null | undefined;
};

export const getOwnSessionForSpotDay = ({
  sessions,
  userId,
  spotName,
  dayKey,
}: OwnSessionArgs) => {
  const normalizedSpot = normalizeSpotName(spotName);
  const ownSessions = (Array.isArray(sessions) ? sessions : []).filter((session) => {
    if (!session || getSessionUserId(session) !== userId) {
      return false;
    }
    if (normalizedSpot && !sameSpot(session, spotName)) {
      return false;
    }
    return getSessionDayKey(session) === dayKey;
  });

  return {
    ownSession: ownSessions[0] ?? null,
    hasOwnSession: ownSessions.length > 0,
    ownSessions,
  };
};

type CanJoinSlotArgs = {
  session: SessionLike | null | undefined;
  ownSessionForSpotDay: { hasOwnSession?: boolean; hasBlockingOwnSession?: boolean } | null | undefined;
  activeDayKey: string | null | undefined;
  followingUserIds?: string[];
  groupParticipantUserIds?: string[];
};

export const getJoinState = ({
  session,
  ownSessionForSpotDay,
  activeDayKey,
  followingUserIds = [],
  groupParticipantUserIds = [],
}: CanJoinSlotArgs) => {
  if (getSessionDayKey(session) !== normalizeSessionDay(activeDayKey)) {
    return { allowed: false, reason: 'NON_JOINABLE_DAY' as const };
  }
  const sessionStatus = typeof (session as { status?: unknown } | null | undefined)?.status === 'string'
    ? ((session as { status: string }).status ?? '').trim().toLowerCase()
    : '';
  if (sessionStatus === 'finished' || sessionStatus === 'uitchecken') {
    return { allowed: false, reason: 'SESSION_FINISHED' as const };
  }
  // Buddy check: current user must be a buddy of at least one participant in the group
  if (followingUserIds.length > 0 || groupParticipantUserIds.length > 0) {
    const isBuddyOfParticipant = groupParticipantUserIds.some((uid) => followingUserIds.includes(uid));
    if (!isBuddyOfParticipant) {
      return { allowed: false, reason: 'NOT_BUDDY' as const };
    }
  }
  return { allowed: true, reason: null };
};

type TopCtaStateArgs = {
  ownSessionForSpotDay: {
    hasOwnSession?: boolean;
    hasBlockingOwnSession?: boolean;
    ownSession?: { id?: string | null } | null;
  } | null | undefined;
};

export const getTopCtaState = ({ ownSessionForSpotDay }: TopCtaStateArgs) => {
  const hasOwnSession = Boolean(ownSessionForSpotDay?.hasBlockingOwnSession);
  const sessionId = ownSessionForSpotDay?.ownSession?.id ?? undefined;

  return {
    mode: hasOwnSession ? 'edit' as const : 'plan' as const,
    hasOwnSession,
    sessionId,
  };
};
