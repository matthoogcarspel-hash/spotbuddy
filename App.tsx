import { useEffect, useMemo, useRef, useState } from 'react';

import { Session as AuthSession } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import DiscoverMap from './src/components/DiscoverMap';
import * as Buzz from 'expo-notifications';
import { Image, PanResponder, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';

import { uploadAvatar } from './src/lib/avatar';
import { spots } from './src/data/spots';
import { cancelSession as cancelSessionAction, joinSession as joinSessionAction, planSession as planSessionAction } from './src/domain/sessions/actions';
import { getCancelErrorMessage, getJoinErrorMessageByReason, logSessionUiActionResult, logSessionUiActionStart } from './src/domain/sessions/actionUi';
import { getDayBoundsForDayKey, getJoinState, getOwnSessionForSpotDay, getSelectedSpotName, getSessionDayKey, getSessionState as getCanonicalSessionState, getTopCtaState, isSessionBlockingOwnSession, normalizeSpotName } from './src/lib/sessionHelpers';
import { buildSpotNotificationPreferenceKey } from './src/lib/spotNotificationPreferences';
import { getLocalDateKey, getTodayLocalDateKey, getTomorrowLocalDateKey } from './src/lib/sessionDay';
import { getSpotStatus } from './src/lib/spotStatus';
import { Profile, SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './src/lib/supabase';
import { hasBlockedSpotbuddyName, hasRestrictedWord, normalizeEmail } from './src/lib/userValidation';
import AuthScreen from './src/screens/AuthScreen';
import NameSetupScreen from './src/screens/NameSetupScreen';
import { theme as appTheme } from './src/theme/theme';
import { SpotSummaryCards as TargetSpotSummaryCards } from './components/SpotSummaryCards';

const fallbackSpots = spots;
type SpotName = string;
type SpotDefinition = {
  spot: SpotName;
  canonicalName: string;
  latitude: number;
  longitude: number;
  coordinateStatus: 'unverified' | 'review' | 'verified';
};
type SessionStatus = 'Is er al' | 'Gaat' | 'Uitchecken' | 'live' | 'finished';
type SessionIntent = 'maybe' | 'likely' | 'definitely';
type SpotSession = {
  id: string;
  spot: SpotName;
  sessionDay: string | null;
  sourceSessionId?: string | null;
  start: string;
  end: string;
  status: SessionStatus;
  intent: SessionIntent;
  createdAt: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  userOwnerUid?: string | null;
  resolvedActorProfileId?: string | null;
};
type SessionAdapterRow = {
  id: string;
  status: string;
  intent?: string | null;
  user_id?: string | null;
  profile_id?: string | null;
  created_by?: string | null;
  spot_name?: string | null;
  session_day?: string | null;
  source_session_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  created_at?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  owner_uid?: string | null;
  resolved_actor_profile_id?: string | null;
};
type ChatMessage = {
  id: string;
  text: string;
  userId: string;
  display_name: string;
  avatar_url: string | null;
  created_at?: string | null;
  createdAt: string | null;
  timestamp?: string | null;
  time?: string | null;
};
type PickerKey = 'startHour' | 'startMinute' | 'endHour' | 'endMinute' | null;
type SpotCoordinates = {
  latitude: number;
  longitude: number;
};
type NearestSpotResult = {
  spot: SpotName;
  distanceMeters: number;
};
type SpotDistanceInfo = {
  spot: SpotName;
  distanceMeters: number | null;
};
type SpotSearchResult = {
  name: SpotName;
  country: string;
  longitude: number;
  latitude: number;
};
type SpotMomentumLabel = string;
type SpotMomentumBuckets = {
  today: SpotMomentumLabel | null;
  tomorrow: SpotMomentumLabel | null;
};
type NotificationActorProfile = {
  display_name: string | null;
};
type NotificationRow = {
  id: string;
  type: string | null;
  actor_user_id?: string | null;
  actor_profile?: NotificationActorProfile | null;
  data: Record<string, unknown> | null;
  created_at: string | null;
  read: boolean | null;
};
type SpotNotificationPreferences = {
  session_planning_notification_mode: SpotNotificationMode;
  checkin_notification_mode: SpotNotificationMode;
  chat_notification_mode: SpotNotificationMode;
  session_joined_notification_mode: SpotNotificationMode;
};
type SpotNotificationMode = 'off' | 'following' | 'everyone';
const spotNotificationPreferencesModel = [
  { key: 'sessionPlanning', label: 'Session planned', dbField: 'session_planning_notification_mode' },
  { key: 'checkin', label: 'Check-ins', dbField: 'checkin_notification_mode' },
  { key: 'chat', label: 'Chat messages', dbField: 'chat_notification_mode' },
  { key: 'sessionJoined', label: 'Someone joined my session', dbField: 'session_joined_notification_mode' },
] as const;
type SpotNotificationPreferenceType = (typeof spotNotificationPreferencesModel)[number]['key'];
type SpotOrderMode = 'distance' | 'manual';
type FollowStatus = 'pending' | 'accepted' | 'rejected';
type BuddyUser = Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;
type SwitchableAccount = Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'owner_uid' | 'created_at'>;
type FollowRequestItem = {
  id: string;
  follower_id: string;
  requester: BuddyUser | null;
};
type IncomingFollowRelation = {
  id: string;
  follower_id: string;
  following_id: string;
  status: FollowStatus;
  created_at: string | null;
  responded_at: string | null;
};
type TimelineFilter = 'everyone' | 'buddies';
type TimelineState = 'live' | 'planned' | 'planned_no_check_in' | 'completed';
type ActiveDay = 'today' | 'tomorrow';
type DeterministicSessionState = 'finished' | 'active' | 'planned';
type SaveDebugError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
  response?: unknown;
} | null;

const hours = Array.from({ length: 24 }, (_, index) => index);
const minuteOptions = [0, 15, 30, 45];
const sessionIntentOptions: { label: string; value: SessionIntent }[] = [
  { label: 'Maybe', value: 'maybe' },
  { label: 'Definitely', value: 'definitely' },
];
const theme = {
  bg: '#07111F',
  bgElevated: '#121B29',
  card: '#162133',
  cardStrong: '#1E2B3F',
  border: '#2F4058',
  text: '#FFFFFF',
  textSoft: '#D6E2F0',
  textMuted: '#A8B3C2',
  primary: '#2FD4FF',
  primaryPressed: '#1AB6E0',
  live: '#5EF0D0',
  warm: '#F2C94C',
};
const formatTimePart = (value: number) => String(value).padStart(2, '0');
const defaultSpotNotificationPreferences: SpotNotificationPreferences = spotNotificationPreferencesModel.reduce((accumulator, preference) => {
  accumulator[preference.dbField] = 'off';
  return accumulator;
}, {} as SpotNotificationPreferences);
const favoriteSpotsStorageKey = 'spotbuddy_favorite_spots_v1';
const spotOrderModeStorageKey = 'spotbuddy_spot_order_mode_v1';
const spotManualOrderStorageKey = 'spotbuddy_spot_manual_order_v1';
const activeProfileStorageKeyPrefix = 'spotbuddy_active_profile_id_v1';
const HOME_SPOTS_LIMIT = 5;
const adminAccountSwitcherEmail = 'matthoogcarspel@gmail.com';
const createProfileId = () => {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `profile-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
};
const resolveNotificationMode = (mode: SpotNotificationMode | null | undefined): SpotNotificationMode =>
  mode === 'off' || mode === 'following' || mode === 'everyone' ? mode : 'off';
const normalizeSpotNotificationPreferences = (
  preferences: Partial<SpotNotificationPreferences> | null | undefined,
): SpotNotificationPreferences => spotNotificationPreferencesModel.reduce((accumulator, preference) => {
  accumulator[preference.dbField] = resolveNotificationMode(preferences?.[preference.dbField]);
  return accumulator;
}, {} as SpotNotificationPreferences);
const notificationModeOptions: { label: string; value: SpotNotificationMode }[] = [
  { label: 'Off', value: 'off' },
  { label: 'Buddies', value: 'following' },
  { label: 'Everyone', value: 'everyone' },
];
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const formatLocalHourMinute = (dateValue: Date) => `${formatTimePart(dateValue.getHours())}:${formatTimePart(dateValue.getMinutes())}`;
const getNowLocalHourMinute = () => formatLocalHourMinute(new Date());
const getCurrentLocalDateKey = () => getTodayLocalDateKey();
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
const quickCheckInEndMinutes = 21 * 60;
const getQuickCheckInWindowError = (currentMinutes: number) => {
  if (currentMinutes < timelineStartMinutes) {
    return 'You can only check in from 08:00';
  }

  if (currentMinutes >= quickCheckInEndMinutes) {
    return 'Check-in is only available until 21:00';
  }

  return null;
};
const getQuickCheckInEndTime = () => {
  const now = new Date();
  const cappedEndTime = new Date(now);
  cappedEndTime.setHours(21, 0, 0, 0);

  const proposedEndTime = new Date(now);
  proposedEndTime.setHours(now.getHours(), now.getMinutes(), 0, 0);
  proposedEndTime.setMinutes(proposedEndTime.getMinutes() + 120);

  const endTime = proposedEndTime > cappedEndTime ? cappedEndTime : proposedEndTime;
  return formatLocalHourMinute(endTime);
};
const isUniqueConstraintError = (error: { code?: string; message?: string } | null | undefined) =>
  error?.code === '23505' || error?.message?.includes('sessions_one_open_per_user_idx') || false;
const toMinutes = (hourMinute: string) => {
  const [hourPart, minutePart] = hourMinute.split(':');
  const hour = Number.parseInt(hourPart ?? '', 10);
  const minute = Number.parseInt(minutePart ?? '', 10);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return 0;
  }

  return hour * 60 + minute;
};
const hasTimeOverlap = (startA: string, endA: string, startB: string, endB: string) => toMinutes(startA) < toMinutes(endB) && toMinutes(endA) > toMinutes(startB);
const isSessionStatusBlockingForPlanning = (sessionItem: SpotSession) => {
  if (sessionItem.checkedOutAt) {
    return false;
  }

  if (sessionItem.status === 'finished' || sessionItem.status === 'Uitchecken') {
    return false;
  }

  return true;
};
const isSessionStillRelevantForPlanning = (sessionItem: SpotSession, currentMinutes: number) => {
  if (!hasPlannedTimeWindow(sessionItem)) {
    return false;
  }

  if (isSessionExpired(sessionItem)) {
    return false;
  }

  if (!isSessionStatusBlockingForPlanning(sessionItem)) {
    return false;
  }

  if (sessionItem.status === 'Gaat') {
    return toMinutes(sessionItem.end) > currentMinutes;
  }

  return true;
};
const isCreatedToday = (value: string | null | undefined) => {
  if (!value) {
    return false;
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return false;
  }

  const now = new Date();
  return dateValue.getFullYear() === now.getFullYear() && dateValue.getMonth() === now.getMonth() && dateValue.getDate() === now.getDate();
};
const isCreatedOnLocalDate = (value: string | null | undefined, localDateKey: string) => {
  if (!value) {
    return false;
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return false;
  }

  return getLocalDateKey(dateValue) === localDateKey;
};
const getCurrentLocalMinutes = () => {
  const now = new Date();
  const nowHours = now.getHours();
  const nowMinutes = now.getMinutes();
  return nowHours * 60 + nowMinutes;
};
const formatToHourMinute = (value: string | null | undefined) => {
  if (!value) {
    return '--:--';
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return '--:--';
  }

  return dateValue.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};
const getLocalMinutesFromIso = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return null;
  }

  return dateValue.getHours() * 60 + dateValue.getMinutes();
};
const isDirectCheckIn = (sessionItem: SpotSession) => {
  if (!sessionItem.checkedInAt || !sessionItem.createdAt || sessionItem.status !== 'Is er al') {
    return false;
  }

  const createdMs = new Date(sessionItem.createdAt).getTime();
  const checkedInMs = new Date(sessionItem.checkedInAt).getTime();
  if (Number.isNaN(createdMs) || Number.isNaN(checkedInMs)) {
    return false;
  }

  return Math.abs(checkedInMs - createdMs) <= 90_000;
};
const hasPlannedTimeWindow = (sessionItem: SpotSession) => {
  if (!sessionItem.start || !sessionItem.end) {
    return false;
  }

  const startMinutes = toMinutes(sessionItem.start);
  const endMinutes = toMinutes(sessionItem.end);
  return endMinutes > startMinutes;
};
const resolveSessionIntent = (value: string | null | undefined): SessionIntent => {
  const resolvedIntent: SessionIntent = value === 'maybe' || value === 'definitely' || value === 'likely' ? value : 'likely';
  return resolvedIntent;
};
const getIntentGoingLabel = (intent: SessionIntent) =>
  intent === 'definitely' ? 'Definitely going' : intent === 'maybe' ? 'Maybe going' : 'Likely going';
const getIntentVisualStyle = (intent: SessionIntent) => {
  if (intent === 'definitely') {
    return {
      labelColor: '#eaf6ff',
      badgeBackgroundColor: '#274f7f',
      badgeBorderColor: '#7ab4ff',
      labelOpacity: 1,
      labelWeight: '700' as const,
      barBorderWidth: 2,
      barOpacity: 1,
    };
  }

  if (intent === 'maybe') {
    return {
      labelColor: theme.textMuted,
      badgeBackgroundColor: theme.bgElevated,
      badgeBorderColor: theme.border,
      labelOpacity: 0.74,
      labelWeight: '500' as const,
      barBorderWidth: 1,
      barOpacity: 0.72,
    };
  }

  return {
    labelColor: theme.text,
    badgeBackgroundColor: theme.cardStrong,
    badgeBorderColor: theme.border,
    labelOpacity: 0.9,
    labelWeight: '600' as const,
    barBorderWidth: 1,
    barOpacity: 0.9,
  };
};
const isSessionJoinableNow = (sessionItem: SpotSession, now = new Date()) => {
  if (!hasPlannedTimeWindow(sessionItem)) {
    return false;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const sessionStartMinutes = toMinutes(sessionItem.start);
  const sessionEndMinutes = toMinutes(sessionItem.end);
  return sessionStartMinutes <= nowMinutes && nowMinutes <= sessionEndMinutes;
};
const parseHourMinuteParts = (hourMinute: string) => {
  const [hourPart, minutePart] = hourMinute.split(':');
  const parsedHour = Number.parseInt(hourPart ?? '', 10);
  const parsedMinute = Number.parseInt(minutePart ?? '', 10);

  return {
    hour: Number.isNaN(parsedHour) ? null : parsedHour,
    minute: Number.isNaN(parsedMinute) ? 0 : parsedMinute,
  };
};
const isIsoInRange = (isoValue: string | null | undefined, rangeStart: Date, rangeEnd: Date) => {
  if (!isoValue) {
    return false;
  }

  const dateValue = new Date(isoValue);
  if (Number.isNaN(dateValue.getTime())) {
    return false;
  }

  return dateValue >= rangeStart && dateValue < rangeEnd;
};
type CleanSessionStatus = 'live' | 'going' | 'maybe' | 'finished';

const getSessionViewState = (sessionItem: SpotSession): CleanSessionStatus => {
  if (
    sessionItem.checkedOutAt ||
    sessionItem.status === 'Uitchecken' ||
    sessionItem.status === 'finished' ||
    isSessionExpired(sessionItem)
  ) {
    return 'finished';
  }

  // LIVE = alleen echte check-in
  if (sessionItem.checkedInAt && !sessionItem.checkedOutAt) {
    return 'live';
  }

  // GOING = definitely / likely
  const resolvedIntent = resolveSessionIntent(sessionItem.intent);
  if (resolvedIntent === 'definitely' || resolvedIntent === 'likely') {
    return 'going';
  }

  return 'maybe';
};

const getCleanSessionStatus = (sessionItem: SpotSession): CleanSessionStatus => {
  return getSessionViewState(sessionItem);
};

const getSessionState = (sessionItem: SpotSession, now = new Date()): DeterministicSessionState => {
  const startDate = getSessionStartTime(sessionItem);
  const endDate = getSessionEndTime(sessionItem);

  if (endDate < now) {
    
    return 'finished';
  }

  if (startDate <= now && now <= endDate) {
    
    return 'active';
  }

  
  return 'planned';
};
const isLiveSession = (sessionItem: SpotSession) =>
  getSessionViewState(sessionItem) === 'live';
const isSessionForLocalDate = (sessionItem: SpotSession, localDateKey: string) => {
  return (sessionItem.sessionDay ?? '') === localDateKey;
};
const getSpotMomentumLabelForDay = ({
  spotName,
  activeDay,
  sessions,
  todayLocalDateKey,
  tomorrowLocalDateKey,
}: {
  spotName: SpotName;
  activeDay: ActiveDay;
  sessions: SpotSession[];
  todayLocalDateKey: string;
  tomorrowLocalDateKey: string;
}): SpotMomentumLabel | null => {
  const normalizedSpotName = normalizeSpotName(spotName);
  const activeDateKey = activeDay === 'today' ? todayLocalDateKey : tomorrowLocalDateKey;
  const spotSessionsForDay = (Array.isArray(sessions) ? sessions : []).filter((sessionItem) => {
    if (normalizeSpotName(sessionItem.spot) !== normalizedSpotName) {
      return false;
    }

    if (sessionItem.checkedOutAt || sessionItem.status === 'finished' || sessionItem.status === 'Uitchecken') {
      return false;
    }

    return isSessionForLocalDate(sessionItem, activeDateKey);
  });

  const checkedInUsers = activeDay === 'today'
    ? dedupeActiveCheckedInSessionsByUser(
      (Array.isArray(spotSessionsForDay) ? spotSessionsForDay : []).filter((sessionItem) => isRealCheckedInLiveSession(sessionItem)),
    )
    : [];
  const checkedInCount = checkedInUsers.length;
  const activeSessions = (Array.isArray(spotSessionsForDay) ? spotSessionsForDay : []).filter((sessionItem) => isLiveSession(sessionItem) && !isSessionExpired(sessionItem));
  const activeSessionsToday = activeDay === 'today' ? activeSessions.length : 0;
  const plannedSessions = (Array.isArray(spotSessionsForDay) ? spotSessionsForDay : []).filter((sessionItem) => !sessionItem.checkedInAt && !sessionItem.checkedOutAt && hasPlannedTimeWindow(sessionItem));
  const plannedSessionsToday = activeDay === 'today' ? plannedSessions.length : 0;
  const plannedSessionsTomorrow = activeDay === 'tomorrow' ? plannedSessions.length : 0;
  const plannedIntents = plannedSessions.map((sessionItem) => sessionItem.intent);
  const hasDefinitely = plannedIntents.includes('definitely');
  const hasLikely = plannedIntents.includes('likely');
  const hasMaybe = plannedIntents.includes('maybe');
  const strongIntent = hasDefinitely || activeSessions.length > 1;
  const mediumIntent = hasLikely;
  const weakIntent = hasMaybe && !hasDefinitely && !hasLikely;
  const plannedOverlapTomorrow = activeDay === 'tomorrow' ? plannedSessionsTomorrow : 0;

  let label: SpotMomentumLabel | null = null;
  if (activeDay === 'today') {
    if (checkedInCount > 5) {
      label = 'Busy now';
    } else if (checkedInCount >= 1) {
      label = 'Live now';
    } else if (strongIntent) {
      label = 'Good later';
    } else if (mediumIntent) {
      label = 'Session planned';
    } else if (weakIntent) {
      label = 'Maybe later';
    }
  } else {
    if (plannedOverlapTomorrow > 5) {
      label = 'Let’s go big tomorrow';
    } else if (strongIntent) {
      label = 'Good tomorrow';
    } else if (mediumIntent) {
      label = 'Session tomorrow';
    } else if (weakIntent) {
      label = 'Maybe tomorrow';
    }
  }

  

  return label;
};
const getSpotMomentumLabels = (spotName: SpotName, sessions: SpotSession[]): SpotMomentumBuckets => {
  const todayLocalDateKey = getCurrentLocalDateKey();
  const tomorrowLocalDateKey = getTomorrowLocalDateKey();
  const todayLabel = getSpotMomentumLabelForDay({
    spotName,
    activeDay: 'today',
    sessions,
    todayLocalDateKey,
    tomorrowLocalDateKey
  });
  const tomorrowLabel = getSpotMomentumLabelForDay({
    spotName,
    activeDay: 'tomorrow',
    sessions,
    todayLocalDateKey,
    tomorrowLocalDateKey
  });

  return {
    today: todayLabel,
    tomorrow: tomorrowLabel,
  };
};
const isPlannedSession = (sessionItem: SpotSession) =>
  hasPlannedTimeWindow(sessionItem)
  && getSessionViewState(sessionItem) !== 'live';
const getTimelineState = (sessionItem: SpotSession): TimelineState => {
  const deterministicState = getSessionState(sessionItem);
  if (deterministicState === 'active') {
    return 'live';
  }

  if (deterministicState === 'finished') {
    return 'completed';
  }
  return 'planned';
};
const getTimelineLabel = (state: TimelineState, compact = false) => {
  if (state === 'live') {
    return 'Live';
  }

  if (state === 'planned') {
    return 'Planned';
  }

  if (state === 'planned_no_check_in') {
    return compact ? 'No check-in' : 'Planned - no check in';
  }

  return 'Finished';
};
const getTimelineStatusOrder = (state: TimelineState) =>
  state === 'live' ? 0 : state === 'planned' ? 1 : state === 'planned_no_check_in' ? 2 : 3;
const timelineJoinButtonWidthPercent = 11;
const timelineJoinButtonGapPercent = 1.2;
const getLiveSessions = (sessions: SpotSession[]) => (Array.isArray(sessions) ? sessions : []).filter((sessionItem) => isLiveSession(sessionItem) && !isSessionExpired(sessionItem));
const getMostRecentSessionByCreatedAt = (sessions: SpotSession[]) =>
  [...sessions].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  })[0] ?? null;
const getSessionRecencyMs = (sessionItem: Pick<SpotSession, 'checkedInAt' | 'createdAt'>) => {
  const checkedInMs = sessionItem.checkedInAt ? new Date(sessionItem.checkedInAt).getTime() : 0;
  const createdMs = sessionItem.createdAt ? new Date(sessionItem.createdAt).getTime() : 0;
  const checkedInSafe = Number.isNaN(checkedInMs) ? 0 : checkedInMs;
  const createdSafe = Number.isNaN(createdMs) ? 0 : createdMs;
  return Math.max(checkedInSafe, createdSafe);
};
const dedupeActiveCheckedInSessionsByUser = (sessions: SpotSession[]) => {
  const byUser = new Map<string, SpotSession>();
  for (const sessionItem of sessions) {
    const existing = byUser.get(sessionItem.userId);
    if (!existing || getSessionRecencyMs(sessionItem) > getSessionRecencyMs(existing)) {
      byUser.set(sessionItem.userId, sessionItem);
    }
  }
  return Array.from(byUser.values());
};
const getCurrentUserLiveSession = (sessions: SpotSession[], userId: string | null | undefined) => {
  if (!userId) {
    return null;
  }

  const userSessions = (Array.isArray(sessions) ? sessions : []).filter((sessionItem) => sessionItem.userId === userId);
  const liveUserSessions = getLiveSessions(userSessions);
  return getMostRecentSessionByCreatedAt(liveUserSessions);
};
const getCurrentUserActiveCheckedInSessionForDay = ({
  sessions,
  userId,
  activeDateStart,
  activeDateEnd,
}: {
  sessions: SpotSession[];
  userId: string | null | undefined;
  activeDateStart: Date;
  activeDateEnd: Date;
}) => {
  if (!userId) {
    return null;
  }

  const activeSessions = sessions
    .filter((sessionItem) => sessionItem.userId === userId)
    .filter((sessionItem) => Boolean(sessionItem.checkedInAt))
    .filter((sessionItem) => !sessionItem.checkedOutAt)
    .filter((sessionItem) => sessionItem.status === 'Is er al' || sessionItem.status === 'live')
    .filter((sessionItem) => Boolean(sessionItem.checkedInAt) && isIsoInRange(sessionItem.checkedInAt, activeDateStart, activeDateEnd))
    .filter((sessionItem) => isLiveSession(sessionItem))
    .filter((sessionItem) => !isSessionExpired(sessionItem));

  const dedupedActiveSessions = dedupeActiveCheckedInSessionsByUser(activeSessions);
  return getMostRecentSessionByCreatedAt(dedupedActiveSessions);
};
const isRealCheckedInLiveSession = (sessionItem: SpotSession) =>
  Boolean(sessionItem.checkedInAt)
  && !sessionItem.checkedOutAt
  && (sessionItem.status === 'Is er al' || sessionItem.status === 'live')
  && isLiveSession(sessionItem)
  && !isSessionExpired(sessionItem);

const createSpotRecord = <T,>(spotNames: SpotName[], makeValue: () => T): Record<SpotName, T> =>
  spotNames.reduce((result, spot) => {
    result[spot] = makeValue();
    return result;
  }, {} as Record<SpotName, T>);
const normalizeDisplayName = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const resolveSessionActorProfileId = (
  sessionItem: Pick<SpotSession, 'userId' | 'userName' | 'userOwnerUid' | 'resolvedActorProfileId'>,
  profiles: Array<Pick<Profile, 'id' | 'display_name' | 'owner_uid'>>,
) => {
  if (sessionItem.resolvedActorProfileId) {
    return sessionItem.resolvedActorProfileId;
  }

  if (!profiles.length) {
    return sessionItem.userId ?? null;
  }

  const directMatch = profiles.find((profileItem) => profileItem.id === sessionItem.userId);
  if (directMatch) {
    return directMatch.id;
  }

  const ownerUidMatches = (Array.isArray(profiles) ? profiles : []).filter((profileItem) => profileItem.owner_uid && profileItem.owner_uid === sessionItem.userOwnerUid);
  if (ownerUidMatches.length === 1) {
    return ownerUidMatches[0].id;
  }

  const sessionDisplayName = normalizeDisplayName(sessionItem.userName);
  if (sessionDisplayName) {
    const displayNameMatches = (Array.isArray(ownerUidMatches) ? ownerUidMatches : []).filter(
      (profileItem) => normalizeDisplayName(profileItem.display_name) === sessionDisplayName,
    );
    if (displayNameMatches.length > 0) {
      return displayNameMatches[0].id;
    }
  }

  return sessionItem.userId ?? null;
};
const isSessionCreatedToday = (sessionItem: SpotSession) => isCreatedToday(sessionItem.createdAt);
const getSessionStartTime = (sessionItem: SpotSession) => {
  const createdDate = sessionItem.createdAt ? new Date(sessionItem.createdAt) : new Date();
  const fallbackDate = Number.isNaN(createdDate.getTime()) ? new Date() : createdDate;
  const sessionDate = new Date(fallbackDate);
  const { hour, minute } = parseHourMinuteParts(sessionItem.start);
  sessionDate.setHours(hour ?? 0, minute ?? 0, 0, 0);
  return sessionDate;
};
const getSessionEndTime = (sessionItem: SpotSession) => {
  const createdDate = sessionItem.createdAt ? new Date(sessionItem.createdAt) : new Date();
  const fallbackDate = Number.isNaN(createdDate.getTime()) ? new Date() : createdDate;
  const sessionDate = new Date(fallbackDate);
  const { hour, minute } = parseHourMinuteParts(sessionItem.end);
  sessionDate.setHours(hour ?? 0, minute ?? 0, 0, 0);
  return sessionDate;
};
const isSessionExpired = (sessionItem: SpotSession, now = new Date()) => {
  if (!hasPlannedTimeWindow(sessionItem)) {
    return false;
  }

  const sessionEndTime = getSessionEndTime(sessionItem);
  const isExpired = sessionEndTime.getTime() < now.getTime();
  const sessionWithOptionalTimes = sessionItem as SpotSession & { startTime?: string; endTime?: string };
  
  return isExpired;
};
const isGoingLaterSession = (sessionItem: SpotSession, currentLocalMinutes: number) => {
  const sessionWithOptionalTimes = sessionItem as SpotSession & { startTime?: string; endTime?: string };
  
  

  if (isLiveSession(sessionItem)) {
    return false;
  }

  if (isSessionExpired(sessionItem)) {
    return false;
  }

  const sessionStartMinutes = toMinutes(sessionItem.start);
  const sessionEndMinutes = toMinutes(sessionItem.end);

  if (Number.isNaN(sessionStartMinutes) || Number.isNaN(sessionEndMinutes)) {
    return false;
  }

  return currentLocalMinutes < sessionEndMinutes;
};
const getSessionDisplayState = (
  sessionItem: SpotSession,
  nowMinutes: number,
): SpotMomentumLabel | null => {
  
  const now = new Date();
  const sessionStartTime = getSessionStartTime(sessionItem);
  const sessionDateKey = getLocalDateKey(sessionStartTime);
  const todayDateKey = getLocalDateKey(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowDateKey = getLocalDateKey(tomorrowDate);
  const isToday = sessionDateKey === todayDateKey;
  const isTomorrow = sessionDateKey === tomorrowDateKey;
  const isHappeningNow = hasPlannedTimeWindow(sessionItem)
    && nowMinutes >= toMinutes(sessionItem.start)
    && nowMinutes < toMinutes(sessionItem.end);

  let label: SpotMomentumLabel | null = null;

  if (isToday) {
    if (isHappeningNow) {
      label = 'Live now';
    } else if (sessionItem.intent === 'definitely') {
      label = 'Good later';
    } else if (sessionItem.intent === 'likely') {
      label = 'Session planned';
    } else {
      label = 'Maybe later';
    }
  } else if (isTomorrow) {
    if (sessionItem.intent === 'definitely') {
      label = 'Good tomorrow';
    } else if (sessionItem.intent === 'likely') {
      label = 'Session tomorrow';
    } else {
      label = 'Maybe tomorrow';
    }
  }

  

  return label;
};
const timelineStartMinutes = 8 * 60;
const planningEndMinutes = 22 * 60;
const timelineEndMinutes = planningEndMinutes;
const planningMinuteStep = minuteOptions[1] - minuteOptions[0];
const latestPlanningStartMinutes = planningEndMinutes - planningMinuteStep;
const roundMinutesUpToStep = (minutes: number, step: number) => Math.ceil(minutes / step) * step;
const minuteValueToHourMinute = (totalMinutes: number) => ({
  hour: Math.floor(totalMinutes / 60),
  minute: totalMinutes % 60,
});
const formatMinutesAsHourMinute = (totalMinutes: number) => `${formatTimePart(Math.floor(totalMinutes / 60))}:${formatTimePart(totalMinutes % 60)}`;
const getTimelineLabelsForRange = (windowStartMinutes: number, windowEndMinutes: number) => {
  if (windowEndMinutes <= windowStartMinutes) {
    return [formatMinutesAsHourMinute(windowStartMinutes)];
  }

  const labels: string[] = [formatMinutesAsHourMinute(windowStartMinutes)];
  const stepMinutes = 120;
  let nextMinutes = Math.ceil(windowStartMinutes / stepMinutes) * stepMinutes;
  if (nextMinutes <= windowStartMinutes) {
    nextMinutes += stepMinutes;
  }

  while (nextMinutes < windowEndMinutes) {
    labels.push(formatMinutesAsHourMinute(nextMinutes));
    nextMinutes += stepMinutes;
  }

  const endLabel = formatMinutesAsHourMinute(windowEndMinutes);
  if (labels[labels.length - 1] !== endLabel) {
    labels.push(endLabel);
  }

  return labels;
};
const getPlanningNowReference = (selectedPlanningDateKey: string, nowMinutes: number) => {
  const todayDateKey = getCurrentLocalDateKey();
  const isToday = selectedPlanningDateKey === todayDateKey;
  const roundedNowMinutes = roundMinutesUpToStep(nowMinutes, planningMinuteStep);
  const earliestStartMinutes = isToday ? Math.max(timelineStartMinutes, roundedNowMinutes) : timelineStartMinutes;
  const hasValidStartSlot = earliestStartMinutes <= latestPlanningStartMinutes;

  return {
    selectedPlanningDateKey,
    todayDateKey,
    isToday,
    nowMinutes,
    roundedNowMinutes,
    earliestStartMinutes,
    latestPlanningStartMinutes,
    hasValidStartSlot,
  };
};
const getDefaultEndMinutesForStart = (startMinutes: number) =>
  Math.min(
    planningEndMinutes,
    Math.max(startMinutes + 60, startMinutes + planningMinuteStep),
  );

type SessionBarJoinPlacement = {
  leftPercent: number;
  placement: 'inside' | 'after' | 'before';
};
const getSessionJoinPlacement = (leftPercent: number, widthPercent: number): SessionBarJoinPlacement => {
  const rightEdgePercent = leftPercent + widthPercent;
  const insideFits = widthPercent >= timelineJoinButtonWidthPercent + timelineJoinButtonGapPercent;
  if (insideFits) {
    return {
      placement: 'inside',
      leftPercent: clamp(
        rightEdgePercent - timelineJoinButtonWidthPercent - timelineJoinButtonGapPercent,
        leftPercent,
        Math.max(leftPercent, 100 - timelineJoinButtonWidthPercent),
      ),
    };
  }

  const availableAfter = 100 - rightEdgePercent;
  if (availableAfter >= timelineJoinButtonWidthPercent + timelineJoinButtonGapPercent) {
    return {
      placement: 'after',
      leftPercent: clamp(rightEdgePercent + timelineJoinButtonGapPercent, 0, 100 - timelineJoinButtonWidthPercent),
    };
  }

  if (leftPercent >= timelineJoinButtonWidthPercent + timelineJoinButtonGapPercent) {
    return {
      placement: 'before',
      leftPercent: clamp(leftPercent - timelineJoinButtonWidthPercent - timelineJoinButtonGapPercent, 0, 100 - timelineJoinButtonWidthPercent),
    };
  }

  return {
    placement: 'inside',
    leftPercent: clamp(rightEdgePercent - timelineJoinButtonWidthPercent, leftPercent, 100 - timelineJoinButtonWidthPercent),
  };
};
const CHECK_IN_RADIUS_METERS = 1000;
const AUTO_CHECKIN_PROMPT_RADIUS_METERS = 300;
const AUTO_CHECKOUT_RADIUS_METERS = 3000;
const AUTO_CHECK_OUT_CONSECUTIVE_OUTSIDE_REQUIRED = 2;
const AUTO_CHECK_OUT_CONFIRMATION_MS = 60_000;
const toRadians = (value: number) => value * (Math.PI / 180);
const getDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const earthRadiusMeters = 6371_000;
  const latitudeDelta = toRadians(lat2 - lat1);
  const longitudeDelta = toRadians(lon2 - lon1);
  const startLatitudeRadians = toRadians(lat1);
  const endLatitudeRadians = toRadians(lat2);

  const haversine =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2)
    + Math.cos(startLatitudeRadians) * Math.cos(endLatitudeRadians) * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);

  const angularDistance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return earthRadiusMeters * angularDistance;
};
const getDistanceMeters = (start: SpotCoordinates, end: SpotCoordinates) => {
  return getDistanceInMeters(start.latitude, start.longitude, end.latitude, end.longitude);
};
const formatDistance = (distanceMeters: number) => {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`;
};
const getNearestSpot = (currentCoordinates: SpotCoordinates, spotDefinitions: SpotDefinition[]): NearestSpotResult | null => {
  
  let nearestSpot: SpotName | null = null;
  let nearestDistanceMeters = Number.POSITIVE_INFINITY;

  for (const spot of spotDefinitions) {
    const spotCoordinates = {
      latitude: spot.latitude,
      longitude: spot.longitude,
    };
    const distanceMeters = getDistanceMeters(currentCoordinates, spotCoordinates);
    
    if (distanceMeters < nearestDistanceMeters) {
      nearestSpot = spot.spot;
      nearestDistanceMeters = distanceMeters;
    }
  }

  if (!nearestSpot || !Number.isFinite(nearestDistanceMeters)) {
    return null;
  }

  return {
    spot: nearestSpot,
    distanceMeters: nearestDistanceMeters,
  };
};

function Avatar({ uri, size = 28 }: { uri: string | null; size?: number }) {
  if (!uri) {
    return (
      <View
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.card,  borderColor: theme.border }}
      />
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.card,  borderColor: theme.border }}
    />
  );
}

type SessionBarProps = {
  leftPercent: number;
  widthPercent: number;
  state: TimelineState;
  intent: SessionIntent;
  isSelected: boolean;
  showJoinButton: boolean;
  label?: string;
  onPress: () => void;
  onJoin: () => void;
};

function SessionBar({ leftPercent, widthPercent, state, intent, isSelected, showJoinButton, label, onPress, onJoin }: SessionBarProps) {
  const stateStyle: Record<TimelineState, { bar: string; text: string; border: string; borderStyle?: 'solid' | 'dashed'; opacity?: number }> = {
    planned: { bar: '#1b3f68', text: '#cae2ff', border: '#5f91c2', borderStyle: 'dashed', opacity: 0.9 },
    planned_no_check_in: { bar: '#5c471e', text: '#f5e3c6', border: '#bc9153', borderStyle: 'dashed', opacity: 0.88 },
    live: { bar: '#1f9c7f', text: '#f2fff9', border: '#63e4be' },
    completed: { bar: '#5d6674', text: '#e2e8f1', border: '#8f98a8', opacity: 0.65 },
  };
  const intentStyle = getIntentVisualStyle(intent);
  const timelineLabel = getTimelineLabel(state, true);
  const plannedBarColor = intent === 'maybe' ? '#5F83A6' : 'rgba(96,165,250,0.46)';
  const plannedBorderColor = intent === 'maybe' ? '#5F83A6' : 'rgba(147,197,253,0.62)';
  const plannedTextColor = intent === 'maybe' ? '#f3e8ff' : '#dbeafe';
  const joinPlacement = getSessionJoinPlacement(leftPercent, widthPercent);

  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={{
        flex: 1,
        height: 18,
        borderRadius: 999,
        backgroundColor: 'transparent',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <View
        style={{
          marginLeft: `${leftPercent}%`,
          width: `${widthPercent}%`,
          height: '100%',
          borderRadius: 999,
          backgroundColor: state === 'live' ? '#5EF0D0' : intent === 'maybe' ? '#5F83A6' : 'rgba(96,165,250,0.46)',
          borderWidth: 0,
          borderColor: state === 'planned' ? plannedBorderColor : stateStyle[state].border,
          borderStyle: stateStyle[state].borderStyle ?? 'solid',
          opacity: 1,
          shadowColor: state === 'live' ? '#63e4be' : '#000000',
          shadowOpacity: state === 'live' ? 0.16 : 0.08,
          shadowRadius: state === 'live' ? 4 : 2,
          shadowOffset: { width: 0, height: 0 },
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 8,
        }}
      >
        {label ? (
          <Text
            numberOfLines={1}
            style={{
              color: 'rgba(255,255,255,0.92)',
              fontSize: 10,
              fontWeight: '700',
              letterSpacing: 0.1,
            }}
          >
            {label}
          </Text>
        ) : null}
      </View>

      {showJoinButton ? (
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onJoin();
          }}
          style={{
            position: 'absolute',
            right: 0,
            width: 72,
            top: 3,
            bottom: 3,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.88)',
            
            borderColor: 'rgba(255,255,255,0.8)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ color: '#061421', fontSize: 12, fontWeight: '900' }}>JOIN</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

type SessionGroupEntry = {
  item: SpotSession;
  state: TimelineState;
  isBuddy: boolean;
  roundedStartMinutes: number;
  roundedEndMinutes: number;
};

type SessionGroup = {
  key: string;
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  sessions: SessionGroupEntry[];
};

type TimelineGroupedSession = SessionGroup & {
  visibleSessions: SessionGroupEntry[];
  representative: SessionGroupEntry | null;
};

type SessionJoinRequest = {
  sessionId: string;
  sessionDay: string | null;
  sessionStatus: string | null;
  normalizedStart: string;
  normalizedEnd: string;
};

type OwnSessionForSpotDayState = {
  ownSession: SpotSession | null;
  hasOwnSession: boolean;
  ownSessions: SpotSession[];
  blockingOwnSession?: SpotSession | null;
  hasBlockingOwnSession?: boolean;
  blockingOwnSessions?: SpotSession[];
};

type SpotDetailState = {
  sessionsForSpot: SpotSession[];
  ownSession: SpotSession | null;
  hasOwnSession: boolean;
  groupedSessions: TimelineGroupedSession[];
  topCtaState: {
    mode: 'plan' | 'edit';
    hasOwnSession: boolean;
  };
  joinStateBySession: Record<string, { allowed: boolean; reason: string | null }>;
  cancelTarget: SpotSession | null;
  ownSessionForSpotDay: OwnSessionForSpotDayState;
};

const buildJoinActionInput = ({
  activeProfile,
  selectedSpot,
  activeDayKey,
  activeDay,
  intent,
  session,
}: {
  activeProfile: Profile | null;
  selectedSpot: SpotName | null;
  activeDayKey: string;
  activeDay: ActiveDay;
  intent: SessionIntent;
  session: SessionJoinRequest;
}) => ({
  activeProfileId: activeProfile?.id ?? null,
  activeDay,
  selectedSpot,
  normalizedStart: session.normalizedStart,
  normalizedEnd: session.normalizedEnd,
  sessionId: session.sessionId,
  sessionDay: session.sessionDay,
  sessionStatus: session.sessionStatus,
  intent: resolveSessionIntent(intent),
  dayKey: activeDayKey,
  targetGroupHasVisibleRows: true,
  alreadyJoinedGroup: false,
});

const buildCancelActionInput = ({
  ownSessionForSpotDay,
  activeProfile,
  activeDateKey,
  availableProfiles,
  sessionOverride = null,
}: {
  ownSessionForSpotDay: {
    ownSession: SpotSession | null;
    hasOwnSession: boolean;
    ownSessions: SpotSession[];
  };
  activeProfile: Profile | null;
  activeDateKey: string;
  availableProfiles: Profile[];
  sessionOverride?: SpotSession | null;
}) => {
  const sessionToCancel = sessionOverride ?? ownSessionForSpotDay.ownSession;
  const activeProfileId = activeProfile?.id ?? null;
  if (!sessionToCancel || !activeProfileId) {
    return null;
  }
  const resolvedSessionActorProfileId = resolveSessionActorProfileId(sessionToCancel, availableProfiles);
  return {
    activeProfileId,
    selectedDateKey: activeDateKey,
    session: {
      id: sessionToCancel.id,
      spot: sessionToCancel.spot,
      sessionDay: sessionToCancel.sessionDay,
      userId: sessionToCancel.userId,
      status: sessionToCancel.status,
      checkedInAt: sessionToCancel.checkedInAt,
      checkedOutAt: sessionToCancel.checkedOutAt,
      createdAt: sessionToCancel.createdAt,
    },
    resolvedSessionActorProfileId,
  };
};

const buildPlanActionInput = ({
  selectedSpot,
  activeDayKey,
  startHour,
  startMinute,
  endHour,
  endMinute,
  intent,
  editingSessionId,
  activeProfile,
  activeDay,
}: {
  selectedSpot: SpotName | null;
  activeDayKey: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  intent: SessionIntent;
  editingSessionId: string | null;
  activeProfile: Profile | null;
  activeDay: ActiveDay;
}) => ({
  activeProfileId: activeProfile?.id ?? null,
  selectedSpot,
  activeDay,
  selectedPlanningDateKey: activeDayKey,
    session_day: activeDayKey,
  startTime: `${formatTimePart(startHour)}:${formatTimePart(startMinute)}`,
  endTime: `${formatTimePart(endHour)}:${formatTimePart(endMinute)}`,
  intent,
  editingSessionId,
});

const roundMinutesToNearestFive = (minutes: number) => Math.round(minutes / 5) * 5;
const isSessionOnDayKey = (session: SpotSession, dayKey: string) =>
  getSessionDayKey(session) === dayKey;
const getRoundedSessionWindow = (sessionItem: SpotSession) => {
  const hasPlannedWindow = hasPlannedTimeWindow(sessionItem);
  const checkedInMinutes = getLocalMinutesFromIso(sessionItem.checkedInAt);
  const rawStartMinutes = hasPlannedWindow ? toMinutes(sessionItem.start) : (checkedInMinutes ?? timelineStartMinutes);
  const rawEndMinutes = hasPlannedWindow
    ? toMinutes(sessionItem.end)
    : Math.min((checkedInMinutes ?? timelineStartMinutes) + 45, timelineEndMinutes);
  const roundedStartMinutes = roundMinutesToNearestFive(rawStartMinutes);
  const roundedEndMinutes = roundMinutesToNearestFive(rawEndMinutes);
  return {
    startMinutes: roundedStartMinutes,
    endMinutes: roundedEndMinutes,
    startTime: formatMinutesAsHourMinute(roundedStartMinutes),
    endTime: formatMinutesAsHourMinute(roundedEndMinutes),
  };
};

const getSortedVisibleGroupSessions = (entries: SessionGroupEntry[]) => {
  const stateRank = { live: 0, planned: 1, planned_no_check_in: 2, completed: 3 } as const;
  return [...entries].sort((a, b) => {
    if (stateRank[a.state] !== stateRank[b.state]) {
      return stateRank[a.state] - stateRank[b.state];
    }
    return a.item.userName.localeCompare(b.item.userName, 'nl-NL');
  });
};

const groupTimelineSessions = ({
  sessions,
  activeDayKey,
  selectedSpot,
  activeProfileId,
  buddiesMode,
  followingUserIds,
}: {
  sessions: Array<{ item: SpotSession; state: TimelineState; isBuddy: boolean }>;
  activeDayKey: string;
  selectedSpot: SpotName | null;
  activeProfileId: string | null | undefined;
  buddiesMode: TimelineFilter;
  followingUserIds: string[];
}) => {
  console.log("TIMELINE_GROUP_ADAPTER_INPUT", {
    totalSessions: sessions?.length ?? 0,
    activeDayKey,
    selectedSpot: (selectedSpot as { name?: string } | null)?.name ?? selectedSpot ?? null
  });

  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const safeFollowingUserIds = Array.isArray(followingUserIds) ? followingUserIds : [];
  const groups = new Map<string, SessionGroup>();

  for (const timelineSession of safeSessions) {
    const {
      startMinutes: roundedStartMinutes,
      endMinutes: roundedEndMinutes,
      startTime,
      endTime,
    } = getRoundedSessionWindow(timelineSession.item);
    const groupRootId =
      timelineSession.item.sourceSessionId
      ?? timelineSession.item.id;

    const groupSpotKey = normalizeSpotName(timelineSession.item.spot);
    const groupKey = `spot:${groupSpotKey}:source:${groupRootId}`;
    const entry: SessionGroupEntry = {
      item: timelineSession.item,
      state: timelineSession.state,
      isBuddy: timelineSession.isBuddy,
      roundedStartMinutes,
      roundedEndMinutes,
    };

    const existing = groups.get(groupKey);
    if (!existing) {
      groups.set(groupKey, {
        key: groupKey,
        startTime,
        endTime,
        startMinutes: roundedStartMinutes,
        endMinutes: roundedEndMinutes,
        sessions: [entry],
      });
    } else {
      existing.sessions.push(entry);
    }
  }

  const orderedGroups = Array.from(groups.values()).sort((a, b) => {
    const startDiff = a.startMinutes - b.startMinutes;

    if (Math.abs(startDiff) <= 30) {
      return b.endMinutes - a.endMinutes;
    }

    if (startDiff !== 0) {
      return startDiff;
    }

    return a.endMinutes - b.endMinutes;
  });
  console.log('SESSION_VISIBILITY_RESTORED', {
    rawSessionsCount: safeSessions.length,
    groupedCount: orderedGroups.length,
  });

  const groupedSessions: TimelineGroupedSession[] = orderedGroups
    .map((group) => {
      const visibleSessions = getSortedVisibleGroupSessions(
        (Array.isArray(group.sessions) ? group.sessions : []).filter(({ item }) => {
          const normalizedActiveProfileId = activeProfileId ?? null;
          const visible =
            item.userId === normalizedActiveProfileId
              ? !isSessionExpired(item)
              : buddiesMode === 'everyone' || safeFollowingUserIds.includes(item.userId);

          console.log('GROUP_VISIBILITY_DEBUG', {
            userName: item.userName,
            userId: item.userId,
            activeProfileId: normalizedActiveProfileId,
            buddiesMode,
            isSelf: item.userId === normalizedActiveProfileId,
            isFollowing: safeFollowingUserIds.includes(item.userId),
            state: getSessionViewState(item) === 'live' ? 'live' : 'planned',
            visible,
          });

          return visible;
        }),
      );
      return {
        ...group,
        visibleSessions,
        representative: visibleSessions[0] ?? (Array.isArray(group.sessions) ? group.sessions[0] : null) ?? null,
      };
    })
    .filter((group) => group.visibleSessions.length > 0);

  console.log("TIMELINE_GROUP_ADAPTER_OUTPUT", {
    totalGroups: groupedSessions?.length ?? 0,
    firstGroup: groupedSessions?.[0] ?? null
  });

  return groupedSessions;
};

const buildSpotDetailState = ({
  sessions,
  selectedSpot,
  activeDayKey,
  activeProfile,
  timelineSessions,
  timelineFilter,
  followingUserIds,
}: {
  sessions: SpotSession[];
  selectedSpot: SpotName | null;
  activeDayKey: string;
  activeProfile: Profile | null;
  timelineSessions: Array<{ item: SpotSession; state: TimelineState; isBuddy: boolean }>;
  timelineFilter: TimelineFilter;
  followingUserIds: string[];
}): SpotDetailState => {
  const sessionsForSpot = (Array.isArray(timelineSessions) ? timelineSessions : []).map((entry) => entry.item);
  const ownSessionForSpotDay = getOwnSessionForSpotDay({
    sessions: sessionsForSpot,
    userId: activeProfile?.id,
    spotName: getSelectedSpotName(selectedSpot),
    dayKey: activeDayKey,
  }) as OwnSessionForSpotDayState;
  const blockingOwnSessions = (ownSessionForSpotDay?.ownSessions ?? []).filter((session) => isSessionBlockingOwnSession(session));
  const blockingOwnSession = blockingOwnSessions[0] ?? null;
  const hasBlockingOwnSession = blockingOwnSessions.length > 0;
  console.log("OWN_SESSION_BLOCKING_EVALUATION", {
    selectedSpot: typeof selectedSpot === 'string' ? selectedSpot : selectedSpot ?? null,
    activeDayKey,
    ownSessionIds: ownSessionForSpotDay?.ownSessions?.map((s) => s?.id ?? null) ?? [],
    blockingSessionIds: blockingOwnSessions?.map((s) => s?.id ?? null) ?? []
  });
  console.log("OWN_SESSION_STATE_TRACE", {
    sessions: (ownSessionForSpotDay?.ownSessions ?? []).map((session) => ({
      id: session?.id ?? null,
      start: session?.start ?? null,
      end: session?.end ?? null,
      status: session?.status ?? null,
      state: getCanonicalSessionState(session)
    }))
  });
  console.log("PLAN_BLOCKING_RESULT", {
    hasBlockingOwnSession,
    blockingSessionId: blockingOwnSession?.id ?? null
  });
  const ownSessionStateForBlocking: OwnSessionForSpotDayState = {
    ...ownSessionForSpotDay,
    ownSession: blockingOwnSession,
    hasOwnSession: hasBlockingOwnSession,
    blockingOwnSession,
    hasBlockingOwnSession,
    blockingOwnSessions,
  };
  const topCtaState = getTopCtaState({ ownSessionForSpotDay: ownSessionStateForBlocking });
  const groupedSessions = groupTimelineSessions({
    sessions: Array.isArray(timelineSessions) ? timelineSessions : [],
    activeDayKey,
    selectedSpot,
    activeProfileId: activeProfile?.id ?? null,
    buddiesMode: timelineFilter,
    followingUserIds: Array.isArray(followingUserIds) ? followingUserIds : [],
  });
  const joinStateBySession = (Array.isArray(timelineSessions) ? timelineSessions : []).reduce((result, entry) => {
    if (!entry?.item?.id) {
      return result;
    }
    const joinState = getJoinState({
      session: entry.item,
      ownSessionForSpotDay: ownSessionStateForBlocking,
      activeDayKey,
    });
    result[entry.item.id] = {
      allowed: joinState.allowed,
      reason: joinState.reason ?? null,
    };
    return result;
  }, {} as Record<string, { allowed: boolean; reason: string | null }>);
  const ownSession = blockingOwnSession;
  const hasOwnSession = hasBlockingOwnSession;

  return {
    sessionsForSpot,
    ownSession,
    hasOwnSession,
    groupedSessions,
    topCtaState,
    joinStateBySession,
    cancelTarget: ownSession,
    ownSessionForSpotDay: ownSessionStateForBlocking,
  };
};

type SessionRowProps = {
  group: TimelineGroupedSession;
  currentProfileId: string | null | undefined;
  activeDay: 'today' | 'tomorrow';
  activeDayKey: string;
  selectedSpot: SpotName | null;
  ownSessionForSpotDay: OwnSessionForSpotDayState;
  joinStateBySession: Record<string, { allowed: boolean; reason: string | null }>;
  timelineWindowStartMinutes: number;
  timelineWindowEndMinutes: number;
  isSelected: boolean;
  nearOverlapWithPrevious: boolean;
  onSelect: (groupKey: string) => void;
  onJoin: (request: SessionJoinRequest) => void;
  onOpenGroupChat: (groupKey: string) => void;
  activeGroupChatKey: string | null;
};

function SessionRow({
  group,
  currentProfileId,
  activeDay,
  activeDayKey,
  selectedSpot,
  ownSessionForSpotDay,
  joinStateBySession,
  timelineWindowStartMinutes,
  timelineWindowEndMinutes,
  isSelected,
  nearOverlapWithPrevious,
  onSelect,
  onJoin,
  onOpenGroupChat,
  activeGroupChatKey,
}: SessionRowProps) {
  const clampedStartMinutes = clamp(group.startMinutes, timelineWindowStartMinutes, timelineWindowEndMinutes);
  const clampedEndMinutes = clamp(Math.max(group.endMinutes, clampedStartMinutes + 20), timelineWindowStartMinutes, timelineWindowEndMinutes);
  const windowTotalMinutes = Math.max(timelineWindowEndMinutes - timelineWindowStartMinutes, 1);
  const leftPercent = clamp(((clampedStartMinutes - timelineWindowStartMinutes) / windowTotalMinutes) * 100, 0, 100);
  const widthPercent = clamp(((clampedEndMinutes - clampedStartMinutes) / windowTotalMinutes) * 100, 1, 100 - leftPercent);

  const safeGroupSessions = Array.isArray(group.sessions) ? group.sessions : [];
  const sortedVisibleSessions = Array.isArray(group.visibleSessions) ? group.visibleSessions : [];
  const getRiderRowName = (sessionItem: SpotSession) => {
    const rawName = typeof sessionItem.userName === 'string' ? sessionItem.userName.trim() : '';
    return rawName.replace(/\s*-\s*(Buddy|You|Other)\s*$/i, '').trim();
  };
  const representative = group.representative ?? safeGroupSessions[0];
  const session = representative?.item ?? null;
  const joinTargetEntry = safeGroupSessions.find((entry) => entry.item?.userId !== currentProfileId) ?? null;
  const joinTarget = joinTargetEntry?.item ?? null;
  const joinState = joinTarget?.id
    ? joinStateBySession[joinTarget.id] ?? getJoinState({
      session: joinTarget,
      ownSessionForSpotDay,
      activeDayKey,
    })
    : { allowed: false, reason: null };
  const isAlreadyInGroup = safeGroupSessions.some(
  (entry) => entry.item?.userId === currentProfileId
);

const canJoinGroup = Boolean(joinTarget) && !isAlreadyInGroup;
  const hostCleanStatus = getCleanSessionStatus(session);
  const rowStatus: TimelineState = hostCleanStatus === 'live' ? 'live' : 'planned';
  const rowIntent: SessionIntent = hostCleanStatus === 'maybe' ? 'maybe' : 'definitely';
  const isLiveRow = rowStatus === 'live';
  console.log("JOIN_REGRESSION_COMPARE", {
    sessionId: session?.id ?? null,
    sessionDay: session?.sessionDay ?? null,
    activeDayKey,
    hasOwnSession: ownSessionForSpotDay?.hasOwnSession ?? false,
    joinStateAllowed: joinState?.allowed ?? null,
    joinStateReason: joinState?.reason ?? null
  });  return (
    <Pressable
      onPress={() => onSelect(group.key)}
      style={({ pressed }) => ({
        marginBottom: 0,
        borderRadius: 14,
        backgroundColor: 'transparent',
        paddingVertical: 6,
        paddingHorizontal: 12,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', position: 'relative' }}>
        <View style={{ width: 82, alignItems: 'center' }}>
          {sortedVisibleSessions.length > 1 ? (
            <Text style={{ color: 'rgba(255,255,255,0.42)', fontSize: 10, fontWeight: '500', marginBottom: 4 }}>
              {`${sortedVisibleSessions.length} riders`}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {sortedVisibleSessions.slice(0, 3).map(({ item }, index) => (
              <View key={`session-avatar-${group.key}-${item.id}`} style={{ marginLeft: index === 0 ? 0 : -8 }}>
                <Avatar uri={item.userAvatarUrl ?? null} size={40} />
              </View>
            ))}
            {sortedVisibleSessions.length > 3 ? (
              <View style={{
                marginLeft: -8,
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.16)',
                borderWidth: 0,
                borderColor: 'rgba(255,255,255,0.22)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: '900' }}>
                  +{sortedVisibleSessions.length - 3}
                </Text>
              </View>
            ) : null}
          </View>

          {sortedVisibleSessions.length === 1 ? (
            <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '500', marginTop: 4, textAlign: 'center', width: 64 }} numberOfLines={1}>
              {getRiderRowName(sortedVisibleSessions[0]?.item)}
            </Text>
          ) : null}

          {isLiveRow && session?.checkedInAt ? (
            <Text style={{ color: '#5EF0D0', fontSize: 10, fontWeight: '700', marginTop: 4 }}>
              checked in at: {formatToHourMinute(session.checkedInAt)}
            </Text>
          ) : null}

          {sortedVisibleSessions.length > 1 && isAlreadyInGroup ? (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onOpenGroupChat(group.key);
              }}
              style={{ marginTop: 4 }}
            >
              <Text style={{ color: activeGroupChatKey === group.key ? theme.primary : theme.textMuted, fontSize: 10, fontWeight: '700' }}>
                💬 Group chat
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View
          style={{
            position: 'absolute',
            left: 104,
            right: 104,
            height: 24,
          }}
        >
          <SessionBar
            leftPercent={leftPercent}
            widthPercent={widthPercent}
            state={getCleanSessionStatus(session) === 'live' ? 'live' : 'planned'}
            intent={rowIntent}
            isSelected={isSelected}
            showJoinButton={false}
            onPress={() => onSelect(group.key)}
            label={`${group.startTime} – ${group.endTime}`}
            onJoin={() => {
              if (!joinTarget) return;
              onJoin({
                sessionId: joinTarget.id,
                sessionDay: joinTarget.sessionDay,
                sessionStatus: joinTarget.status ?? null,
                normalizedStart: group.startTime,
                normalizedEnd: group.endTime,
              });
            }}
          />
        </View>

        <View style={{ width: 92 }} />

        {canJoinGroup ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              if (!joinTarget) return;
              onJoin({
                sessionId: joinTarget.id,
                sessionDay: joinTarget.sessionDay,
                sessionStatus: joinTarget.status ?? null,
                normalizedStart: group.startTime,
                normalizedEnd: group.endTime,
              });
            }}
            style={{
              width: 72,
              height: 18,
              borderRadius: 14,
              backgroundColor: 'rgba(255,255,255,0.88)',
              justifyContent: 'center',
              alignItems: 'center',
              position: 'absolute',
              right: 0,
            }}
          >
            <Text style={{ color: '#061421', fontSize: 10, fontWeight: '900' }}>JOIN</Text>
          </Pressable>
        ) : (
          <View style={{ width: 72 }} />
        )}
      </View>
    </Pressable>
  );
}

type SpotSummaryMetric = {
  icon: string;
  label: string;
  helper: string;
  value: number;
  color: string;
};

function SpotSummaryCards({ metrics, theme }: { metrics: SpotSummaryMetric[]; theme: any }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, backgroundColor: 'transparent', paddingHorizontal: 0, paddingBottom: 0, marginTop: 0, marginBottom: 8, borderWidth: 0 }}>
      {metrics.map((metric) => {
        const isLive = metric.label === 'LIVE';
        const isGoing = metric.label === 'GOING';
        const accent = isLive ? '#5EF0D0' : isGoing ? '#4DB8FF' : '#5F83A6';

        return (
          <View
            key={`spot-summary-${metric.label}`}
            style={{
              flex: 1,
              minHeight: 128,
              backgroundColor: 'transparent',
              borderRadius: 16,
              padding: 16,
              borderWidth: 0,
              borderColor: 'rgba(255,255,255,0.045)',
              borderLeftWidth: 1,
              borderLeftColor: 'rgba(255,255,255,0.045)',
            }}
          >
            <Text
              style={{
                color: accent,
                fontSize: 38,
                lineHeight: 38,
                fontWeight: '900',
                marginBottom: 14,
              }}
            >
              {metric.icon}
            </Text>


            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ color: '#ffffff', fontSize: 30, fontWeight: '900', marginRight: 8 }}>
                {metric.value}
              </Text>
              <Text style={{ color: accent, fontSize: 13, fontWeight: '900' }}>
                {metric.label}
              </Text>
            </View>

            <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700', marginTop: 2 }}>
              riders
            </Text>

            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.045)', marginVertical: 12 }} />

            <Text style={{ color: 'rgba(255,255,255,0.68)', fontSize: 12, fontWeight: '600' }}>
              {metric.helper}
            </Text>
          </View>
        );
      })}
    </View>
  );
}


type SessionTimelineProps = {
  groupedSessions: TimelineGroupedSession[];
  joinStateBySession: Record<string, { allowed: boolean; reason: string | null }>;
  selectedTimelineSessionId: string | null;
  currentProfileId: string | null | undefined;
  selectedSpot: SpotName | null;
  ownSessionForSpotDay: OwnSessionForSpotDayState;
  currentLocalMinutes: number;
  timelineWindowStartMinutes: number;
  timelineWindowEndMinutes: number;
  timelineFilter: TimelineFilter;
  showNowMarker: boolean;
  activeDay: 'today' | 'tomorrow';
  onSelectSession: (sessionId: string) => void;
  onJoinSession: (request: SessionJoinRequest) => void;
  onOpenGroupChat: (groupKey: string) => void;
  activeGroupChatKey: string | null;
  onClearSelection: () => void;
};

const getGroupCleanStatus = (group: any): 'live' | 'going' | 'maybe' => {
  const hostSession = group?.representative?.item ?? group?.sessions?.[0]?.item ?? group?.visibleSessions?.[0]?.item ?? null;
  const status = getCleanSessionStatus(hostSession);
  return status === 'finished' ? 'maybe' : status;
};

function SessionTimeline({
  groupedSessions,
  joinStateBySession,
  selectedTimelineSessionId,
  currentProfileId,
  selectedSpot,
  ownSessionForSpotDay,
  currentLocalMinutes,
  timelineWindowStartMinutes,
  timelineWindowEndMinutes,
  timelineFilter,
  showNowMarker,
  activeDay,
  onSelectSession,
  onJoinSession,
  onOpenGroupChat,
  activeGroupChatKey,
  onClearSelection,
}: SessionTimelineProps) {
  const activeDayKey = activeDay === 'today' ? getTodayLocalDateKey() : getTomorrowLocalDateKey();
  const totalRange = Math.max(timelineWindowEndMinutes - timelineWindowStartMinutes, 1);
  const isCurrentTimeMarkerVisible = showNowMarker && currentLocalMinutes >= timelineWindowStartMinutes && currentLocalMinutes <= timelineWindowEndMinutes;
  const currentPercent = ((currentLocalMinutes - timelineWindowStartMinutes) / totalRange) * 100;
  const nowPosition = clamp(currentPercent, 0, 100);  const renderRange = useMemo(
    () => ({
      timelineWindowStartMinutes,
      timelineWindowEndMinutes,
      rangeStart: formatMinutesAsHourMinute(timelineWindowStartMinutes),
      rangeEnd: formatMinutesAsHourMinute(timelineWindowEndMinutes),
      currentLocalMinutes,
      nowLabel: formatMinutesAsHourMinute(currentLocalMinutes),
    }),
    [currentLocalMinutes, timelineWindowEndMinutes, timelineWindowStartMinutes],
  );
  const visibleGroups = Array.isArray(groupedSessions) ? groupedSessions : [];
  const liveGroups = visibleGroups.filter((group) => getGroupCleanStatus(group) === 'live');
  const goingGroups = visibleGroups.filter((group) => getGroupCleanStatus(group) === 'going');
  const maybeGroups = visibleGroups.filter((group) => getGroupCleanStatus(group) === 'maybe');
  const timelineGridLabels = getTimelineLabelsForRange(timelineWindowStartMinutes, timelineWindowEndMinutes);
  const timelineHourMarks = Array.from(
    { length: Math.floor(timelineWindowEndMinutes / 60) - Math.ceil(timelineWindowStartMinutes / 60) + 1 },
    (_, i) => (Math.ceil(timelineWindowStartMinutes / 60) + i) * 60
  );
  useEffect(() => {
    
  }, [renderRange]);

  return (
    <Pressable onPress={onClearSelection}>
      <View style={{ position: 'relative' }}>
        {isCurrentTimeMarkerVisible ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 104,
              right: 0,
              top: 0,
              bottom: 0,
              zIndex: 10,
            }}
          >
            <View
              style={{
                position: 'absolute',
                left: `${nowPosition}%`,
                top: 0,
                bottom: 0,
                width: 0,
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 14,
                  backgroundColor: '#e6f6ff',
                  shadowColor: '#d8eeff',
                  shadowOpacity: 0.14,
                  shadowRadius: 3,
                  shadowOffset: { width: 0, height: 0 },
                }}
              />
              <Text style={{ marginTop: 2, color: '#ecf7ff', fontSize: 10, fontWeight: '700', letterSpacing: 0.2 }}>Now</Text>
              <View
                style={{
                  marginTop: 3,
                  width: 2,
                  flex: 1,
                  borderLeftWidth: 2,
                  borderStyle: 'solid',
                  borderColor: 'rgba(205,233,255,0.32)',
                }}
              />
            </View>
          </View>
        ) : null}

        {visibleGroups.length > 0 ? (
          <>
            {[
              { key: 'live', title: 'LIVE NOW', groups: liveGroups, color: '#5EF0D0' },
              { key: 'going', title: 'GOING', groups: goingGroups, color: '#4DB8FF' },
              { key: 'maybe', title: 'MAYBE', groups: maybeGroups, color: '#5F83A6' },
            ].map((section) => {
              if (section.groups.length === 0) return null;

              return (
                <View key={section.key} style={{
                  marginBottom: 10,
                  padding: 10,
                  borderRadius: 18,
                  position: 'relative',
                  overflow: 'hidden',
                  backgroundColor: 'rgba(255,255,255,0.018)',
                  borderWidth: 0,
                  borderLeftWidth: 1,
                  borderLeftColor: 'rgba(255,255,255,0.05)',
                  borderColor: 'rgba(255,255,255,0.045)'
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: section.color, marginRight: 8, opacity: 0.85 }} />
                      <Text style={{ color: section.color, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 }}>
                        {section.title}
                      </Text>
                    </View>
                    <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '600' }}>
                      {section.groups.length} {section.groups.length === 1 ? 'session' : 'sessions'}
                    </Text>
                  </View>

                  <View pointerEvents="none" style={{ position: 'absolute', left: 104, right: 104, top: 42, bottom: 10 }}>
                    {timelineHourMarks.map((hourMinutes) => (
                      <View key={`hour-line-${section.key}-${hourMinutes}`} style={{
                        position: 'absolute',
                        left: `${((hourMinutes - timelineWindowStartMinutes) / Math.max(timelineWindowEndMinutes - timelineWindowStartMinutes, 1)) * 100}%`,
                        top: 0,
                        bottom: 0,
                        width: 1,
                        backgroundColor: 'rgba(255,255,255,0.022)'
                      }} />
                    ))}
                  </View>

                  {section.groups.map((group, index) => (
                    <View key={`timeline-row-wrap-${section.key}-${group.key}`}>
                      {index > 0 ? (
                        <View pointerEvents="none" style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.055)', marginBottom: 5 }} />
                      ) : null}
                      <SessionRow
                      key={group.key}
                      group={group}
                      currentProfileId={currentProfileId}
                      activeDay={activeDay}
                      activeDayKey={activeDayKey}
                      selectedSpot={selectedSpot}
                      ownSessionForSpotDay={ownSessionForSpotDay}
                      joinStateBySession={joinStateBySession}
                      nearOverlapWithPrevious={false}
                      timelineWindowStartMinutes={timelineWindowStartMinutes}
                      timelineWindowEndMinutes={timelineWindowEndMinutes}
                      isSelected={selectedTimelineSessionId === group.key}
                      onSelect={onSelectSession}
                      onJoin={onJoinSession}
                      onOpenGroupChat={onOpenGroupChat}
                      activeGroupChatKey={activeGroupChatKey}
                    />
                    </View>
                  ))}
                </View>
              );
            })}
          </>
        ) : (
          <Text style={{ color: theme.textSoft, fontSize: 14 }}>
            {timelineFilter === 'buddies'
              ? 'No buddy sessions on the timeline yet'
              : 'No sessions on the timeline yet'}
          </Text>
        )}
      </View>
    </Pressable>
  );
}


export default function App() {
  const isNativePlatform = Platform.OS === 'ios' || Platform.OS === 'android';
  const isWebPlatform = Platform.OS === 'web';
  const [isPasswordResetRoute, setIsPasswordResetRoute] = useState(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return false;
    }

    return (
      window.location.pathname === '/reset-password'
      || window.location.href.includes('/reset-password#')
    );
  });
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [resetPasswordConfirmInput, setResetPasswordConfirmInput] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState('');
  const [isSavingResetPassword, setIsSavingResetPassword] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const hash = window.location.hash;

    if (!hash.includes('access_token')) {
      return;
    }

    const params = new URLSearchParams(hash.replace('#', ''));

    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');

    if (!access_token || !refresh_token) {
      return;
    }

    supabase.auth.setSession({
      access_token,
      refresh_token,
    }).then(({ error }) => {
      if (error) {
        console.error('RESET_SET_SESSION_ERROR', error);
        return;
      }

      console.log('RESET_SESSION_READY', true);
    });
  }, []);

  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [switchableAccounts, setSwitchableAccounts] = useState<SwitchableAccount[]>([]);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [switchAccountError, setSwitchAccountError] = useState('');
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileHydrationError, setProfileHydrationError] = useState('');
  const [spotDefinitions, setSpotDefinitions] = useState<SpotDefinition[]>(
    fallbackSpots.map((spot) => ({
      ...spot,
      canonicalName: normalizeSpotName(spot.spot),
      coordinateStatus: 'unverified',
    }))
  );
  const [selectedSpot, setSelectedSpot] = useState<SpotName | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showBuddies, setShowBuddies] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profileAvatarInputUri, setProfileAvatarInputUri] = useState<string | null>(null);
  const [profileEditError, setProfileEditError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [showAdminCreateProfile, setShowAdminCreateProfile] = useState(false);
  const [adminCreateNameInput, setAdminCreateNameInput] = useState('');
  const [adminCreateAvatarInputUri, setAdminCreateAvatarInputUri] = useState<string | null>(null);
  const [adminCreateError, setAdminCreateError] = useState<unknown>('');
  const [adminCreateWarning, setAdminCreateWarning] = useState('');
  const [, setAdminCreateSuccess] = useState(false);
  const [isAdminCreatingProfile, setIsAdminCreatingProfile] = useState(false);
  const spotNames = useMemo(() => spotDefinitions.map((spot) => spot.spot), [spotDefinitions]);
  const verifiedSpotDefinitions = useMemo(
    () => spotDefinitions.filter((spot) => spot.coordinateStatus === 'verified'),
    [spotDefinitions],
  );
  const [sessionsBySpot, setSessionsBySpot] = useState<Record<SpotName, SpotSession[]>>(() => createSpotRecord(fallbackSpots.map((spot) => spot.spot), () => []));
  const [messagesBySpot, setMessagesBySpot] = useState<Record<string, ChatMessage[]>>(() => createSpotRecord(fallbackSpots.map((spot) => spot.spot), () => []));
  const [loadingData, setLoadingData] = useState(false);
  const activeProfileOwnerUidRef = useRef<string | null>(null);
  const activeProfileIdRef = useRef<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [activePicker, setActivePicker] = useState<PickerKey>(null);
  const [startHour, setStartHour] = useState<number | null>(null);
  const [startMinute, setStartMinute] = useState(0);
  const [endHour, setEndHour] = useState<number | null>(null);
  const [endMinute, setEndMinute] = useState(0);
  const [intent, setIntent] = useState<SessionIntent>('definitely');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [showManageSessions, setShowManageSessions] = useState(false);
  const [formError, setFormError] = useState('');
  const [saveError, setSaveError] = useState<SaveDebugError>(null);
  const planningHelperText = 'You go live at the spot after check-in.';
  const [sessionActionError, setSessionActionError] = useState('');
  const [joinInFlightSessionId, setJoinInFlightSessionId] = useState<string | null>(null);
  const [homeQuickCheckInError, setHomeQuickCheckInError] = useState('');
  const [quickCheckInSpotInFlight, setQuickCheckInSpotInFlight] = useState<SpotName | null>(null);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  const [isResolvingNearestSpot, setIsResolvingNearestSpot] = useState(false);
  const [nearestSpotResult, setNearestSpotResult] = useState<NearestSpotResult | null>(null);
  const [currentCoordinates, setCurrentCoordinates] = useState<SpotCoordinates | null>(null);
  const [favoriteSpots, setFavoriteSpots] = useState<SpotName[]>([]);
  const [homeSpotsLimitMessage, setHomeSpotsLimitMessage] = useState('');
  const [orderMode, setOrderMode] = useState<SpotOrderMode>('distance');
  const [manualOrder, setManualOrder] = useState<SpotName[]>([]);
  const [showYourSpotsPage, setShowYourSpotsPage] = useState(false);
  const [showDiscoverSpotsPage, setShowDiscoverSpotsPage] = useState(false);
  const [discoverMapCenter, setDiscoverMapCenter] = useState<SpotCoordinates | null>(null);
  const [coordinateReviewSpotName, setCoordinateReviewSpotName] = useState<SpotName | null>(null);
  const [coordinateReviewPoint, setCoordinateReviewPoint] = useState<SpotCoordinates | null>(null);
  const [yourSpotsMode, setYourSpotsMode] = useState<'search' | 'discover'>('search');
  const [homeSpotSearchQuery, setHomeSpotSearchQuery] = useState('');
  const [allSpots, setAllSpots] = useState<SpotSearchResult[]>([]);
  const [spots, setSpots] = useState<SpotSearchResult[]>([]);
  const [searchResults, setSearchResults] = useState<SpotSearchResult[]>([]);
  const searchBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draggingManualSpot, setDraggingManualSpot] = useState<SpotName | null>(null);
  const [dragManualOrder, setDragManualOrder] = useState<SpotName[] | null>(null);
  const dragStartIndexRef = useRef<number | null>(null);
  const dragInitialOrderRef = useRef<SpotName[]>([]);
  const dragManualOrderRef = useRef<SpotName[] | null>(null);
  const dragSpotNameRef = useRef<SpotName | null>(null);
  const webDragOverIndexRef = useRef<number | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const spotChatScrollRef = useRef<ScrollView | null>(null);
  const groupChatScrollRef = useRef<ScrollView | null>(null);
  const realtimeRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRealtimeRefetch = () => {
    if (realtimeRefetchTimeoutRef.current) {
      clearTimeout(realtimeRefetchTimeoutRef.current);
    }

    realtimeRefetchTimeoutRef.current = setTimeout(() => {
      realtimeRefetchTimeoutRef.current = null;
      void fetchSharedData({ skipLoadingState: true }).then(() => {
        setGroupMessagesRefreshKey((value) => value + 1);
      });
    }, 250);
  };

  const [activeGroupChatKey, setActiveGroupChatKey] = useState<string | null>(null);
  const [groupMessageInput, setGroupMessageInput] = useState('');
  const [groupMessages, setGroupMessages] = useState<ChatMessage[]>([]);
  const [groupMessagesRefreshKey, setGroupMessagesRefreshKey] = useState(0);
    const [spotNotificationPreferences, setSpotNotificationPreferences] = useState<SpotNotificationPreferences>(defaultSpotNotificationPreferences);
  const [loadingSpotNotificationPreferences, setLoadingSpotNotificationPreferences] = useState(false);
  const [savingNotificationPreferenceKey, setSavingNotificationPreferenceKey] = useState<SpotNotificationPreferenceType | null>(null);
  const [notificationPreferencesError, setNotificationPreferencesError] = useState('');
  const [isNotificationPanelExpanded, setIsNotificationPanelExpanded] = useState(false);
  const [isNotificationInboxExpanded, setIsNotificationInboxExpanded] = useState(false);
  const [notificationRows, setNotificationRows] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentLocalMinutes, setCurrentLocalMinutes] = useState(() => getCurrentLocalMinutes());
  const [currentLocalDateKey, setCurrentLocalDateKey] = useState(() => getCurrentLocalDateKey());
  const [homeQuickCheckOutInFlight, setHomeQuickCheckOutInFlight] = useState(false);
  const [autoCheckoutNotice, setAutoCheckoutNotice] = useState<string | null>(null);
  const [showAutoCheckinPrompt, setShowAutoCheckinPrompt] = useState(false);
  const [autoCheckInPromptDismissed, setAutoCheckInPromptDismissed] = useState(false);
  const autoCheckInPromptShownRef = useRef(false);
  const autoCheckoutOutsideCountRef = useRef(0);
  const autoCheckoutOutsideSinceRef = useRef<number | null>(null);
  const autoCheckoutInFlightRef = useRef(false);
  const hasAutoCheckedOutRef = useRef(false);
  const gpsWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const gpsWatcherSessionIdRef = useRef<string | null>(null);
  const gpsWatcherStartTokenRef = useRef(0);
  const [buddyUsers, setBuddyUsers] = useState<BuddyUser[]>([]);
  const [searchUsersInput, setSearchUsersInput] = useState('');
  const [outgoingFollowStatusesByUserId, setOutgoingFollowStatusesByUserId] = useState<Record<string, FollowStatus>>({});
  const [followingUserIds, setFollowingUserIds] = useState<string[]>([]);
  const [incomingFollowRequests, setIncomingFollowRequests] = useState<FollowRequestItem[]>([]);
  const [followerUsers, setFollowerUsers] = useState<BuddyUser[]>([]);
  const [loadingBuddies, setLoadingBuddies] = useState(false);
  const [buddyActionUserId, setBuddyActionUserId] = useState<string | null>(null);
  const [followRequestActionId, setFollowRequestActionId] = useState<string | null>(null);
  const [buddiesError, setBuddiesError] = useState('');
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('everyone');
  const [activeDay, setActiveDay] = useState<ActiveDay>('today');
  const [selectedTimelineSessionId, setSelectedTimelineSessionId] = useState<string | null>(null);
  const authUser = session?.user ?? null;
  const authenticatedUserId = authUser?.id ?? null;
  const authenticatedUserEmail = normalizeEmail(authUser?.email ?? '');
  const isAccountSwitcherVisible = authenticatedUserEmail === adminAccountSwitcherEmail;
  const normalizeSearch = (value: unknown) => {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };
  const COUNTRY_ALIASES: Record<string, string[]> = useMemo(() => {
    const rawAliases = {
      nederland: ['netherlands', 'holland', 'nl', 'nether'],
      netherlands: ['nederland', 'holland', 'nl', 'nether'],
      duitsland: ['germany', 'de'],
      germany: ['duitsland', 'de'],
      belgie: ['belgium', 'be', 'belgie', 'belgie'],
      belgium: ['belgie', 'be'],
      frankrijk: ['france', 'fr'],
      france: ['frankrijk', 'fr'],
      spanje: ['spain', 'es'],
      spain: ['spanje', 'es'],
      portugal: ['pt'],
      denemarken: ['denmark', 'dk'],
      denmark: ['denemarken', 'dk'],
    };
    const normalized: Record<string, string[]> = {};
    Object.entries(rawAliases).forEach(([country, aliases]) => {
      const normalizedCountry = normalizeSearch(country);
      const normalizedAliases = aliases.map((alias) => normalizeSearch(alias)).filter(Boolean);
      normalized[normalizedCountry] = Array.from(new Set(normalizedAliases));
    });
    return normalized;
  }, []);
  const query = homeSpotSearchQuery;
  const filteredSpots = useMemo(() => {
    const safeSpots = Array.isArray(allSpots) ? allSpots : [];
    const normalizedQuery = normalizeSearch(query);
    console.log('SPOT_SEARCH_QUERY_NORMALIZED', normalizedQuery);

    if (!normalizedQuery) {
      console.log('SPOT_SEARCH_RESULT_COUNT', 0);
      console.log('SPOT_SEARCH_TOP_RESULTS', []);
      return [];
    }

    const getAliasTerms = (normalizedCountry: string) => {
      const directAliases = COUNTRY_ALIASES[normalizedCountry] ?? [];
      const reverseAliases = Object.entries(COUNTRY_ALIASES)
        .filter(([, aliases]) => aliases.includes(normalizedCountry))
        .map(([country]) => country);
      return Array.from(new Set([...directAliases, ...reverseAliases]));
    };

    const ranked = safeSpots
      .map((spot) => {
        const normalizedSpotName = normalizeSearch(spot.name);
        const normalizedCountry = normalizeSearch(spot.country);
        const aliasTerms = getAliasTerms(normalizedCountry);
        const aliasMatch = aliasTerms.some((alias) => alias.includes(normalizedQuery) || normalizedQuery.includes(alias));

        const matches = normalizedSpotName.includes(normalizedQuery)
          || normalizedCountry.includes(normalizedQuery)
          || aliasMatch
          || normalizedQuery.includes(normalizedCountry);

        if (!matches) {
          return null;
        }

        let rank = 5;
        if (normalizedSpotName.startsWith(normalizedQuery)) {
          rank = 1;
        } else if (normalizedCountry.startsWith(normalizedQuery)) {
          rank = 2;
        } else if (normalizedSpotName.includes(normalizedQuery)) {
          rank = 3;
        } else if (normalizedCountry.includes(normalizedQuery)) {
          rank = 4;
        }

        return { spot, rank };
      })
      .filter((item): item is { spot: SpotSearchResult; rank: number } => item !== null)
      .sort((a, b) => {
        if (a.rank !== b.rank) {
          return a.rank - b.rank;
        }
        const countryCompare = normalizeSearch(a.spot.country).localeCompare(normalizeSearch(b.spot.country));
        if (countryCompare !== 0) {
          return countryCompare;
        }
        return normalizeSearch(a.spot.name).localeCompare(normalizeSearch(b.spot.name));
      })
      .slice(0, 20)
      .map((item) => item.spot);

    console.log('SPOT_SEARCH_RESULT_COUNT', ranked.length);
    console.log('SPOT_SEARCH_TOP_RESULTS', ranked.slice(0, 5));
    return ranked;
  }, [allSpots, query, COUNTRY_ALIASES]);
  if (!Array.isArray(spots)) {
    
    return null;
  }
  const activeProfile = profile ?? null;
  const activeAppUserId = activeProfile?.id ?? null;
  const activeAppUserEmail = authenticatedUserEmail;
  const refreshUnreadBuzzState = async () => {
    if (!activeAppUserId) {
      setNotificationRows([]);
      setUnreadCount(0);
      return;
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('id,type,actor_user_id,data,created_at,read,actor_profile:profiles!notifications_actor_user_id_fkey(display_name)')
      .eq('user_id', activeAppUserId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Failed to load notifications inbox rows:', error);
      setNotificationRows([]);
      setUnreadCount(0);
      return;
    }

    setNotificationRows(
  (data ?? []).map((row) => ({
    ...row,
    actor_profile: Array.isArray(row.actor_profile)
      ? row.actor_profile[0] ?? null
      : row.actor_profile ?? null,
  }))
);

    const { count, error: unreadCountError } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', activeAppUserId)
      .eq('read', false);

    if (unreadCountError) {
      console.error('Failed to load unread notifications count:', unreadCountError);
      setUnreadCount(0);
      return;
    }

    setUnreadCount(count ?? 0);
  };
  useEffect(() => {
    void refreshUnreadBuzzState();
  }, [activeAppUserId]);
  const markAllBuzzAsRead = async () => {
    if (!activeAppUserId) return;

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', activeAppUserId)
      .eq('read', false);

    if (error) {
      console.error('Failed to mark notifications as read', error);
      return;
    }

    await refreshUnreadBuzzState();
  };
  useEffect(() => {
    activeProfileIdRef.current = activeAppUserId;
  }, [activeAppUserId]);
  const getNotificationInboxSummary = (notificationRow: NotificationRow) => {
    const data = notificationRow.data;
    if (notificationRow.type === 'session_joined') {
      const actorNameFromData = data && typeof data === 'object'
        ? [data.actorName, data.actorDisplayName, data.actor_name, data.display_name]
          .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : null;
      const actorNameFromProfile = typeof notificationRow.actor_profile?.display_name === 'string' && notificationRow.actor_profile.display_name.trim()
        ? notificationRow.actor_profile.display_name.trim()
        : null;
      const actorName = actorNameFromData?.trim() || actorNameFromProfile;
      return actorName ? `${actorName} joined your session` : 'Someone joined your session';
    }
    if (data && typeof data === 'object') {
      const message = data.message;
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
      const spotName = data.spotName;
      if (typeof spotName === 'string' && spotName.trim() && notificationRow.type) {
        return `${notificationRow.type}: ${spotName.trim()}`;
      }
    }
    return notificationRow.type || 'Notification';
  };
  const visibleProfiles = switchableAccounts;
  const availableProfiles = useMemo<Profile[]>(() => {
    const profileMap = new Map<string, Profile>();
    if (profile?.id) {
      profileMap.set(profile.id, {
        id: profile.id,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url ?? null,
        owner_uid: (profile as Profile & { owner_uid?: string | null }).owner_uid ?? null,
      });
    }
    for (const account of switchableAccounts) {
      profileMap.set(account.id, {
        id: account.id,
        display_name: account.display_name,
        avatar_url: account.avatar_url ?? null,
        owner_uid: account.owner_uid ?? null,
      });
    }
    return [...profileMap.values()];
  }, [profile, switchableAccounts]);
  const passwordResetRedirectTo = useMemo(() => {
    const configuredRedirect = Constants.expoConfig?.extra?.passwordResetRedirectTo;
    if (typeof configuredRedirect === 'string' && configuredRedirect.trim()) {
      return configuredRedirect.trim();
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/reset-password`;
    }

    const configuredScheme = Constants.expoConfig?.scheme;
    if (typeof configuredScheme === 'string' && configuredScheme.trim()) {
      return `${configuredScheme.trim()}://reset-password`;
    }

    return undefined;
  }, []);
  const getActiveProfileStorageKey = (ownerUid: string) => `${activeProfileStorageKeyPrefix}:${ownerUid}`;

  const handleSaveResetPassword = async () => {
    const passwordValue = resetPasswordInput.trim();
    const confirmValue = resetPasswordConfirmInput.trim();

    setResetPasswordError('');
    setResetPasswordSuccess('');

    if (!passwordValue || !confirmValue) {
      setResetPasswordError('Enter and confirm your new password');
      return;
    }

    if (passwordValue.length < 8) {
      setResetPasswordError('Password must be at least 8 characters');
      return;
    }

    if (passwordValue !== confirmValue) {
      setResetPasswordError('Passwords do not match');
      return;
    }

    setIsSavingResetPassword(true);

    const { error } = await supabase.auth.updateUser({
      password: passwordValue,
    });

    setIsSavingResetPassword(false);

    if (error) {
      console.error('RESET_PASSWORD_UPDATE_ERROR', error);
      setResetPasswordError('Could not update password. Please request a new reset link.');
      return;
    }

    setResetPasswordSuccess('Password updated. You can now log in.');
    setResetPasswordInput('');
    setResetPasswordConfirmInput('');

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }

    setIsPasswordResetRoute(false);
    await supabase.auth.signOut();
  };

  const handlePasswordResetRequest = async (email: string) => {
    
    // sender name / email template branding is configured in Supabase dashboard, not in app code
    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      passwordResetRedirectTo ? { redirectTo: passwordResetRedirectTo } : undefined
    );

    if (error) {
      console.error("PASSWORD_RESET_ERROR", error);
      return { error: 'Could not send reset link. Please try again.' };
    }

    
    return { error: null };
  };

  useEffect(() => {
    if (isAccountSwitcherVisible) {
      
    }
    
  }, [authenticatedUserEmail, isAccountSwitcherVisible]);

  const hydrateActiveProfile = async (authUser: AuthSession['user'] | null, _reason: string) => {
    
    
    if (!authUser?.id) {
      setSwitchableAccounts([]);
      setProfile(null);
      activeProfileOwnerUidRef.current = null;
      setProfileHydrationError('');
      setLoadingProfile(false);
      
      
      return;
    }

    setLoadingProfile(true);
    setProfileHydrationError('');
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, owner_uid, created_at')
        .eq('owner_uid', authUser.id)
        .order('created_at', { ascending: true });
      

      if (error) {
        setSwitchableAccounts([]);
        setProfile(null);
        setProfileHydrationError(error.message || 'Failed to load profiles');
        return;
      }

      const ownedProfiles = (data ?? []) as SwitchableAccount[];
      setSwitchableAccounts(ownedProfiles);
      const savedProfileId = await AsyncStorage.getItem(getActiveProfileStorageKey(authUser.id));
      

      const resolvedProfile = (savedProfileId
        ? ownedProfiles.find((profileItem) => profileItem.id === savedProfileId) ?? null
        : null) ?? ownedProfiles[0] ?? null;
      

      setProfile(resolvedProfile);
      activeProfileOwnerUidRef.current = authUser.id;

      if (resolvedProfile?.id) {
        await AsyncStorage.setItem(getActiveProfileStorageKey(authUser.id), resolvedProfile.id);
      } else {
        await AsyncStorage.removeItem(getActiveProfileStorageKey(authUser.id));
      }
    } finally {
      setLoadingProfile(false);
      
    }
  };

  const loadOwnedProfiles = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user?.id) {
      setSwitchAccountError('You must be logged in to switch account');
      setSwitchableAccounts([]);
      
      return [] as SwitchableAccount[];
    }

    setSwitchAccountError('');
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, owner_uid, created_at')
      .eq('owner_uid', user.id)
      .order('created_at', { ascending: true });
    

    if (error) {
      console.error('ACCOUNT_SWITCHER_LOAD_ERROR', error);
      setSwitchAccountError(error.message || 'Failed to load switchable profiles');
      setSwitchableAccounts([]);
      
      return [] as SwitchableAccount[];
    }

    const loadedProfiles = (data ?? []) as SwitchableAccount[];
    setSwitchableAccounts(loadedProfiles);
    
    
    return loadedProfiles;
  };

  const createAdminProfile = async (profileName: string, avatarFile?: string | null) => {
    
    const { data: { user } } = await supabase.auth.getUser();
    

    if (!user?.id) {
      throw new Error('You must be logged in');
    }

    const uploadAvatarIfExists = async (avatar?: string | null) => {
      if (!avatar) {
        return null;
      }

      const avatarStorageKey = `${user.id}-${Date.now()}`;
      const { error: uploadError, publicUrl } = await uploadAvatar(avatarStorageKey, avatar);
      if (uploadError || !publicUrl) {
        throw uploadError ?? new Error('Avatar URL is missing');
      }
      return publicUrl;
    };

    let avatarUrl: string | null = null;
    try {
      avatarUrl = await uploadAvatarIfExists(avatarFile);
    } catch (e) {
      
    }

    const payload = {
      display_name: profileName,
      owner_uid: user.id,
      avatar_url: avatarUrl,
    };
    

    const { data, error } = await supabase
      .from("profiles")
      .insert({ ...payload, session_day: selectedDayKey })
      .select()
      .single();

    
    if (error) {
      throw error;
    }

    
    return data;
  };

  const handleAdminCreateProfile = async () => {
    const username = adminCreateNameInput.trim();
    const currentUserEmail = normalizeEmail(session?.user?.email ?? '');
    const isAdmin = currentUserEmail === adminAccountSwitcherEmail;

    

    if (!session?.user?.id) {
      setAdminCreateError('You must be logged in');
      return;
    }

    if (!isAdmin) {
      setAdminCreateError('You are not allowed to create profiles');
      
      return;
    }

    if (!username) {
      setAdminCreateError('Please fill in all required fields');
      return;
    }

    setIsAdminCreatingProfile(true);
    setAdminCreateError('');
    setAdminCreateWarning('');
    try {
      const createdProfile = await createAdminProfile(username, adminCreateAvatarInputUri);
      setAdminCreateSuccess(true);
      setAdminCreateError('');
      setAdminCreateWarning('');
      setAdminCreateNameInput('');
      setAdminCreateAvatarInputUri(null);
      setShowAdminCreateProfile(false);
      
      const profiles = await loadOwnedProfiles();
      
      
      
      
    } catch (error) {
      
      
      
      setAdminCreateSuccess(false);
      setAdminCreateError(
        error?.message ||
        JSON.stringify(error, null, 2)
      );
    } finally {
      setIsAdminCreatingProfile(false);
    }
  };

  const handleSelectAccount = async (selectedProfile: SwitchableAccount) => {
    
    const fromUser = {
      id: activeAppUserId,
      email: activeAppUserEmail,
    };
    const toUser = {
      id: selectedProfile.id,
      email: activeAppUserEmail,
    };
    

    setShowAccountSwitcher(false);
    setShowBuddies(false);
    setShowAccountSwitcher(false);
    setShowAdminCreateProfile(false);
    setSwitchableAccounts([]);
    setSelectedSpot(null);
    setProfile(selectedProfile);
    if (authenticatedUserId) {
      await AsyncStorage.setItem(getActiveProfileStorageKey(authenticatedUserId), selectedProfile.id);
    }
    await fetchSharedData();
    await fetchBuddiesData();
    
  };

  useEffect(() => {
    
  }, [visibleProfiles]);

  useEffect(() => {
    
  }, []);

  useEffect(() => {
    
  }, [favoriteSpots]);
  useEffect(() => {
    
  }, [favoriteSpots]);

  useEffect(() => {
    console.log('PUSH_INIT');
    const FALLBACK_EAS_PROJECT_ID = "6420f442-2be4-4803-9620-f769bc5def4f";

    const register = async () => {
      try {
        if (Platform.OS === 'web') {
          console.log('PUSH_SKIP_WEB');
          return;
        }

        const { status } = await Buzz.requestPermissionsAsync();
        console.log('PUSH_PERMISSION_STATUS', status);

        const projectId =
          Constants?.expoConfig?.extra?.eas?.projectId ??
          Constants?.easConfig?.projectId ??
          FALLBACK_EAS_PROJECT_ID;

        console.log('PUSH_PROJECT_ID', projectId);

        const token = await Buzz.getExpoPushTokenAsync({
          projectId,
        });

        console.log('PUSH_TOKEN', token.data);

        if (!activeAppUserId || !token.data) {
          return;
        }

        const { error: pushTokenSaveError } = await supabase
          .from('push_tokens')
          .upsert(
            {
              user_id: activeAppUserId,
              expo_push_token: token.data,
              platform: Platform.OS,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,expo_push_token' }
          );

        if (pushTokenSaveError) {
          console.error('PUSH_TOKEN_SAVE_ERROR', pushTokenSaveError);
        } else {
          console.log('PUSH_TOKEN_SAVED');
        }
      } catch (e) {
        console.log('PUSH_ERROR', e);
      }
    };

    register();
  }, [activeAppUserId]);

  useEffect(() => {
    if (!activeAppUserId || spotNames.length === 0) {
      return;
    }

    void fetchSharedData();
  }, [activeDay]);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const [storedValue, storedOrderMode, storedManualOrder] = await Promise.all([
          AsyncStorage.getItem(favoriteSpotsStorageKey),
          AsyncStorage.getItem(spotOrderModeStorageKey),
          AsyncStorage.getItem(spotManualOrderStorageKey),
        ]);
        if (!isMounted) {
          return;
        }

        const parsedFavoriteSpots = storedValue ? JSON.parse(storedValue) : null;
        const loadedFavoriteSpotsRaw = Array.isArray(parsedFavoriteSpots)
          ? (Array.isArray(parsedFavoriteSpots) ? parsedFavoriteSpots : []).filter((value): value is SpotName => typeof value === 'string')
          : [];
        const loadedFavoriteSpots = loadedFavoriteSpotsRaw.slice(0, HOME_SPOTS_LIMIT);
        if (loadedFavoriteSpotsRaw.length !== loadedFavoriteSpots.length) {
          void AsyncStorage.setItem(favoriteSpotsStorageKey, JSON.stringify(loadedFavoriteSpots)).catch((error) => {
            console.error('Failed to persist favorite spots', error);
          });
        }
        const loadedOrderMode: SpotOrderMode = storedOrderMode === 'manual' ? 'manual' : 'distance';
        const parsedManualOrder = storedManualOrder ? JSON.parse(storedManualOrder) : null;
        const loadedManualOrderRaw = Array.isArray(parsedManualOrder)
          ? (Array.isArray(parsedManualOrder) ? parsedManualOrder : []).filter((value): value is SpotName => typeof value === 'string')
          : [];
        const dedupedManualOrder: SpotName[] = [];
        for (const spotName of loadedManualOrderRaw) {
          if (!dedupedManualOrder.includes(spotName)) {
            dedupedManualOrder.push(spotName);
          }
        }
        const normalizedManualOrder = (Array.isArray(dedupedManualOrder) ? dedupedManualOrder : []).filter((spotName) => loadedFavoriteSpots.includes(spotName));
        for (const spotName of loadedFavoriteSpots) {
          if (!normalizedManualOrder.includes(spotName)) {
            normalizedManualOrder.push(spotName);
          }
        }
        if (normalizedManualOrder.length !== dedupedManualOrder.length) {
          void AsyncStorage.setItem(spotManualOrderStorageKey, JSON.stringify(normalizedManualOrder)).catch((error) => {
            console.error('Failed to persist spot manual order', error);
          });
        }
        setFavoriteSpots(loadedFavoriteSpots);
        setOrderMode(loadedOrderMode);
        setManualOrder(normalizedManualOrder);
        
        
      } catch (error) {
        console.error('Failed to load favorite spots', error);
        
        
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);
  useEffect(() => () => {
    if (searchBlurTimeoutRef.current) {
      clearTimeout(searchBlurTimeoutRef.current);
      searchBlurTimeoutRef.current = null;
    }
  }, []);

  const addSelectedSpot = (spotName: SpotName) => {
    
    setFavoriteSpots((previousFavoriteSpots) => {
      const selectedSpots = previousFavoriteSpots;
      const currentCount = selectedSpots.length;
      

      if (selectedSpots.includes(spotName)) {
        
        setHomeSpotsLimitMessage('');
        setHomeSpotSearchQuery('');
        return previousFavoriteSpots;
      }

      
      if (currentCount >= HOME_SPOTS_LIMIT) {
        
        setHomeSpotsLimitMessage('Your home screen can show up to 5 spots. Remove one to add another.');
        return previousFavoriteSpots;
      }

      const nextSelectedSpots = [...selectedSpots, spotName];
      
      setHomeSpotsLimitMessage('');
      setManualOrder((previousManualOrder) => {
        if (previousManualOrder.includes(spotName)) {
          return previousManualOrder;
        }
        const nextManualOrder = [...previousManualOrder, spotName];
        void AsyncStorage.setItem(spotManualOrderStorageKey, JSON.stringify(nextManualOrder)).catch((error) => {
          console.error('Failed to persist spot manual order', error);
        });
        return nextManualOrder;
      });
      void AsyncStorage.setItem(favoriteSpotsStorageKey, JSON.stringify(nextSelectedSpots)).catch((error) => {
        console.error('Failed to persist favorite spots', error);
      }).then(() => {
        
      });
      setHomeSpotSearchQuery('');
      return nextSelectedSpots;
    });
  };
  const openSpotLookup = (spotName: SpotName) => {
    const isSavedSpot = favoriteSpots.includes(spotName);
    
    
    setSelectedSpot(spotName);
    setShowYourSpotsPage(false);
    setHomeSpotSearchQuery('');
    setSearchResults([]);
  };
  const handleSearchResultPress = (selectedSpot: SpotSearchResult) => {
    if (searchBlurTimeoutRef.current) {
      clearTimeout(searchBlurTimeoutRef.current);
      searchBlurTimeoutRef.current = null;
    }

    openSpotLookup(selectedSpot.name);
  };
  const removeSelectedSpot = (spotName: SpotName) => {
    setHomeSpotsLimitMessage('');
    setFavoriteSpots((previousFavoriteSpots) => {
      if (!previousFavoriteSpots.includes(spotName)) {
        return previousFavoriteSpots;
      }
      const nextSelectedSpots = (Array.isArray(previousFavoriteSpots) ? previousFavoriteSpots : []).filter((favoriteSpot) => favoriteSpot !== spotName);
      
      void AsyncStorage.setItem(favoriteSpotsStorageKey, JSON.stringify(nextSelectedSpots)).catch((error) => {
        console.error('Failed to persist favorite spots', error);
      });
      return nextSelectedSpots;
    });
    setManualOrder((previousManualOrder) => {
      const nextManualOrder = (Array.isArray(previousManualOrder) ? previousManualOrder : []).filter((manualSpot) => manualSpot !== spotName);
      void AsyncStorage.setItem(spotManualOrderStorageKey, JSON.stringify(nextManualOrder)).catch((error) => {
        console.error('Failed to persist spot manual order', error);
      });
      return nextManualOrder;
    });
  };
  const handleSpotSaveAction = (spotName: SpotName, action: 'add' | 'remove') => {
    
    if (action === 'add') {
      addSelectedSpot(spotName);
      return;
    }
    removeSelectedSpot(spotName);
  };
  const persistManualOrder = (nextManualOrder: SpotName[]) => {
    void AsyncStorage.setItem(spotManualOrderStorageKey, JSON.stringify(nextManualOrder)).then(() => {
      
    }).catch((error) => {
      console.error('Failed to persist spot manual order', error);
    });
  };
  const moveManualSpot = (spotName: SpotName, index: number, direction: 'up' | 'down') => {
    
    setManualOrder((previousManualOrder) => {
      const currentIndex = previousManualOrder.indexOf(spotName);
      if (currentIndex < 0) {
        return previousManualOrder;
      }
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= previousManualOrder.length) {
        return previousManualOrder;
      }
      const nextManualOrder = [...previousManualOrder];
      const [movedSpot] = nextManualOrder.splice(currentIndex, 1);
      nextManualOrder.splice(targetIndex, 0, movedSpot);
      
      persistManualOrder(nextManualOrder);
      return nextManualOrder;
    });
  };
  const updateManualOrder = (nextManualOrder: SpotName[]) => {
    setManualOrder(nextManualOrder);
    
    persistManualOrder(nextManualOrder);
  };
  const updateOrderMode = (nextOrderMode: SpotOrderMode) => {
    setOrderMode(nextOrderMode);
    void AsyncStorage.setItem(spotOrderModeStorageKey, nextOrderMode).catch((error) => {
      console.error('Failed to persist spot order mode', error);
    });
  };
  useEffect(() => {
    setSearchResults(filteredSpots);
  }, [filteredSpots]);
  useEffect(() => {
    if (!showYourSpotsPage || allSpots.length > 0) {
      return;
    }

    let isMounted = true;

    (async () => {
      const response = await supabase
        .from('spots')
        .select('*');
      const data = (response.data as SpotSearchResult[] | null) ?? [];

      if (!isMounted) {
        return;
      }

      setSpots(data);
      setAllSpots(data);
    })();

    return () => {
      isMounted = false;
    };
  }, [showYourSpotsPage, allSpots.length]);
  useEffect(() => {
    setManualOrder((previousManualOrder) => {
      const dedupedManualOrder: SpotName[] = [];
      for (const spotName of previousManualOrder) {
        if (!dedupedManualOrder.includes(spotName)) {
          dedupedManualOrder.push(spotName);
        }
      }
      const favoriteSpotSet = new Set(favoriteSpots);
      const filteredOrder = (Array.isArray(dedupedManualOrder) ? dedupedManualOrder : []).filter((spotName) => favoriteSpotSet.has(spotName));
      for (const spotName of favoriteSpots) {
        if (!filteredOrder.includes(spotName)) {
          filteredOrder.push(spotName);
        }
      }
      const unchanged = filteredOrder.length === previousManualOrder.length
        && filteredOrder.every((spotName, index) => previousManualOrder[index] === spotName);
      if (unchanged) {
        return previousManualOrder;
      }
      void AsyncStorage.setItem(spotManualOrderStorageKey, JSON.stringify(filteredOrder)).catch((error) => {
        console.error('Failed to persist spot manual order', error);
      });
      return filteredOrder;
    });
  }, [favoriteSpots]);

  const resetFlow = () => {
    setSelectedSpot(null);
    setShowProfile(false);
    setShowBuddies(false);
    setProfileNameInput('');
    setProfileAvatarInputUri(null);
    setProfileEditError('');
    setIsSavingProfile(false);
    setBuddyUsers([]);
    setSearchUsersInput('');
    setOutgoingFollowStatusesByUserId({});
    setFollowingUserIds([]);
    setIncomingFollowRequests([]);
    setFollowerUsers([]);
    setLoadingBuddies(false);
    setBuddyActionUserId(null);
    setFollowRequestActionId(null);
    setBuddiesError('');
    setSessionsBySpot(createSpotRecord(spotNames, () => []));
    setMessagesBySpot(createSpotRecord(spotNames, () => []));
  };

  const fetchBuddiesData = async () => {
    const activeProfileId = activeProfile?.id ?? null;
    if (!activeProfileId) {
      setBuddyUsers([]);
      setOutgoingFollowStatusesByUserId({});
      setFollowingUserIds([]);
      setIncomingFollowRequests([]);
      setFollowerUsers([]);
      return;
    }

    setLoadingBuddies(true);
    setBuddiesError('');
    

    const [usersResponse, followsResponse, incomingRequestsResponse, incomingAcceptedResponse] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .neq('id', activeProfileId)
        .order('display_name', { ascending: true }),
      supabase
        .from('user_follows')
        .select('id, follower_id, following_id, status, created_at, responded_at')
        .eq('follower_id', activeProfileId),
      supabase
        .from('user_follows')
        .select('id, follower_id, following_id, status, created_at, responded_at')
        .eq('following_id', activeProfileId)
        .eq('status', 'pending'),
      supabase
        .from('user_follows')
        .select('id, follower_id, following_id, status, created_at, responded_at')
        .eq('following_id', activeProfileId)
        .eq('status', 'accepted'),
    ]);

    if (usersResponse.error) {
      console.error('BUDDIES_USERS_LOAD_ERROR', usersResponse.error);
      
      setBuddiesError('Could not load users');
    } else {
      const loadedUsers = (usersResponse.data ?? []) as BuddyUser[];
      
      
      setBuddyUsers(loadedUsers);
    }

    if (followsResponse.error) {
      console.error('BUDDIES_FOLLOWING_LOAD_ERROR', followsResponse.error);
      setBuddiesError('Could not load buddies');
    } else {
      
      const outgoingStatuses = (followsResponse.data ?? []).reduce<Record<string, FollowStatus>>((acc, relation) => {
        acc[relation.following_id] = relation.status as FollowStatus;
        return acc;
      }, {});
      setOutgoingFollowStatusesByUserId(outgoingStatuses);
      const acceptedFollowingUserIds = (followsResponse.data ?? [])
        .filter((item) => item.status === 'accepted')
        .map((item) => item.following_id);
      
      
      setFollowingUserIds(acceptedFollowingUserIds);
    }

    if (incomingRequestsResponse.error || incomingAcceptedResponse.error) {
      console.error('BUDDIES_INCOMING_REQUESTS_LOAD_ERROR', incomingRequestsResponse.error);
      console.error('BUDDIES_INCOMING_ACCEPTED_LOAD_ERROR', incomingAcceptedResponse.error);
      setBuddiesError('Could not load follow requests');
    } else {
      const pendingIncomingRelations = (incomingRequestsResponse.data ?? []) as IncomingFollowRelation[];
      const acceptedIncomingRelations = (incomingAcceptedResponse.data ?? []) as IncomingFollowRelation[];
      
      
      const incomingRequesterIds = pendingIncomingRelations.map((requestItem) => requestItem.follower_id);
      const incomingAcceptedFollowerIds = acceptedIncomingRelations.map((relationItem) => relationItem.follower_id);
      const allIncomingUserIds = Array.from(new Set([...incomingRequesterIds, ...incomingAcceptedFollowerIds]));
      const incomingUsersById: Record<string, BuddyUser> = {};

      if (allIncomingUserIds.length > 0) {
        const incomingUsersResponse = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', allIncomingUserIds);

        if (incomingUsersResponse.error) {
          console.error('BUDDIES_INCOMING_REQUESTS_USERS_LOAD_ERROR', incomingUsersResponse.error);
          
          setBuddiesError('Could not load requesters');
        } else {
          
          (incomingUsersResponse.data ?? []).forEach((incomingUser) => {
            incomingUsersById[incomingUser.id] = incomingUser as BuddyUser;
          });
        }
      }

      const incomingRequests = pendingIncomingRelations.map((requestItem) => ({
        ...requestItem,
        requester: incomingUsersById[requestItem.follower_id] ?? null,
      }));
      const incomingFollowers = acceptedIncomingRelations
        .map((relationItem) => incomingUsersById[relationItem.follower_id] ?? null)
        .filter((userItem): userItem is BuddyUser => Boolean(userItem))
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
      
      
      setIncomingFollowRequests(incomingRequests);
      setFollowerUsers(incomingFollowers);
    }

    setLoadingBuddies(false);
  };

  const handleFollowUser = async (userIdToFollow: string) => {
    const activeProfileId = activeProfile?.id ?? null;
    const targetProfile = buddyUsers.find((userItem) => userItem.id === userIdToFollow) ?? null;
    
    
    if (!activeProfileId || !targetProfile || targetProfile.id === activeProfileId) {
      return;
    }

    const payload = {
      follower_id: activeProfileId,
      following_id: targetProfile.id,
      status: 'pending' as FollowStatus,
      responded_at: null as string | null,
    };
    const previousStatus = outgoingFollowStatusesByUserId[userIdToFollow];
    
    setBuddyActionUserId(userIdToFollow);
    setOutgoingFollowStatusesByUserId((previous) => ({ ...previous, [userIdToFollow]: 'pending' }));
    setFollowingUserIds((previous) => (Array.isArray(previous) ? previous : []).filter((id) => id !== userIdToFollow));

    const { data, error } = await supabase
      .from('user_follows')
      .upsert(payload, { onConflict: 'follower_id,following_id' })
      .select();
    
    if (error) {
      console.error('BUDDIES_FOLLOW_ERROR', error);
      setOutgoingFollowStatusesByUserId((previous) => {
        const nextValue = { ...previous };
        if (previousStatus) {
          nextValue[userIdToFollow] = previousStatus;
        } else {
          delete nextValue[userIdToFollow];
        }
        return nextValue;
      });
      setBuddyActionUserId(null);
      setBuddiesError('Follow failed');
      return;
    }

    
    setBuddyActionUserId(null);
    await fetchBuddiesData();
  };

  const handleUnfollowUser = async (userIdToUnfollow: string) => {
    if (!activeAppUserId || userIdToUnfollow === activeAppUserId) {
      return;
    }

    const payload = {
      follower_id: activeAppUserId,
      following_id: userIdToUnfollow,
    };
    
    setBuddyActionUserId(userIdToUnfollow);
    setFollowingUserIds((previous) => (Array.isArray(previous) ? previous : []).filter((id) => id !== userIdToUnfollow));
    setOutgoingFollowStatusesByUserId((previous) => {
      const nextValue = { ...previous };
      delete nextValue[userIdToUnfollow];
      return nextValue;
    });

    const { error } = await supabase
      .from('user_follows')
      .delete()
      .eq('follower_id', activeAppUserId)
      .eq('following_id', userIdToUnfollow);

    if (error) {
      console.error('BUDDIES_UNFOLLOW_ERROR', error);
      setFollowingUserIds((previous) => (previous.includes(userIdToUnfollow) ? previous : [...previous, userIdToUnfollow]));
      setOutgoingFollowStatusesByUserId((previous) => ({ ...previous, [userIdToUnfollow]: 'accepted' }));
      setBuddyActionUserId(null);
      setBuddiesError('Unfollow failed');
      return;
    }

    
    setBuddyActionUserId(null);
    await fetchBuddiesData();
  };

  const handleAcceptFollowRequest = async (requestItem: FollowRequestItem) => {
    const activeProfileId = activeProfile?.id ?? null;
    const targetProfile = requestItem.requester ?? null;
    
    
    if (!activeProfileId || !targetProfile || targetProfile.id === activeProfileId) {
      return;
    }

    const payload = {
      id: requestItem.id,
      follower_id: targetProfile.id,
      following_id: activeProfileId,
      status: 'accepted' as FollowStatus,
      responded_at: new Date().toISOString(),
    };
    
    setFollowRequestActionId(requestItem.id);
    const { data, error } = await supabase
      .from('user_follows')
      .update({ status: 'accepted', responded_at: payload.responded_at })
      .eq('id', requestItem.id)
      .eq('follower_id', payload.follower_id)
      .eq('following_id', payload.following_id)
      .select();
    

    if (error) {
      console.error('BUDDIES_ACCEPT_ERROR', error);
      setBuddiesError('Accept failed');
      setFollowRequestActionId(null);
      return;
    }

    
    setFollowRequestActionId(null);
    await fetchBuddiesData();
  };

  const handleRejectFollowRequest = async (requestItem: FollowRequestItem) => {
    const activeProfileId = activeProfile?.id ?? null;
    const targetProfile = requestItem.requester ?? null;
    if (!activeProfileId || !targetProfile || targetProfile.id === activeProfileId) {
      return;
    }

    const payload = {
      id: requestItem.id,
      follower_id: targetProfile.id,
      following_id: activeProfileId,
      status: 'rejected' as FollowStatus,
      responded_at: new Date().toISOString(),
    };
    
    setFollowRequestActionId(requestItem.id);
    const { error } = await supabase
      .from('user_follows')
      .update({ status: 'rejected', responded_at: payload.responded_at })
      .eq('id', requestItem.id)
      .eq('follower_id', payload.follower_id)
      .eq('following_id', payload.following_id);

    if (error) {
      console.error('BUDDIES_REJECT_ERROR', error);
      setBuddiesError('Decline failed');
      setFollowRequestActionId(null);
      return;
    }

    
    setFollowRequestActionId(null);
    await fetchBuddiesData();
  };

  const mapSessionStatus = (status: string): SessionStatus => {
    if (status === 'Ik ben geweest' || status === 'finished') {
      return 'Uitchecken';
    }

    if (status === 'cancelled' || status === 'canceled' || status === 'geannuleerd') {
      return 'Uitchecken';
    }

    if (status === 'Is er al' || status === 'Uitchecken' || status === 'live') {
      if (status === 'live') {
        return 'Is er al';
      }
      return status;
    }
    return 'Gaat';
  };
  const getSessionAutoCloseTimestamp = (sessionDate: Date) => {
    const now = new Date();
    const endOfSessionDate = new Date(sessionDate);
    endOfSessionDate.setHours(23, 59, 59, 999);
    const safeCloseDate = endOfSessionDate.getTime() > now.getTime() ? now : endOfSessionDate;
    return safeCloseDate.toISOString();
  };
  const normalizeLoadedSession = (row: {
    id: string;
    status: string;
    created_at: string | null;
    checked_in_at: string | null;
    checked_out_at: string | null;
  }) => {
    const mappedStatus = mapSessionStatus(row.status);
    const isActiveStatus = mappedStatus === 'Is er al' || row.status === 'live';
    const isStillOpen = row.checked_out_at === null;

    const staleReferenceIso = row.checked_in_at ?? row.created_at;
    const staleReferenceDate = staleReferenceIso ? new Date(staleReferenceIso) : null;
    const isValidStaleReference = staleReferenceDate !== null && !Number.isNaN(staleReferenceDate.getTime());
    const isStaleByDate = isValidStaleReference
      ? getLocalDateKey(staleReferenceDate) < getCurrentLocalDateKey()
      : false;

    if (!isActiveStatus || !isStillOpen || !isStaleByDate) {
      return {
        status: mappedStatus,
        checkedInAt: row.checked_in_at,
        checkedOutAt: row.checked_out_at,
      };
    }

    

    const autoClosedAt = getSessionAutoCloseTimestamp(staleReferenceDate);
    

    return {
      status: 'Uitchecken' as SessionStatus,
      checkedInAt: row.checked_in_at,
      checkedOutAt: autoClosedAt,
    };
  };
  const toSpotSession = (row: SessionAdapterRow, canonicalSpotName: SpotName): SpotSession => {    const normalizedSession = normalizeLoadedSession({
      id: row.id,
      status: row.status,
      created_at: row.created_at ?? null,
      checked_in_at: row.checked_in_at ?? null,
      checked_out_at: row.checked_out_at ?? null,
    });
    const session = {
      id: row.id,
      spot: canonicalSpotName,
      sessionDay: row.session_day ?? getSessionDayKey(row),
      sourceSessionId: row.source_session_id ?? null,
      start: (row.start_time ?? '').slice(0, 5),
      end: (row.end_time ?? '').slice(0, 5),
      status: normalizedSession.status,
      intent: resolveSessionIntent(row.intent),
      createdAt: row.created_at ?? null,
      checkedInAt: normalizedSession.checkedInAt,
      checkedOutAt: normalizedSession.checkedOutAt,
      userId: row.user_id ?? row.resolved_actor_profile_id ?? row.profile_id ?? row.created_by ?? '',
      userName: row.display_name?.trim() || 'Unknown rider',
      userAvatarUrl: row.avatar_url ?? null,
      userOwnerUid: row.owner_uid ?? null,
      resolvedActorProfileId: row.resolved_actor_profile_id ?? null,
    };    return session;
  };

  const fetchSpotDefinitions = async () => {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      fetch(`${SUPABASE_URL}/rest/v1/spots?select=*`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      })
        .then((res) => res.json())
        .then(() => undefined)
        .catch((error) => console.error('RAW_SPOTS_ERROR', error));
    }

    const { data, error } = await supabase
      .from('spots')
      .select('*');

    if (error) {
      console.error('Failed to load spots, falling back to local spots:', error);
      return;
    }

    const mappedSpots = (data ?? [])
      .map((row) => {
        const spotName = (row.spot_name ?? row.name ?? row.spot ?? '').toString().trim();
        const coordinateStatus = row.coordinate_status === 'verified' || row.coordinate_status === 'review' || row.coordinate_status === 'unverified'
          ? row.coordinate_status
          : 'unverified';
        const hasLaunchCoordinates =
          row.launch_latitude !== null
          && row.launch_latitude !== undefined
          && row.launch_longitude !== null
          && row.launch_longitude !== undefined;

        const shouldUseLaunchCoordinates =
          hasLaunchCoordinates
          && (
            coordinateStatus === 'verified'
            || coordinateStatus === 'review'
          );

        const rawLatitudeValue = Number(
          shouldUseLaunchCoordinates
            ? row.launch_latitude
            : row.latitude ?? row.lat ?? null
        );

        const rawLongitudeValue = Number(
          shouldUseLaunchCoordinates
            ? row.launch_longitude
            : row.longitude ?? row.lng ?? row.lon ?? null
        );
        const fallbackSpot = fallbackSpots.find((spot) => normalizeSpotName(spot.spot) === normalizeSpotName(spotName)) ?? null;

        const coordinatesInNormalOrderAreValid = Number.isFinite(rawLatitudeValue)
          && Number.isFinite(rawLongitudeValue)
          && Math.abs(rawLatitudeValue) <= 90
          && Math.abs(rawLongitudeValue) <= 180;
        const coordinatesInSwappedOrderAreValid = Number.isFinite(rawLatitudeValue)
          && Number.isFinite(rawLongitudeValue)
          && Math.abs(rawLongitudeValue) <= 90
          && Math.abs(rawLatitudeValue) <= 180;

        let latitudeValue = rawLatitudeValue;
        let longitudeValue = rawLongitudeValue;

        if (!coordinatesInNormalOrderAreValid && coordinatesInSwappedOrderAreValid) {
          latitudeValue = rawLongitudeValue;
          longitudeValue = rawLatitudeValue;
        } else if (coordinatesInNormalOrderAreValid && coordinatesInSwappedOrderAreValid && fallbackSpot) {
          const distanceToFallbackFromNormalOrder = getDistanceInMeters(
            rawLatitudeValue,
            rawLongitudeValue,
            fallbackSpot.latitude,
            fallbackSpot.longitude,
          );
          const distanceToFallbackFromSwappedOrder = getDistanceInMeters(
            rawLongitudeValue,
            rawLatitudeValue,
            fallbackSpot.latitude,
            fallbackSpot.longitude,
          );

          if (distanceToFallbackFromSwappedOrder < distanceToFallbackFromNormalOrder) {
            latitudeValue = rawLongitudeValue;
            longitudeValue = rawLatitudeValue;
          }
        }

        

        if (!spotName || Number.isNaN(latitudeValue) || Number.isNaN(longitudeValue)) {
          return null;
        }

        const canonicalName = normalizeSpotName(
          (row.canonical_name ?? spotName).toString()
        );

        const fallbackSpotMatch =
          fallbackSpots.find(
            (spot) =>
              normalizeSpotName(spot.spot) === canonicalName
          ) ?? null;

        const shouldUseFallbackCoordinates =
          coordinateStatus !== 'verified'
          && fallbackSpotMatch;

        return {
          spot: spotName,
          canonicalName,
          latitude: shouldUseFallbackCoordinates
            ? fallbackSpotMatch.latitude
            : latitudeValue,
          longitude: shouldUseFallbackCoordinates
            ? fallbackSpotMatch.longitude
            : longitudeValue,
          coordinateStatus,
        } satisfies SpotDefinition;
      })
      .filter((spot): spot is SpotDefinition => Boolean(spot));

    if (mappedSpots.length === 0) {
      console.error('Spots table is empty or unreadable, falling back to local spots');
      return;
    }

    
    console.log('SPOT_DEFINITIONS_DEBUG', mappedSpots.map((spot) => ({
      spot: spot.spot,
      canonicalName: spot.canonicalName,
      latitude: spot.latitude,
      longitude: spot.longitude,
      coordinateStatus: spot.coordinateStatus,
    })));

    setSpotDefinitions(mappedSpots);
  };

  const selectedDayKey = activeDay === 'today' ? getTodayLocalDateKey() : getTomorrowLocalDateKey();

  useEffect(() => {
    if (!activeGroupChatKey || !selectedSpot || !selectedDayKey) {
      setGroupMessages([]);
      return;
    }

    let isCancelled = false;

    const loadGroupMessages = async () => {
      const conversationResponse = await supabase
        .from('conversations')
        .select('id')
        .eq('type', 'group')
        .eq('spot_name', selectedSpot)
        .eq('session_day', selectedDayKey)
        .eq('group_key', activeGroupChatKey)
        .limit(1);

      const conversationId = Array.isArray(conversationResponse.data)
        ? conversationResponse.data[0]?.id ?? null
        : null;

      if (!conversationId) {
        if (!isCancelled) setGroupMessages([]);
        return;
      }

      const messagesResponse = await supabase
        .from('messages')
        .select('id, user_id, text, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (messagesResponse.error) {
        console.error('GROUP_CHAT_FETCH_ERROR', messagesResponse.error);
        return;
      }

      const rows = messagesResponse.data ?? [];
      const userIds = [...new Set(rows.map((message) => message.user_id).filter(Boolean))];

      const profilesResponse = userIds.length
        ? await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', userIds)
        : { data: [], error: null };

      if (profilesResponse.error) {
        console.error('GROUP_CHAT_PROFILES_ERROR', profilesResponse.error);
        return;
      }

      const profilesById = new Map((profilesResponse.data ?? []).map((profile) => [profile.id, profile]));

      const nextMessages = rows.map((message) => {
        const profile = message.user_id ? profilesById.get(message.user_id) : null;
        return {
          id: message.id,
          text: message.text,
          userId: message.user_id,
          display_name: profile?.display_name?.trim() || 'Unknown rider',
          avatar_url: profile?.avatar_url ?? null,
          created_at: message.created_at,
          createdAt: message.created_at,
        };
      });

      console.log('GROUP_CHAT_FETCH_RESULT', {
        groupKey: activeGroupChatKey,
        count: nextMessages.length,
      });

      if (!isCancelled) setGroupMessages(nextMessages);
    };

    void loadGroupMessages();

    return () => {
      isCancelled = true;
    };
  }, [activeGroupChatKey, selectedSpot, selectedDayKey, groupMessagesRefreshKey]);


  const fetchSharedData = async ({ skipLoadingState = false }: { skipLoadingState?: boolean } = {}) => {
    if (!skipLoadingState) {
      setLoadingData(true);
    }
    console.log('JOIN_MODEL_SELECTED', {
      rootCause: 'E',
      readTarget: 'sessions',
      writeTarget: 'sessions',
    });
    
    
    

    const dayBounds = getDayBoundsForDayKey(selectedDayKey);
    const sessionsResponse = dayBounds
      ? await supabase
          .from('sessions')
          .select('*')
          .eq('session_day', selectedDayKey)
          .order('created_at', { ascending: true })
      : { data: [], error: { message: 'INVALID_DAY_KEY' } };
    const sessionsData = sessionsResponse.data ?? [];
    console.log('RAW_SCHEVENINGEN_SESSION_ROWS', sessionsData
      .filter((row) => String(row.spot_name ?? '').toLowerCase().includes('scheveningen'))
      .map((row) => ({
        id: row.id,
        spot_name: row.spot_name,
        status: row.status,
        start_time: row.start_time,
        end_time: row.end_time,
        session_day: row.session_day,
        user_id: row.user_id,
      }))
    );
    const conversationResponse = selectedSpot && selectedDayKey
      ? await supabase
          .from('conversations')
          .select('id')
          .eq('type', 'spot')
          .eq('spot_name', selectedSpot)
          .eq('session_day', selectedDayKey)
          .limit(1)
      : { data: [], error: null };

    const conversationId = Array.isArray(conversationResponse.data)
      ? conversationResponse.data[0]?.id ?? null
      : null;

    console.log("CHAT_CONVERSATION_FETCH", {
      selectedSpot,
      selectedDayKey,
      conversationId,
      error: conversationResponse.error?.message ?? null,
    });

    const messagesResponse = conversationId
      ? await supabase
          .from('messages')
          .select('id, user_id, text, spot_name, created_at, session_day, conversation_id')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
      : { data: [], error: null };
    const messagesData = messagesResponse.data ?? [];
    const rows = messagesData;    const messagesError = messagesResponse.error;
    if (!selectedSpot) {
      
    }
    

    const sessionIdentityValues = [...new Set(
      sessionsData
        .flatMap((sessionRow) => [sessionRow.user_id, sessionRow.profile_id, sessionRow.created_by, sessionRow.owner_uid])
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    )];
    const { data: profilesByIdData, error: profilesByIdError } = sessionIdentityValues.length
      ? await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, owner_uid')
          .in('id', sessionIdentityValues)
      : { data: [], error: null };
    const { data: profilesByOwnerUidData, error: profilesByOwnerUidError } = sessionIdentityValues.length
      ? await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, owner_uid')
          .in('owner_uid', sessionIdentityValues)
      : { data: [], error: null };
    const profilesData = [...(profilesByIdData ?? []), ...(profilesByOwnerUidData ?? [])];
    
    if (profilesByIdError || profilesByOwnerUidError) {
      console.error('Failed to load profiles for sessions:', profilesByIdError ?? profilesByOwnerUidError);
    }

    if (sessionsResponse.error) {
      console.error('Failed to load sessions:', sessionsResponse.error);
    } else {
      const nextSessionsBySpot = createSpotRecord<SpotSession[]>(spotNames, () => []);
      const canonicalSpotNameByNormalizedSpotName = new Map<string, SpotName>();
      for (const spotName of spotNames) {
        const normalizedSpotName = normalizeSpotName(spotName);
        if (!canonicalSpotNameByNormalizedSpotName.has(normalizedSpotName)) {
          canonicalSpotNameByNormalizedSpotName.set(normalizedSpotName, spotName);
        }
      }

      const profilesById = new Map((profilesData ?? []).map((profile) => [profile.id, profile]));
      const profilesByOwnerUid = new Map<string, Array<(typeof profilesData)[number]>>();
      for (const profileItem of profilesData ?? []) {
        if (!profileItem.owner_uid) {
          continue;
        }
        const current = profilesByOwnerUid.get(profileItem.owner_uid) ?? [];
        current.push(profileItem);
        profilesByOwnerUid.set(profileItem.owner_uid, current);
      }
      const mergedSessions = sessionsData.map((row) => {
        const sessionOwnerAuthUserId = (row.owner_uid ?? null) || (typeof row.user_id === 'string' && profilesByOwnerUid.has(row.user_id) ? row.user_id : null);
        const directProfile = (typeof row.user_id === 'string' ? profilesById.get(row.user_id) : null)
          ?? (typeof row.profile_id === 'string' ? profilesById.get(row.profile_id) : null)
          ?? (typeof row.created_by === 'string' ? profilesById.get(row.created_by) : null)
          ?? null;
        const ownerProfiles = sessionOwnerAuthUserId ? profilesByOwnerUid.get(sessionOwnerAuthUserId) ?? [] : [];
        const sessionDisplayName = typeof row.display_name === 'string' ? row.display_name : null;
        const profileFromDisplayName = sessionDisplayName
          ? ownerProfiles.find((profileItem) => normalizeDisplayName(profileItem.display_name) === normalizeDisplayName(sessionDisplayName))
          : null;
        const fallbackOwnerProfile = ownerProfiles.length === 1 ? ownerProfiles[0] : null;
        const resolvedProfile = directProfile ?? profileFromDisplayName ?? fallbackOwnerProfile ?? null;
        return {
          ...row,
          display_name: resolvedProfile?.display_name?.trim() || sessionDisplayName?.trim() || 'Unknown rider',
          avatar_url: resolvedProfile?.avatar_url ?? null,
          owner_uid: resolvedProfile?.owner_uid ?? sessionOwnerAuthUserId ?? row.owner_uid ?? null,
          resolved_actor_profile_id: resolvedProfile?.id ?? null,
        };
      });
      

      for (const row of mergedSessions) {
        const normalizedSpotName = normalizeSpotName(row?.spot_name ?? '');
        const resolvedSpotName = canonicalSpotNameByNormalizedSpotName.get(normalizedSpotName) ?? null;
        const droppedRow = !resolvedSpotName;
        console.log("CANONICAL_SPOT_RESOLUTION", {
          rawSpotName: row?.spot_name ?? null,
          normalizedSpotName: normalizedSpotName ?? null,
          resolvedSpotName: resolvedSpotName ?? null,
          dropped: droppedRow === true
        });
        if (droppedRow) {
          console.warn("FALLBACK_SPOT_USED", row?.spot_name);
          // fallback: use raw spot name instead of dropping
          const fallbackSpotName = row?.spot_name;
          if (!fallbackSpotName || !nextSessionsBySpot[fallbackSpotName]) {
            continue;
          }
          const mappedSession = toSpotSession(row, fallbackSpotName);
          nextSessionsBySpot[fallbackSpotName].push(mappedSession);
          continue;
        }

        const mappedSession = toSpotSession(row, resolvedSpotName);
        console.log("CANONICAL_SESSION_ROW", {
          id: mappedSession?.id ?? null,
          spot: mappedSession?.spot ?? null,
          sessionDay: mappedSession?.sessionDay ?? null,
          userId: mappedSession?.userId ?? null,
          start: mappedSession?.start ?? null,
          end: mappedSession?.end ?? null
        });
        nextSessionsBySpot[resolvedSpotName].push(mappedSession);
      }
      console.log("SESSION_ADAPTER_BOUNDARY_ACTIVE", {
        totalCanonicalSessions: Object.values(nextSessionsBySpot ?? {}).flat().length
      });

      const loadedSessions = Object.values(nextSessionsBySpot).flat();
      console.log('OWN_SESSION_MATCH', {
        activeDay: selectedDayKey,
        matches: loadedSessions.filter((sessionItem) => sessionItem.sessionDay === selectedDayKey).map((sessionItem) => sessionItem.id),
      });
      console.log('SPOT_SESSION_BUCKET_DEBUG_DETAILED', Object.fromEntries(
        Object.entries(nextSessionsBySpot).map(([spotName, spotSessions]) => [
          spotName,
          (spotSessions ?? []).map((sessionItem) => ({
            id: sessionItem.id,
            spot: sessionItem.spot,
            userName: sessionItem.userName,
            start: sessionItem.start,
            end: sessionItem.end,
            status: sessionItem.status,
          })),
        ])
      ));

      setSessionsBySpot(nextSessionsBySpot);
    }

    if (messagesError) {
      console.error("MESSAGES QUERY ERROR", messagesError);
      console.error('Failed to load messages:', messagesError);
    }

    const profilesError = profilesByIdError ?? profilesByOwnerUidError ?? null;
    if (profilesError) {
      console.error("PROFILES QUERY ERROR", profilesError);
      console.error('Failed to load profiles:', profilesError);
    }

    if (messagesError || profilesError) {
      if (!skipLoadingState) {
        setLoadingData(false);
      }
      return;
    }

    if (!messagesError) {
      const messageUserIds = [...new Set((messagesData ?? []).map((message) => message.user_id).filter(Boolean))];
      const { data: messageProfilesData, error: messageProfilesError } = messageUserIds.length
        ? await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', messageUserIds)
        : { data: [], error: null };

      if (messageProfilesError) {
        console.error('Failed to load message profiles:', messageProfilesError);
        if (!skipLoadingState) {
          setLoadingData(false);
        }
        return;
      }

      const profilesById = new Map((messageProfilesData ?? []).map((profile) => [profile.id, profile]));
      const mergedMessages = (messagesData ?? []).map((message) => {
        const profile = message.user_id ? profilesById.get(message.user_id) : null;
        return {
          ...message,
          display_name: profile?.display_name?.trim() || 'Unknown rider',
          avatar_url: profile?.avatar_url ?? null,
        };
      });
      

      const nextMessagesBySpot: Record<string, ChatMessage[]> = {};

      for (const row of mergedMessages) {
        const spot = row.spot_name as SpotName;
        const key = `${spot}-${selectedDayKey}`;
        if (!spotNames.includes(spot)) {
          continue;
        }

        nextMessagesBySpot[key] = nextMessagesBySpot[key] || [];
        nextMessagesBySpot[key].push({
          id: row.id,
          text: row.text,
          userId: row.user_id,
          display_name: row.display_name,
          avatar_url: row.avatar_url,
          created_at: row.created_at,
          createdAt: row.created_at,
        });
      }

      setMessagesBySpot(nextMessagesBySpot);
    } else {
      
    }

    if (!skipLoadingState) {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    
    supabase.auth.getSession().then(({ data }) => {
      const nextSession = data.session;
      setSession(nextSession);
      setLoadingSession(false);
      

      if (nextSession) {
        void fetchSpotDefinitions();
        void hydrateActiveProfile(nextSession.user, 'auth_session_initialized');
        void fetchSharedData();
      } else {
        setSwitchableAccounts([]);
        setProfile(null);
        activeProfileOwnerUidRef.current = null;
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);

      if (!nextSession) {
        setSwitchableAccounts([]);
        setProfile(null);
        activeProfileOwnerUidRef.current = null;
        resetFlow();
        return;
      }

      if (activeProfileOwnerUidRef.current === nextSession.user.id && activeProfileIdRef.current) {
        
        return;
      }

      void hydrateActiveProfile(nextSession.user, 'auth_user_changed');
      void fetchSpotDefinitions();
      void fetchSharedData();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const headerProfile = activeProfile
    ? {
      userId: activeProfile.id,
      displayName: activeProfile.display_name,
      avatarUrl: activeProfile.avatar_url,
    }
    : null;

  useEffect(() => {
    
  }, [authenticatedUserId, headerProfile?.avatarUrl, headerProfile?.displayName, headerProfile?.userId]);

  useEffect(() => {
    return () => {
      if (realtimeRefetchTimeoutRef.current) {
        clearTimeout(realtimeRefetchTimeoutRef.current);
        realtimeRefetchTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (showProfile && profile) {
      setProfileNameInput(profile.display_name);
    }
  }, [showProfile, profile]);

  useEffect(() => {
    if (!showProfile || !isAccountSwitcherVisible) {
      return;
    }

    void loadOwnedProfiles();
  }, [showProfile, isAccountSwitcherVisible]);

  useEffect(() => {
    if (!showBuddies || !activeAppUserId) {
      return;
    }

    void fetchBuddiesData();
  }, [showBuddies, activeAppUserId]);

  useEffect(() => {
    if (!activeAppUserId) {
      setFollowingUserIds([]);
      return;
    }

    void (async () => {
      
      const { data, error } = await supabase
        .from('user_follows')
        .select('follower_id, following_id, status')
        .or(`and(follower_id.eq.${activeAppUserId},status.eq.accepted),and(following_id.eq.${activeAppUserId},status.eq.accepted)`)
        .eq('status', 'accepted');

      if (error) {
        console.error('TIMELINE_FOLLOWING_USERS_LOAD_ERROR', error);
        return;
      }

      const buddyRelations = data ?? [];
      
      const buddyProfileIds = Array.from(
        new Set(
          buddyRelations
            .map((item) => (item.follower_id === activeAppUserId ? item.following_id : item.follower_id))
            .filter((id): id is string => Boolean(id && id !== activeAppUserId)),
        ),
      );
      
      setFollowingUserIds(buddyProfileIds);
    })();
  }, [activeAppUserId, activeProfile?.id]);

  useEffect(() => {
    setSessionsBySpot((previous) => {
      const next = createSpotRecord<SpotSession[]>(spotNames, () => []);
      for (const spot of spotNames) {
        next[spot] = previous[spot] ?? [];
      }
      return next;
    });
    // FIX: do not reset messagesBySpot (we use spot+day keys now)
setMessagesBySpot((previous) => previous);
  }, [spotNames]);

  useEffect(() => {
    if (!selectedSpot) {
      return;
    }

    if (!spotNames.includes(selectedSpot)) {
      const selectedCanonicalName = normalizeSpotName(selectedSpot);
      const replacementSpot = spotDefinitions.find((spot) =>
        spot.canonicalName === selectedCanonicalName
        || normalizeSpotName(spot.spot) === selectedCanonicalName
      )?.spot ?? null;
      if (replacementSpot) {
        setSelectedSpot(replacementSpot);
        return;
      }

      console.error('SPOT_DETAIL_SELECTED_SPOT_MISSING', { selectedSpot });
      setSelectedSpot(null);
    }
  }, [selectedSpot, spotDefinitions, spotNames]);


  useEffect(() => {
    if (!activeAppUserId || spotNames.length === 0) {
      return;
    }

    void fetchSharedData();
  }, [activeAppUserId, spotNames]);

  useEffect(() => {
    if (!activeAppUserId || spotNames.length === 0) {
      return;
    }

    const realtimeChannel = supabase
      .channel('sessions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        (payload) => {
          const newRecord = payload?.new as { id?: string; spot_name?: string } | null;
          const oldRecord = payload?.old as { id?: string; spot_name?: string } | null;

          console.log('SESSIONS_REALTIME_EVENT', {
            eventType: payload?.eventType ?? null,
            table: payload?.table ?? null,
            recordId: newRecord?.id ?? oldRecord?.id ?? null,
          });

          const payloadSpot = newRecord?.spot_name
            ?? oldRecord?.spot_name
            ?? null;
          if (selectedSpot && payloadSpot && normalizeSpotName(payloadSpot) !== normalizeSpotName(selectedSpot)) {
            return;
          }

          scheduleRealtimeRefetch();
        },
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          return;
        }

        console.log('SESSIONS_REALTIME_SUBSCRIBED', {
          selectedSpot: (selectedSpot as { name?: string } | null)?.name ?? selectedSpot ?? null,
          activeDay,
        });
      });

    return () => {
      void supabase.removeChannel(realtimeChannel);
      console.log('SESSIONS_REALTIME_UNSUBSCRIBED');
    };
  }, [activeAppUserId, activeDay, selectedSpot, selectedDayKey, spotNames]);

  useEffect(() => {
    if (!activeAppUserId || !selectedSpot) {
      return;
    }

    const realtimeChannel = supabase
      .channel(`messages-realtime-${selectedSpot}-${selectedDayKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          const nextRow = payload?.new as { spot_name?: string | null; session_day?: string | null } | null;
          const oldRow = payload?.old as { spot_name?: string | null; session_day?: string | null } | null;
          const payloadSpot = nextRow?.spot_name ?? oldRow?.spot_name ?? null;
          const payloadDay = nextRow?.session_day ?? oldRow?.session_day ?? null;

          if (payloadSpot !== selectedSpot || payloadDay !== selectedDayKey) {
            return;
          }

          console.log('MESSAGES_REALTIME_EVENT', {
            eventType: payload?.eventType ?? null,
            selectedSpot,
            selectedDayKey,
          });

          scheduleRealtimeRefetch();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('MESSAGES_REALTIME_SUBSCRIBED', {
            selectedSpot,
            selectedDayKey,
          });
        }
      });

    return () => {
      void supabase.removeChannel(realtimeChannel);
      console.log('MESSAGES_REALTIME_UNSUBSCRIBED');
    };
  }, [activeAppUserId, selectedSpot, selectedDayKey]);

  useEffect(() => {
    setHomeQuickCheckInError('');
  }, []);

  useEffect(() => {
    if (!selectedSpot) {
      setHomeQuickCheckInError('');
    }
  }, [selectedSpot]);

  useEffect(() => {
    
  }, [showForm]);

  useEffect(() => {
    if (!selectedSpot) {
      return;
    }

    console.log("CHAT_LOAD_TRIGGER", {
      selectedSpot: (selectedSpot as { name?: string } | null)?.name ?? selectedSpot ?? null,
      triggered: true
    });

    let isCancelled = false;

    const loadMessagesForSelectedSpot = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, user_id, text, spot_name, created_at')
        .eq('spot_name', selectedSpot)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Failed to load messages:', error);
        return;
      }

      const rows = data ?? [];
      console.log("CHAT_FETCH_RESULT", {
        selectedSpot: (selectedSpot as { name?: string } | null)?.name ?? selectedSpot ?? null,
        count: rows?.length ?? 0
      });

      const messageUserIds = [...new Set(rows.map((message) => message.user_id).filter(Boolean))];
      const { data: messageProfilesData, error: messageProfilesError } = messageUserIds.length
        ? await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', messageUserIds)
        : { data: [], error: null };

      if (messageProfilesError) {
        console.error('Failed to load message profiles:', messageProfilesError);
        return;
      }

      if (isCancelled) {
        return;
      }

      const profilesById = new Map((messageProfilesData ?? []).map((profile) => [profile.id, profile]));
      const messages = rows.map((message) => {
        const profile = message.user_id ? profilesById.get(message.user_id) : null;
        return {
          id: message.id,
          text: message.text,
          userId: message.user_id,
          display_name: profile?.display_name?.trim() || 'Unknown rider',
          avatar_url: profile?.avatar_url ?? null,
          created_at: message.created_at,
          createdAt: message.created_at,
        };
      });

      setMessagesBySpot((previous) => {
        const next = { ...previous };
        next[selectedSpot] = messages;
        return next;
      });

    };

    void loadMessagesForSelectedSpot();

    return () => {
      isCancelled = true;
    };
  }, [selectedSpot]);

  useEffect(() => {
    let isCancelled = false;

    const loadSpotNotificationPreferences = async () => {
      const { userId: persistedUserId, spotName: normalizedSpotName } = buildSpotNotificationPreferenceKey({
        userId: activeProfile?.id ?? null,
        spotName: getSelectedSpotName(selectedSpot),
      });
      console.log("SESSION_JOINED_PREF_LOAD_INPUT", {
        userId: persistedUserId ?? null,
        selectedSpot: selectedSpot ?? null,
        normalizedSpotName: normalizedSpotName ?? null
      });
      if (!normalizedSpotName || !persistedUserId) {
        setSpotNotificationPreferences(defaultSpotNotificationPreferences);
        setNotificationPreferencesError('');
        setLoadingSpotNotificationPreferences(false);
        return;
      }

      setLoadingSpotNotificationPreferences(true);
      setNotificationPreferencesError('');
      

      const { data, error } = await supabase
        .from('spot_notification_preferences')
        .select(`
          session_planning_notification_mode,
          checkin_notification_mode,
          chat_notification_mode,
          session_joined_notification_mode
        `)
        .eq('user_id', persistedUserId)
        .eq('spot_name', normalizedSpotName)
        .maybeSingle();

      if (isCancelled) {
        return;
      }

      if (error) {
        console.error('Failed to load notification preferences:', error);
        setSpotNotificationPreferences(defaultSpotNotificationPreferences);
        setNotificationPreferencesError('Could not load notification preferences.');
        setLoadingSpotNotificationPreferences(false);
        return;
      }

      const preferenceRow = data;
      console.log("SESSION_JOINED_PREF_LOAD_RAW", {
        row: preferenceRow ?? null
      });
      const normalizedPreferences = normalizeSpotNotificationPreferences(data);
      console.log("SESSION_JOINED_PREF_LOAD_NORMALIZED", {
        session_joined_notification_mode: normalizedPreferences.session_joined_notification_mode
      });
      setSpotNotificationPreferences(normalizedPreferences);
      
      setLoadingSpotNotificationPreferences(false);
    };

    void loadSpotNotificationPreferences();

    return () => {
      isCancelled = true;
    };
  }, [selectedSpot, activeProfile?.id]);

  useEffect(() => {
    setIsNotificationPanelExpanded(false);
  }, [selectedSpot]);

  useEffect(() => {
    setCurrentLocalMinutes(getCurrentLocalMinutes());
    setCurrentLocalDateKey(getCurrentLocalDateKey());

    const interval = setInterval(() => {
      setCurrentLocalMinutes(getCurrentLocalMinutes());
      setCurrentLocalDateKey(getCurrentLocalDateKey());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [selectedSpot]);

  const gpsActiveCheckedInSession = useMemo(() => {
    const allSessions = Object.values(sessionsBySpot).flat();
    return getCurrentUserLiveSession(allSessions, activeAppUserId);
  }, [activeAppUserId, sessionsBySpot]);

  useEffect(() => {
    if (isNativePlatform) {
      return;
    }

    let active = true;
    setIsResolvingNearestSpot(true);
    

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setCurrentCoordinates(null);
      setNearestSpotResult(null);
      setIsResolvingNearestSpot(false);
      const error = {
        reason: 'GEOLOCATION_UNAVAILABLE',
        platform: Platform.OS,
      };
      
      return () => {
        active = false;
      };
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!active) {
          return;
        }

        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const coordinates = {
          latitude,
          longitude,
        };
        setCurrentCoordinates(coordinates);
        const nearest = getNearestSpot(coordinates, verifiedSpotDefinitions);
        setNearestSpotResult(nearest);
        
        setIsResolvingNearestSpot(false);
      },
      (error) => {
        if (!active) {
          return;
        }

        setCurrentCoordinates(null);
        setNearestSpotResult(null);
        setIsResolvingNearestSpot(false);
        
      },
      {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 45_000,
      },
    );

    return () => {
      active = false;
    };
  }, [isNativePlatform, verifiedSpotDefinitions]);

  useEffect(() => {
    let active = true;

    const stopWatcher = (reason: string) => {
      if (!gpsWatcherRef.current) {
        gpsWatcherSessionIdRef.current = null;
        return;
      }

      gpsWatcherRef.current.remove();
      gpsWatcherRef.current = null;
      gpsWatcherSessionIdRef.current = null;
      
    };

    if (!isNativePlatform) {
      stopWatcher('NON_NATIVE_PLATFORM');
      
      return () => {
        active = false;
      };
    }

    const shouldRunGpsWatcher = Boolean(
      gpsActiveCheckedInSession
      && (gpsActiveCheckedInSession.status === 'live' || gpsActiveCheckedInSession.status === 'Is er al'),
    );
    if (!shouldRunGpsWatcher || !gpsActiveCheckedInSession) {
      
      setCurrentCoordinates(null);
      setNearestSpotResult(null);
      setIsResolvingNearestSpot(false);
      stopWatcher('NO_ACTIVE_SESSION');
      return () => {
        active = false;
      };
    }

    if (gpsWatcherRef.current && gpsWatcherSessionIdRef.current === gpsActiveCheckedInSession.id) {
      return () => {
        active = false;
      };
    }

    const startToken = gpsWatcherStartTokenRef.current + 1;
    gpsWatcherStartTokenRef.current = startToken;

    const startLocationMonitoring = async () => {
      setIsResolvingNearestSpot(true);

      try {
        const permissionResponse = await Location.requestForegroundPermissionsAsync();
        if (!active || gpsWatcherStartTokenRef.current !== startToken) {
          return;
        }

        setLocationPermissionStatus(permissionResponse.status);
        

        if (permissionResponse.status !== 'granted') {
          stopWatcher('PERMISSION_NOT_GRANTED');
          setCurrentCoordinates(null);
          setNearestSpotResult(null);
          setIsResolvingNearestSpot(false);
          return;
        }

        const applyCoordinates = (coordinates: SpotCoordinates) => {
          setCurrentCoordinates(coordinates);
          const nearest = getNearestSpot(coordinates, verifiedSpotDefinitions);
          setNearestSpotResult(nearest);
          
        };

        const currentPosition = await Location.getCurrentPositionAsync({});
        if (!active || gpsWatcherStartTokenRef.current !== startToken) {
          return;
        }

        applyCoordinates({
          latitude: currentPosition.coords.latitude,
          longitude: currentPosition.coords.longitude,
        });

        stopWatcher('RESTART_MONITORING');
        const nextWatcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 75,
          },
          (position) => {
            if (!active || gpsWatcherStartTokenRef.current !== startToken) {
              return;
            }

            applyCoordinates({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          },
        );

        if (!active || gpsWatcherStartTokenRef.current !== startToken) {
          nextWatcher.remove();
          return;
        }

        gpsWatcherRef.current = nextWatcher;
        gpsWatcherSessionIdRef.current = gpsActiveCheckedInSession.id;
        
      } catch (error) {
        if (!active) {
          return;
        }

        stopWatcher('MONITORING_ERROR');
        setCurrentCoordinates(null);
        setNearestSpotResult(null);
        console.error('Failed to monitor location:', error);
      } finally {
        if (active) {
          setIsResolvingNearestSpot(false);
        }
      }
    };

    void startLocationMonitoring();

    return () => {
      active = false;
      if (gpsWatcherSessionIdRef.current === gpsActiveCheckedInSession.id) {
        stopWatcher('EFFECT_CLEANUP');
      }
    };
  }, [gpsActiveCheckedInSession, isNativePlatform, verifiedSpotDefinitions]);

  useEffect(() => {
    
  }, [nearestSpotResult]);

  const activeDayContext = useMemo(() => {
    const base = new Date();
    const start = new Date(base);
    if (activeDay === 'today') {
      start.setHours(0, 0, 0, 0);
    } else {
      start.setDate(start.getDate() + 1);
      start.setHours(0, 0, 0, 0);
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const dateKey = getLocalDateKey(start);
    return { activeDateStart: start, activeDateEnd: end, activeDateKey: dateKey };
  }, [activeDay]);
  const { activeDateStart, activeDateEnd, activeDateKey } = activeDayContext;
  const activeCheckedInSession = useMemo(() => {
    const allSessions = Object.values(sessionsBySpot).flat();
    const userId = activeAppUserId;
    const chosenSession = getCurrentUserActiveCheckedInSessionForDay({
      sessions: allSessions,
      userId,
      activeDateStart,
      activeDateEnd,
    });
    const activeUserSessions = userId
      ? allSessions
        .filter((sessionItem) => sessionItem.userId === userId)
        .filter((sessionItem) => Boolean(sessionItem.checkedInAt))
        .filter((sessionItem) => !sessionItem.checkedOutAt)
        .filter((sessionItem) => sessionItem.status === 'Is er al' || sessionItem.status === 'live')
        .filter((sessionItem) => Boolean(sessionItem.checkedInAt) && isIsoInRange(sessionItem.checkedInAt, activeDateStart, activeDateEnd))
        .filter((sessionItem) => isLiveSession(sessionItem))
        .filter((sessionItem) => !isSessionExpired(sessionItem))
      : [];
    const duplicateCount = activeUserSessions.length > 1 ? activeUserSessions.length - 1 : 0;
    if (userId && chosenSession) {
      
    }
    return chosenSession;
  }, [activeDateEnd, activeDateStart, activeAppUserId, sessionsBySpot]);
  const hasActiveCheckedInSession = Boolean(activeCheckedInSession);
  const activeDayKey = activeDay === 'today' ? getTodayLocalDateKey() : getTomorrowLocalDateKey();
  const sessions = selectedSpot && Array.isArray(sessionsBySpot[selectedSpot])
    ? sessionsBySpot[selectedSpot]
    : [];

  console.log('SELECTED_SPOT_SESSION_DEBUG', {
    selectedSpot,
    sessionCount: sessions.length,
    sessions: sessions.map((s) => ({
      id: s.id,
      spot: s.spot,
      status: s.status,
      start: s.start,
      end: s.end,
    })),
  });
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const timelineSessions = useMemo(() => {
    const safeTimelineSessions = Array.isArray(sessions) ? sessions : [];
    const dedupedSessions = Array.from(new Map(safeTimelineSessions.map((item) => [item.id, item])).values());
    const filteredSessions = (Array.isArray(dedupedSessions) ? dedupedSessions : []).filter((item) => {
      const sameDay = item.sessionDay === activeDayKey;
      const state = getSessionViewState(item);
      console.log('TIMELINE_FILTER_REASON', {
        id: item.id,
        userId: item.userId,
        userName: item.userName,
        sessionDay: item.sessionDay,
        activeDayKey,
        start: item.start,
        end: item.end,
        status: item.status,
        sameDay,
        state,
        kept: sameDay && state !== 'finished',
      });

      if (!sameDay) {
        return false;
      }

      return state !== 'finished';
    });

    const visibleSessions = Array.isArray(filteredSessions) ? filteredSessions : [];
    return visibleSessions
      .map((item) => {
        const viewState = getSessionViewState(item);
        const state: TimelineState = viewState === 'live' ? 'live' : 'planned';
        const startMinutes = hasPlannedTimeWindow(item) ? toMinutes(item.start) : null;
        const checkedInMinutes = getLocalMinutesFromIso(item.checkedInAt);
        const checkedOutMinutes = getLocalMinutesFromIso(item.checkedOutAt);
        const fallbackMinutes = getLocalMinutesFromIso(item.createdAt) ?? timelineStartMinutes;
        const sortMinutes = checkedInMinutes ?? startMinutes ?? checkedOutMinutes ?? fallbackMinutes;

        return {
          item,
          state,
          isBuddy: followingUserIds.includes(item.userId),
          sortMinutes,
        };
      })
      .sort((a, b) => {
        if (a.isBuddy !== b.isBuddy) {
          return a.isBuddy ? -1 : 1;
        }

        const byStatus = getTimelineStatusOrder(a.state) - getTimelineStatusOrder(b.state);
        if (byStatus !== 0) {
          return byStatus;
        }

        if (a.sortMinutes !== b.sortMinutes) {
          return a.sortMinutes - b.sortMinutes;
        }

        return a.item.userName.localeCompare(b.item.userName, 'nl-NL');
      });
  }, [activeDateEnd, activeDateStart, followingUserIds, sessions, activeDayKey]);
  const spotState = useMemo(
    () =>
      buildSpotDetailState({
        sessions: safeSessions,
        selectedSpot,
        activeDayKey,
        activeProfile,
        timelineSessions,
        timelineFilter,
        followingUserIds,
      }),
    [safeSessions, selectedSpot, activeDayKey, activeProfile, timelineSessions, timelineFilter, followingUserIds],
  );
  useEffect(() => {
    
  }, [activeDay]);
  useEffect(() => {
    
  }, [activeCheckedInSession, activeDay, hasActiveCheckedInSession, selectedSpot, activeAppUserId]);
  useEffect(() => {
    
  }, [activeDay]);
  const plannedSession = useMemo(() => {
    const currentUserId = activeAppUserId;
    if (!currentUserId) {
      return null;
    }

    const allCandidateSessions = Object.values(sessionsBySpot)
      .flat()
      .filter((sessionItem) => sessionItem.userId === currentUserId)
      .filter((sessionItem) => isSessionOnDayKey(sessionItem, activeDayKey));
    const userSessions = allCandidateSessions
      .filter((sessionItem) => getSessionViewState(sessionItem) !== 'live');
    

    return userSessions
      .sort((a, b) => {
        const startDiff = toMinutes(a.start) - toMinutes(b.start);
        if (startDiff !== 0) {
          return startDiff;
        }

        const aCreatedAt = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bCreatedAt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bCreatedAt - aCreatedAt;
      })[0] ?? null;
  }, [activeAppUserId, activeDateEnd, activeDateStart, activeDay, sessionsBySpot]);
  const activeBannerSession = activeCheckedInSession ?? plannedSession;
  useEffect(() => {
    
  }, [activeBannerSession]);
  const plannedSessionIntentLabel = useMemo(() => {
    if (!plannedSession) {
      return null;
    }
    const resolvedIntent = resolveSessionIntent(plannedSession.intent);
    return getIntentGoingLabel(resolvedIntent);
  }, [plannedSession]);

  const plannedSessionTimeLabel = useMemo(() => {
    if (!plannedSession?.start || !plannedSession?.end) {
      return null;
    }

    return `${plannedSession.start} - ${plannedSession.end}`;
  }, [plannedSession]);
  const messages = selectedSpot ? messagesBySpot[`${selectedSpot}-${selectedDayKey}`] || [] : [];
  useEffect(() => {
    if (!selectedSpot) return;
    console.log("INITIAL_CHAT_FETCH", { selectedSpot, activeDay });
    void fetchSharedData();
  }, [selectedSpot]);

  useEffect(() => {
    console.log("DAY_CHANGE_FETCH_TRIGGER", { activeDay });
    void fetchSharedData();
  }, [activeDay]);

  const areAnySpotBuzzEnabled =
    spotNotificationPreferences.session_planning_notification_mode !== 'off'
    || spotNotificationPreferences.checkin_notification_mode !== 'off'
    || spotNotificationPreferences.chat_notification_mode !== 'off'
    || spotNotificationPreferences.session_joined_notification_mode !== 'off';
  const daySessionsBySpot = useMemo(() => {
    const next = createSpotRecord<SpotSession[]>(spotNames, () => []);
    for (const spot of spotNames) {
      next[spot] = (Array.isArray(sessionsBySpot[spot]) ? sessionsBySpot[spot] : []).filter((item) => isSessionOnDayKey(item, activeDayKey));
    }
    
    return next;
  }, [activeDateEnd, activeDateStart, activeDay, sessionsBySpot, spotNames]);
  const allUserSessions = useMemo(() => {
    if (!activeAppUserId) {
      return [];
    }

    const allSessions = Object.values(sessionsBySpot)
      .flat()
      .filter((sessionItem) => sessionItem.userId === activeAppUserId);
    const filteredSessions = (Array.isArray(allSessions) ? allSessions : []).filter((sessionItem) => !isSessionExpired(sessionItem));
    

    return filteredSessions;
  }, [activeAppUserId, sessionsBySpot]);
  const upcomingPlannedSession = useMemo(() => {
    const nowMinutes = getCurrentLocalMinutes();
    const currentDateKey = getCurrentLocalDateKey();

    return allUserSessions
      .filter(
        (sessionItem) =>
          isPlannedSession(sessionItem)
          && (sessionItem.sessionDay ?? '') === currentDateKey
          && toMinutes(sessionItem.start) > nowMinutes,
      )
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))[0] ?? null;
  }, [allUserSessions]);
  const buddyRequests = useMemo(
    () => incomingFollowRequests.map((requestItem) => ({ ...requestItem, status: 'pending' as const })),
    [incomingFollowRequests],
  );
  const pendingBuddyRequestsCount = useMemo(() => {
    if (!buddyRequests) return 0;
    return (Array.isArray(buddyRequests) ? buddyRequests : []).filter((r) => r.status === 'pending').length;
  }, [buddyRequests]);
  const pendingRequestsCount: number | null = Number.isFinite(pendingBuddyRequestsCount) ? pendingBuddyRequestsCount : null;
  const hasPendingRequests = (pendingRequestsCount ?? 0) > 0;
  useEffect(() => {
    autoCheckoutOutsideCountRef.current = 0;
    autoCheckoutOutsideSinceRef.current = null;
    hasAutoCheckedOutRef.current = false;
  }, [gpsActiveCheckedInSession?.id]);

  useEffect(() => {
    if (!autoCheckoutNotice) {
      return;
    }

    const timeout = setTimeout(() => {
      setAutoCheckoutNotice(null);
    }, 4500);

    return () => clearTimeout(timeout);
  }, [autoCheckoutNotice]);

  useEffect(() => {
    const runAutoCheckOutIfNeeded = async () => {
      if (!isNativePlatform) {
        autoCheckoutOutsideCountRef.current = 0;
        autoCheckoutOutsideSinceRef.current = null;
        
        return;
      }

      const isActiveLiveStatus = gpsActiveCheckedInSession?.status === 'live' || gpsActiveCheckedInSession?.status === 'Is er al';
      if (!activeAppUserId || !currentCoordinates || !gpsActiveCheckedInSession || !isActiveLiveStatus) {
        autoCheckoutOutsideCountRef.current = 0;
        autoCheckoutOutsideSinceRef.current = null;
        
        
        return;
      }

      const activeSpotDefinition = verifiedSpotDefinitions.find(
        (spot) => normalizeSpotName(spot.spot) === normalizeSpotName(gpsActiveCheckedInSession.spot),
      );
      if (!activeSpotDefinition) {
        autoCheckoutOutsideCountRef.current = 0;
        autoCheckoutOutsideSinceRef.current = null;
        
        return;
      }

      const spotCoordinates = {
        latitude: activeSpotDefinition.latitude,
        longitude: activeSpotDefinition.longitude,
      };
      const distanceMeters = getDistanceMeters(currentCoordinates, spotCoordinates);
      const isOutsideRadius = distanceMeters > AUTO_CHECKOUT_RADIUS_METERS;
      const spotId = gpsActiveCheckedInSession.id;
      
      

      if (!isOutsideRadius) {
        
        if (autoCheckoutOutsideCountRef.current !== 0 || autoCheckoutOutsideSinceRef.current !== null) {
          
        }
        autoCheckoutOutsideCountRef.current = 0;
        autoCheckoutOutsideSinceRef.current = null;
        hasAutoCheckedOutRef.current = false;
        return;
      }

      if (hasAutoCheckedOutRef.current) {
        
        return;
      }

      if (autoCheckoutInFlightRef.current) {
        
        return;
      }

      autoCheckoutInFlightRef.current = true;
      hasAutoCheckedOutRef.current = true;
      
      

      await handleQuickCheckOut();
      const autoCheckoutFailed = activeCheckedInSession?.id === gpsActiveCheckedInSession.id;
      if (autoCheckoutFailed) {
        autoCheckoutInFlightRef.current = false;
        hasAutoCheckedOutRef.current = false;
        console.error('AUTO_CHECKOUT_ERROR', {
          sessionId: gpsActiveCheckedInSession.id,
          error: 'CHECKOUT_HANDLER_DID_NOT_CLOSE_SESSION',
        });
        return;
      }

      autoCheckoutInFlightRef.current = false;
      autoCheckoutOutsideCountRef.current = 0;
      autoCheckoutOutsideSinceRef.current = null;
      if (gpsWatcherRef.current) {
        gpsWatcherRef.current.remove();
        gpsWatcherRef.current = null;
        gpsWatcherSessionIdRef.current = null;
        
      }
      setAutoCheckoutNotice('Automatically checked out\nYou appear to have left the spot');
      await fetchSharedData();
    };

    void runAutoCheckOutIfNeeded();
  }, [currentCoordinates, gpsActiveCheckedInSession, isNativePlatform, activeAppUserId, verifiedSpotDefinitions]);
  const selectedPlanningDateKey = activeDateKey;
  const planningNowReference = useMemo(
    () => getPlanningNowReference(selectedPlanningDateKey, currentLocalMinutes),
    [currentLocalMinutes, selectedPlanningDateKey],
  );
  const nowReference = useMemo(() => {
    const todayDateKey = getCurrentLocalDateKey();
    const isToday = selectedPlanningDateKey === todayDateKey;
    return {
      selectedPlanningDateKey,
      todayDateKey,
      isToday,
      currentLocalMinutes,
      nowLabel: formatMinutesAsHourMinute(currentLocalMinutes),
    };
  }, [currentLocalMinutes, selectedPlanningDateKey]);
  const windowInfo = useMemo(() => {
    const twoHoursBack = currentLocalMinutes - 120;
    const roundedStart = Math.floor(twoHoursBack / 60) * 60;
    const dynamicTodayStart = clamp(roundedStart, timelineStartMinutes, timelineEndMinutes - 60);

    return {
      startMinutes: activeDay === 'today' ? dynamicTodayStart : timelineStartMinutes,
      endMinutes: timelineEndMinutes,
      mode: activeDay === 'today' ? 'rolling_today' : 'full_day',
    };
  }, [activeDay, currentLocalMinutes]);
  const timelineMode = windowInfo.mode;
  useEffect(() => {
    
  }, [activeDay, timelineMode]);
  const timelineWindow = useMemo(
    () => ({
      startMinutes: windowInfo.startMinutes,
      endMinutes: windowInfo.endMinutes,
    }),
    [windowInfo.endMinutes, windowInfo.startMinutes],
  );
  const timelineLabels = useMemo(
    () => getTimelineLabelsForRange(timelineWindow.startMinutes, timelineWindow.endMinutes)
      .map((label) => {
        const [hour, minute] = label.split(':').map(Number);
        return {
          label,
          minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
        };
      }),
    [timelineWindow.endMinutes, timelineWindow.startMinutes],
  );
  useEffect(() => {
    
  }, [timelineWindow.endMinutes, timelineWindow.startMinutes]);
  useEffect(() => {
  }, [timelineLabels, timelineWindow]);
  useEffect(() => {
    
  }, [nowReference]);
  useEffect(() => {
    
  }, [windowInfo]);
  const startHourOptions = useMemo(
    () =>
      hours
        .filter((hour) => hour >= 8 && hour <= 20)
        .filter((hour) => {
          if (!planningNowReference.isToday) {
            return true;
          }
          const hourMinMinutes = hour * 60;
          const hourMaxMinutes = hourMinMinutes + Math.max(...minuteOptions);
          return hourMaxMinutes >= planningNowReference.earliestStartMinutes && hourMinMinutes <= planningNowReference.latestPlanningStartMinutes;
        }),
    [planningNowReference.earliestStartMinutes, planningNowReference.isToday, planningNowReference.latestPlanningStartMinutes],
  );
  useEffect(() => {
    
  }, [planningNowReference]);
  useEffect(() => {
    if (!showForm || !planningNowReference.isToday || startHour === null) {
      return;
    }

    const startTotalMinutes = startHour * 60 + startMinute;
    if (startTotalMinutes >= planningNowReference.earliestStartMinutes) {
      return;
    }

    const adjustedStart = minuteValueToHourMinute(planningNowReference.earliestStartMinutes);
    
    setStartHour(adjustedStart.hour);
    setStartMinute(adjustedStart.minute);
  }, [planningNowReference.earliestStartMinutes, planningNowReference.isToday, showForm, startHour, startMinute]);
  useEffect(() => {
    if (!showForm || startHour === null) {
      return;
    }

    const startTotalMinutes = startHour * 60 + startMinute;
    const minEndMinutes = startTotalMinutes + planningMinuteStep;
    if (minEndMinutes > planningEndMinutes) {
      if (endHour !== null) {
        setEndHour(null);
        setEndMinute(0);
      }
      return;
    }

    const currentEndTotalMinutes = endHour === null ? null : endHour * 60 + endMinute;
    if (currentEndTotalMinutes !== null && currentEndTotalMinutes > startTotalMinutes && currentEndTotalMinutes <= planningEndMinutes) {
      return;
    }

    const adjustedEndMinutes = getDefaultEndMinutesForStart(startTotalMinutes);
    const adjustedEnd = minuteValueToHourMinute(adjustedEndMinutes);
    
    setEndHour(adjustedEnd.hour);
    setEndMinute(adjustedEnd.minute);
  }, [endHour, endMinute, showForm, startHour, startMinute]);
  const isCheckedInAtSelectedSpot = Boolean(
    selectedSpot
    && hasActiveCheckedInSession
    && activeCheckedInSession
    && normalizeSpotName(activeCheckedInSession.spot) === normalizeSpotName(selectedSpot),
  );
  const hasPlannedSession = Boolean(
    allUserSessions
      .some(
        (sessionItem) =>
          sessionItem.status === 'Gaat'
          && !sessionItem.checkedInAt
          && !sessionItem.checkedOutAt
          && hasPlannedTimeWindow(sessionItem)
          && getSessionViewState(sessionItem) !== 'live'
          && (sessionItem.sessionDay ?? '') === activeDayKey,
      ),
  );
  const viewedSpot = selectedSpot;
  const savedSpots = favoriteSpots;
  const safeMySpots = Array.isArray(savedSpots) ? savedSpots : [];
  const selectedSpotName = viewedSpot ?? null;
  const currentSpot = selectedSpotName ? { id: selectedSpotName, name: selectedSpotName } : null;
  const isAlreadyAdded = safeMySpots.some((spot) => {
    if (typeof spot === 'string') {
      return spot === currentSpot?.id;
    }
    if (currentSpot?.id && (spot as { id?: string | null })?.id) {
      return (spot as { id?: string | null }).id === currentSpot.id;
    }
    return (spot as { name?: string | null })?.name === currentSpot?.name;
  });
  const isSelectedSpotSaved = isAlreadyAdded;
  const canAddSelectedSpotToMySpots = Boolean(currentSpot && !isAlreadyAdded && safeMySpots.length < HOME_SPOTS_LIMIT);
  const selectedSpotDefinition = useMemo(
    () => (selectedSpot ? spotDefinitions.find((spot) => spot.spot === selectedSpot) ?? null : null),
    [selectedSpot, spotDefinitions],
  );
  const selectedSpotDistanceMeters = useMemo(
    () => (currentCoordinates && selectedSpotDefinition
      ? getDistanceMeters(currentCoordinates, {
        latitude: selectedSpotDefinition.latitude,
        longitude: selectedSpotDefinition.longitude,
      })
      : null),
    [currentCoordinates, selectedSpotDefinition],
  );
  const selectedSpotWithinCheckInRadius = selectedSpotDistanceMeters !== null
    ? selectedSpotDistanceMeters <= CHECK_IN_RADIUS_METERS
    : false;
  
  const withinRange = selectedSpotWithinCheckInRadius;
  const shouldShowSpotCheckIn = activeDay === 'today' && !isCheckedInAtSelectedSpot;
  const shouldShowSpotCheckOut = activeDay === 'today' && isCheckedInAtSelectedSpot;
  const canCheckIn = shouldShowSpotCheckIn && withinRange;
  const checkInCtaVisible = canCheckIn;
  useEffect(() => {
    
  }, [activeDay, withinRange, hasActiveCheckedInSession, checkInCtaVisible]);
  const canCheckOut = shouldShowSpotCheckOut;
  useEffect(() => {
    
  }, [activeDay, selectedSpot, shouldShowSpotCheckOut]);
  const topCta = spotState.topCtaState;
  const hasOwnSessionOnSelectedSpotDay = spotState.ownSessionForSpotDay?.hasBlockingOwnSession ?? false;
  const ownActiveSessions = (spotState.sessionsForSpot ?? [])
    .filter((s) =>
      s.userId === activeAppUserId &&
      getCanonicalSessionState(s) !== 'finished'
    );

  const ownSessionCount = ownActiveSessions.length;
  const joinedSession = spotState.ownSession;
  const canEditJoinedSession = Boolean(joinedSession && isPlannedSession(joinedSession));
  const canCancelJoinedSession = Boolean(
    joinedSession
    && joinedSession?.userId === activeAppUserId
    && !joinedSession.checkedInAt
    && !joinedSession.checkedOutAt,
  );
  
  const topCtaMode = ownSessionCount === 0
    ? 'plan' as const
    : 'edit' as const;
  const mode = spotState?.topCtaState?.mode ?? null;
  console.log("MODE_SAFE", { mode });
  const headerStateLabel = hasOwnSessionOnSelectedSpotDay ? 'You have a session today' : null;
  const headerHelperText = hasOwnSessionOnSelectedSpotDay
    ? 'You’re going today. Others can join you.'
    : '';  const liveCount = (spotState?.sessionsForSpot ?? []).filter((session) => {
    return getSessionState(session) === "active";
  }).length;
  const nowSummaryLabel = liveCount > 0
    ? `${liveCount} rider${liveCount === 1 ? '' : 's'} live now.`
    : 'No live riders yet.';  useEffect(() => {
    
  }, [activeDay, hasOwnSessionOnSelectedSpotDay, topCtaMode]);
  useEffect(() => {
    setShowManageSessions(false);
  }, [selectedSpot, activeDayKey]);

  const handleCancelPlannedSession = async (sessionOverride: SpotSession | null = null) => {
    const input = buildCancelActionInput({
      ownSessionForSpotDay: spotState.ownSessionForSpotDay,
      activeProfile,
      activeDateKey,
      availableProfiles,
      sessionOverride,
    });
    if (!input) {
      setSessionActionError(getCancelErrorMessage());
      return;
    }

    logSessionUiActionStart({
      type: 'cancelSession',
      selectedSpot,
      activeDay,
    });
    console.log("CANCEL_INPUT_BUILT", input);
    console.log("SESSION_ACTION_CANCEL_CALL", input);
    const result = await cancelSessionAction(input);
    console.log("SESSION_ACTION_CANCEL_RESULT", result);
    logSessionUiActionResult('cancelSession', result);
    if (!result.ok) {
      setSessionActionError(getCancelErrorMessage());
      return;
    }
    await fetchSharedData();
    setSessionActionError('');
    setEditingSessionId(null);
    if (editingSessionId === input.session.id) {
      resetForm();
    }
  };
  const quickCheckInWindowError = getQuickCheckInWindowError(currentLocalMinutes);
  const canQuickCheckIn = !quickCheckInWindowError;
  const nearestSpotName = nearestSpotResult?.spot ?? null;
  const distanceMeters = nearestSpotResult?.distanceMeters ?? null;
  const nearestSpotWithinRange = nearestSpotResult ? nearestSpotResult.distanceMeters <= CHECK_IN_RADIUS_METERS : false;
  const nearestSpotDistanceLabel = nearestSpotResult ? formatDistance(nearestSpotResult.distanceMeters) : null;
  const nearestSpotCanCheckIn = activeDay === 'today' && !hasActiveCheckedInSession && canQuickCheckIn && nearestSpotWithinRange;
  const isHomeCheckoutButtonVisible = Boolean(activeDay === 'today' && nearestSpotResult && nearestSpotDistanceLabel && hasActiveCheckedInSession);
  useEffect(() => {
    
  }, [activeDay, isHomeCheckoutButtonVisible, nearestSpotName]);
  
  
  
  
  
  useEffect(() => {
    if (!homeQuickCheckInError) {
      return;
    }

    if (!activeCheckedInSession || !quickCheckInWindowError || nearestSpotWithinRange) {
      setHomeQuickCheckInError('');
    }
  }, [activeCheckedInSession, homeQuickCheckInError, nearestSpotWithinRange, quickCheckInWindowError]);
  useEffect(() => {
    
    const isWithinAutoCheckInRadius = distanceMeters !== null && distanceMeters <= AUTO_CHECKIN_PROMPT_RADIUS_METERS;
    

    if (autoCheckInPromptShownRef.current || autoCheckInPromptDismissed) {
      return;
    }

    if (
      nearestSpotName &&
      isWithinAutoCheckInRadius &&
      !hasActiveCheckedInSession
    ) {
      
      
      setShowAutoCheckinPrompt(true);
      autoCheckInPromptShownRef.current = true;
    }
  }, [activeCheckedInSession, autoCheckInPromptDismissed, distanceMeters, hasActiveCheckedInSession, nearestSpotName]);

  const homeSpotCards = useMemo<SpotDistanceInfo[]>(() => {
    const selectedSpotNames = new Set(favoriteSpots);
    const selectedSpotsWithDistance = spotDefinitions
      .filter((spot) => selectedSpotNames.has(spot.spot))
      .map((spot) => ({
        spot: spot.spot,
        distanceMeters: currentCoordinates
          ? getDistanceMeters(currentCoordinates, {
            latitude: spot.latitude,
            longitude: spot.longitude,
          })
          : null,
      }));
    const manualOrderIndex = manualOrder.reduce((result, spotName, index) => {
      result[spotName] = index;
      return result;
    }, {} as Record<SpotName, number>);
    const orderedSpots = [...selectedSpotsWithDistance].sort((a, b) => {
      if (orderMode === 'manual') {
        const aIndex = manualOrderIndex[a.spot] ?? Number.POSITIVE_INFINITY;
        const bIndex = manualOrderIndex[b.spot] ?? Number.POSITIVE_INFINITY;
        if (aIndex !== bIndex) {
          return aIndex - bIndex;
        }
        return a.spot.localeCompare(b.spot);
      }
        const aDistance = a.distanceMeters ?? Number.POSITIVE_INFINITY;
        const bDistance = b.distanceMeters ?? Number.POSITIVE_INFINITY;
        return aDistance - bDistance;
      });
    const sortedSpotsForLog = orderedSpots.map((spotItem) => ({ name: spotItem.spot }));
    
    return orderedSpots;
  }, [currentCoordinates, favoriteSpots, manualOrder, orderMode, spotDefinitions]);
  useEffect(() => {
    
  }, [orderMode]);
  const homeLiveCountBySpot = useMemo(
    () =>
      spotNames.reduce((result, spot) => {
        result[spot] = getLiveSessions(sessionsBySpot[spot] ?? []).length;
        return result;
      }, {} as Record<SpotName, number>),
    [sessionsBySpot, spotNames],
  );
  useEffect(() => {
    const homeLiveSessions = Object.values(sessionsBySpot).flat();
    const homeSessionsSource = {
      totalSessions: homeLiveSessions.length,
      liveSessions: getLiveSessions(homeLiveSessions).map((sessionItem) => ({
        id: sessionItem.id,
        spot: sessionItem.spot,
        userId: sessionItem.userId,
        checkedInAt: sessionItem.checkedInAt,
        checkedOutAt: sessionItem.checkedOutAt,
      })),
    };
    
  }, [sessionsBySpot]);
  useEffect(() => {
    
  }, [homeLiveCountBySpot]);
  useEffect(() => {
    
  }, [activeCheckedInSession, activeAppUserId]);
  useEffect(() => {
    
  }, [activeCheckedInSession, hasOwnSessionOnSelectedSpotDay]);
  const filteredMessages = useMemo(
    () => (Array.isArray(messages) ? messages : []),
    [messages],
  );
  const orderedMessages = useMemo(
    () => {
      const messagesWithIndex = filteredMessages.map((message, index) => ({ message, index }));
      return messagesWithIndex
        .sort((a, b) => {
          const aTime = a.message.createdAt ? new Date(a.message.createdAt).getTime() : 0;
          const bTime = b.message.createdAt ? new Date(b.message.createdAt).getTime() : 0;
          if (aTime !== bTime) {
            return bTime - aTime;
          }
          return b.index - a.index;
        })
        .map(({ message }) => message);
    },
    [filteredMessages],
  );
  useEffect(() => {
    console.log("CHAT_STATE_TRACE", (messages ?? []).slice(0, 5).map((message) => ({
      id: message?.id ?? null,
      created_at: message?.created_at ?? null,
      createdAt: message?.createdAt ?? null,
      timestamp: message?.timestamp ?? null,
      time: message?.time ?? null
    })));
  }, [messages]);
  useEffect(() => {  }, [messages]);
  useEffect(() => {  }, [orderedMessages]);
  useEffect(() => {  }, [orderedMessages]);
  useEffect(() => {
    
  }, [activeDay, filteredMessages]);

  useEffect(() => {  }, [spotState]);
  const selectedSpotForReadModelLogs = typeof selectedSpot === 'string'
    ? selectedSpot
    : selectedSpot ?? null;
  useEffect(() => {  }, [activeDayKey, selectedSpotForReadModelLogs, timelineSessions]);
  useEffect(() => {  }, [activeDayKey, selectedSpotForReadModelLogs, spotState.ownSession, spotState.ownSessionForSpotDay]);
  
  
  const selectedSpotMomentumLabel = useMemo(
    () => {
      if (!selectedSpot) {
        return null;
      }

      const detailSessions = daySessionsBySpot[selectedSpot] ?? [];
      const status = getSpotStatus({
        spotName: selectedSpot,
        sessions: detailSessions,
        selectedDay: activeDay,
        now: new Date(),
        getSessionState,
      });

      console.log('DETAIL_SPOT_STATUS_RESULT', {
        spotName: selectedSpot,
        label: status.label,
      });

      return status.label;
    },
    [activeDay, daySessionsBySpot, selectedSpot],
  );
  const selectedTimelineSession = useMemo(() => {
    if (!selectedTimelineSessionId) {
      return null;
    }

    return timelineSessions.find(({ item }) => {
      const { startTime, endTime } = getRoundedSessionWindow(item);
      const representativeId = item.id ?? 'unknown';
      const groupKey = `${startTime}-${endTime}-${representativeId}`;
      return groupKey === selectedTimelineSessionId;
    }) ?? null;
  }, [selectedTimelineSessionId, timelineSessions]);

  const selectedTimelineGroupSessions = useMemo(() => {
    if (!selectedTimelineSessionId) {
      return [];
    }

    return timelineSessions.filter(({ item }) => {
      const { startTime, endTime } = getRoundedSessionWindow(item);
      return `${startTime}-${endTime}` === selectedTimelineSessionId;
    });
  }, [selectedTimelineSessionId, timelineSessions]);

  const activeGroupChatContext = useMemo(() => {
    if (!activeGroupChatKey) {
      return null;
    }

    const group = spotState.groupedSessions.find((item) => item.key === activeGroupChatKey);
    if (!group) {
      return null;
    }

    const riderCount = group.visibleSessions?.length ?? group.sessions?.length ?? 0;

    return {
      title: selectedSpot ? `${selectedSpot}` : 'Group Chat',
      subtitle: `${group.startTime} – ${group.endTime} · ${riderCount} rider${riderCount === 1 ? '' : 's'}`,
    };
  }, [activeGroupChatKey, selectedSpot, spotState.groupedSessions]);

  const isCurrentUserInSelectedTimelineGroup = selectedTimelineGroupSessions.some(
    ({ item }) => item.userId === activeAppUserId,
  );

  useEffect(() => {
    setActiveGroupChatKey(null);
  }, [selectedSpot, activeDay]);

  const openEmptyPlanningForm = () => {
    const nowReference = getPlanningNowReference(selectedPlanningDateKey, getCurrentLocalMinutes());
    setEditingSessionId(null);
    setIntent('definitely');
    if (nowReference.isToday && nowReference.hasValidStartSlot) {
      const defaultStart = minuteValueToHourMinute(nowReference.earliestStartMinutes);
      const defaultEndMinutes = getDefaultEndMinutesForStart(nowReference.earliestStartMinutes);
      const defaultEnd = minuteValueToHourMinute(defaultEndMinutes);
      
      setStartHour(defaultStart.hour);
      setStartMinute(defaultStart.minute);
      setEndHour(defaultEnd.hour);
      setEndMinute(defaultEnd.minute);
    } else {
      setStartHour(null);
      setStartMinute(0);
      setEndHour(null);
      setEndMinute(0);
    }
    setShowForm(true);
    setActivePicker(null);
    setFormError(nowReference.isToday && !nowReference.hasValidStartSlot ? 'No valid planning time left today.' : '');
    setSaveError(null);
    setSessionActionError('');
  };
  useEffect(() => {
    if (!selectedTimelineSessionId) {
      return;
    }

    const exists = spotState.groupedSessions.some(
      (group) => group.key === selectedTimelineSessionId
    );

    if (!exists) {
      setSelectedTimelineSessionId(null);
    }
  }, [selectedTimelineSessionId, spotState.groupedSessions]);
  useEffect(() => {
    
  }, [selectedSpot, sessions, timelineSessions]);
  const checkedInUsers = useMemo(
    () => {
      const liveSessions = sessions
        .filter((sessionItem) => isIsoInRange(sessionItem.checkedInAt, activeDateStart, activeDateEnd))
        .filter((sessionItem) => isRealCheckedInLiveSession(sessionItem))
        .sort((a, b) => {
        const aTime = a.checkedInAt ? new Date(a.checkedInAt).getTime() : 0;
        const bTime = b.checkedInAt ? new Date(b.checkedInAt).getTime() : 0;
        return bTime - aTime;
      });
      const dedupedUsers = dedupeActiveCheckedInSessionsByUser(liveSessions)
        .sort((a, b) => getSessionRecencyMs(b) - getSessionRecencyMs(a));
      
      return dedupedUsers;
    },
    [activeDateEnd, activeDateStart, sessions],
  );
  const upcomingSessions = useMemo(
    () =>
      sessions
        .filter((sessionItem) => (sessionItem.sessionDay ?? '') === activeDayKey)
        .filter((sessionItem) => getSessionViewState(sessionItem) !== 'live')
        .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
        .slice(0, 3),
    [activeDayKey, sessions],
  );
  const nowAtSpotMode: 'live' | 'upcoming' | 'empty' = checkedInUsers.length > 0
    ? 'live'
    : upcomingSessions.length > 0
      ? 'upcoming'
      : 'empty';
  
  
  
  const duplicatePlannedSessionMessage = 'You already have a session at this spot and time.';
  const liveKiterCountLabel = `${checkedInUsers.length} ${checkedInUsers.length === 1 ? 'kiter' : 'kiters'} now at the spot`;
  const shouldShowNowAtSpotPanel = activeDay === 'today' && checkedInUsers.length > 0;
  useEffect(() => {
    
  }, [activeDay, checkedInUsers.length, shouldShowNowAtSpotPanel]);
  const getSessionPersistenceErrorMessage = (error: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  } | null | undefined, fallbackMessage: string) => {
    if (!error) {
      return fallbackMessage;
    }

    if (error.code === '23505') {
      if (error.message?.includes('sessions_unique') || error.details?.includes('sessions_unique')) {
        return duplicatePlannedSessionMessage;
      }
      return error.details?.trim() || error.message?.trim() || 'You already have an open session. Finish it first.';
    }

    if (error.code === '23P01') {
      return 'You already have an overlapping session at this spot';
    }

    if (error.details?.trim()) {
      return error.details;
    }

    if (error.message?.trim()) {
      return error.message;
    }

    return fallbackMessage;
  };
  const saveSpotNotificationPreferences = async (
    nextPreferences: SpotNotificationPreferences,
    preferenceType: SpotNotificationPreferenceType,
  ) => {
    if (!selectedSpot || !activeAppUserId) {
      return false;
    }

    setSavingNotificationPreferenceKey(preferenceType);
    setNotificationPreferencesError('');

    const tableName = 'spot_notification_preferences';
    const { userId: persistedUserId, spotName: normalizedSpotName } = buildSpotNotificationPreferenceKey({
      userId: activeProfile?.id ?? null,
      spotName: getSelectedSpotName(selectedSpot),
    });
    if (!persistedUserId) {
      setSavingNotificationPreferenceKey(null);
      setNotificationPreferencesError('Saving notification preferences failed.');
      return false;
    }
    if (!normalizedSpotName) {
      setSavingNotificationPreferenceKey(null);
      setNotificationPreferencesError('Saving notification preferences failed.');
      return false;
    }
    const payload = {
      user_id: persistedUserId,
      spot_name: normalizedSpotName,
      ...normalizeSpotNotificationPreferences(nextPreferences),
    };

    const onConflictKeys = "user_id,spot_name";
    const nextValue = payload.session_joined_notification_mode;
    console.log("PREF_KEY_SAVE", {
      userId: persistedUserId ?? null,
      selectedSpot: selectedSpot ?? null,
      normalizedSpotName: normalizedSpotName ?? null,
      nextValue
    });

    const { data, error } = await supabase
      .from(tableName)
      .upsert(payload, {
        onConflict: onConflictKeys,
      })
      .select(`
        user_id,
        spot_name,
        session_planning_notification_mode,
        checkin_notification_mode,
        chat_notification_mode,
        session_joined_notification_mode
      `);

    if (error) {
      console.error('Failed to save notification preference:', error);
      setNotificationPreferencesError('Saving notification preferences failed.');
      setSavingNotificationPreferenceKey(null);
      return false;
    }

    const { data: readbackData, error: readbackError } = await supabase
      .from(tableName)
      .select(`
        user_id,
        spot_name,
        session_planning_notification_mode,
        checkin_notification_mode,
        chat_notification_mode,
        session_joined_notification_mode
      `)
      .eq('user_id', persistedUserId)
      .eq('spot_name', normalizedSpotName)
      .maybeSingle();

    const loadedPreferences = normalizeSpotNotificationPreferences(readbackData);
    console.log("PREF_KEY_READBACK", {
      userId: persistedUserId ?? null,
      spotName: normalizedSpotName ?? null,
    });
    console.log("PREF_DB_ROW_SAVE_READBACK", {
      ok: !readbackError,
      error: readbackError ?? null,
      row: readbackData ?? null,
      normalized: loadedPreferences,
    });

    setSavingNotificationPreferenceKey(null);
    return true;
  };


  const runCheckInFlowForSpot = async ({
    spot,
    source,
  }: {
    spot: SpotName;
    source: 'spot_page' | 'home_quick';
  }): Promise<{ ok: true; spot: SpotName } | { ok: false; reason: string; error?: unknown }> => {
    const activeProfileId = activeProfile?.id ?? null;
    
    if (!activeProfileId) {
      return { ok: false, reason: 'missing_auth_or_profile' };
    }

    const requestedCanonicalName = normalizeSpotName(spot);
    const canonicalSpot =
      spotDefinitions.find((spotDefinition) =>
        spotDefinition.canonicalName === requestedCanonicalName
        || normalizeSpotName(spotDefinition.spot) === requestedCanonicalName
      )?.spot
      ?? spot;
    if (!canonicalSpot) {
      return { ok: false, reason: 'missing_spot' };
    }

    const nowIso = new Date().toISOString();
    const getLatestOpenSession = async () =>
      supabase
        .from('sessions')
        .select('id, spot_name, status, created_at')
        .eq('user_id', activeProfileId)
        .is('checked_out_at', null)
        .in('status', ['Gaat', 'Is er al'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    const getExistingActiveCheckedInSessionsForDay = async () =>
      supabase
        .from('sessions')
        .select('id, spot_name, status, created_at, checked_in_at, checked_out_at')
        .eq('user_id', activeProfileId)
        .is('checked_out_at', null)
        .in('status', ['Is er al', 'live'])
        .gte('checked_in_at', activeDateStart.toISOString())
        .lt('checked_in_at', activeDateEnd.toISOString())
        .order('checked_in_at', { ascending: false });
    const deleteGhostSessionsForUser = async (userId: string) => {
      const payload = { user_id: userId };
      
      
      const cleanupResponse = await supabase
        .from('sessions')
        .delete()
        .eq('user_id', userId)
        .is('checked_in_at', null)
        .is('checked_out_at', null);

      if (cleanupResponse.error) {
        
      }
    };

    const latestOpenSessionResponse = await getLatestOpenSession();
    if (latestOpenSessionResponse.error) {
      
      return { ok: false, reason: 'fetch_latest_open_session_failed', error: latestOpenSessionResponse.error };
    }
    const existingCheckedInSessionsForDayResponse = await getExistingActiveCheckedInSessionsForDay();
    if (existingCheckedInSessionsForDayResponse.error) {
      
      return { ok: false, reason: 'fetch_existing_checked_in_sessions_for_day_failed', error: existingCheckedInSessionsForDayResponse.error };
    }
    const existingCheckedInSessionsForDay = (
      existingCheckedInSessionsForDayResponse.data ?? []
    ).filter((session) => {
      const checkedInAt = session.checked_in_at
        ? new Date(session.checked_in_at).getTime()
        : 0;

      const ageHours = (Date.now() - checkedInAt) / (1000 * 60 * 60);

      return ageHours < 12;
    });
    
    const activeSession = existingCheckedInSessionsForDay
      .slice()
      .sort((a, b) => {
        const aCheckedInMs = a.checked_in_at ? new Date(a.checked_in_at).getTime() : 0;
        const bCheckedInMs = b.checked_in_at ? new Date(b.checked_in_at).getTime() : 0;
        const aCreatedMs = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bCreatedMs = b.created_at ? new Date(b.created_at).getTime() : 0;
        return Math.max(bCheckedInMs, bCreatedMs) - Math.max(aCheckedInMs, aCreatedMs);
      })[0] ?? null;
    if (activeSession) {
      if (normalizeSpotName(activeSession.spot_name) === normalizeSpotName(canonicalSpot)) {
        await fetchSharedData();
        return { ok: true, spot: canonicalSpot };
      }
      
      return { ok: false, reason: `already_checked_in_other_spot:${activeSession.spot_name}` };
    }

    const latestOpenSession = latestOpenSessionResponse.data;
    if (latestOpenSession?.status === 'Is er al') {
      if (normalizeSpotName(latestOpenSession.spot_name) === normalizeSpotName(canonicalSpot)) {
        return { ok: false, reason: 'already_checked_in_same_spot' };
      }

      return { ok: false, reason: `already_checked_in_other_spot:${latestOpenSession.spot_name}` };
    }

    if (latestOpenSession?.status === 'Gaat') {
      if (normalizeSpotName(latestOpenSession.spot_name) !== normalizeSpotName(canonicalSpot)) {
        
        const payload = { user_id: activeProfileId };
        
        
        const clearPlannedResult = await supabase
          .from('sessions')
          .delete()
          .eq('id', latestOpenSession.id)
          .eq('user_id', activeProfileId);

        if (clearPlannedResult.error) {
          
          return { ok: false, reason: 'clear_planned_session_other_spot_failed', error: clearPlannedResult.error };
        }

        
        await deleteGhostSessionsForUser(activeProfileId);
      } else {

      const updatePayload = {
        status: 'Is er al',
        intent: 'definitely',
        checked_in_at: nowIso,
        checked_out_at: null,
      } as const;
      
      if (source === 'home_quick') {
        
      }
      const payload = { user_id: activeProfileId };
      
      const checkInResponse = await supabase
        .from('sessions')
        .update(updatePayload)
        .eq('id', latestOpenSession.id)
        .eq('user_id', activeProfileId);

      if (checkInResponse.error) {
        
        return { ok: false, reason: 'update_existing_session_failed', error: checkInResponse.error };
      }

      
      await fetchSharedData();
      return { ok: true, spot: canonicalSpot };
      }
    }

    await deleteGhostSessionsForUser(activeProfileId);

    const insertPayload = {
      spot_name: canonicalSpot,
      user_id: activeProfileId,
      start_time: getNowLocalHourMinute(),
      end_time: getQuickCheckInEndTime(),
      status: 'Is er al',
      intent: 'definitely' as const,
      checked_in_at: nowIso,
      checked_out_at: null,
      session_day: activeDayKey,
    };
    
    
    if (source === 'home_quick') {
      
    }
    const insertResult = await supabase.from('sessions').insert(insertPayload);

    if (insertResult.error) {
      
      if (isUniqueConstraintError(insertResult.error)) {
        return { ok: false, reason: 'unique_constraint_live_session', error: insertResult.error };
      }
      return { ok: false, reason: 'insert_new_live_session_failed', error: insertResult.error };
    }

    
    await fetchSharedData();
    return { ok: true, spot: canonicalSpot };
  };
  const mapCheckInFailureToMessage = (reason: string) => {
    if (reason === 'already_checked_in_same_spot') {
      return 'You are already checked in';
    }
    if (reason.startsWith('already_checked_in_other_spot:')) {
      const spotName = reason.split(':')[1] ?? '';
      return `You are already checked in at ${spotName}`;
    }
    if (reason === 'planned_session_other_spot' || reason === 'unique_constraint_live_session') {
      return 'Finish your current session first';
    }
    return 'Check-in failed. Please try again.';
  };
  const handleCheckInWithSharedFlow = async ({
    spot,
    source,
  }: {
    spot: SpotName;
    source: 'spot_page' | 'home_quick';
  }): Promise<{ errorMessage: string | null; checkedInSpot: SpotName | null }> => {
    
    console.log('CHECKIN_SHARED_FLOW_START', { spot, source });
    const checkInResult = await runCheckInFlowForSpot({ spot, source });
    console.log('CHECKIN_SHARED_FLOW_RESULT', checkInResult);
    if (!checkInResult.ok) {
      const failureResult = checkInResult as { ok: false; reason: string; error?: unknown };
      const failureReason = failureResult.reason;
      const failureError = failureResult.error ?? null;
      
      return { errorMessage: mapCheckInFailureToMessage(failureReason), checkedInSpot: null };
    }

    
    console.log('CHECKIN_FORCE_REFRESH_START');

    await fetchSharedData({ skipLoadingState: true });

    if (checkInResult.spot) {
      setSelectedSpot(checkInResult.spot);
    }

    console.log('CHECKIN_FORCE_REFRESH_DONE', {
      checkedInSpot: checkInResult.spot,
    });

    return { errorMessage: null, checkedInSpot: checkInResult.spot };
  };

  const handleUpdateSessionStatus = async (status: SessionStatus) => {
    setSessionActionError('');
    const actionLabel = status === 'Is er al' ? 'SPOT_PAGE_CHECKIN' : 'SPOT_PAGE_CHECKOUT';
    

    const activeProfileId = activeProfile?.id ?? null;
    
    if (!activeProfileId) {
      return;
    }

    const nowIso = new Date().toISOString();
    const getLatestOpenSession = async () =>
      supabase
        .from('sessions')
        .select('id, spot_name, status, created_at')
        .eq('user_id', activeProfileId)
        .is('checked_out_at', null)
        .in('status', ['Gaat', 'Is er al'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (status === 'Is er al') {
      if (!selectedSpot) {
        console.error('SPOT_PAGE_CHECKIN_MISSING_SPOT_NAME', { selectedSpot });
        return;
      }
      if (!selectedSpotWithinCheckInRadius) {
        setSessionActionError('You are too far from the spot (&gt;1 km)');
        return;
      }
      const { errorMessage } = await handleCheckInWithSharedFlow({ spot: selectedSpot, source: 'spot_page' });
      if (errorMessage) {
        setSessionActionError(errorMessage);
        return;
      }
      setSessionActionError('');
      return;
    }

    const latestOpenSessionResponse = await getLatestOpenSession();
    if (latestOpenSessionResponse.error) {
      
      setSessionActionError('Check-out failed. Please try again.');
      return;
    }

    const checkedInSession = latestOpenSessionResponse.data?.status === 'Is er al' ? latestOpenSessionResponse.data : null;
    if (!checkedInSession) {
      setSessionActionError('Check eerst in');
      return;
    }

    const payload = { user_id: activeProfileId };
    
    const result = await supabase
      .from('sessions')
      .update({
        status: 'Uitchecken',
        checked_out_at: nowIso,
      })
      .eq('id', checkedInSession.id)
      .eq('user_id', activeProfileId);

    if (result.error) {
      
      setSessionActionError('Check-out failed. Please try again.');
      return;
    }

    
    await fetchSharedData();
    setSessionActionError('');
  };

  const resetForm = () => {
    setShowForm(false);
    setActivePicker(null);
    setStartHour(null);
    setStartMinute(0);
    setEndHour(null);
    setEndMinute(0);
    setIntent('definitely');
    setEditingSessionId(null);
    setFormError('');
    setSaveError(null);
  };

  const handleQuickCheckIn = async (spot: SpotName) => {
    
    
    setHomeQuickCheckInError('');

    if (quickCheckInWindowError) {
      setHomeQuickCheckInError(quickCheckInWindowError);
      
      return;
    }

    if (!activeAppUserId || !profile) {
      return;
    }
    const isPressedSpotWithinRange = Boolean(
      nearestSpotResult
      && normalizeSpotName(nearestSpotResult.spot) === normalizeSpotName(spot)
      && nearestSpotResult.distanceMeters <= CHECK_IN_RADIUS_METERS,
    );
    if (!isPressedSpotWithinRange) {
      setHomeQuickCheckInError('You are too far from the spot (&gt;1 km)');
      
      return;
    }

    setQuickCheckInSpotInFlight(spot);
    
    const { errorMessage: checkInErrorMessage, checkedInSpot } = await handleCheckInWithSharedFlow({ spot, source: 'home_quick' });
    setQuickCheckInSpotInFlight(null);

    if (checkInErrorMessage) {
      setHomeQuickCheckInError(checkInErrorMessage);
      
      
      return;
    }

    const resolvedSpot = checkedInSpot ?? spot;
    setSelectedSpot(resolvedSpot);
    
    
    setHomeQuickCheckInError('');
    
    
  };
  const handleAutoCheckInDismiss = () => {
    setAutoCheckInPromptDismissed(true);
    setShowAutoCheckinPrompt(false);
    
  };
  const handleAutoCheckInConfirm = async () => {
    if (!nearestSpotName || distanceMeters === null) {
      return;
    }

    setShowAutoCheckinPrompt(false);
    
    await handleQuickCheckIn(nearestSpotName);
  };

  const verifySpotCoordinates = async ({
    canonicalName,
    latitude,
    longitude,
  }: {
    canonicalName: string;
    latitude: number;
    longitude: number;
  }) => {
    const { error } = await supabase
      .from('spots')
      .update({
        launch_latitude: latitude,
        launch_longitude: longitude,
        coordinate_status: 'verified',
        coordinate_verification_source: 'discover_map_admin',
        coordinate_verified_at: new Date().toISOString(),
      })
      .eq('canonical_name', canonicalName);

    if (error) {
      console.error('VERIFY_SPOT_COORDINATES_ERROR', error);
      return;
    }

    await fetchSpotDefinitions();
  };

  const handleQuickCheckOut = async () => {
    
    setHomeQuickCheckInError('');

    const activeProfileId = activeProfile?.id ?? null;
    
    if (!activeProfileId) {
      return;
    }

    if (!activeCheckedInSession) {
      setHomeQuickCheckInError('Check eerst in');
      
      return;
    }

    setHomeQuickCheckOutInFlight(true);
    const payload = { user_id: activeProfileId };
    
    const result = await supabase
      .from('sessions')
      .update({
        status: 'Uitchecken',
        checked_out_at: new Date().toISOString(),
      })
      .eq('id', activeCheckedInSession.id)
      .eq('user_id', activeProfileId);

    setHomeQuickCheckOutInFlight(false);

    if (result.error) {
      
      setHomeQuickCheckInError('Check-out failed. Please try again.');
      
      return;
    }

    
    
    setHomeQuickCheckInError('');
    await fetchSharedData();
  };

  useEffect(() => {
    if (!showDiscoverSpotsPage) {
      return;
    }

    if (currentCoordinates) {
      setDiscoverMapCenter(currentCoordinates);
      return;
    }

    setDiscoverMapCenter({ latitude: 52.1326, longitude: 5.2913 });
  }, [showDiscoverSpotsPage, currentCoordinates]);

  if (loadingSession || loadingProfile || loadingData) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgElevated, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: theme.text }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (isPasswordResetRoute) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#0b1220',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: '#111827',
            borderRadius: 16,
            padding: 24,
            gap: 12,
          }}
        >
          <Text style={{ color: 'white', fontSize: 28, fontWeight: '700', marginBottom: 8 }}>
            Reset password
          </Text>

          <TextInput
            value={resetPasswordInput}
            onChangeText={setResetPasswordInput}
            placeholder="New password"
            placeholderTextColor="#94a3b8"
            secureTextEntry
            style={{
              backgroundColor: '#1e293b',
              color: 'white',
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          />

          <TextInput
            value={resetPasswordConfirmInput}
            onChangeText={setResetPasswordConfirmInput}
            placeholder="Confirm new password"
            placeholderTextColor="#94a3b8"
            secureTextEntry
            style={{
              backgroundColor: '#1e293b',
              color: 'white',
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          />

          {!!resetPasswordError && (
            <Text style={{ color: '#f87171' }}>{resetPasswordError}</Text>
          )}

          {!!resetPasswordSuccess && (
            <Text style={{ color: '#4ade80' }}>{resetPasswordSuccess}</Text>
          )}

          <Pressable
            onPress={handleSaveResetPassword}
            disabled={isSavingResetPassword}
            style={{
              backgroundColor: '#2563eb',
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              marginTop: 6,
            }}
          >
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
              {isSavingResetPassword ? 'Saving...' : 'Save new password'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!session) {
    return <AuthScreen
      onSignupSuccess={() => {
        void supabase.auth.getSession().then(({ data }) => {
          if (data.session) {
            void hydrateActiveProfile(data.session.user, 'signup_success');
            void fetchSharedData();
          }
        });
      }}
      onPasswordResetRequest={handlePasswordResetRequest}
    />;
  }

  if (profileHydrationError && session) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgElevated, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Text style={{ color: theme.text, textAlign: 'center' }}>{profileHydrationError}</Text>
        <Pressable
          onPress={() => {
            void hydrateActiveProfile(session.user, 'retry_after_profile_query_error');
          }}
          style={{ marginTop: 16, backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}
        >
          <Text style={{ color: theme.text, fontWeight: '600' }}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return <NameSetupScreen userId={session.user.id} onSaved={(savedProfile) => {
      setProfile(savedProfile);
      activeProfileOwnerUidRef.current = session.user.id;
      void AsyncStorage.setItem(getActiveProfileStorageKey(session.user.id), savedProfile.id);
    }} />;
  }
  if (showDiscoverSpotsPage) {

    const discoverCenterLabel = discoverMapCenter
      ? `${discoverMapCenter.latitude.toFixed(3)}, ${discoverMapCenter.longitude.toFixed(3)}`
      : 'Locating…';

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgElevated, paddingHorizontal: 20, paddingTop: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <Text style={{ color: theme.text, fontSize: 28, fontWeight: '900' }}>
            Discover
          </Text>

          <Pressable
            onPress={() => setShowDiscoverSpotsPage(false)}
            style={{
              backgroundColor: theme.cardStrong,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.border,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>
              Back
            </Text>
          </Pressable>
        </View>

        <View
          style={{
            flex: 1,
            overflow: 'hidden',
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.card,
          }}
        >
          <DiscoverMap
            center={{
              latitude: discoverMapCenter?.latitude ?? 52.3676,
              longitude: discoverMapCenter?.longitude ?? 4.9041,
            }}
            spots={spotDefinitions
              .filter((spotItem) =>
                Number.isFinite(spotItem.latitude)
                && Number.isFinite(spotItem.longitude)
              )
              .map((spotItem) => {
                if (spotItem.canonicalName.includes('scheveningen')) {
                  console.log('DISCOVER_RENDER_COORDS', {
                    spot: spotItem.spot,
                    canonicalName: spotItem.canonicalName,
                    latitude: spotItem.latitude,
                    longitude: spotItem.longitude,
                    coordinateStatus: spotItem.coordinateStatus,
                  });
                }

                return ({
              name: spotItem.spot,
              latitude: spotItem.latitude,
              longitude: spotItem.longitude,
              isAdded: favoriteSpots.includes(spotItem.spot),
              coordinateStatus: spotItem.coordinateStatus,
            });
              })}
            onOpenSpot={(spotName) => {
              setSelectedSpot(spotName);
              setShowDiscoverSpotsPage(false);
            }}
            onAddSpot={(spotName) => {
              addSelectedSpot(spotName);
            }}
            onMapClick={(latitude, longitude) => {
              setCoordinateReviewPoint({ latitude, longitude });
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (showYourSpotsPage) {
    const manualOrderToRender = orderMode === 'manual' && dragManualOrder ? dragManualOrder : manualOrder;
    const manualOrderCards = manualOrderToRender
      .map((spotName) => {
        const matchingCard = homeSpotCards.find((card) => card.spot === spotName);
        return matchingCard ?? null;
      })
      .filter((card): card is SpotDistanceInfo => card !== null);
    const selectedSpotCards = orderMode === 'manual' ? manualOrderCards : homeSpotCards;
    const rowHeight = 56;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgElevated, paddingHorizontal: 20, paddingTop: 20 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
          <View style={{ backgroundColor: theme.card, borderRadius: 14, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: theme.text, fontSize: 26, fontWeight: '700' }}>My spots (max 5)</Text>
              <Pressable
                onPress={() => setShowYourSpotsPage(false)}
                style={{ backgroundColor: theme.cardStrong, borderRadius: 999, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10, paddingVertical: 6 }}
              >
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Back home</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 10 }}>
              <TextInput
                value={homeSpotSearchQuery}
                onChangeText={(value) => {
                  setHomeSpotSearchQuery(value);
                  setYourSpotsMode('search');
                }}
                onFocus={() => {
                  setYourSpotsMode('search');

                  if (searchBlurTimeoutRef.current) {
                    clearTimeout(searchBlurTimeoutRef.current);
                    searchBlurTimeoutRef.current = null;
                  }
                }}
                onBlur={() => {
                  if (searchBlurTimeoutRef.current) {
                    clearTimeout(searchBlurTimeoutRef.current);
                  }
                  searchBlurTimeoutRef.current = setTimeout(() => {
                    searchBlurTimeoutRef.current = null;
                  }, 120);
                }}
                placeholder="Search spots"
                placeholderTextColor={theme.textMuted}
                style={{
                  flex: 1,
                  backgroundColor: theme.card,
                  color: theme.text,
                  borderRadius: 999,
                  borderWidth: 0,
                  borderColor: theme.border,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 12,
                }}
              />

              <Pressable
                onPress={() => {
                  setShowDiscoverSpotsPage(true);
                }}
                style={{
                  backgroundColor: theme.cardStrong,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: theme.border,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '800' }}>
                  Discover
                </Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 8 }}>
              {searchResults.map((spotItem) => {
                const isAdded = favoriteSpots.includes(spotItem.name);

                return (
                  <View
                    key={`your-spots-page-search-${spotItem.country}-${spotItem.name}-${spotItem.longitude}-${spotItem.latitude}`}
                    style={{ paddingVertical: 5, borderTopWidth: 1, borderTopColor: theme.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <Pressable
                      onPressIn={() => handleSearchResultPress(spotItem)}
                      style={{ flex: 1, marginRight: 8 }}
                    >
                      <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14 }}>{`${spotItem.country} - ${spotItem.name}`}</Text>
                    </Pressable>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Pressable
                        disabled={isAdded}
                        onPress={() => {
                          if (!isAdded) {
                            addSelectedSpot(spotItem.name);
                          }
                        }}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: theme.border,
                          backgroundColor: theme.cardStrong,
                          opacity: isAdded ? 0.6 : 1,
                        }}
                      >
                        <Text
                          style={{
                            color: isAdded ? theme.textMuted : theme.textSoft,
                            fontSize: 11,
                            fontWeight: '800',
                          }}
                        >
                          {isAdded ? 'Added' : 'Add'}
                        </Text>
                      </Pressable>

                      <Pressable
                        onPressIn={() => handleSearchResultPress(spotItem)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: theme.border,
                          backgroundColor: theme.cardStrong,
                        }}
                      >
                        <Text
                          style={{
                            color: theme.textSoft,
                            fontSize: 11,
                            fontWeight: '800',
                          }}
                        >
                          Open
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>

            {homeSpotsLimitMessage ? (
              <Text style={{ color: '#ffb6b6', fontSize: 12, marginTop: 8 }}>{homeSpotsLimitMessage}</Text>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 8 }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>Order mode</Text>
              <Pressable
                onPress={() => updateOrderMode('distance')}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  
                  borderColor: orderMode === 'distance' ? theme.primary : theme.border,
                  backgroundColor: orderMode === 'distance' ? '#123868' : theme.cardStrong,
                }}
              >
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Distance</Text>
              </Pressable>
              <Pressable
                onPress={() => updateOrderMode('manual')}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  
                  borderColor: orderMode === 'manual' ? theme.primary : theme.border,
                  backgroundColor: orderMode === 'manual' ? '#123868' : theme.cardStrong,
                }}
              >
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Manual</Text>
              </Pressable>
            </View>

            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', marginTop: 6 }}>My spots</Text>
            {selectedSpotCards.length > 0 ? (
              <View style={{ marginTop: 8 }}>
                {selectedSpotCards.map(({ spot, distanceMeters }, manualIndex) => {
                  const isCheckedInAtThisSpot = Boolean(
                    activeCheckedInSession
                    && normalizeSpotName(activeCheckedInSession.spot) === normalizeSpotName(spot)
                  );
                  const isNearestSpotCard = Boolean(
                    nearestSpotResult
                    && normalizeSpotName(nearestSpotResult.spot) === normalizeSpotName(spot)
                  );
                  const isHomeSpotWithinCheckInRadius = Boolean(
                    (distanceMeters !== null && distanceMeters <= CHECK_IN_RADIUS_METERS)
                    || (isNearestSpotCard && nearestSpotResult && nearestSpotResult.distanceMeters <= CHECK_IN_RADIUS_METERS)
                  );
                  const panResponder = orderMode === 'manual' && !isWebPlatform ? PanResponder.create({
                    onStartShouldSetPanResponder: () => true,
                    onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 3,
                    onPanResponderGrant: () => {
                      dragStartIndexRef.current = manualIndex;
                      dragInitialOrderRef.current = [...manualOrderToRender];
                      dragManualOrderRef.current = [...manualOrderToRender];
                      dragSpotNameRef.current = spot;
                      webDragOverIndexRef.current = manualIndex;
                      setDraggingManualSpot(spot);
                      setDragManualOrder([...manualOrderToRender]);
                      
                    },
                    onPanResponderMove: (_, gestureState) => {
                      const startIndex = dragStartIndexRef.current;
                      if (startIndex === null) {
                        return;
                      }
                      const initialOrder = dragInitialOrderRef.current;
                      if (initialOrder.length <= 1) {
                        return;
                      }
                      const nextIndex = clamp(startIndex + Math.round(gestureState.dy / rowHeight), 0, initialOrder.length - 1);
                      const reordered = [...initialOrder];
                      const [movedSpot] = reordered.splice(startIndex, 1);
                      reordered.splice(nextIndex, 0, movedSpot);
                      dragManualOrderRef.current = reordered;
                      setDragManualOrder(reordered);
                    },
                    onPanResponderRelease: () => {
                      const nextManualOrder = dragManualOrderRef.current ?? dragInitialOrderRef.current;
                      const fromIndex = dragStartIndexRef.current ?? manualIndex;
                      const draggedSpotName = dragSpotNameRef.current;
                      const toIndex = draggedSpotName ? nextManualOrder.indexOf(draggedSpotName) : fromIndex;
                      
                      if (nextManualOrder.length > 0) {
                        updateManualOrder(nextManualOrder);
                      }
                      setDraggingManualSpot(null);
                      setDragManualOrder(null);
                      dragStartIndexRef.current = null;
                      dragInitialOrderRef.current = [];
                      dragManualOrderRef.current = null;
                      dragSpotNameRef.current = null;
                      webDragOverIndexRef.current = null;
                    },
                    onPanResponderTerminate: () => {
                      setDraggingManualSpot(null);
                      setDragManualOrder(null);
                      dragStartIndexRef.current = null;
                      dragInitialOrderRef.current = [];
                      dragManualOrderRef.current = null;
                      dragSpotNameRef.current = null;
                      webDragOverIndexRef.current = null;
                    },
                  }) : null;
                  return (
                    <View
                      key={`your-spots-page-selected-${spot}`}
                      {...(panResponder ? panResponder.panHandlers : {})}
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: theme.border,
                        paddingVertical: 10,
                        opacity: draggingManualSpot === spot ? 0.7 : 1,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>{spot}</Text>
                          <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>
                            Distance: {distanceMeters === null ? 'Unknown' : formatDistance(distanceMeters)}
                          </Text>

                          {isHomeSpotWithinCheckInRadius ? (
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                              {!hasActiveCheckedInSession ? (
                                <Pressable
                                  onPress={() => {
                                    void handleQuickCheckIn(spot);
                                  }}
                                  style={{
                                    backgroundColor: '#5EF0D0',
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    borderRadius: 999,
                                  }}
                                >
                                  <Text style={{ color: '#061421', fontSize: 12, fontWeight: '900' }}>
                                    Check in
                                  </Text>
                                </Pressable>
                              ) : null}

                              {isCheckedInAtThisSpot ? (
                                <Pressable
                                  onPress={() => {
                                    void handleQuickCheckOut();
                                  }}
                                  style={{
                                    backgroundColor: '#8b1f38',
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    borderRadius: 999,
                                  }}
                                >
                                  <Text style={{ color: '#ffd7de', fontSize: 12, fontWeight: '900' }}>
                                    Check out
                                  </Text>
                                </Pressable>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {orderMode === 'manual' ? (
                            <>
                              <Pressable
                                disabled={manualIndex === 0}
                                onPress={() => moveManualSpot(spot, manualIndex, 'up')}
                                style={{ paddingHorizontal: 6, paddingVertical: 4, opacity: manualIndex === 0 ? 0.45 : 1 }}
                              >
                                <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: '700' }}>Up</Text>
                              </Pressable>
                              <Pressable
                                disabled={manualIndex === selectedSpotCards.length - 1}
                                onPress={() => moveManualSpot(spot, manualIndex, 'down')}
                                style={{ paddingHorizontal: 6, paddingVertical: 4, opacity: manualIndex === selectedSpotCards.length - 1 ? 0.45 : 1 }}
                              >
                                <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: '700' }}>Down</Text>
                              </Pressable>
                            </>
                          ) : null}
                          <Pressable
                            onPress={() => removeSelectedSpot(spot)}
                            style={{ paddingHorizontal: 6, paddingVertical: 4 }}
                          >
                            <Text style={{ color: '#ff9f9f', fontSize: 12, fontWeight: '700' }}>Remove</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={{ color: theme.textMuted, marginTop: 8 }}>No spots selected yet.</Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (showBuddies) {
    const trimmedSearch = searchUsersInput.trim().toLowerCase();
    const filteredBuddyUsers = (Array.isArray(buddyUsers) ? buddyUsers : []).filter((userItem) => {
      if (!trimmedSearch) {
        return true;
      }

      const searchableName = userItem.display_name.toLowerCase();
      return searchableName.includes(trimmedSearch);
    });
    
    const followedUsers = (Array.isArray(buddyUsers) ? buddyUsers : []).filter((userItem) => followingUserIds.includes(userItem.id));

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgElevated, paddingHorizontal: 20, paddingTop: 20 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
          <View style={{ backgroundColor: theme.card, borderRadius: 14, padding: 16 }}>
            <Text style={{ color: theme.text, fontSize: 26, fontWeight: '700' }}>Buddies</Text>

            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', marginTop: 16 }}>Follow requests</Text>
            {incomingFollowRequests.length === 0 ? (
              <Text style={{ color: theme.textSoft, marginTop: 8 }}>No open follow requests</Text>
            ) : (
              <View style={{ marginTop: 10 }}>
                {incomingFollowRequests.map((requestItem) => {
                  const isRequestInFlight = followRequestActionId === requestItem.id;
                  return (
                    <View
                      key={`incoming-follow-request-${requestItem.id}`}
                      style={{
                        backgroundColor: theme.bgElevated,
                        borderRadius: 10,
                        
                        borderColor: theme.border,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        marginBottom: 18,
                      }}
                    >
                      <Text style={{ color: theme.text, fontSize: 15, marginBottom: 8 }}>
                        {requestItem.requester?.display_name ?? 'Unknown user'}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable
                          disabled={isRequestInFlight}
                          onPress={() => {
                            void handleAcceptFollowRequest(requestItem);
                          }}
                          style={{
                            flex: 1,
                            backgroundColor: '#166534',
                            borderRadius: 8,
                            paddingVertical: 4,
                            opacity: isRequestInFlight ? 0.5 : 1,
                          }}
                        >
                          <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '700' }}>Accept</Text>
                        </Pressable>
                        <Pressable
                          disabled={isRequestInFlight}
                          onPress={() => {
                            void handleRejectFollowRequest(requestItem);
                          }}
                          style={{
                            flex: 1,
                            backgroundColor: '#991b1b',
                            borderRadius: 8,
                            paddingVertical: 4,
                            opacity: isRequestInFlight ? 0.5 : 1,
                          }}
                        >
                          <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '700' }}>Decline</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', marginTop: 16 }}>Buddies</Text>
            {followedUsers.length === 0 ? (
              <Text style={{ color: theme.textSoft, marginTop: 8 }}>You are not following anyone yet</Text>
            ) : (
              <View style={{ marginTop: 10 }}>
                {followedUsers.map((userItem) => (
                  <View key={`following-${userItem.id}`} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Avatar uri={userItem.avatar_url} size={28} />
                    <Text style={{ color: theme.text, marginLeft: 2, fontSize: 15 }}>{userItem.display_name}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', marginTop: 16 }}>Followers</Text>
            {followerUsers.length === 0 ? (
              <Text style={{ color: theme.textSoft, marginTop: 8 }}>You do not have followers yet</Text>
            ) : (
              <View style={{ marginTop: 10 }}>
                {followerUsers.map((userItem) => (
                  <View key={`follower-${userItem.id}`} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Avatar uri={userItem.avatar_url} size={28} />
                    <Text style={{ color: theme.text, marginLeft: 8, fontSize: 15 }}>{userItem.display_name}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', marginTop: 18 }}>All users</Text>
            <TextInput
              value={searchUsersInput}
              onChangeText={setSearchUsersInput}
              placeholder="Search users"
              placeholderTextColor={theme.textMuted}
              style={{
                marginTop: 10,
                
                borderColor: theme.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 4,
                color: theme.text,
                backgroundColor: theme.bgElevated,
              }}
            />
            {loadingBuddies ? <Text style={{ color: theme.textSoft, marginTop: 8 }}>Loading...</Text> : null}
            {buddiesError ? <Text style={{ color: '#ff7e7e', marginTop: 8 }}>{buddiesError}</Text> : null}
            <View style={{ marginTop: 10 }}>
              {filteredBuddyUsers.map((userItem) => {
                const followStatus = outgoingFollowStatusesByUserId[userItem.id];
                const isFollowed = followStatus === 'accepted';
                const isPending = followStatus === 'pending';
                const isActionInFlight = buddyActionUserId === userItem.id;
                const actionLabel = isPending ? 'Requested' : isFollowed ? 'Unfollow' : 'Send follow request';

                return (
                  <View
                    key={`buddy-user-${userItem.id}`}
                    style={{
                      backgroundColor: theme.bgElevated,
                      borderRadius: 10,
                      
                      borderColor: theme.border,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      marginBottom: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}>
                      <Avatar uri={userItem.avatar_url} size={30} />
                      <Text style={{ color: theme.text, marginLeft: 10, fontSize: 15, flexShrink: 1 }}>{userItem.display_name}</Text>
                    </View>
                    <Pressable
                      disabled={isActionInFlight || isPending}
                      onPress={() => {
                        if (isFollowed) {
                          void handleUnfollowUser(userItem.id);
                          return;
                        }
                        void handleFollowUser(userItem.id);
                      }}
                      style={{
                        backgroundColor: isPending ? '#334155' : isFollowed ? '#7c2d12' : '#1d4ed8',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        opacity: isActionInFlight ? 0.5 : 1,
                      }}
                    >
                      <Text style={{ color: '#ffffff', fontWeight: '700' }}>
                        {isActionInFlight ? '...' : actionLabel}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <Pressable
              onPress={() => {
                setShowBuddies(false);
                setBuddiesError('');
              }}
              style={{ marginTop: 6, backgroundColor: theme.bgElevated, borderRadius: 10, padding: 12 }}
            >
              <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Back</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (showProfile) {
    const handlePickProfileAvatar = async () => {
      setProfileEditError('');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setProfileEditError("Allow photo access to choose a profile photo");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled) {
        setProfileAvatarInputUri(result.assets[0].uri);
      }
    };

    const handleSaveProfile = async () => {
      const trimmedName = profileNameInput.trim();
      const isAvatarOnlyUpdate = Boolean(profileAvatarInputUri) && trimmedName === profile.display_name;

      if (!isAvatarOnlyUpdate && !trimmedName) {
        setProfileEditError('Name is required');
        return;
      }

      if (!isAvatarOnlyUpdate && trimmedName.length < 2) {
        setProfileEditError('Name must be at least 2 characters');
        return;
      }

      if (!isAvatarOnlyUpdate && trimmedName.length > 20) {
        setProfileEditError('Name can be at most 20 characters');
        return;
      }

      const normalizedEmail = normalizeEmail(session.user.email ?? '');

      if (!isAvatarOnlyUpdate && hasBlockedSpotbuddyName(trimmedName, normalizedEmail)) {
        
        setProfileEditError('Username not allowed');
        return;
      }

      if (!isAvatarOnlyUpdate && hasRestrictedWord(trimmedName)) {
        
        setProfileEditError('Username contains restricted words');
        return;
      }

      setProfileEditError('');
      setIsSavingProfile(true);

      if (!isAvatarOnlyUpdate) {
        const { data: existingProfile, error: existingProfileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('display_name', trimmedName)
          .neq('id', session.user.id)
          .maybeSingle();

        if (existingProfileError) {
          setIsSavingProfile(false);
          setProfileEditError(existingProfileError.message);
          return;
        }

        if (existingProfile) {
          setIsSavingProfile(false);
          setProfileEditError('This name is already taken');
          return;
        }
      }

      const activeProfileId = activeProfile?.id ?? null;
      let avatarUrl = profile.avatar_url;
      if (profileAvatarInputUri) {
        const avatarUploadId = activeProfileId ?? session.user.id;
        const { error: uploadError, publicUrl } = await uploadAvatar(avatarUploadId, profileAvatarInputUri);
        if (uploadError) {
          setIsSavingProfile(false);
          setProfileEditError('Photo upload failed');
          return;
        }
        if (!publicUrl) {
          setIsSavingProfile(false);
          setProfileEditError('Avatar URL is missing');
          return;
        }
        avatarUrl = publicUrl;
        
        

        if (!activeProfileId) {
          setIsSavingProfile(false);
          setProfileEditError('Profile not found');
          return;
        }

        const avatarUpdateResult = await supabase
          .from('profiles')
          .update({ avatar_url: avatarUrl })
          .eq('id', activeProfileId);
        
        const { error: avatarUpdateError } = avatarUpdateResult;

        if (avatarUpdateError) {
          setIsSavingProfile(false);
          if (avatarUpdateError.code === '42501') {
            setProfileEditError('Your profile cannot be updated');
            return;
          }
          setProfileEditError(avatarUpdateError.message);
          return;
        }
      }

      if (!isAvatarOnlyUpdate) {
        const payload = {
          display_name: trimmedName,
        };
        

        const updateResult = await supabase
          .from('profiles')
          .update(payload)
          .eq('id', session.user.id);
        
        const { error: updateError } = updateResult;

        if (updateError) {
          setIsSavingProfile(false);
          if (updateError.code === '23505') {
            setProfileEditError('This name is already taken');
            return;
          }
          if (updateError.code === '42501') {
            setProfileEditError('Your profile cannot be updated');
            return;
          }
          setProfileEditError(updateError.message);
          return;
        }
      }

      const { data: freshProfile, error: freshProfileError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, created_at')
        .eq('id', session.user.id)
        .single();
      

      if (freshProfileError) {
        setIsSavingProfile(false);
        setProfileEditError(freshProfileError.message);
        return;
      }

      setProfile(freshProfile);
      setIsSavingProfile(false);
      setProfileAvatarInputUri(null);
      setProfileEditError('');
    };

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgElevated, paddingHorizontal: 20, paddingTop: 20 }}>
        <View style={{ backgroundColor: theme.card, borderRadius: 14, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Avatar uri={profileAvatarInputUri ?? profile.avatar_url} size={42} />
            <View style={{ marginLeft: 10 }}>
              <Text style={{ color: theme.text, fontSize: 24, fontWeight: '700' }}>{profileNameInput || profile.display_name}</Text>
              <Text style={{ color: theme.textSoft, marginTop: 4 }}>Logged in</Text>
            </View>
          </View>

          <View style={{ marginTop: 16 }}>
            <TextInput
              value={profileNameInput}
              onChangeText={setProfileNameInput}
              placeholder="Display name"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              style={{ backgroundColor: theme.bgElevated, color: theme.text, borderRadius: 10, padding: 10, marginBottom: 10 }}
            />

            {profileEditError ? <Text style={{ color: '#ff7e7e', marginBottom: 10 }}>{profileEditError}</Text> : null}
          </View>

          <Pressable
            onPress={() => {
              void handlePickProfileAvatar();
            }}
            style={{ marginTop: 10, backgroundColor: theme.bgElevated, borderRadius: 10, padding: 12 }}
          >
            <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Change photo</Text>
          </Pressable>

          <Pressable
            disabled={isSavingProfile}
            onPress={() => {
              void handleSaveProfile();
            }}
            style={{
              marginTop: 10,
              backgroundColor: theme.bgElevated,
              borderRadius: 10,
              padding: 12,
              opacity: isSavingProfile ? 0.6 : 1,
            }}
          >
            <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>
              {isSavingProfile ? 'Save...' : 'Save'}
            </Text>
          </Pressable>

          <Pressable onPress={() => {
            setShowProfile(false);
            setShowBuddies(true);
          }} style={{ marginTop: 10, backgroundColor: theme.bgElevated, borderRadius: 10, padding: 12 }}>
            <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Buddies</Text>
          </Pressable>

          {isAccountSwitcherVisible ? (
            <View style={{ marginTop: 10 }}>
              <Pressable
                onPress={() => {
                  const nextOpen = !showAccountSwitcher;
                  setShowAccountSwitcher(nextOpen);
                  if (nextOpen) {
                    
                    void loadOwnedProfiles();
                  }
                }}
                style={{ backgroundColor: theme.bgElevated, borderRadius: 10, padding: 12 }}
              >
                <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Switch account</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const nextOpen = !showAdminCreateProfile;
                  setShowAdminCreateProfile(nextOpen);
                  if (!nextOpen) {
                    setAdminCreateAvatarInputUri(null);
                    setAdminCreateWarning('');
                  }
                  if (nextOpen) {
                    
                  }
                }}
                style={{ marginTop: 8, backgroundColor: theme.bgElevated, borderRadius: 10, padding: 12 }}
              >
                <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Create profile</Text>
              </Pressable>
              {showAdminCreateProfile ? (
                <View style={{ marginTop: 8, backgroundColor: theme.bgElevated, borderRadius: 10,  borderColor: theme.border, padding: 10 }}>
                  <TextInput
                    value={adminCreateNameInput}
                    onChangeText={setAdminCreateNameInput}
                    placeholder="Profile name / username"
                    placeholderTextColor={theme.textMuted}
                    autoCapitalize="none"
                    style={{ backgroundColor: theme.card, color: theme.text, borderRadius: 8, padding: 10, marginBottom: 8 }}
                  />
                  <Pressable
                    onPress={async () => {
                      setAdminCreateError('');
                      setAdminCreateWarning('');
                      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                      if (status !== 'granted') {
                        setAdminCreateError('Allow photo access to choose a profile photo');
                        return;
                      }

                      const result = await ImagePicker.launchImageLibraryAsync({
                        mediaTypes: ImagePicker.MediaTypeOptions.Images,
                        allowsEditing: true,
                        aspect: [1, 1],
                        quality: 0.7,
                      });

                      if (!result.canceled) {
                        setAdminCreateAvatarInputUri(result.assets[0].uri);
                      }
                    }}
                    style={{ backgroundColor: theme.card, borderRadius: 8, padding: 10, marginBottom: 8 }}
                  >
                    <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>
                      {adminCreateAvatarInputUri ? 'Change avatar (optional)' : 'Pick avatar (optional)'}
                    </Text>
                  </Pressable>
                  {adminCreateAvatarInputUri ? (
                    <View style={{ marginBottom: 8, alignItems: 'center' }}>
                      <Avatar uri={adminCreateAvatarInputUri} size={42} />
                    </View>
                  ) : null}
                  {adminCreateError && (
                    <Text style={{ color: 'red' }}>
                      {typeof adminCreateError === 'string'
                        ? adminCreateError
                        : JSON.stringify(adminCreateError, null, 2)}
                    </Text>
                  )}
                  {adminCreateWarning ? <Text style={{ color: '#f2c66d', marginBottom: 8, fontSize: 12 }}>{adminCreateWarning}</Text> : null}
                  <Pressable
                    disabled={isAdminCreatingProfile}
                    onPress={() => {
                      void handleAdminCreateProfile();
                    }}
                    style={{ backgroundColor: theme.card, borderRadius: 8, padding: 10, opacity: isAdminCreatingProfile ? 0.6 : 1 }}
                  >
                    <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>
                      {isAdminCreatingProfile ? 'Creating...' : 'Create profile'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {showAccountSwitcher ? (
                <View style={{ marginTop: 8, backgroundColor: theme.bgElevated, borderRadius: 10,  borderColor: theme.border, padding: 8 }}>
                  {(() => {
                    const data = visibleProfiles;
                    
                    return null;
                  })()}
                  {switchAccountError ? (
                    <Text style={{ color: '#ff7e7e', marginBottom: 8, fontSize: 12 }}>{switchAccountError}</Text>
                  ) : null}
                  <View style={{ marginBottom: 8 }}>
                    <Text style={{ color: theme.textSoft, fontSize: 12 }}>
                      Profiles found: {visibleProfiles.length}
                    </Text>
                    {visibleProfiles.map((profile) => (
                      <Text key={`switch-account-debug-${profile.id}`} style={{ color: theme.textSoft, fontSize: 12 }}>
                        - {profile.display_name ?? '(no display_name)'}
                      </Text>
                    ))}
                  </View>
                  {visibleProfiles.map((account) => {
                    const profile = account;
                    
                    const isActive = account.id === activeAppUserId;
                    return (
                      <Pressable
                        key={`switch-account-${account.id}`}
                        onPress={() => {
                          void handleSelectAccount(account);
                        }}
                        style={{
                          borderRadius: 8,
                          
                          borderColor: theme.border,
                          backgroundColor: isActive ? '#D8F5FF' : theme.cardStrong,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          marginBottom: 6,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <Avatar uri={account.avatar_url ?? null} size={34} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{account.display_name}</Text>
                          <Text style={{ color: theme.textSoft, fontSize: 12 }}>
                            {account.id}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          <Pressable onPress={() => {
            resetFlow();
            setShowAdminCreateProfile(false);
            setAdminCreateAvatarInputUri(null);
            void supabase.auth.signOut();
          }} style={{ marginTop: 16, backgroundColor: theme.bgElevated, borderRadius: 10, padding: 12 }}>
            <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Log out</Text>
          </Pressable>

          <Pressable onPress={() => {
            setShowProfile(false);
            setShowAccountSwitcher(false);
            setShowAdminCreateProfile(false);
            setProfileAvatarInputUri(null);
            setAdminCreateAvatarInputUri(null);
            setProfileEditError('');
          }} style={{ marginTop: 10, backgroundColor: theme.bgElevated, borderRadius: 10, padding: 12 }}>
            <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (selectedSpot) {
    const spotSessions = (daySessionsBySpot[selectedSpot] ?? []).filter((s) => getCleanSessionStatus(s) !== 'finished');

    const liveSessions = spotSessions.filter((s) => getCleanSessionStatus(s) === 'live');
    const goingSessions = spotSessions.filter((s) => !isSessionExpired(s) && getCleanSessionStatus(s) === 'going');
    const maybeSessions = spotSessions.filter((s) => !isSessionExpired(s) && getCleanSessionStatus(s) === 'maybe');

    const liveCount = liveSessions.length;
    const goingCount = goingSessions.length;
    const maybeCount = maybeSessions.length;
    const totalSessions = spotSessions.length;

    const sendGroupChatMessage = async () => {
      const messageText = groupMessageInput.trim();
      if (!messageText || !activeGroupChatKey) return;

      const existingConversationResponse = await supabase
        .from('conversations')
        .select('id')
        .eq('type', 'group')
        .eq('spot_name', selectedSpot)
        .eq('session_day', selectedDayKey)
        .eq('group_key', activeGroupChatKey)
        .limit(1);

      let conversationId = Array.isArray(existingConversationResponse.data)
        ? existingConversationResponse.data[0]?.id ?? null
        : null;

      if (!conversationId) {
        const createConversationResponse = await supabase
          .from('conversations')
          .insert({
            type: 'group',
            spot_name: selectedSpot,
            session_day: selectedDayKey,
            group_key: activeGroupChatKey,
          })
          .select('id')
          .single();

        if (createConversationResponse.error) {
          console.error('GROUP_CHAT_CREATE_ERROR', createConversationResponse.error);
          return;
        }

        conversationId = createConversationResponse.data?.id ?? null;
      }

      const { error } = await supabase
        .from('messages')
        .insert({
          user_id: activeAppUserId,
          text: messageText,
          spot_name: selectedSpot,
          session_day: selectedDayKey,
          conversation_id: conversationId,
          created_at: new Date().toISOString(),
        });

      if (error) {
        console.error('GROUP_CHAT_SEND_ERROR', error);
        return;
      }

      setGroupMessageInput('');
      setGroupMessages((prev) => [...prev, {
        id: `${conversationId}-${Date.now()}`,
        text: messageText,
        userId: activeAppUserId,
        display_name: activeProfile?.display_name?.trim() || 'You',
        avatar_url: activeProfile?.avatar_url ?? null,
        created_at: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }]);

      setGroupMessagesRefreshKey((value) => value + 1);
    };

    const sendSpotChatMessage = async () => {
      const messageText = messageInput.trim();
      if (!messageText || !selectedSpot) return;

      const payload = {
        user_id: activeAppUserId,
        text: messageText,
        spot_name: selectedSpot,
        created_at: new Date().toISOString(),
      };

      const existingConversationResponse = await supabase
        .from('conversations')
        .select('id')
        .eq('type', 'spot')
        .eq('spot_name', selectedSpot)
        .eq('session_day', selectedDayKey)
        .limit(1);

      let conversationId = Array.isArray(existingConversationResponse.data)
        ? existingConversationResponse.data[0]?.id ?? null
        : null;

      if (!conversationId) {
        const createConversationResponse = await supabase
          .from('conversations')
          .insert({
            type: 'spot',
            spot_name: selectedSpot,
            session_day: selectedDayKey,
          })
          .select('id')
          .single();

        if (createConversationResponse.error) {
          console.error('CHAT_CONVERSATION_CREATE_ERROR', createConversationResponse.error);
          return;
        }

        conversationId = createConversationResponse.data?.id ?? null;
      }

      const { error } = await supabase
        .from('messages')
        .insert({
          ...payload,
          session_day: selectedDayKey,
          conversation_id: conversationId,
        });

      if (error) {
        console.error('FULL ERROR', error);
        return;
      }

      setMessageInput('');
      setMessagesBySpot((prev) => {
        const key = `${selectedSpot}-${selectedDayKey}`;
        const previousMessages = prev[key] ?? [];

        return {
          ...prev,
          [key]: [...previousMessages, {
            id: `${conversationId}-${Date.now()}`,
            text: messageText,
            userId: activeAppUserId,
            display_name: activeProfile?.display_name?.trim() || 'You',
            avatar_url: activeProfile?.avatar_url ?? null,
            created_at: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          }],
        };
      });
      setTimeout(() => {
        spotChatScrollRef.current?.scrollToEnd({ animated: false });
      }, 0);
      scheduleRealtimeRefetch();
    };

    const joinSession = async ({ sessionId, sessionDay, sessionStatus, normalizedStart, normalizedEnd }: SessionJoinRequest) => {
      if (joinInFlightSessionId === sessionId) {
        return;
      }

      setJoinInFlightSessionId(sessionId);
      console.log("JOIN_HANDLER_START");
      const joinState = spotState.joinStateBySession[sessionId]
        ?? getJoinState({
          session: {
            id: sessionId,
            sessionDay,
            status: sessionStatus,
          },
          ownSessionForSpotDay: spotState.ownSessionForSpotDay,
          activeDayKey: activeDateKey,
        });
      console.log("JOIN_HANDLER_PRECHECK", {
        sessionId: sessionId ?? null,
        allowed: joinState?.allowed ?? null,
        reason: joinState?.reason ?? null
      });
      console.log("STABLE_JOIN_PRECHECK", {
        activeProfileId: activeProfile?.id ?? null,
        selectedSpot: getSelectedSpotName(selectedSpot),
        activeDay,
        hasOwnSession: spotState.hasOwnSession ?? false,
        ownSessionId: spotState.ownSession?.id ?? null
      });
      console.log("JOIN_HANDLER_INPUT", {
        userId: activeProfile?.id ?? activeAppUserId ?? null,
        spotName: getSelectedSpotName(selectedSpot),
        sessionDay,
        startTime: normalizedStart,
        endTime: normalizedEnd
      });
      const input = buildJoinActionInput({
        activeProfile,
        selectedSpot,
        activeDayKey: activeDateKey,
        activeDay,
        intent,
        session: {
          sessionId,
          sessionDay,
          sessionStatus,
          normalizedStart,
          normalizedEnd,
        },
      });
      console.log("JOIN_INPUT_BUILT", input);
      console.log("JOIN_SERVICE_CALL_INPUT", input);
      logSessionUiActionStart({
        type: 'joinSession',
        selectedSpot,
        activeDay,
      });
      try {
        const result = await joinSessionAction(input);
        console.log("JOIN_SERVICE_CALL_RESULT", result);
        const joinResultReason = 'reason' in result ? result.reason : null;
        console.log("JOIN_HANDLER_RESULT_AFTER_CLICK", {
          ok: result?.ok ?? false,
          reason: joinResultReason
        });
        logSessionUiActionResult('joinSession', result);
        if (!result.ok) {
          const joinReason = joinResultReason;
          setSessionActionError(getJoinErrorMessageByReason(joinReason));
          return;
        }

        await fetchSharedData({ skipLoadingState: true });
        setSessionActionError('');
        setSelectedTimelineSessionId(null);
      } catch (error) {
        console.error('JOIN_HANDLER_ERROR', error);
        setSessionActionError('Joining the session failed. Please try again.');
      } finally {
        setJoinInFlightSessionId(null);
      }
    };
    const handleQuickLive = async () => {
  console.log("QUICK_LIVE_START");

  if (!activeProfile?.id || !selectedSpot) return;

  const now = new Date();

  const start = now;
  const end = new Date(now.getTime() + (2 * 60 * 60 * 1000));

  console.log("QUICK_LIVE_DISABLED_PENDING_JOIN_HANDLER_REWIRE", {
    selectedPlanningDateKey,
    start: `${start.getHours()}:${String(start.getMinutes()).padStart(2,'0')}`,
    end: `${end.getHours()}:${String(end.getMinutes()).padStart(2,'0')}`,
  });
};

const handleSave = async () => {
      console.log("PLAN_HANDLER_START");
      logSessionUiActionStart({
        type: 'planSession',
        selectedSpot,
        activeDay,
      });

      setSaveError(null);
      
      const startTotalMinutes = startHour === null ? null : (startHour * 60) + startMinute;
      const endTotalMinutes = endHour === null ? null : (endHour * 60) + endMinute;
      const nowReference = getPlanningNowReference(selectedPlanningDateKey, getCurrentLocalMinutes());
      const validationReason = (() => {
        if (startHour === null || endHour === null || startTotalMinutes === null || endTotalMinutes === null) {
          return 'INVALID_TIME_RANGE';
        }
        if (startTotalMinutes < timelineStartMinutes || endTotalMinutes > planningEndMinutes || endTotalMinutes <= startTotalMinutes) {
          return 'INVALID_TIME_RANGE';
        }
        if (nowReference.isToday && startTotalMinutes < nowReference.earliestStartMinutes) {
          return 'INVALID_TIME_FOR_TODAY';
        }
        return null;
      })();
      const isValid = validationReason === null;
      console.log("PLAN_HANDLER_VALIDATION_RESULT", {
        valid: isValid,
        reason: validationReason ?? null
      });
      if (!isValid) {
        if (validationReason === 'INVALID_TIME_FOR_TODAY') {
          setFormError('Start time cannot be in the past.');
        } else {
          setFormError('Please choose a valid time range.');
        }
        logSessionUiActionResult('planSession', {
          ok: false,
          reason: validationReason,
        });
        return;
      }
      
      if (!activeProfile?.id) {
        setFormError('Planning the session failed. Please try again.');
        setSaveError({ message: 'missing_auth_or_profile' });
        logSessionUiActionResult('planSession', {
          ok: false,
          reason: 'UNKNOWN_ERROR',
        });
        
        return;
      }
      const input = buildPlanActionInput({
        selectedSpot,
        activeDayKey: selectedPlanningDateKey,
        startHour,
        startMinute,
        endHour,
        endMinute,
        intent,
        editingSessionId,
        activeProfile,
        activeDay,
      });
      console.log("PLAN_INPUT_BUILT", input);
      console.log("STABLE_PLAN_PRECHECK", {
        activeProfileId: activeProfile?.id ?? null,
        selectedSpot: getSelectedSpotName(selectedSpot),
        activeDay,
        hasOwnSession: spotState.hasOwnSession ?? false,
        ownSessionId: spotState.ownSession?.id ?? null
      });
      console.log("PLAN_SERVICE_CALL_INPUT", input);
      const result = await planSessionAction(input);
      console.log("PLAN_SERVICE_CALL_RESULT", result);
      logSessionUiActionResult('planSession', result);
      if (!result.ok) {
        const resultReason = 'reason' in result ? result.reason : null;
        const mappedReason = resultReason === 'WRITE_FAILED' ? 'UNKNOWN_ERROR' : resultReason;
        const persistenceError = ('error' in result ? result.error : null) as {
          code?: string;
          message?: string;
          details?: string;
          hint?: string;
        } | null | undefined;
        setFormError(getSessionPersistenceErrorMessage(persistenceError, 'Planning the session failed. Please try again.'));
        setSaveError({
          message: persistenceError?.message,
          details: persistenceError?.details,
          hint: persistenceError?.hint,
          code: persistenceError?.code,
          response: { ...result, reason: mappedReason },
        });
        return;
      }

      
      await fetchSharedData();
      resetForm();
      setSessionActionError('');
    };
    const primaryButtonStyle = {
      backgroundColor: 'rgba(255,255,255,0.055)',
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      minHeight: 38,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    } as const;
    const sessionActionButtonBaseStyle = {
      flex: 1,
      borderRadius: 8,
      minHeight: 38,
      paddingVertical: 8,
      paddingHorizontal: 12,
      justifyContent: 'center',
      alignItems: 'center',
    } as const;
    const autoCheckoutBanner = autoCheckoutNotice ? (
      <View style={{ backgroundColor: '#16324d',  borderColor: '#2f5f86', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }}>
        <Text style={{ color: '#d9eeff', fontSize: 13, fontWeight: '700' }}>Automatically checked out</Text>
        <Text style={{ color: '#d9eeff', fontSize: 13, marginTop: 2 }}>You appear to have left the spot</Text>
      </View>
    ) : null;

    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 34 }}>
        <Pressable onPress={() => setSelectedSpot(null)} style={{ marginBottom: 18 }}>
          <Text style={{ color: theme.textSoft, fontSize: 15, letterSpacing: 0.2 }}>← Back to spots</Text>
        </Pressable>

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 14 }}>
          {!isSelectedSpotSaved && canAddSelectedSpotToMySpots ? (
            <Pressable
              onPress={() => {
                if (selectedSpot) {
                  addSelectedSpot(selectedSpot);
                }
              }}
              style={{
                backgroundColor: theme.card,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '900' }}>
                Add to my spots
              </Text>
            </Pressable>
          ) : null}

          {isSelectedSpotSaved ? (
            <View
              style={{
                backgroundColor: theme.card,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '800' }}>
                In your spots
              </Text>
            </View>
          ) : null}
        </View>
        {autoCheckoutBanner}

        <View style={{ backgroundColor: 'transparent', borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 10, marginBottom: 0, borderWidth: 0, borderBottomWidth: 0, borderColor: 'transparent' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View />
            <Pressable
              onPress={() => {
                setIsNotificationPanelExpanded((prev) => !prev);
              }}
              style={{
                borderRadius: 999,
                
                borderColor: theme.border,
                backgroundColor: theme.bgElevated,
                paddingHorizontal: 10,
                paddingVertical: 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: '600' }}>{`Buzz${unreadCount ? ` (${unreadCount})` : ''}`}</Text>
              <View style={{ width: 6, height: 8, borderRadius: 999, backgroundColor: areAnySpotBuzzEnabled ? theme.primary : theme.textMuted }} />
            </Pressable>
          </View>
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: theme.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.4 }}>{selectedSpot}</Text>
            <Text style={{ color: liveCount > 0 ? '#5EF0D0' : theme.textMuted, fontSize: 13, fontWeight: '800', marginTop: 5 }}>
              {liveCount > 0 ? 'Live now' : 'No one live now'}
            </Text>
          </View>
          
          {false && selectedSpotMomentumLabel ? (
            <View style={{ alignSelf: 'flex-start', marginTop: 8, borderRadius: 999,  borderColor: theme.border, backgroundColor: theme.bgElevated, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '700' }}>{selectedSpotMomentumLabel}</Text>
            
</View>
          ) : null}
          {isNotificationPanelExpanded ? (
            <View style={{ marginTop: 10, borderRadius: 14, borderColor: theme.border, backgroundColor: '#081827', paddingHorizontal: 14, paddingVertical: 12 }}>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>
                Buzz for this spot
              </Text>
            </View>
          ) : null}
        </View>

        
<TargetSpotSummaryCards
          metrics={[
            { icon: '⚡', label: 'LIVE', helper: 'Checked in', value: liveCount, color: '#5EF0D0', sessions: liveSessions },
            { icon: '👥', label: 'GOING', helper: 'Definitely coming', value: goingCount, color: '#4DB8FF', sessions: goingSessions },
            { icon: '◌', label: 'MAYBE', helper: 'Might come', value: maybeCount, color: '#5F83A6', sessions: maybeSessions },
          ]}
        />

        
<View style={{ backgroundColor: 'transparent', padding: 0, marginTop: 10, marginBottom: 18 }}>
          
          {checkInCtaVisible ? (
            <Pressable
              onPress={() => {
                void handleUpdateSessionStatus('Is er al');
              }}
              style={{ ...primaryButtonStyle, backgroundColor: '#5EF0D0', marginBottom: 10 }}
            >
              <Text style={{ color: '#061421', fontSize: 12, fontWeight: '900' }}>
                Check in now · {selectedSpotDistanceMeters !== null ? `${Math.round(selectedSpotDistanceMeters)} m away` : 'nearby'}
              </Text>
            </Pressable>
          ) : null}

          {topCtaMode === 'plan' ? (
            <Pressable
              onPress={() => {
                if (hasOwnSessionOnSelectedSpotDay) {
                return;
              }
                openEmptyPlanningForm();
              }}
              style={{ ...primaryButtonStyle, opacity: 1 }}
            >
              <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>Plan session</Text>
            </Pressable>
          ) : null}
          {topCtaMode === 'edit' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
              {canCheckOut ? (
                <Pressable
                  onPress={() => {
                    void handleUpdateSessionStatus('Uitchecken');
                  }}
                  style={{
                    backgroundColor: '#8b1f38',
                    borderRadius: 999,
                    paddingHorizontal: 13,
                    paddingVertical: 7,
                  }}
                >
                  <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '900' }}>Check out</Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => {
                  setShowManageSessions(true);
                  setShowForm(false);
                  setEditingSessionId(null);
                  setActivePicker(null);
                  setSessionActionError('');
                  setFormError('');
                  setSaveError(null);
                }}
                style={{ paddingVertical: 6, paddingHorizontal: 0, opacity: 1 }}
              >
                <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: '800' }}>☰ Manage sessions</Text>
              </Pressable>
              {ownSessionCount === 1 ? (
                <Pressable
                  disabled={!joinedSession || !canCancelJoinedSession}
                  onPress={() => {
                    if (!joinedSession || !canCancelJoinedSession) {
                      return;
                    }
                    void handleCancelPlannedSession();
                  }}
                  style={{ paddingVertical: 6, paddingHorizontal: 0, opacity: joinedSession && canCancelJoinedSession ? 1 : 0.35 }}
                >
                  <Text style={{ color: '#ff8fa3', fontSize: 13, fontWeight: '800' }}>× Cancel session</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  setShowManageSessions(false);
                  setSessionActionError('');
                  openEmptyPlanningForm();
                }}
                style={{ paddingVertical: 6, paddingHorizontal: 0 }}
              >
                <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: '800' }}>＋ Add extra session</Text>
              </Pressable>
              {showManageSessions ? (
                <Pressable
                  onPress={() => setShowManageSessions(false)}
                  style={{ paddingVertical: 6, paddingHorizontal: 0 }}
                >
                  <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '800' }}>Close</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {showManageSessions ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>
                Manage sessions open
              </Text>
              <Text style={{ color: theme.textSoft, fontSize: 12 }}>
                Count: {(spotState.ownSessionForSpotDay?.ownSessions ?? []).length}
              </Text>
              {ownActiveSessions.map((sessionItem) => (
                <View key={sessionItem.id} style={{  borderColor: theme.border, borderRadius: 14, padding: 10, gap: 8 }}>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>
                    {sessionItem.start} - {sessionItem.end}
                  {(() => {
                    const toMinutes = (value?: string | null) => {
                      if (!value) return null;
                      const [h, m] = value.split(':').map(Number);
                      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
                      return h * 60 + m;
                    };

                    const myStart = toMinutes(sessionItem.start);
                    const myEnd = toMinutes(sessionItem.end);
                    if (myStart === null || myEnd === null || myEnd <= myStart) return null;

                    const overlaps = (spotState.sessionsForSpot ?? [])
                      .filter((otherSession) => otherSession.id !== sessionItem.id)
                      .map((otherSession) => {
                        const otherStart = toMinutes(otherSession.start);
                        const otherEnd = toMinutes(otherSession.end);
                        if (otherStart === null || otherEnd === null || otherEnd <= otherStart) return null;

                        const overlapMinutes = Math.max(0, Math.min(myEnd, otherEnd) - Math.max(myStart, otherStart));
                        if (overlapMinutes <= 0) return null;

                        const overlapPercent = Math.round((overlapMinutes / (myEnd - myStart)) * 100);
                        const name = otherSession.userName || 'Someone';
if (overlapPercent < 25) return null;
const barColor = overlapPercent >= 75 ? '#5EF0D0' : overlapPercent >= 50 ? '#eab308' : '#f97316';
return { name, overlapPercent, barColor };
                      })
                      .filter(Boolean)
                      .slice(0, 3);

                    if (overlaps.length === 0) return <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>Overlap: none</Text>;

                    console.log('BUDDY_OVERLAP_RESULT', { sessionId: sessionItem.id, overlaps });

                    return (
                      <View style={{ marginTop: 6, gap: 5 }}>
                        {overlaps.map((overlapItem, index) => (
                          <View key={`${sessionItem.id}-overlap-${index}`}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                              <Text style={{ color: theme.textSoft, fontSize: 12 }}>Overlap with {overlapItem.name}</Text>
                              <Text style={{ color: theme.textSoft, fontSize: 12 }}>{overlapItem.overlapPercent}%</Text>
                            </View>
                            <View style={{ height: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                              <View style={{ width: `${overlapItem.overlapPercent}%`, height: '100%', backgroundColor: overlapItem.barColor, borderRadius: 999 }} />
                            </View>
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => {
                        setEditingSessionId(sessionItem.id);
                        const parsedStart = parseHourMinuteParts(sessionItem.start);
                        const parsedEnd = parseHourMinuteParts(sessionItem.end);
                        setStartHour(parsedStart.hour);
                        setStartMinute(parsedStart.minute);
                        setEndHour(parsedEnd.hour);
                        setEndMinute(parsedEnd.minute);
                        setIntent(resolveSessionIntent(sessionItem.intent));
                        setShowForm(true);
                        setShowManageSessions(false);
                        setActivePicker(null);
                        setSessionActionError('');
                        setFormError('');
                        setSaveError(null);
                      }}
                      style={{ ...sessionActionButtonBaseStyle, backgroundColor: '#1e3a8a' }}
                    >
                      <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        void handleCancelPlannedSession(sessionItem);
                        setShowManageSessions(false);
                      }}
                      style={{ ...sessionActionButtonBaseStyle, backgroundColor: '#8b1f38' }}
                    >
                      <Text style={{ color: '#ffd7de', fontSize: 14, fontWeight: '700' }}>Cancel session</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 6 }}>{headerHelperText}</Text>
          {sessionActionError ? <Text style={{ color: '#ff7e7e', fontSize: 14, marginTop: 8 }}>{sessionActionError}</Text> : null}

          {showForm ? (
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: theme.textSoft, fontSize: 14, marginBottom: 6 }}>Start time</Text>

              <View style={{ flexDirection: 'row', marginBottom: 6, gap: 8 }}>
                <Pressable onPress={() => { setActivePicker((prev) => (prev === 'startHour' ? null : 'startHour')); setFormError(''); }} style={{ flex: 1, backgroundColor: theme.bgElevated, borderRadius: 14,  borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ color: theme.text, fontSize: 15 }}>Hour: {startHour === null ? '--' : formatTimePart(startHour)}</Text>
                </Pressable>
                <Pressable onPress={() => { setActivePicker((prev) => (prev === 'startMinute' ? null : 'startMinute')); setFormError(''); }} style={{ flex: 1, backgroundColor: theme.bgElevated, borderRadius: 14,  borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ color: theme.text, fontSize: 15 }}>Minute: {formatTimePart(startMinute)}</Text>
                </Pressable>
              </View>
              {activePicker === 'startHour' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                  {startHourOptions.map((hour) => (
                    <Pressable
                      key={`start-hour-${hour}`}
                      onPress={() => {
                        setStartHour(hour);
                        if (planningNowReference.isToday) {
                          const earliestMinuteForHour = minuteOptions.find((minute) => (hour * 60) + minute >= planningNowReference.earliestStartMinutes);
                          if (earliestMinuteForHour !== undefined && startMinute < earliestMinuteForHour) {
                            setStartMinute(earliestMinuteForHour);
                          }
                        }
                      }}
                      style={{ backgroundColor: startHour === hour ? theme.primary : theme.bgElevated,  borderColor: theme.border, borderRadius: 10, padding: 16, marginRight: 8, marginBottom: 8 }}
                    >
                      <Text style={{ color: theme.text }}>{formatTimePart(hour)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {activePicker === 'startMinute' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                  {minuteOptions
                    .filter((minute) => {
                      if (startHour === null) {
                        return false;
                      }
                      const selectedStartMinutes = (startHour * 60) + minute;
                      if (planningNowReference.isToday && selectedStartMinutes < planningNowReference.earliestStartMinutes) {
                        return false;
                      }
                      return selectedStartMinutes <= planningNowReference.latestPlanningStartMinutes;
                    })
                    .map((minute) => (
                    <Pressable key={`start-minute-${minute}`} onPress={() => setStartMinute(minute)} style={{ backgroundColor: startMinute === minute ? theme.primary : theme.bgElevated,  borderColor: theme.border, borderRadius: 10, padding: 16, marginRight: 8, marginBottom: 8 }}>
                      <Text style={{ color: theme.text }}>{formatTimePart(minute)}</Text>
                    </Pressable>
                    ))}
                </View>
              ) : null}

              <Text style={{ color: theme.textSoft, fontSize: 14, marginBottom: 6 }}>End time</Text>
              <View style={{ flexDirection: 'row', marginBottom: 6, gap: 8 }}>
                <Pressable onPress={() => { setActivePicker((prev) => (prev === 'endHour' ? null : 'endHour')); setFormError(''); }} style={{ flex: 1, backgroundColor: theme.bgElevated, borderRadius: 14,  borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ color: theme.text, fontSize: 15 }}>Hour: {endHour === null ? '--' : formatTimePart(endHour)}</Text>
                </Pressable>
                <Pressable onPress={() => { setActivePicker((prev) => (prev === 'endMinute' ? null : 'endMinute')); setFormError(''); }} style={{ flex: 1, backgroundColor: theme.bgElevated, borderRadius: 14,  borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ color: theme.text, fontSize: 15 }}>Minute: {formatTimePart(endMinute)}</Text>
                </Pressable>
              </View>
              {activePicker === 'endHour' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                  {(Array.isArray(hours) ? hours : []).filter((hour) => hour >= 8 && hour <= 22).map((hour) => (
                    <Pressable key={`end-hour-${hour}`} onPress={() => setEndHour(hour)} style={{ backgroundColor: endHour === hour ? theme.primary : theme.bgElevated,  borderColor: theme.border, borderRadius: 10, padding: 16, marginRight: 8, marginBottom: 8 }}>
                      <Text style={{ color: theme.text }}>{formatTimePart(hour)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {activePicker === 'endMinute' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                  {minuteOptions.map((minute) => (
                    <Pressable key={`end-minute-${minute}`} onPress={() => setEndMinute(minute)} style={{ backgroundColor: endMinute === minute ? theme.primary : theme.bgElevated,  borderColor: theme.border, borderRadius: 10, padding: 16, marginRight: 8, marginBottom: 8 }}>
                      <Text style={{ color: theme.text }}>{formatTimePart(minute)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Text style={{ color: theme.textSoft, fontSize: 14, marginBottom: 6 }}>Intent</Text>
              <View style={{ flexDirection: 'row', marginBottom: 10, gap: 8 }}>
                {sessionIntentOptions.map((option) => {
                  const isActive = intent === option.value;
                  return (
                    <Pressable
                      key={`intent-${option.value}`}
                      onPress={() => {
                        setIntent(option.value);
                        
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: isActive ? theme.primary : theme.bgElevated,
                        borderRadius: 10,
                        
                        borderColor: theme.border,
                        paddingVertical: 8,
                        paddingHorizontal: 8,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: theme.text, fontSize: 13, fontWeight: isActive ? '700' : '600' }}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {formError ? (
                <Text
                  style={{
                    color: formError === planningHelperText ? theme.textMuted : '#ff7e7e',
                    fontSize: formError === planningHelperText ? 13 : 14,
                    marginBottom: 10,
                  }}
                >
                  {formError}
                </Text>
              ) : null}
              {saveError ? (
                <Text style={{ color: '#ffb3b3', fontSize: 12, marginBottom: 10 }}>
                  {`Save error: ${saveError.message || saveError.details || 'unknown'}`}
                </Text>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => {
                    console.log("PLAN_BUTTON_CLICK", {
                      selectedSpot: (selectedSpot as { name?: string } | null)?.name ?? selectedSpot ?? null,
                      activeDay,
                      startHour,
                      startMinute,
                      endHour,
                      endMinute,
                      intent
                    });
                    void handleSave();
                  }}
                  style={{ ...primaryButtonStyle, flex: 1 }}
                >
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{editingSessionId ? 'Update' : 'Save'}</Text>
                </Pressable>
                <Pressable onPress={resetForm} style={{ ...primaryButtonStyle, flex: 1, backgroundColor: theme.bgElevated }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        <View style={{ backgroundColor: 'transparent', padding: 0, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            
            <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 999, padding: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
              {([
                { key: 'everyone' as const, label: 'Everyone' },
                { key: 'buddies' as const, label: 'Buddies' },
              ]).map((option) => {
                const isActive = timelineFilter === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setTimelineFilter(option.key)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: isActive ? '#202833' : 'transparent',
                    }}
                  >
                    <Text style={{ color: isActive ? '#ffffff' : theme.textMuted, fontSize: 12, fontWeight: '800' }}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ marginBottom: 14 }}>
            <View style={{ marginLeft: 252, marginRight: 104, height: 16, position: 'relative' }}>
              {timelineLabels.map((item) => {
                const totalMinutes = Math.max(timelineWindow.endMinutes - timelineWindow.startMinutes, 1);
                const leftPercent = clamp(((item.minutes - timelineWindow.startMinutes) / totalMinutes) * 100, 0, 100);

                return (
                  <Text
                    key={item.label}
                    style={{
                      position: 'absolute',
                      left: `${leftPercent}%`,
                      transform: [{ translateX: -8 }],
                      color: theme.textMuted,
                      fontSize: 11,
                    }}
                  >
                    {item.label}
                  </Text>
                );
              })}
            </View>
          </View>
          <SessionTimeline
            groupedSessions={spotState.groupedSessions}
            joinStateBySession={spotState.joinStateBySession}
            selectedTimelineSessionId={selectedTimelineSessionId}
            currentProfileId={activeAppUserId}
            selectedSpot={selectedSpot}
            ownSessionForSpotDay={spotState.ownSessionForSpotDay}
            currentLocalMinutes={activeDay === 'today' ? currentLocalMinutes : timelineStartMinutes}
            timelineWindowStartMinutes={timelineWindow.startMinutes}
            timelineWindowEndMinutes={timelineWindow.endMinutes}
            timelineFilter={timelineFilter}
            showNowMarker={activeDay === 'today'}
            activeDay={activeDay}
            onSelectSession={(sessionId) => setSelectedTimelineSessionId(sessionId)}
            onClearSelection={() => setSelectedTimelineSessionId(null)}
            onJoinSession={(joinRequest) => {
              void joinSession(joinRequest);
            }}
            onOpenGroupChat={(groupKey) => {
              setActiveGroupChatKey(groupKey);
            }}
            activeGroupChatKey={activeGroupChatKey}
          />

        </View>

        {false && shouldShowNowAtSpotPanel ? (
          <View style={{ backgroundColor: theme.card, borderRadius: 18, padding: 16, marginBottom: 10,  borderColor: theme.border }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>Now at the spot</Text>
            {nowAtSpotMode === 'live' ? (
              <>
                <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 10 }}>{liveKiterCountLabel}</Text>
                <View>
                  {checkedInUsers.map((liveSession) => (
                    <View key={`live-${liveSession.id}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 }} numberOfLines={1}>{liveSession.userName}</Text>
                      <Text style={{ color: theme.textMuted, fontSize: 12 }}>{`checked in at ${formatToHourMinute(liveSession.checkedInAt)}`}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : nowAtSpotMode === 'upcoming' ? (
              <>
                <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 10 }}>
                  {activeDay === 'today' ? 'Coming up today' : 'Coming up tomorrow'}
                </Text>
                <View>
                  {upcomingSessions.map((upcomingSession) => (
                    <View key={`upcoming-${upcomingSession.id}`} style={{ marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 }} numberOfLines={1}>{upcomingSession.userName}</Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>{`${upcomingSession.start}–${upcomingSession.end}`}</Text>
                      </View>
                      <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                        {getIntentGoingLabel(resolveSessionIntent(upcomingSession.intent))}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>No one at the spot yet</Text>
            )}
          </View>
        ) : null}

        {activeGroupChatKey ? (
          <View style={{ backgroundColor: 'transparent', borderRadius: 22, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.055)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                <Text style={{ fontSize: 16 }}>💬</Text>
              </View>
              <View>
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: '900' }}>
                  {activeGroupChatContext?.title ?? 'Group Chat'}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                  {activeGroupChatContext?.subtitle ?? 'Messages for this session'}
                </Text>
              </View>
            </View>

            {groupMessages.length > 0 ? (
              <ScrollView
                ref={groupChatScrollRef}
                style={{ maxHeight: 250, marginTop: 12 }}
                onContentSizeChange={() => {
                  setTimeout(() => {
                    const node = groupChatScrollRef.current as any;
                    console.log('GROUP_SCROLL_METRICS', {
                      hasRef: Boolean(node),
                      keys: node ? Object.keys(node).slice(0, 20) : [],
                      hasScrollableNode: Boolean(node?.getScrollableNode),
                      hasInnerViewNode: Boolean(node?.getInnerViewNode),
                    });
                    const scrollNode =
                      (groupChatScrollRef.current as any)?.getScrollableNode?.();
                    const innerNode =
                      (groupChatScrollRef.current as any)?.getInnerViewNode?.();

                    console.log('GROUP_SCROLL_NODE_NUMBERS_BEFORE', {
                      scrollTop: scrollNode?.scrollTop,
                      scrollHeight: scrollNode?.scrollHeight,
                      clientHeight: scrollNode?.clientHeight,
                      innerScrollHeight: innerNode?.scrollHeight,
                      innerClientHeight: innerNode?.clientHeight,
                    });

                    if (scrollNode) {
                      scrollNode.scrollTop = scrollNode.scrollHeight;
                    }

                    console.log('GROUP_SCROLL_NODE_NUMBERS_AFTER', {
                      scrollTop: scrollNode?.scrollTop,
                      scrollHeight: scrollNode?.scrollHeight,
                      clientHeight: scrollNode?.clientHeight,
                    });
                  }, 0);
                }}
              >
                {groupMessages.map((message) => {
                  const renderedTime = message.createdAt ? formatToHourMinute(message.createdAt) : '';
                  return (
                    <View key={message.id} style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 }}>
                      <Avatar uri={message.avatar_url} size={24} />
                      <View style={{ marginLeft: 8, maxWidth: '84%', backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 16, borderBottomLeftRadius: 5, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.065)' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                          <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: '800', flexShrink: 1 }} numberOfLines={1}>
                            {message.display_name}
                          </Text>
                          {renderedTime ? (
                            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '700' }}>
                              {renderedTime}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={{ color: theme.text, fontSize: 15, marginTop: 3 }}>{message.text}</Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 12 }}>No group messages yet</Text>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.065)', paddingLeft: 12, paddingRight: 5, paddingVertical: 5, marginTop: 10 }}>
              <TextInput
                value={groupMessageInput}
                onChangeText={setGroupMessageInput}
                onSubmitEditing={() => {
                  void sendGroupChatMessage();
                }}
                blurOnSubmit={false}
                placeholder="Type a group message"
                placeholderTextColor={theme.textMuted}
                style={({ flex: 1, color: theme.text, paddingVertical: 7, paddingRight: 8, fontSize: 15, outlineStyle: 'none', boxShadow: 'none' } as any)}
              />
            <Pressable
              data-group-chat-send="true"
              onPress={() => {
                void sendGroupChatMessage();
              }}
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#05070a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}
            >
              <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '900' }}>↑</Text>
            </Pressable>
            </View>
          </View>
        ) : null}

        <View style={{ backgroundColor: 'transparent', borderRadius: 22, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.055)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
              <Text style={{ fontSize: 16 }}>💬</Text>
            </View>
            <View>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: '900' }}>Spot Chat</Text>
              <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 }}>Messages for this spot</Text>
            </View>
          </View>

          {orderedMessages.length > 0 ? (
            <ScrollView
              ref={spotChatScrollRef}
              style={{ maxHeight: 250, marginBottom: 12 }}
              onContentSizeChange={() => {
                setTimeout(() => {
                  const scrollNode =
                    (spotChatScrollRef.current as any)?.getScrollableNode?.();

                  if (scrollNode) {
                    scrollNode.scrollTop = scrollNode.scrollHeight;
                  }
                }, 0);
              }}
            >
              {orderedMessages
                .slice()
                .sort((a, b) => {
                  const aTime = new Date(a.createdAt ?? a.created_at ?? a.timestamp ?? 0).getTime();
                  const bTime = new Date(b.createdAt ?? b.created_at ?? b.timestamp ?? 0).getTime();
                  return aTime - bTime;
                })
                .map((message) => (
                (() => {
                  const chosenTimestampValue =
                    message?.createdAt ??
                    message?.created_at ??
                    message?.timestamp ??
                    null;
                  const renderedTime = chosenTimestampValue
                    ? formatToHourMinute(chosenTimestampValue)
                    : "";
                  const isOwnMessage = message.userId === activeAppUserId;

                  return (
                    <View key={message.id} style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 }}>
                      <Avatar uri={message.avatar_url} size={24} />
                      <View style={{ marginLeft: 8, maxWidth: '84%', backgroundColor: isOwnMessage ? 'rgba(32,40,51,0.95)' : 'rgba(255,255,255,0.045)', borderRadius: 16, borderBottomLeftRadius: 5, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: isOwnMessage ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.065)' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                          <Text style={{ color: isOwnMessage ? '#dbeafe' : theme.textSoft, fontSize: 11, fontWeight: '800', flexShrink: 1 }} numberOfLines={1}>
                            {isOwnMessage ? 'You' : message.display_name}
                          </Text>
                          {renderedTime ? (
                            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '700' }}>
                              {renderedTime}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={{ color: theme.text, fontSize: 15, marginTop: 3 }}>{message.text}</Text>
                      </View>
                    </View>
                  );
                })()
              ))}
            </ScrollView>
          ) : (
            <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 12 }}>No messages yet</Text>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.065)', paddingLeft: 12, paddingRight: 5, paddingVertical: 5 }}>
            <TextInput
              value={messageInput}
              onChangeText={setMessageInput}
              onSubmitEditing={() => {
                void sendSpotChatMessage();
              }}
              blurOnSubmit={false}
              placeholder="Type a message"
              placeholderTextColor={theme.textMuted}
              style={({ flex: 1, color: theme.text, paddingVertical: 7, paddingRight: 8, fontSize: 15, outlineStyle: 'none', boxShadow: 'none' } as any)}
            />
          <Pressable
            data-spot-chat-send="true"
            onPress={() => {
              void sendSpotChatMessage();
            }}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#05070a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '900' }}>↑</Text>
          </Pressable>
          </View>
        </View>


      </ScrollView>
    );
  }
  const visibleSpots = homeSpotCards.map(({ spot, distanceMeters }) => ({ name: spot, distanceMeters }));
  
  
  
  
  
  
  
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 32 }}>

        <View style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
            <View
              style={{
                width: 120,
                height: 120,
                overflow: 'hidden',
                marginRight: -12,
                marginLeft: -4,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Image
                source={require('./assets/logo.png')}
                style={{ width: 210, height: 210, marginLeft: 8 }}
                resizeMode="contain"
              />
            </View>

            <Image
              source={require('./assets/wordmark.png')}
              style={{ width: 470, height: 110, marginLeft: -125 }}
              resizeMode="contain"
            />
          </View>

          {plannedSession ? (
            <Pressable
              onPress={() => setSelectedSpot(plannedSession.spot)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                width: 620,
                minHeight: 104,
                marginLeft: 54,
                marginBottom: 4,
                backgroundColor: 'transparent',
                borderRadius: 24,
                borderWidth: 0,

                paddingVertical: 12,
                paddingLeft: 0,
                paddingRight: 22,
              }}
            >
              <Pressable
                key={headerProfile?.userId ?? 'header-profile-empty'}
                onPress={(event) => {
                  event.stopPropagation();
                  setShowProfile(true);
                }}
                style={{ marginLeft: -44, marginRight: 24 }}
              >
                <View>
                  <Avatar uri={headerProfile?.avatarUrl ?? null} size={88} />
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'transparent',
                      paddingVertical: 3,
                      alignItems: 'center',
                      borderBottomLeftRadius: 44,
                      borderBottomRightRadius: 44,
                    }}
                  >
                    <Text style={{ color: theme.text, fontWeight: '900', fontSize: 12 }}>
                      You
                    </Text>
                  </View>
                </View>
              </Pressable>

              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }}>
                    Planned session
                  </Text>

                  {plannedSessionTimeLabel ? (
                    <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>
                      {plannedSessionTimeLabel}
                    </Text>
                  ) : null}
                </View>
                <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800', marginTop: 4 }}>
                  {plannedSession.spot}
                </Text>
                <Text style={{ color: theme.textSoft, fontSize: 18, fontWeight: '600', marginTop: 2 }}>
                  {plannedSessionIntentLabel}
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12, justifyContent: 'flex-start' }}>
          <Pressable
            onPress={() => setShowYourSpotsPage(true)}
            style={{
              width: 170,
              backgroundColor: 'rgba(255,255,255,0.075)',
              borderRadius: 999,
              paddingVertical: 7,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>Spots</Text>
          </Pressable>

          <Pressable
            onPress={() => setShowDiscoverSpotsPage(true)}
            style={{
              width: 170,
              backgroundColor: 'rgba(255,255,255,0.075)',
              borderRadius: 999,
              paddingVertical: 7,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>
              Discover
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setShowBuddies(true)}
            style={{
              width: 170,
              backgroundColor: 'rgba(255,255,255,0.075)',
              borderRadius: 999,
              paddingVertical: 7,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>Buddies</Text>
            {hasPendingRequests && pendingRequestsCount !== null ? (
              <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: theme.bg, fontSize: 10, fontWeight: '900' }}>{pendingRequestsCount}</Text>
              </View>
            ) : null}
          </Pressable>

          <Pressable
            onPress={() => {
              setIsNotificationInboxExpanded((prev) => {
                const nextExpanded = !prev;
                if (nextExpanded) void markAllBuzzAsRead();
                return nextExpanded;
              });
            }}
            style={{
              width: 170,
              backgroundColor: 'rgba(255,255,255,0.075)',
              borderRadius: 999,
              paddingVertical: 5,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>{`Buzz (${unreadCount})`}</Text>
          </Pressable>
        </View>

        {isNotificationInboxExpanded ? (
          <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 14, marginBottom: 16 }}>
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800', marginBottom: 10 }}>Recent notifications</Text>
            {notificationRows.length === 0 ? (
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>No notifications yet.</Text>
            ) : (
              notificationRows.map((notificationRow, index) => (
                <View key={notificationRow.id} style={{ paddingTop: index === 0 ? 0 : 10, marginTop: index === 0 ? 0 : 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: theme.border }}>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: notificationRow.read === false ? '800' : '600' }}>
                    {getNotificationInboxSummary(notificationRow)}
                  </Text>
                  {notificationRow.created_at ? (
                    <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 3 }}>
                      {new Date(notificationRow.created_at).toLocaleString()}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 999, padding: 2, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
          {([
            { key: 'today' as const, label: 'Today' },
            { key: 'tomorrow' as const, label: 'Tomorrow' },
          ]).map((option) => {
            const isActive = activeDay === option.key;
            return (
              <Pressable
                key={`home-day-${option.key}`}
                onPress={() => setActiveDay(option.key)}
                style={{
  backgroundColor: isActive ? '#202833' : 'transparent',
  borderRadius: 999,
  paddingVertical: 6,
  paddingHorizontal: 13,
  marginRight: 0,
  opacity: 1
}}
              >
                <Text style={{ color: isActive ? '#ffffff' : theme.textMuted, fontSize: 12, fontWeight: '800' }}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginBottom: 18 }}>
          {isResolvingNearestSpot ? (
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>Nearest spot · Getting location...</Text>
          ) : nearestSpotResult && nearestSpotDistanceLabel ? (
            (() => {
              const nearestSessions = daySessionsBySpot[nearestSpotResult.spot] ?? [];
              const nearestStatus = getSpotStatus({
                spotName: nearestSpotResult.spot,
                sessions: nearestSessions,
                selectedDay: activeDay,
                now: new Date(),
                getSessionState,
              });
              const activityParts = [
                nearestStatus.activeCount > 0 ? `● ${nearestStatus.activeCount} now` : null,
                nearestStatus.plannedCount > 0 ? `${nearestStatus.plannedCount} later` : null,
              ].filter(Boolean);
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingVertical: 6 }}>
                  <Pressable onPress={() => setSelectedSpot(nearestSpotResult.spot)} style={{ alignSelf: 'flex-start' }}>
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                      Nearest spot · <Text style={{ color: theme.primary, fontWeight: '800' }}>{nearestSpotResult.spot}</Text> · {nearestSpotDistanceLabel}
                      {activityParts.length > 0 ? (
                        <Text style={{ color: theme.primary, fontWeight: '800' }}> · {activityParts.join(' · ')}</Text>
                      ) : null}
                    </Text>
                  </Pressable>

                  {false ? (
                    <Pressable
                      onPress={() => {
                        console.log('HOME_NEAREST_CHECKIN_BUTTON_PRESSED', {
                          nearestSpot: nearestSpotResult.spot,
                          nearestSpotDistance: nearestSpotResult.distanceMeters,
                          nearestSpotCanCheckIn,
                          hasActiveCheckedInSession,
                        });
                        void handleQuickCheckIn(nearestSpotResult.spot);
                      }}
                      style={{ backgroundColor: '#5EF0D0', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}
                    >
                      <Text style={{ color: '#061421', fontSize: 11, fontWeight: '900' }}>CHECK IN</Text>
                    </Pressable>
                  ) : null}

                  {false ? (
                    <Pressable
                      onPress={() => {
                        void handleQuickCheckOut();
                      }}
                      style={{ backgroundColor: '#8b1f38', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}
                    >
                      <Text style={{ color: '#ffd7de', fontSize: 11, fontWeight: '900' }}>CHECK OUT</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })()
          ) : (
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>Nearest spot · No nearby spot</Text>
          )}
        </View>

        {visibleSpots.length === 0 ? (
          <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 16 }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>No spots selected yet</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>Manage your list from Your spots.</Text>
          </View>
        ) : null}

        {visibleSpots.map((spot) => {
          const daySpotSessions = daySessionsBySpot[spot.name] ?? [];
          const status = getSpotStatus({
            spotName: spot.name,
            sessions: daySpotSessions,
            selectedDay: activeDay,
            now: new Date(),
            getSessionState,
          });

          const statusLabel = status.label;
          const cleanDaySpotSessions = daySpotSessions.filter((sessionItem) => getCleanSessionStatus(sessionItem) !== 'finished');
          const liveSessions = cleanDaySpotSessions.filter((sessionItem) => getCleanSessionStatus(sessionItem) === 'live');

          if (normalizeSpotName(spot.name) === normalizeSpotName('Scheveningen KZVS')) {
          }
          const goingSessions = cleanDaySpotSessions.filter((sessionItem) => getCleanSessionStatus(sessionItem) === 'going');
          const maybeSessions = cleanDaySpotSessions.filter((sessionItem) => getCleanSessionStatus(sessionItem) === 'maybe');
          const activeCount = liveSessions.length;
          const goingCount = goingSessions.length;
          const maybeCount = maybeSessions.length;
          const isLiveSpot = activeCount > 0;
          const liveRiders = liveSessions.slice(0, 4);
          const activeRiderSessions = [...liveSessions, ...goingSessions, ...maybeSessions].slice(0, 5);
          const totalActiveRiders = activeCount + goingCount + maybeCount;

          const forecastHours = Array.from({ length: 16 }).map((_, hourIndex) => {
            const hour = 7 + hourIndex;

            const sessionsInHour = cleanDaySpotSessions.filter((sessionItem) => {
              const [startHourRaw, startMinuteRaw] = String(sessionItem.start || '0:00').split(':');
              const [endHourRaw, endMinuteRaw] = String(sessionItem.end || '0:00').split(':');

              const startMinutes =
                (Number(startHourRaw) * 60) + Number(startMinuteRaw || 0);
              const endMinutes =
                (Number(endHourRaw) * 60) + Number(endMinuteRaw || 0);

              const hourStartMinutes = hour * 60;
              const hourEndMinutes = hourStartMinutes + 60;

              return startMinutes < hourEndMinutes && endMinutes > hourStartMinutes;
            });



            const liveHourCount = sessionsInHour.filter(
              (sessionItem) => getCleanSessionStatus(sessionItem) === 'live'
            ).length;

            const goingHourCount = sessionsInHour.filter(
              (sessionItem) => getCleanSessionStatus(sessionItem) === 'going'
            ).length;

            const maybeHourCount = sessionsInHour.filter(
              (sessionItem) => getCleanSessionStatus(sessionItem) === 'maybe'
            ).length;

            const totalHourCount =
              (liveHourCount * 1.6) +
              (goingHourCount * 1.25) +
              (maybeHourCount * 0.85);

            let color = 'rgba(255,255,255,0.10)';

            if (liveHourCount > 0) {
              color = '#5EF0D0';
            } else if (goingHourCount > 0) {
              color = '#4DB8FF';
            } else if (maybeHourCount > 0) {
              color = '#5F83A6';
            }

            return {
              hour,
              liveHourCount,
              goingHourCount,
              maybeHourCount,
              totalHourCount,
              color,
              height: totalHourCount > 0
                ? Math.max(34, Math.min(82, totalHourCount * 24))
                : 8,
            };
          });

          const bestForecastHour = [...forecastHours]
            .sort((a, b) => b.totalHourCount - a.totalHourCount)[0];

          const bestWindowLabel =
            bestForecastHour && bestForecastHour.totalHourCount > 0
              ? `${String(bestForecastHour.hour).padStart(2, '0')}:00–${String(Math.min(22, bestForecastHour.hour + 2)).padStart(2, '0')}:00`
              : null;

          return (
            <Pressable
              key={spot.name}
              onPress={() => setSelectedSpot(spot.name)}
              style={({ pressed }) => ({
                backgroundColor: '#071421',
                borderRadius: 24,
                padding: 22,
                marginBottom: 18,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.07)',
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18 }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                    <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900', letterSpacing: 0.2 }}>
                      {spot.name}
                    </Text>

                    <Text
                      style={{
                        color: 'rgba(255,255,255,0.36)',
                        fontSize: 11,
                        fontWeight: '800',
                        letterSpacing: 1,
                      }}
                    >
                      SESSION FORECAST — TODAY
                    </Text>
                  </View>

                  <Text style={{ color: 'rgba(255,255,255,0.52)', marginTop: 5, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>
                    {spot.distanceMeters === null ? 'DISTANCE UNKNOWN' : `${formatDistance(spot.distanceMeters)} AWAY`}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end', minWidth: 150 }}>
                  {statusLabel ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          backgroundColor: isLiveSpot ? '#5EF0D0' : '#4DB8FF',
                          marginRight: 7,
                        }}
                      />
                      <Text
                        style={{
                          color: isLiveSpot ? '#5EF0D0' : '#4DB8FF',
                          fontSize: 12,
                          fontWeight: '800',
                        }}
                      >
                        {statusLabel}
                      </Text>
                    </View>
                  ) : null}

                  <Text
                    style={{
                      color: 'rgba(255,255,255,0.48)',
                      fontSize: 11,
                      fontWeight: '600',
                      marginTop: 5,
                    }}
                  >
                    Best window 14:00–16:00
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 26 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                    paddingHorizontal: 2,
                  }}
                >
                  {Array.from({ length: 16 }).map((_, hourIndex) => {
                    const hour = 7 + hourIndex;
                    return (
                      <Text
                        key={`hour-${spot.name}-${hour}`}
                        style={{
                          color: 'rgba(255,255,255,0.46)',
                          fontSize: 10,
                          fontWeight: '800',
                        }}
                      >
                        {String(hour).padStart(2, '0')}
                      </Text>
                    );
                  })}
                </View>

                <View
                  style={{
                    position: 'relative',
                    height: 96,
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(255,255,255,0.12)',
                    paddingHorizontal: 2,
                  }}
                >
                  {Array.from({ length: 16 }).map((_, index) => {
                    const bars = forecastHours.map((forecastHour) => ({
                          h: forecastHour.height,
                          c: forecastHour.color,
                        }));

                    const item = bars[index];

                    return (
                      <View
                        key={`forecast-bar-${spot.name}-${index}`}
                        style={{
                          width: 18,
                          height: item.h,
                          borderRadius: 6,
                          backgroundColor: item.c,
                        }}
                      />
                    );
                  })}

                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: `${Math.max(0, Math.min(100, (((new Date().getHours() + new Date().getMinutes() / 60) - 7) / 15) * 100))}%`,
                      bottom: -31,
                      alignItems: 'center',
                      transform: [{ translateX: -24 }],
                    }}
                  >
                    <View
                      style={{
                        width: 0,
                        height: 0,
                        borderLeftWidth: 7,
                        borderRightWidth: 7,
                        borderBottomWidth: 10,
                        borderLeftColor: 'transparent',
                        borderRightColor: 'transparent',
                        borderBottomColor: 'rgba(255,255,255,0.9)',
                        marginBottom: 4,
                      }}
                    />

                    <View
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.95)',
                        paddingHorizontal: 9,
                        paddingVertical: 3,
                        borderRadius: 999,
                      }}
                    >
                      <Text style={{ color: '#061421', fontSize: 11, fontWeight: '900' }}>
                        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 26,
                    marginTop: 42,
                    paddingTop: 14,
                    borderTopWidth: 1,
                    borderTopColor: 'rgba(255,255,255,0.06)',
                  }}
                >
                  <Text style={{ color: activeCount > 0 ? '#5EF0D0' : theme.textMuted, fontSize: 13, fontWeight: '800' }}>
                    ● {activeCount} live
                  </Text>

                  <Text style={{ color: goingCount > 0 ? '#4DB8FF' : theme.textMuted, fontSize: 13, fontWeight: '800' }}>
                    ● {goingCount} going
                  </Text>

                  <Text style={{ color: maybeCount > 0 ? '#5F83A6' : theme.textMuted, fontSize: 13, fontWeight: '800' }}>
                    ● {maybeCount} maybe
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
