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
  activeProfileId: string | null | undefined;
  ownSessionForSpotDay: { hasOwnSession?: boolean } | null | undefined;
  targetGroupHasVisibleRows: boolean;
  alreadyJoinedGroup: boolean;
};

export const canJoinSlot = ({
  activeProfileId,
  ownSessionForSpotDay,
  targetGroupHasVisibleRows,
  alreadyJoinedGroup,
}: CanJoinSlotArgs) => {
  if (!activeProfileId) {
    return { allowed: false, reason: 'NO_ACTIVE_PROFILE' };
  }
  if (!targetGroupHasVisibleRows) {
    return { allowed: false, reason: 'NO_VISIBLE_ROWS' };
  }
  if (alreadyJoinedGroup) {
    return { allowed: false, reason: 'ALREADY_JOINED_GROUP' };
  }
  if (ownSessionForSpotDay?.hasOwnSession) {
    return { allowed: false, reason: 'ALREADY_HAS_SESSION_ON_SPOT_DAY' };
  }
  return { allowed: true, reason: null };
};
