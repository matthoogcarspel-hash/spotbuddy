export type SpotStatusKey = 'live' | 'live_hot' | 'live_insane' | 'forming' | 'quiet';
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

// Deterministisch maar dagelijks wisselend — zelfde spot geeft zelfde tekst per dag
const dailySeed = (spotName: string, date: Date): number => {
  const dateStr = `${date.getFullYear()}${date.getMonth()}${date.getDate()}`;
  const str = spotName + dateStr;
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h);
};

const pick = <T>(arr: T[], seed: number): T => arr[seed % arr.length];

const QUIET = [
  'Quiet right now',
  'All yours today 🏄',
  'First one there wins',
  'Peaceful out there',
  'Your private spot today',
  'No crowds, no problem',
  'Empty beach calling',
];

const FORMING = [
  'Session forming 👀',
  'Someone\'s warming up',
  'It\'s happening',
  'Riders on the way',
  'The crew is mobilising',
  'Getting started soon',
  'Early birds are coming',
];

const LIVE_LOW = [ // 1-2 live
  'Riders out! 🪁',
  'It\'s on!',
  'Kite\'s up!',
  'Session is alive',
  'Someone\'s killing it',
  'Live action',
  'First wave caught',
];

const LIVE_MED = [ // 3-5 live
  'Vibes are real 🔥',
  'Good session going',
  'The crew is out',
  'Don\'t miss this',
  'Getting good out there',
  'Solid session in progress',
  'Join the fun',
];

const LIVE_HOT = [ // 6-9 live or 5+ total
  'Full send mode 🚀',
  'Pack your kite NOW',
  'Drop everything and go',
  'This is what we live for',
  'Party on the water 🎉',
  'Epic session — get there!',
  'All systems go 🔥',
];

const LIVE_INSANE = [ // 10+ live or crazy total
  'ABSOLUTELY WILD OUT THERE 🤙',
  'GO. NOW. Drop everything.',
  'Full circus on the water 🎪',
  'This is insane — GET THERE',
  'Best day of the year, move!',
  'Legendary session happening',
  'History being made 🏆',
];

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
  const activeSessions = safeSessions.filter((sessionItem) => getSessionState(sessionItem, now) === 'active');
  const plannedSessions = safeSessions.filter((sessionItem) => getSessionState(sessionItem, now) === 'planned');
  const activeCount = new Set(activeSessions.map((s) => (s as any).userId ?? (s as any).user_id).filter(Boolean)).size;
  const plannedCount = new Set(plannedSessions.map((s) => (s as any).userId ?? (s as any).user_id).filter(Boolean)).size;
  const totalCount = activeCount + plannedCount;
  const isLiveNow = activeCount >= 1;
  const isForming = !isLiveNow && plannedCount >= 1;

  const seed = dailySeed(spotName, now);

  let key: SpotStatusKey = 'quiet';
  let label = pick(QUIET, seed);
  let variant: SpotStatusVariant = 'muted';

  if (isLiveNow) {
    variant = 'success';
    if (activeCount >= 10 || totalCount >= 12) {
      key = 'live_insane';
      label = pick(LIVE_INSANE, seed);
    } else if (activeCount >= 6 || totalCount >= 7) {
      key = 'live_hot';
      label = pick(LIVE_HOT, seed);
    } else if (activeCount >= 3) {
      key = 'live';
      label = pick(LIVE_MED, seed);
    } else {
      key = 'live';
      label = pick(LIVE_LOW, seed);
    }
  } else if (isForming) {
    key = 'forming';
    label = pick(FORMING, seed);
    variant = 'info';
  }

  const intensity = activeCount > 0 ? activeCount : plannedCount;

  return { key, label, variant, activeCount, plannedCount, totalCount, isLiveNow, isForming, intensity };
};
