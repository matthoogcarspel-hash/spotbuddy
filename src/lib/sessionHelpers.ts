import { getLocalDateKey } from './sessionDay';

type SessionLike = {
  id?: string | null;
  userId?: string | null;
  user_id?: string | null;
  spot?: string | null;
  spot_name?: string | null;
  session_day?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  start?: string | null;
  start_time?: string | null;
};

type SessionDayKeyOptions = {
  fallbackDayKey?: string | null;
  fallbackResolver?: ((session: SessionLike | null | undefined) => string | null) | null;
};

export const normalizeSpotName = (value: string | null | undefined) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
const coerceDate = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

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

export const getSessionDayKey = (session: SessionLike | null | undefined, options: SessionDayKeyOptions = {}) => {
  const sessionDay = typeof session?.session_day === 'string' ? session.session_day.trim() : '';
  if (sessionDay) {
    return sessionDay;
  }

  if (typeof options.fallbackResolver === 'function') {
    const resolved = options.fallbackResolver(session);
    if (resolved) {
      return resolved;
    }
  }

  if (options.fallbackDayKey) {
    return options.fallbackDayKey;
  }

  const startDate = coerceDate(session?.start_time ?? session?.start ?? null);
  if (startDate) {
    return getLocalDateKey(startDate);
  }

  const createdDate = coerceDate(session?.created_at ?? session?.createdAt ?? null);
  if (createdDate) {
    return getLocalDateKey(createdDate);
  }

  return null;
};

type OwnSessionArgs = {
  sessions: SessionLike[];
  userId: string | null | undefined;
  spotName: string | null | undefined;
  dayKey: string | null | undefined;
  options?: SessionDayKeyOptions;
};

export const getOwnSessionForSpotDay = ({
  sessions,
  userId,
  spotName,
  dayKey,
  options,
}: OwnSessionArgs) => {
  const normalizedSpot = normalizeSpotName(spotName);
  const ownSessions = (Array.isArray(sessions) ? sessions : []).filter((session) => {
    if (!session || getSessionUserId(session) !== userId) {
      return false;
    }
    if (normalizedSpot && !sameSpot(session, spotName)) {
      return false;
    }
    return getSessionDayKey(session, options) === dayKey;
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
