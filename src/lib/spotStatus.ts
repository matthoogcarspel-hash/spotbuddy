export type SpotStatusKey = 'live' | 'forming' | 'quiet';
export type SpotStatusVariant = 'success' | 'info' | 'muted';
export type SpotSessionState = 'active' | 'planned' | 'finished';

export type SpotStatusResult = {
  key: SpotStatusKey;
  label: string;
  variant: SpotStatusVariant;
  activeCount: number;
  plannedCount: number;
  totalCount: number;
  isLiveNow: boolean;
  isForming: boolean;
  intensity: number;
};

export const getSpotStatus = <T>({
  spotName,
  sessions,
  selectedDay,
  now = new Date(),
  getSessionState,
}: {
  spotName: string;
  sessions: T[];
  selectedDay: string;
  now?: Date;
  getSessionState: (sessionItem: T, nowReference: Date) => SpotSessionState;
}): SpotStatusResult => {
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const activeCount = safeSessions.filter((sessionItem) => getSessionState(sessionItem, now) === 'active').length;
  const plannedCount = safeSessions.filter((sessionItem) => getSessionState(sessionItem, now) === 'planned').length;
  const totalCount = activeCount + plannedCount;
  const isLiveNow = activeCount >= 1;
  const isForming = !isLiveNow && plannedCount >= 1;

  let key: SpotStatusKey = 'quiet';
  let label = 'Quiet right now';
  let variant: SpotStatusVariant = 'muted';

  if (isLiveNow) {
    key = 'live';
    label = 'Live';
    variant = 'success';
  } else if (isForming) {
    key = 'forming';
    label = 'Session forming';
    variant = 'info';
  }

  const intensity = activeCount > 0 ? activeCount : plannedCount;

  console.log('SPOT_STATUS_SHARED_RESULT', {
    spotName,
    selectedDay,
    activeCount,
    plannedCount,
    totalCount,
    label,
  });

  return {
    key,
    label,
    variant,
    activeCount,
    plannedCount,
    totalCount,
    isLiveNow,
    isForming,
    intensity,
  };
};
