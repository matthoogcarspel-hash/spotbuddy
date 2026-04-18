import { useEffect, useMemo, useRef, useState } from 'react';

import { Session as AuthSession } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Image, PanResponder, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';

import { uploadAvatar } from './src/lib/avatar';
import { spots } from './src/data/spots';
import { Profile, supabase } from './src/lib/supabase';
import { hasBlockedSpotbuddyName, hasRestrictedWord, normalizeEmail } from './src/lib/userValidation';
import AuthScreen from './src/screens/AuthScreen';
import NameSetupScreen from './src/screens/NameSetupScreen';

const fallbackSpots = spots;
type SpotName = string;
type SpotDefinition = {
  spot: SpotName;
  latitude: number;
  longitude: number;
};
type SessionStatus = 'Is er al' | 'Gaat' | 'Uitchecken' | 'live' | 'finished';
type SessionIntent = 'maybe' | 'likely' | 'definitely';
type SpotSession = {
  id: string;
  spot: SpotName;
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
};
type ChatMessage = {
  id: string;
  text: string;
  userId: string;
  display_name: string;
  avatar_url: string | null;
  createdAt: string | null;
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
type SpotMomentumLabel =
  | 'Happening now'
  | 'Looks on today'
  | 'Session forming today'
  | 'Maybe forming today'
  | 'Looks on tomorrow'
  | 'Session forming tomorrow'
  | 'Maybe forming tomorrow';
type SpotMomentumBuckets = {
  today: SpotMomentumLabel | null;
  tomorrow: SpotMomentumLabel | null;
};
type SpotNotificationPreferences = {
  session_planning_notification_mode: SpotNotificationMode;
  checkin_notification_mode: SpotNotificationMode;
  chat_notification_mode: SpotNotificationMode;
};
type SpotNotificationMode = 'off' | 'following' | 'everyone';
type SpotOrderMode = 'distance' | 'manual';
type FollowStatus = 'pending' | 'accepted' | 'rejected';
type BuddyUser = Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;
type SwitchableAccount = Pick<Profile, 'id' | 'display_name'> & { email: string | null };
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
  { label: 'Likely', value: 'likely' },
  { label: 'Definitely', value: 'definitely' },
];
const theme = {
  bg: '#060b14',
  bgElevated: '#0b1626',
  card: '#101f33',
  cardStrong: '#13263d',
  border: '#1f3d5f',
  text: '#f2f7ff',
  textSoft: '#9eb2c9',
  textMuted: '#7f97b3',
  primary: '#2a8cff',
  primaryPressed: '#1f72d4',
  live: '#21c47f',
  warm: '#c67a44',
};
const formatTimePart = (value: number) => String(value).padStart(2, '0');
const defaultSpotNotificationPreferences: SpotNotificationPreferences = {
  session_planning_notification_mode: 'off',
  checkin_notification_mode: 'off',
  chat_notification_mode: 'off',
};
const favoriteSpotsStorageKey = 'spotbuddy_favorite_spots_v1';
const spotOrderModeStorageKey = 'spotbuddy_spot_order_mode_v1';
const spotManualOrderStorageKey = 'spotbuddy_spot_manual_order_v1';
const HOME_SPOTS_LIMIT = 5;
const adminAccountSwitcherEmail = 'matthoogcarspel@gmail.com';
const resolveNotificationMode = (mode: SpotNotificationMode | null | undefined): SpotNotificationMode =>
  mode === 'off' || mode === 'following' || mode === 'everyone' ? mode : 'off';
const notificationModeOptions: { label: string; value: SpotNotificationMode }[] = [
  { label: 'Off', value: 'off' },
  { label: 'Buddies', value: 'following' },
  { label: 'Everyone', value: 'everyone' },
];
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const formatLocalHourMinute = (dateValue: Date) => `${formatTimePart(dateValue.getHours())}:${formatTimePart(dateValue.getMinutes())}`;
const getNowLocalHourMinute = () => formatLocalHourMinute(new Date());
const getLocalDateKey = (dateValue: Date) => `${dateValue.getFullYear()}-${formatTimePart(dateValue.getMonth() + 1)}-${formatTimePart(dateValue.getDate())}`;
const getCurrentLocalDateKey = () => getLocalDateKey(new Date());
const getTomorrowLocalDateKey = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getLocalDateKey(tomorrow);
};
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
const getIsoDateRangeForLocalDateKey = (localDateKey: string) => {
  const [yearPart, monthPart, dayPart] = localDateKey.split('-').map((value) => Number.parseInt(value ?? '', 10));
  if (!yearPart || !monthPart || !dayPart) {
    return null;
  }

  const dayStart = new Date();
  dayStart.setFullYear(yearPart, monthPart - 1, dayPart);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return {
    dayStartIso: dayStart.toISOString(),
    dayEndIso: dayEnd.toISOString(),
  };
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
const getSessionState = (sessionItem: SpotSession, now = new Date()): DeterministicSessionState => {
  const startDate = getSessionStartTime(sessionItem);
  const endDate = getSessionEndTime(sessionItem);

  if (endDate < now) {
    console.log("SESSION_STATE_DEBUG", { sessionId: sessionItem.id, start: startDate.toISOString(), end: endDate.toISOString(), state: 'finished' });
    return 'finished';
  }

  if (startDate <= now && now <= endDate) {
    console.log("SESSION_STATE_DEBUG", { sessionId: sessionItem.id, start: startDate.toISOString(), end: endDate.toISOString(), state: 'active' });
    return 'active';
  }

  console.log("SESSION_STATE_DEBUG", { sessionId: sessionItem.id, start: startDate.toISOString(), end: endDate.toISOString(), state: 'planned' });
  return 'planned';
};
const isLiveSession = (sessionItem: SpotSession, now = new Date()) => getSessionState(sessionItem, now) === 'active';
const getSpotMomentumLabels = (spotName: SpotName, sessions: SpotSession[]): SpotMomentumBuckets => {
  const nowMinutes = getCurrentLocalMinutes();
  const todayLocalDateKey = getCurrentLocalDateKey();
  const tomorrowLocalDateKey = getTomorrowLocalDateKey();
  const normalizedSpotName = normalizeSpotName(spotName);
  const todaySessions = sessions.filter((sessionItem) => {
    if (normalizeSpotName(sessionItem.spot) !== normalizedSpotName) {
      return false;
    }

    if (sessionItem.checkedOutAt || sessionItem.status === 'finished' || sessionItem.status === 'Uitchecken') {
      return false;
    }

    if (isLiveSession(sessionItem)) {
      const liveDateValue = sessionItem.checkedInAt ?? sessionItem.createdAt;
      return isCreatedOnLocalDate(liveDateValue, todayLocalDateKey);
    }

    if (!hasPlannedTimeWindow(sessionItem)) {
      return false;
    }

    if (!isCreatedOnLocalDate(sessionItem.createdAt, todayLocalDateKey)) {
      return false;
    }

    return toMinutes(sessionItem.start) > nowMinutes;
  });
  console.log("SPOT_MOMENTUM_TODAY_INPUT", { spotName, sessions: todaySessions });

  const realCheckedInTodaySessions = todaySessions.filter((sessionItem) => isRealCheckedInLiveSession(sessionItem));
  let todayLabel: SpotMomentumLabel | null = null;
  if (realCheckedInTodaySessions.length > 0) {
    todayLabel = 'Happening now';
  } else if (todaySessions.some((sessionItem) => sessionItem.intent === 'definitely')) {
    todayLabel = 'Looks on today';
  } else if (todaySessions.some((sessionItem) => sessionItem.intent === 'likely')) {
    todayLabel = 'Session forming today';
  } else if (todaySessions.some((sessionItem) => sessionItem.intent === 'maybe')) {
    todayLabel = 'Maybe forming today';
  }
  console.log("SPOT_MOMENTUM_TODAY_LABEL", { spotName, label: todayLabel });

  const tomorrowSessions = sessions.filter((sessionItem) => {
    if (normalizeSpotName(sessionItem.spot) !== normalizedSpotName) {
      return false;
    }

    if (sessionItem.checkedOutAt || sessionItem.status === 'finished' || sessionItem.status === 'Uitchecken') {
      return false;
    }

    if (isLiveSession(sessionItem)) {
      return false;
    }

    if (!hasPlannedTimeWindow(sessionItem)) {
      return false;
    }

    if (sessionItem.checkedInAt !== null || sessionItem.checkedOutAt !== null) {
      return false;
    }

    return isCreatedOnLocalDate(sessionItem.createdAt, tomorrowLocalDateKey);
  });
  console.log("SPOT_MOMENTUM_TOMORROW_INPUT", { spotName, sessions: tomorrowSessions });

  let tomorrowLabel: SpotMomentumLabel | null = null;
  if (tomorrowSessions.some((sessionItem) => sessionItem.intent === 'definitely')) {
    tomorrowLabel = 'Looks on tomorrow';
  } else if (tomorrowSessions.some((sessionItem) => sessionItem.intent === 'likely')) {
    tomorrowLabel = 'Session forming tomorrow';
  } else if (tomorrowSessions.some((sessionItem) => sessionItem.intent === 'maybe')) {
    tomorrowLabel = 'Maybe forming tomorrow';
  }
  console.log("SPOT_MOMENTUM_TOMORROW_LABEL", { spotName, label: tomorrowLabel });

  return {
    today: todayLabel,
    tomorrow: tomorrowLabel,
  };
};
const isPlannedSession = (sessionItem: SpotSession) =>
  hasPlannedTimeWindow(sessionItem)
  && getSessionState(sessionItem) === 'planned';
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
const getLiveSessions = (sessions: SpotSession[]) => sessions.filter((sessionItem) => isLiveSession(sessionItem) && !isSessionExpired(sessionItem));
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

  const userSessions = sessions.filter((sessionItem) => sessionItem.userId === userId);
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
const normalizeSpotName = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
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
  console.log("SESSION_EXPIRY_CHECK", {
    startTime: sessionWithOptionalTimes?.startTime ?? sessionItem.start,
    endTime: sessionWithOptionalTimes?.endTime ?? sessionItem.end,
    now: new Date(),
    isExpired
  });
  return isExpired;
};
const isGoingLaterSession = (sessionItem: SpotSession, currentLocalMinutes: number) => {
  const sessionWithOptionalTimes = sessionItem as SpotSession & { startTime?: string; endTime?: string };
  console.log("MOMENTUM_HELPER_FIXED");
  console.log("GOING_LATER_SESSION_CHECK", {
    startTime: sessionWithOptionalTimes?.startTime,
    endTime: sessionWithOptionalTimes?.endTime
  });

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
  console.log("DISPLAY_LABEL_INPUT", {
    startTime: (sessionItem as SpotSession & { startTime?: string }).startTime,
    endTime: (sessionItem as SpotSession & { endTime?: string }).endTime,
    now: new Date()
  });
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
      label = 'Happening now';
    } else if (sessionItem.intent === 'definitely') {
      label = 'Looks on today';
    } else if (sessionItem.intent === 'likely') {
      label = 'Session forming today';
    } else {
      label = 'Maybe forming today';
    }
  } else if (isTomorrow) {
    if (sessionItem.intent === 'definitely') {
      label = 'Looks on tomorrow';
    } else if (sessionItem.intent === 'likely') {
      label = 'Session forming tomorrow';
    } else {
      label = 'Maybe forming tomorrow';
    }
  }

  console.log("DISPLAY_LABEL_RESULT", label);

  return label;
};
const timelineStartMinutes = 8 * 60;
const planningEndMinutes = 22 * 60;
const timelineEndMinutes = planningEndMinutes;
const timelinePastWindowMinutes = 2 * 60;
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
const registerForPushNotifications = async (userId: string) => {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    return;
  }

  console.log('push permission granted');

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('Push registration skipped: missing EAS projectId.');
    return;
  }

  const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
  const expoPushToken = tokenResult.data;

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: expoPushToken,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,platform' }
  );

  if (error) {
    console.error('Push token save failed:', error);
    return;
  }

  console.log('push token saved');
};
const getNearestSpot = (currentCoordinates: SpotCoordinates, spotDefinitions: SpotDefinition[]): NearestSpotResult | null => {
  console.log('NEAREST_SPOT_DEBUG_USER_COORDINATES', currentCoordinates);
  let nearestSpot: SpotName | null = null;
  let nearestDistanceMeters = Number.POSITIVE_INFINITY;

  for (const spot of spotDefinitions) {
    const spotCoordinates = {
      latitude: spot.latitude,
      longitude: spot.longitude,
    };
    const distanceMeters = getDistanceMeters(currentCoordinates, spotCoordinates);
    console.log('NEAREST_SPOT_DEBUG_SPOT_DISTANCE', {
      spot: spot.spot,
      userCoordinates: currentCoordinates,
      spotCoordinates,
      distanceMeters,
    });
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
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.cardStrong, borderWidth: 1, borderColor: theme.border }}
      />
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.cardStrong, borderWidth: 1, borderColor: theme.border }}
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
  onPress: () => void;
  onJoin: () => void;
};

function SessionBar({ leftPercent, widthPercent, state, intent, isSelected, showJoinButton, onPress, onJoin }: SessionBarProps) {
  const stateStyle: Record<TimelineState, { bar: string; text: string; border: string; borderStyle?: 'solid' | 'dashed'; opacity?: number }> = {
    planned: { bar: '#204f86', text: '#d7ecff', border: '#63a7ff', borderStyle: 'dashed' },
    planned_no_check_in: { bar: '#6c4f1c', text: '#fff2dd', border: '#d9a04c', borderStyle: 'dashed' },
    live: { bar: '#1c8c73', text: '#ecfff7', border: '#35d3ac' },
    completed: { bar: '#5d6674', text: '#e2e8f1', border: '#8f98a8', opacity: 0.65 },
  };
  const intentStyle = getIntentVisualStyle(intent);
  const timelineLabel = getTimelineLabel(state, true);
  const joinPlacement = getSessionJoinPlacement(leftPercent, widthPercent);

  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={{ flex: 1, height: 28, borderRadius: 999, backgroundColor: theme.bgElevated, borderWidth: 1, borderColor: isSelected ? theme.primary : theme.border, overflow: 'hidden' }}
    >
      <View
        style={{
          position: 'absolute',
          left: `${leftPercent}%`,
          width: `${widthPercent}%`,
          top: 3,
          bottom: 3,
          borderRadius: 999,
          backgroundColor: stateStyle[state].bar,
          borderWidth: intentStyle.barBorderWidth,
          borderColor: stateStyle[state].border,
          borderStyle: stateStyle[state].borderStyle ?? 'solid',
          opacity: (stateStyle[state].opacity ?? 1) * intentStyle.barOpacity,
          justifyContent: 'center',
          paddingHorizontal: 8,
        }}
      >
        <Text numberOfLines={1} style={{ color: stateStyle[state].text, fontSize: 11, fontWeight: '700' }}>
          {timelineLabel}
        </Text>
      </View>

      {showJoinButton ? (
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onJoin();
          }}
          style={{
            position: 'absolute',
            left: `${joinPlacement.leftPercent}%`,
            width: `${timelineJoinButtonWidthPercent}%`,
            top: 5,
            bottom: 5,
            borderRadius: 999,
            backgroundColor: joinPlacement.placement === 'inside' ? '#2a8cff' : '#1a66c9',
            borderWidth: 1,
            borderColor: '#81c0ff',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '700' }}>Join</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

type SessionRowProps = {
  timelineSession: { item: SpotSession; state: TimelineState; isBuddy: boolean };
  currentUserId: string | null | undefined;
  timelineWindowStartMinutes: number;
  timelineWindowEndMinutes: number;
  isSelected: boolean;
  onSelect: (sessionId: string) => void;
  onJoin: (sessionItem: SpotSession) => void;
};

function SessionRow({ timelineSession, currentUserId, timelineWindowStartMinutes, timelineWindowEndMinutes, isSelected, onSelect, onJoin }: SessionRowProps) {
  const { item, state, isBuddy } = timelineSession;
  const resolvedIntent = resolveSessionIntent(item.intent);
  const intentLabel = getIntentGoingLabel(resolvedIntent);
  const intentStyle = getIntentVisualStyle(resolvedIntent);
  const hasPlannedWindow = hasPlannedTimeWindow(item);
  const checkedInMinutes = getLocalMinutesFromIso(item.checkedInAt);
  const sessionStartMinutes = hasPlannedWindow ? toMinutes(item.start) : (checkedInMinutes ?? timelineStartMinutes);
  const sessionEndMinutes = hasPlannedWindow
    ? toMinutes(item.end)
    : Math.min((checkedInMinutes ?? timelineStartMinutes) + 45, timelineEndMinutes);
  const clampedStartMinutes = clamp(sessionStartMinutes, timelineWindowStartMinutes, timelineWindowEndMinutes);
  const clampedEndMinutes = clamp(Math.max(sessionEndMinutes, clampedStartMinutes + 20), timelineWindowStartMinutes, timelineWindowEndMinutes);
  const windowTotalMinutes = Math.max(timelineWindowEndMinutes - timelineWindowStartMinutes, 1);
  const leftPercent = clamp(((clampedStartMinutes - timelineWindowStartMinutes) / windowTotalMinutes) * 100, 0, 100);
  const widthPercent = clamp(((clampedEndMinutes - clampedStartMinutes) / windowTotalMinutes) * 100, 6, 100 - leftPercent);
  const startTime = hasPlannedWindow ? item.start : formatMinutesAsHourMinute(sessionStartMinutes);
  const endTime = hasPlannedWindow ? item.end : formatMinutesAsHourMinute(sessionEndMinutes);
  console.log("TIMELINE_BAR_POSITION_DEBUG", { startTime, endTime, leftPercent, widthPercent });
  const canShowJoin = Boolean(
    isSelected
    && currentUserId
    && item.userId !== currentUserId
    && state !== 'completed'
    && hasPlannedWindow
    && isSessionJoinableNow(item),
  );

  return (
    <Pressable onPress={() => onSelect(item.id)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      <View style={{ width: 90, marginRight: 8 }}>
        <Text numberOfLines={1} style={{ color: isBuddy ? theme.text : theme.textSoft, fontSize: 13, fontWeight: isBuddy ? '700' : '500' }}>
          {item.userName}
        </Text>
        <View
          style={{
            marginTop: 3,
            alignSelf: 'flex-start',
            borderRadius: 999,
            paddingHorizontal: 7,
            paddingVertical: 2,
            backgroundColor: intentStyle.badgeBackgroundColor,
            borderWidth: 1,
            borderColor: intentStyle.badgeBorderColor,
            opacity: intentStyle.labelOpacity,
          }}
        >
          <Text numberOfLines={1} style={{ color: intentStyle.labelColor, fontSize: 10, fontWeight: intentStyle.labelWeight }}>
            {intentLabel}
          </Text>
        </View>
      </View>
      <SessionBar
        leftPercent={leftPercent}
        widthPercent={widthPercent}
        state={state}
        intent={resolvedIntent}
        isSelected={isSelected}
        showJoinButton={canShowJoin}
        onPress={() => onSelect(item.id)}
        onJoin={() => onJoin(item)}
      />
    </Pressable>
  );
}

type SessionTimelineProps = {
  timelineSessions: Array<{ item: SpotSession; state: TimelineState; isBuddy: boolean }>;
  selectedTimelineSessionId: string | null;
  currentUserId: string | null | undefined;
  currentLocalMinutes: number;
  timelineWindowStartMinutes: number;
  timelineWindowEndMinutes: number;
  timelineFilter: TimelineFilter;
  showNowMarker: boolean;
  onSelectSession: (sessionId: string) => void;
  onJoinSession: (sessionItem: SpotSession) => void;
  onClearSelection: () => void;
};

function SessionTimeline({
  timelineSessions,
  selectedTimelineSessionId,
  currentUserId,
  currentLocalMinutes,
  timelineWindowStartMinutes,
  timelineWindowEndMinutes,
  timelineFilter,
  showNowMarker,
  onSelectSession,
  onJoinSession,
  onClearSelection,
}: SessionTimelineProps) {
  const totalRange = Math.max(timelineWindowEndMinutes - timelineWindowStartMinutes, 1);
  const isCurrentTimeMarkerVisible = showNowMarker && currentLocalMinutes >= timelineWindowStartMinutes && currentLocalMinutes <= timelineWindowEndMinutes;
  const currentPercent = ((currentLocalMinutes - timelineWindowStartMinutes) / totalRange) * 100;
  const renderRange = useMemo(
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
  const visibleTimelineSessions = useMemo(
    () =>
      timelineSessions.filter(({ item }) => {
        const hasPlannedWindow = hasPlannedTimeWindow(item);
        const checkedInMinutes = getLocalMinutesFromIso(item.checkedInAt);
        const sessionStartMinutes = hasPlannedWindow ? toMinutes(item.start) : (checkedInMinutes ?? timelineStartMinutes);
        const sessionEndMinutes = hasPlannedWindow
          ? toMinutes(item.end)
          : Math.min((checkedInMinutes ?? timelineStartMinutes) + 45, timelineEndMinutes);
        return sessionEndMinutes >= timelineWindowStartMinutes && sessionStartMinutes <= timelineWindowEndMinutes;
      }),
    [timelineSessions, timelineWindowEndMinutes, timelineWindowStartMinutes],
  );

  useEffect(() => {
    console.log("TIMELINE_RENDER_RANGE", renderRange);
  }, [renderRange]);

  return (
    <Pressable onPress={onClearSelection}>
      <View style={{ position: 'relative' }}>
        {isCurrentTimeMarkerVisible ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 98,
              right: 0,
              top: 0,
              bottom: 0,
              zIndex: 10,
            }}
          >
            <View
              style={{
                position: 'absolute',
                left: `${currentPercent}%`,
                top: 0,
                bottom: 0,
                width: 0,
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: '#d8eeffcc',
                  shadowColor: '#d8eeff',
                  shadowOpacity: 0.28,
                  shadowRadius: 5,
                  shadowOffset: { width: 0, height: 0 },
                }}
              />
              <Text style={{ marginTop: 2, color: '#cfe6ffcc', fontSize: 10, fontWeight: '600' }}>Now</Text>
              <View
                style={{
                  marginTop: 4,
                  width: 1,
                  flex: 1,
                  borderLeftWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: '#cfe6ff80',
                }}
              />
            </View>
          </View>
        ) : null}

        {visibleTimelineSessions.length > 0 ? (
          visibleTimelineSessions.map((timelineSession) => (
            <SessionRow
              key={timelineSession.item.id}
              timelineSession={timelineSession}
              currentUserId={currentUserId}
              timelineWindowStartMinutes={timelineWindowStartMinutes}
              timelineWindowEndMinutes={timelineWindowEndMinutes}
              isSelected={selectedTimelineSessionId === timelineSession.item.id}
              onSelect={onSelectSession}
              onJoin={onJoinSession}
            />
          ))
        ) : (
          <Text style={{ color: theme.textSoft, fontSize: 14 }}>
            {timelineFilter === 'buddies' ? 'No buddy sessions on the timeline yet' : 'No sessions on the timeline yet'}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export default function App() {
  const isNativePlatform = Platform.OS === 'ios' || Platform.OS === 'android';
  const isWebPlatform = Platform.OS === 'web';
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeUserOverride, setActiveUserOverride] = useState<SwitchableAccount | null>(null);
  const [switchableAccounts, setSwitchableAccounts] = useState<SwitchableAccount[]>([]);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [spotDefinitions, setSpotDefinitions] = useState<SpotDefinition[]>(fallbackSpots.map((spot) => ({ ...spot })));
  const [selectedSpot, setSelectedSpot] = useState<SpotName | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showBuddies, setShowBuddies] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profileAvatarInputUri, setProfileAvatarInputUri] = useState<string | null>(null);
  const [profileEditError, setProfileEditError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const spotNames = useMemo(() => spotDefinitions.map((spot) => spot.spot), [spotDefinitions]);
  const [sessionsBySpot, setSessionsBySpot] = useState<Record<SpotName, SpotSession[]>>(() => createSpotRecord(fallbackSpots.map((spot) => spot.spot), () => []));
  const [messagesBySpot, setMessagesBySpot] = useState<Record<SpotName, ChatMessage[]>>(() => createSpotRecord(fallbackSpots.map((spot) => spot.spot), () => []));
  const [loadingData, setLoadingData] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [activePicker, setActivePicker] = useState<PickerKey>(null);
  const [startHour, setStartHour] = useState<number | null>(null);
  const [startMinute, setStartMinute] = useState(0);
  const [endHour, setEndHour] = useState<number | null>(null);
  const [endMinute, setEndMinute] = useState(0);
  const [intent, setIntent] = useState<SessionIntent>('likely');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [saveError, setSaveError] = useState<SaveDebugError>(null);
  const planningHelperText = 'You go live at the spot after check-in.';
  const [sessionActionError, setSessionActionError] = useState('');
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
  const [homeSpotSearchQuery, setHomeSpotSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draggingManualSpot, setDraggingManualSpot] = useState<SpotName | null>(null);
  const [dragManualOrder, setDragManualOrder] = useState<SpotName[] | null>(null);
  const dragStartIndexRef = useRef<number | null>(null);
  const dragInitialOrderRef = useRef<SpotName[]>([]);
  const dragManualOrderRef = useRef<SpotName[] | null>(null);
  const dragSpotNameRef = useRef<SpotName | null>(null);
  const webDragOverIndexRef = useRef<number | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [spotNotificationPreferences, setSpotNotificationPreferences] = useState<SpotNotificationPreferences>(defaultSpotNotificationPreferences);
  const [loadingSpotNotificationPreferences, setLoadingSpotNotificationPreferences] = useState(false);
  const [savingNotificationPreferenceKey, setSavingNotificationPreferenceKey] = useState<'sessionPlanning' | 'checkin' | 'chat' | null>(null);
  const [notificationPreferencesError, setNotificationPreferencesError] = useState('');
  const [isNotificationPanelExpanded, setIsNotificationPanelExpanded] = useState(false);
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
  const authenticatedUserId = session?.user.id ?? null;
  const authenticatedUserEmail = normalizeEmail(session?.user.email ?? '');
  const isAccountSwitcherVisible = authenticatedUserEmail === adminAccountSwitcherEmail;
  const activeAppUserId = activeUserOverride?.id ?? authenticatedUserId;
  const activeAppUserEmail = activeUserOverride?.email ?? authenticatedUserEmail;
  const passwordResetRedirectTo = useMemo(() => {
    const configuredRedirect = Constants.expoConfig?.extra?.passwordResetRedirectTo;
    if (typeof configuredRedirect === 'string' && configuredRedirect.trim()) {
      return configuredRedirect.trim();
    }

    const configuredScheme = Constants.expoConfig?.scheme;
    if (typeof configuredScheme === 'string' && configuredScheme.trim()) {
      return `${configuredScheme.trim()}://reset-password`;
    }

    return undefined;
  }, []);

  const handlePasswordResetRequest = async (email: string) => {
    console.log("PASSWORD_RESET_REQUESTED", { email });
    // sender name / email template branding is configured in Supabase dashboard, not in app code
    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      passwordResetRedirectTo ? { redirectTo: passwordResetRedirectTo } : undefined
    );

    if (error) {
      console.error("PASSWORD_RESET_ERROR", error);
      return { error: 'Could not send reset link. Please try again.' };
    }

    console.log("PASSWORD_RESET_SENT", { email });
    return { error: null };
  };

  useEffect(() => {
    console.log("ACCOUNT_SWITCHER_VISIBLE", authenticatedUserEmail);
  }, [authenticatedUserEmail]);

  const loadSwitchableAccounts = async () => {
    if (!isAccountSwitcherVisible || !authenticatedUserId) {
      setSwitchableAccounts([]);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name')
      .order('display_name', { ascending: true });

    if (error) {
      console.error('ACCOUNT_SWITCHER_LOAD_ERROR', error);
      setSwitchableAccounts([]);
      return;
    }

    const dedupedById = new Map<string, SwitchableAccount>();
    for (const account of data ?? []) {
      if (!account?.id) {
        continue;
      }
      dedupedById.set(account.id, {
        id: account.id,
        display_name: account.display_name ?? 'Unknown user',
        email: account.id === authenticatedUserId ? authenticatedUserEmail : null,
      });
    }
    if (!dedupedById.has(authenticatedUserId)) {
      dedupedById.set(authenticatedUserId, {
        id: authenticatedUserId,
        display_name: profile?.display_name ?? 'Current user',
        email: authenticatedUserEmail,
      });
    }
    setSwitchableAccounts(Array.from(dedupedById.values()));
  };

  const handleSelectAccount = async (account: SwitchableAccount) => {
    const fromUser = {
      id: activeAppUserId,
      email: activeAppUserEmail,
    };
    const toUser = {
      id: account.id,
      email: account.email,
    };
    console.log("ACCOUNT_SWITCH_SELECTED", { fromUser, toUser });

    setShowAccountSwitcher(false);
    setShowBuddies(false);
    setShowAccountSwitcher(false);
    setSwitchableAccounts([]);
    setSelectedSpot(null);
    setActiveUserOverride(account.id === authenticatedUserId ? null : account);
    setCurrentUserId(account.id);
    await fetchProfile(account.id);
    await fetchSharedData();
    await fetchBuddiesData();
    console.log("ACCOUNT_SWITCH_REFRESH_COMPLETE", { activeUserId: account.id, activeUserEmail: account.email });
  };

  useEffect(() => {
    console.log("HOME_SPOTS_LIMIT", HOME_SPOTS_LIMIT);
  }, []);

  useEffect(() => {
    console.log("HOME_SELECTED_SPOTS_COUNT", favoriteSpots.length);
  }, [favoriteSpots]);
  useEffect(() => {
    console.log("ACTIVE_DAY_SOURCE_OF_TRUTH", activeDay);
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
          ? parsedFavoriteSpots.filter((value): value is SpotName => typeof value === 'string')
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
          ? parsedManualOrder.filter((value): value is SpotName => typeof value === 'string')
          : [];
        const dedupedManualOrder: SpotName[] = [];
        for (const spotName of loadedManualOrderRaw) {
          if (!dedupedManualOrder.includes(spotName)) {
            dedupedManualOrder.push(spotName);
          }
        }
        const normalizedManualOrder = dedupedManualOrder.filter((spotName) => loadedFavoriteSpots.includes(spotName));
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
        console.log("FAVORITE_SPOTS_LOADED", loadedFavoriteSpots);
        console.log("SELECTED_SPOTS_LOADED", loadedFavoriteSpots);
      } catch (error) {
        console.error('Failed to load favorite spots', error);
        console.log("FAVORITE_SPOTS_LOADED", []);
        console.log("SELECTED_SPOTS_LOADED", []);
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
    console.log("SPOT_ADD_HANDLER_ACTIVE");
    setFavoriteSpots((previousFavoriteSpots) => {
      const selectedSpots = previousFavoriteSpots;
      const currentCount = selectedSpots.length;
      console.log("SPOT_ADD_ATTEMPT", { spotName, currentCount, selectedSpots });

      if (selectedSpots.includes(spotName)) {
        console.log("SPOT_ADD_DUPLICATE_BLOCKED", { spotName });
        setHomeSpotsLimitMessage('');
        setHomeSpotSearchQuery('');
        return previousFavoriteSpots;
      }

      console.log("SPOT_ADD_LIMIT_CHECK", { currentCount, limit: HOME_SPOTS_LIMIT });
      if (currentCount >= HOME_SPOTS_LIMIT) {
        console.log("SPOT_ADD_BLOCKED_LIMIT", { spotName, currentCount });
        setHomeSpotsLimitMessage('Your home screen can show up to 5 spots. Remove one to add another.');
        return previousFavoriteSpots;
      }

      const nextSelectedSpots = [...selectedSpots, spotName];
      console.log("SPOT_ADD_SUCCESS", { spotName, nextSelectedSpots });
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
        console.log("SPOT_ADD_PERSISTED", { nextSelectedSpots });
      });
      setHomeSpotSearchQuery('');
      return nextSelectedSpots;
    });
  };
  const handleSearchResultPress = (spotName: SpotName) => {
    console.log("SPOT_ADD_ROW_PRESSED", { spotName });
    if (searchBlurTimeoutRef.current) {
      clearTimeout(searchBlurTimeoutRef.current);
      searchBlurTimeoutRef.current = null;
    }
    addSelectedSpot(spotName);
    setIsSearchFocused(false);
  };
  const removeSelectedSpot = (spotName: SpotName) => {
    setHomeSpotsLimitMessage('');
    setFavoriteSpots((previousFavoriteSpots) => {
      if (!previousFavoriteSpots.includes(spotName)) {
        return previousFavoriteSpots;
      }
      const nextSelectedSpots = previousFavoriteSpots.filter((favoriteSpot) => favoriteSpot !== spotName);
      console.log("SPOT_REMOVED", spotName);
      void AsyncStorage.setItem(favoriteSpotsStorageKey, JSON.stringify(nextSelectedSpots)).catch((error) => {
        console.error('Failed to persist favorite spots', error);
      });
      return nextSelectedSpots;
    });
    setManualOrder((previousManualOrder) => {
      const nextManualOrder = previousManualOrder.filter((manualSpot) => manualSpot !== spotName);
      void AsyncStorage.setItem(spotManualOrderStorageKey, JSON.stringify(nextManualOrder)).catch((error) => {
        console.error('Failed to persist spot manual order', error);
      });
      return nextManualOrder;
    });
  };
  const persistManualOrder = (nextManualOrder: SpotName[]) => {
    void AsyncStorage.setItem(spotManualOrderStorageKey, JSON.stringify(nextManualOrder)).then(() => {
      console.log("YOUR_SPOTS_REORDER_PERSISTED", nextManualOrder);
    }).catch((error) => {
      console.error('Failed to persist spot manual order', error);
    });
  };
  const moveManualSpot = (spotName: SpotName, index: number, direction: 'up' | 'down') => {
    console.log("YOUR_SPOTS_DRAG_CONTROL_PRESSED", { spotName, index });
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
      console.log("YOUR_SPOTS_REORDER_COMMIT", {
        fromIndex: currentIndex,
        toIndex: targetIndex,
        nextSelectedSpots: nextManualOrder,
      });
      persistManualOrder(nextManualOrder);
      return nextManualOrder;
    });
  };
  const updateManualOrder = (nextManualOrder: SpotName[]) => {
    setManualOrder(nextManualOrder);
    console.log("YOUR_SPOTS_MANUAL_ORDER_UPDATED", nextManualOrder);
    persistManualOrder(nextManualOrder);
  };
  const updateOrderMode = (nextOrderMode: SpotOrderMode) => {
    setOrderMode(nextOrderMode);
    void AsyncStorage.setItem(spotOrderModeStorageKey, nextOrderMode).catch((error) => {
      console.error('Failed to persist spot order mode', error);
    });
  };
  useEffect(() => {
    console.log("SPOT_SEARCH_QUERY", homeSpotSearchQuery);
  }, [homeSpotSearchQuery]);
  useEffect(() => {
    console.log("HOME_HIDE_ACTION_REMOVED");
  }, []);
  useEffect(() => {
    if (!showYourSpotsPage) {
      return;
    }
    console.log("YOUR_SPOTS_PAGE_OPENED");
  }, [showYourSpotsPage]);
  useEffect(() => {
    if (!showYourSpotsPage) {
      return;
    }
    const query = homeSpotSearchQuery;
    console.log("YOUR_SPOTS_PAGE_SEARCH_QUERY", query);
  }, [homeSpotSearchQuery, showYourSpotsPage]);
  useEffect(() => {
    if (!showYourSpotsPage) {
      return;
    }
    console.log("YOUR_SPOTS_SEARCH_FOCUS", isSearchFocused);
  }, [isSearchFocused, showYourSpotsPage]);
  useEffect(() => {
    if (!showYourSpotsPage) {
      return;
    }
    if (orderMode === 'manual') {
      console.log("YOUR_SPOTS_REORDER_UI_ACTIVE");
    }
    console.log("YOUR_SPOTS_PAGE_ORDER_MODE", orderMode);
  }, [orderMode, showYourSpotsPage]);
  useEffect(() => {
    if (!showYourSpotsPage) {
      return;
    }
    console.log("YOUR_SPOTS_MANUAL_ORDER_UPDATED", manualOrder);
  }, [manualOrder, showYourSpotsPage]);
  useEffect(() => {
    setManualOrder((previousManualOrder) => {
      const dedupedManualOrder: SpotName[] = [];
      for (const spotName of previousManualOrder) {
        if (!dedupedManualOrder.includes(spotName)) {
          dedupedManualOrder.push(spotName);
        }
      }
      const favoriteSpotSet = new Set(favoriteSpots);
      const filteredOrder = dedupedManualOrder.filter((spotName) => favoriteSpotSet.has(spotName));
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
    if (!activeAppUserId) {
      setBuddyUsers([]);
      setOutgoingFollowStatusesByUserId({});
      setFollowingUserIds([]);
      setIncomingFollowRequests([]);
      setFollowerUsers([]);
      return;
    }

    setLoadingBuddies(true);
    setBuddiesError('');
    console.log('BUDDIES_CURRENT_USER_ID', { userId: activeAppUserId });

    const [usersResponse, followsResponse, incomingRequestsResponse, incomingAcceptedResponse] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .neq('id', activeAppUserId)
        .order('display_name', { ascending: true }),
      supabase
        .from('user_follows')
        .select('id, follower_id, following_id, status, created_at, responded_at')
        .eq('follower_id', activeAppUserId),
      supabase
        .from('user_follows')
        .select('id, follower_id, following_id, status, created_at, responded_at')
        .eq('following_id', activeAppUserId)
        .eq('status', 'pending'),
      supabase
        .from('user_follows')
        .select('id, follower_id, following_id, status, created_at, responded_at')
        .eq('following_id', activeAppUserId)
        .eq('status', 'accepted'),
    ]);

    if (usersResponse.error) {
      console.error('BUDDIES_USERS_LOAD_ERROR', usersResponse.error);
      console.log('BUDDIES_USERS_QUERY_ERROR_DETAIL', {
        message: usersResponse.error.message,
        details: usersResponse.error.details,
        hint: usersResponse.error.hint,
        code: usersResponse.error.code,
      });
      setBuddiesError('Could not load users');
    } else {
      const loadedUsers = (usersResponse.data ?? []) as BuddyUser[];
      console.log('BUDDIES_PROFILES_QUERY_RESULT', loadedUsers);
      console.log('BUDDIES_FILTERED_USERS_SHOWN', {
        currentUserId: activeAppUserId,
        userIds: loadedUsers.map((userItem) => userItem.id),
      });
      setBuddyUsers(loadedUsers);
    }

    if (followsResponse.error) {
      console.error('BUDDIES_FOLLOWING_LOAD_ERROR', followsResponse.error);
      setBuddiesError('Could not load buddies');
    } else {
      console.log('BUDDIES_FOLLOWING_RELATIONSHIPS_LOADED', followsResponse.data ?? []);
      const outgoingStatuses = (followsResponse.data ?? []).reduce<Record<string, FollowStatus>>((acc, relation) => {
        acc[relation.following_id] = relation.status as FollowStatus;
        return acc;
      }, {});
      setOutgoingFollowStatusesByUserId(outgoingStatuses);
      const acceptedFollowingUserIds = (followsResponse.data ?? [])
        .filter((item) => item.status === 'accepted')
        .map((item) => item.following_id);
      console.log('BUDDIES_ACCEPTED_OUTGOING_FOLLOWS', (followsResponse.data ?? []).filter((item) => item.status === 'accepted'));
      console.log('BUDDIES_FOLLOWING_LIST_UPDATED', acceptedFollowingUserIds);
      setFollowingUserIds(acceptedFollowingUserIds);
    }

    if (incomingRequestsResponse.error || incomingAcceptedResponse.error) {
      console.error('BUDDIES_INCOMING_REQUESTS_LOAD_ERROR', incomingRequestsResponse.error);
      console.error('BUDDIES_INCOMING_ACCEPTED_LOAD_ERROR', incomingAcceptedResponse.error);
      setBuddiesError('Could not load follow requests');
    } else {
      const pendingIncomingRelations = (incomingRequestsResponse.data ?? []) as IncomingFollowRelation[];
      const acceptedIncomingRelations = (incomingAcceptedResponse.data ?? []) as IncomingFollowRelation[];
      console.log('BUDDIES_PENDING_INCOMING_REQUESTS', pendingIncomingRelations);
      console.log('BUDDIES_ACCEPTED_INCOMING_FOLLOWS', acceptedIncomingRelations);
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
          console.log('BUDDIES_INCOMING_REQUESTS_USERS_QUERY_ERROR_DETAIL', {
            message: incomingUsersResponse.error.message,
            details: incomingUsersResponse.error.details,
            hint: incomingUsersResponse.error.hint,
            code: incomingUsersResponse.error.code,
          });
          setBuddiesError('Could not load requesters');
        } else {
          console.log('BUDDIES_JOINED_PROFILE_ROWS', incomingUsersResponse.data ?? []);
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
      console.log('BUDDIES_INCOMING_REQUESTS_LOADED', incomingRequests);
      console.log('BUDDIES_INCOMING_ACCEPTED_FOLLOWERS_LOADED', incomingFollowers);
      setIncomingFollowRequests(incomingRequests);
      setFollowerUsers(incomingFollowers);
    }

    setLoadingBuddies(false);
  };

  const handleFollowUser = async (userIdToFollow: string) => {
    if (!activeAppUserId || userIdToFollow === activeAppUserId) {
      return;
    }

    const payload = {
      follower_id: activeAppUserId,
      following_id: userIdToFollow,
      status: 'pending' as FollowStatus,
      responded_at: null as string | null,
    };
    const previousStatus = outgoingFollowStatusesByUserId[userIdToFollow];
    console.log('BUDDIES_OUTGOING_FOLLOW_REQUEST_PAYLOAD', payload);
    setBuddyActionUserId(userIdToFollow);
    setOutgoingFollowStatusesByUserId((previous) => ({ ...previous, [userIdToFollow]: 'pending' }));
    setFollowingUserIds((previous) => previous.filter((id) => id !== userIdToFollow));

    const { error } = await supabase
      .from('user_follows')
      .upsert(payload, { onConflict: 'follower_id,following_id' });
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

    console.log('BUDDIES_FOLLOW_SUCCESS', payload);
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
    console.log('BUDDIES_UNFOLLOW_ACTION_PAYLOAD', payload);
    setBuddyActionUserId(userIdToUnfollow);
    setFollowingUserIds((previous) => previous.filter((id) => id !== userIdToUnfollow));
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

    console.log('BUDDIES_UNFOLLOW_SUCCESS', payload);
    setBuddyActionUserId(null);
    await fetchBuddiesData();
  };

  const handleAcceptFollowRequest = async (requestItem: FollowRequestItem) => {
    if (!activeAppUserId) {
      return;
    }

    const payload = {
      id: requestItem.id,
      follower_id: requestItem.follower_id,
      following_id: activeAppUserId,
      status: 'accepted' as FollowStatus,
      responded_at: new Date().toISOString(),
    };
    console.log('BUDDIES_ACCEPT_PAYLOAD', payload);
    setFollowRequestActionId(requestItem.id);
    const { error } = await supabase
      .from('user_follows')
      .update({ status: 'accepted', responded_at: payload.responded_at })
      .eq('id', requestItem.id);

    if (error) {
      console.error('BUDDIES_ACCEPT_ERROR', error);
      setBuddiesError('Accept failed');
      setFollowRequestActionId(null);
      return;
    }

    console.log('BUDDIES_ACCEPT_SUCCESS', payload);
    setFollowRequestActionId(null);
    await fetchBuddiesData();
  };

  const handleRejectFollowRequest = async (requestItem: FollowRequestItem) => {
    if (!activeAppUserId) {
      return;
    }

    const payload = {
      id: requestItem.id,
      follower_id: requestItem.follower_id,
      following_id: activeAppUserId,
      status: 'rejected' as FollowStatus,
      responded_at: new Date().toISOString(),
    };
    console.log('BUDDIES_REJECT_PAYLOAD', payload);
    setFollowRequestActionId(requestItem.id);
    const { error } = await supabase
      .from('user_follows')
      .update({ status: 'rejected', responded_at: payload.responded_at })
      .eq('id', requestItem.id);

    if (error) {
      console.error('BUDDIES_REJECT_ERROR', error);
      setBuddiesError('Decline failed');
      setFollowRequestActionId(null);
      return;
    }

    console.log('BUDDIES_REJECT_SUCCESS', payload);
    setFollowRequestActionId(null);
    await fetchBuddiesData();
  };

  const fetchProfile = async (userId: string, options?: { showLoader?: boolean }) => {
    const showLoader = options?.showLoader ?? true;

    if (showLoader) {
      setLoadingProfile(true);
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, created_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      setProfile(null);
      console.error('Failed to load profile:', error);
    } else {
      setProfile(data ?? null);
      console.log('PROFILE_STATE_LOADED', {
        requestedUserId: userId,
        profileUserId: data?.id ?? null,
        displayName: data?.display_name ?? null,
        avatarUrl: data?.avatar_url ?? null,
      });
    }

    if (showLoader) {
      setLoadingProfile(false);
    }

    return data ?? null;
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

    console.log('STALE_SESSION_DETECTED', {
      sessionId: row.id,
      originalStatus: row.status,
      checkedInAt: row.checked_in_at,
      createdAt: row.created_at,
    });

    const autoClosedAt = getSessionAutoCloseTimestamp(staleReferenceDate);
    console.log('STALE_SESSION_AUTO_CLOSED', {
      sessionId: row.id,
      checkedOutAt: autoClosedAt,
      nextStatus: 'Uitchecken',
    });

    return {
      status: 'Uitchecken' as SessionStatus,
      checkedInAt: row.checked_in_at,
      checkedOutAt: autoClosedAt,
    };
  };

  const fetchSpotDefinitions = async () => {
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
        const rawLatitudeValue = Number(row.latitude ?? row.lat ?? null);
        const rawLongitudeValue = Number(row.longitude ?? row.lng ?? row.lon ?? null);
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

        console.log('SPOTS_COORDINATES_DEBUG', {
          spotName,
          rawLatitudeValue,
          rawLongitudeValue,
          normalizedLatitudeValue: latitudeValue,
          normalizedLongitudeValue: longitudeValue,
          fallbackLatitudeValue: fallbackSpot?.latitude ?? null,
          fallbackLongitudeValue: fallbackSpot?.longitude ?? null,
        });

        if (!spotName || Number.isNaN(latitudeValue) || Number.isNaN(longitudeValue)) {
          return null;
        }

        return {
          spot: spotName,
          latitude: latitudeValue,
          longitude: longitudeValue,
        } satisfies SpotDefinition;
      })
      .filter((spot): spot is SpotDefinition => Boolean(spot));

    if (mappedSpots.length === 0) {
      console.warn('Spots table is empty or unreadable, falling back to local spots');
      return;
    }

    console.log('SPOTS_SOURCE_LOADED', { source: 'supabase_spots', count: mappedSpots.length });
    setSpotDefinitions(mappedSpots);
  };

  const fetchSharedData = async () => {
    setLoadingData(true);
    console.log("SESSIONS VISIBILITY BUG PATH ACTIVE");
    console.log("MESSAGES QUERY PATH ACTIVE");
    console.log("MESSAGES QUERY START", { selectedSpot });

    const sessionsResponse = await supabase
      .from('sessions')
      .select('id, spot_name, user_id, start_time, end_time, status, intent, created_at, checked_in_at, checked_out_at')
      .in('spot_name', [...spotNames])
      .order('created_at', { ascending: true });
    const sessionsData = sessionsResponse.data ?? [];
    console.log("SESSIONS RAW RESULT", sessionsData);
    const messagesResponse = selectedSpot
      ? await supabase
          .from('messages')
          .select('id, user_id, text, spot_name, created_at')
          .eq('spot_name', selectedSpot)
          .order('created_at', { ascending: true })
      : { data: [], error: null };
    const messagesData = messagesResponse.data ?? [];
    const messagesError = messagesResponse.error;
    if (!selectedSpot) {
      console.log("MESSAGES QUERY SKIPPED", { reason: "NO_SELECTED_SPOT", selectedSpot });
    }
    console.log("MESSAGES RAW RESULT", messagesData);

    const sessionUserIds = [...new Set(sessionsData.map((sessionRow) => sessionRow.user_id).filter(Boolean))];
    const { data: profilesData, error: profilesError } = sessionUserIds.length
      ? await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', sessionUserIds)
      : { data: [], error: null };
    console.log("SESSION PROFILES RAW RESULT", profilesData);

    if (sessionsResponse.error) {
      console.error('Failed to load sessions:', sessionsResponse.error);
    } else {
      const nextSessionsBySpot = createSpotRecord<SpotSession[]>(spotNames, () => []);

      const profilesById = new Map((profilesData ?? []).map((profile) => [profile.id, profile]));
      const mergedSessions = sessionsData.map((row) => {
        const profile = row.user_id ? profilesById.get(row.user_id) : null;
        return {
          ...row,
          display_name: profile?.display_name?.trim() || 'Unknown rider',
          avatar_url: profile?.avatar_url ?? null,
        };
      });
      console.log("SESSIONS MERGED RESULT", mergedSessions);

      for (const row of mergedSessions) {
        const spot = row.spot_name as SpotName;
        if (!spotNames.includes(spot)) {
          continue;
        }

        const normalizedSession = normalizeLoadedSession(row);

        nextSessionsBySpot[spot].push({
          id: row.id,
          spot,
          start: row.start_time.slice(0, 5),
          end: row.end_time.slice(0, 5),
          status: normalizedSession.status,
          intent: resolveSessionIntent(row.intent),
          createdAt: row.created_at,
          checkedInAt: normalizedSession.checkedInAt,
          checkedOutAt: normalizedSession.checkedOutAt,
          userId: row.user_id,
          userName: row.display_name,
          userAvatarUrl: row.avatar_url,
        });
      }

      const loadedSessions = Object.values(nextSessionsBySpot).flat();
      console.log('SESSIONS_LOADED_FOR_TIMELINE', {
        total: loadedSessions.length,
        planned: loadedSessions.filter((item) => isPlannedSession(item)).map((item) => ({
          id: item.id,
          spot: item.spot,
          start: item.start,
          end: item.end,
          intent: item.intent,
          checkedInAt: item.checkedInAt,
          checkedOutAt: item.checkedOutAt,
        })),
        live: loadedSessions.filter((item) => isLiveSession(item)).map((item) => ({
          id: item.id,
          spot: item.spot,
          start: item.start,
          end: item.end,
          intent: item.intent,
          checkedInAt: item.checkedInAt,
          checkedOutAt: item.checkedOutAt,
        })),
      });

      setSessionsBySpot(nextSessionsBySpot);
    }

    if (messagesError) {
      console.error("MESSAGES QUERY ERROR", messagesError);
      console.error('Failed to load messages:', messagesError);
    }

    if (profilesError) {
      console.error("PROFILES QUERY ERROR", profilesError);
      console.error('Failed to load profiles:', profilesError);
    }

    if (messagesError || profilesError) {
      setLoadingData(false);
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
        setLoadingData(false);
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
      console.log("MESSAGES MERGED RESULT", mergedMessages);

      const nextMessagesBySpot = createSpotRecord<ChatMessage[]>(spotNames, () => []);

      for (const row of mergedMessages) {
        const spot = row.spot_name as SpotName;
        if (!spotNames.includes(spot)) {
          continue;
        }

        nextMessagesBySpot[spot].push({
          id: row.id,
          text: row.text,
          userId: row.user_id,
          display_name: row.display_name,
          avatar_url: row.avatar_url,
          createdAt: row.created_at,
        });
      }

      setMessagesBySpot(nextMessagesBySpot);
    } else {
      console.log("MESSAGES MERGED RESULT", []);
    }

    setLoadingData(false);
  };

  useEffect(() => {
    void fetchSpotDefinitions();
    void supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });

    supabase.auth.getSession().then(({ data }) => {
      const nextSession = data.session;
      console.log('AUTH_STATE_CHANGED', {
        event: 'INITIAL_SESSION',
        userId: nextSession?.user.id ?? null,
      });
      setSession(nextSession);
      setActiveUserOverride(null);
      setCurrentUserId(nextSession?.user.id ?? null);
      setLoadingSession(false);

      if (nextSession) {
        setProfile(null);
        console.log('PROFILE_STATE_RESET', {
          reason: 'auth_session_initialized',
          previousUserId: profile?.id ?? null,
          nextUserId: nextSession.user.id,
        });
        void fetchSpotDefinitions();
        void fetchProfile(nextSession.user.id);
        void fetchSharedData();
      } else {
        setProfile(null);
        console.log('PROFILE_STATE_RESET', {
          reason: 'no_session_on_init',
          previousUserId: profile?.id ?? null,
          nextUserId: null,
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      console.log('AUTH_STATE_CHANGED', {
        event,
        userId: nextSession?.user.id ?? null,
      });
      setSession(nextSession);
      setActiveUserOverride(null);
      setCurrentUserId(nextSession?.user.id ?? null);

      console.log('PROFILE_STATE_RESET', {
        reason: nextSession ? 'auth_user_changed' : 'logout',
        previousUserId: profile?.id ?? null,
        nextUserId: nextSession?.user.id ?? null,
      });
      setProfile(null);

      if (!nextSession) {
        resetFlow();
        return;
      }

      void fetchProfile(nextSession.user.id);
      void fetchSpotDefinitions();
      void fetchSharedData();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const headerProfile = profile
    ? {
      userId: profile.id,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
    }
    : null;

  useEffect(() => {
    console.log('HEADER_PROFILE_RENDER', {
      sessionUserId: activeAppUserId ?? null,
      profileUserId: headerProfile?.userId ?? null,
      displayName: headerProfile?.displayName ?? null,
      avatarUrl: headerProfile?.avatarUrl ?? null,
    });
  }, [headerProfile?.avatarUrl, headerProfile?.displayName, headerProfile?.userId, activeAppUserId]);

  useEffect(() => {
    if (showProfile && profile) {
      setProfileNameInput(profile.display_name);
    }
  }, [showProfile, profile]);

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
        .select('following_id')
        .eq('follower_id', activeAppUserId)
        .eq('status', 'accepted');

      if (error) {
        console.error('TIMELINE_FOLLOWING_USERS_LOAD_ERROR', error);
        return;
      }

      setFollowingUserIds((data ?? []).map((item) => item.following_id));
    })();
  }, [activeAppUserId]);

  useEffect(() => {
    setSessionsBySpot((previous) => {
      const next = createSpotRecord<SpotSession[]>(spotNames, () => []);
      for (const spot of spotNames) {
        next[spot] = previous[spot] ?? [];
      }
      return next;
    });
    setMessagesBySpot((previous) => {
      const next = createSpotRecord<ChatMessage[]>(spotNames, () => []);
      for (const spot of spotNames) {
        next[spot] = previous[spot] ?? [];
      }
      return next;
    });
  }, [spotNames]);

  useEffect(() => {
    if (!selectedSpot) {
      return;
    }

    if (!spotNames.includes(selectedSpot)) {
      const replacementSpot = spotDefinitions.find((spot) => normalizeSpotName(spot.spot) === normalizeSpotName(selectedSpot))?.spot ?? null;
      if (replacementSpot) {
        setSelectedSpot(replacementSpot);
        return;
      }

      console.warn('SPOT_DETAIL_SELECTED_SPOT_MISSING', { selectedSpot });
      setSelectedSpot(null);
    }
  }, [selectedSpot, spotDefinitions, spotNames]);

  useEffect(() => {
    if (!activeAppUserId) {
      return;
    }

    void registerForPushNotifications(activeAppUserId).catch((error: unknown) => {
      console.error('Push registration failed:', error);
    });
  }, [activeAppUserId]);

  useEffect(() => {
    if (!activeAppUserId || spotNames.length === 0) {
      return;
    }

    void fetchSharedData();
  }, [activeAppUserId, spotNames]);

  useEffect(() => {
    setHomeQuickCheckInError('');
  }, []);

  useEffect(() => {
    if (!selectedSpot) {
      setHomeQuickCheckInError('');
    }
  }, [selectedSpot]);

  useEffect(() => {
    console.log('SHOW_FORM', showForm);
  }, [showForm]);

  useEffect(() => {
    if (!selectedSpot) {
      return;
    }

    console.log('SPOT_DETAIL_SELECTED_SPOT_NAME', { selectedSpot });
  }, [selectedSpot]);

  useEffect(() => {
    let isCancelled = false;
    setIsNotificationPanelExpanded(false);

    const loadSpotNotificationPreferences = async () => {
      if (!selectedSpot || !activeAppUserId) {
        setSpotNotificationPreferences(defaultSpotNotificationPreferences);
        setNotificationPreferencesError('');
        setLoadingSpotNotificationPreferences(false);
        return;
      }

      setLoadingSpotNotificationPreferences(true);
      setNotificationPreferencesError('');
      console.log('NOTIFICATION_PREFS_LOAD_START', { userId: activeAppUserId, spotName: selectedSpot });

      const { data, error } = await supabase
        .from('spot_notification_preferences')
        .select(`
          session_planning_notification_mode,
          checkin_notification_mode,
          chat_notification_mode
        `)
        .eq('user_id', activeAppUserId)
        .eq('spot_name', selectedSpot)
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

      console.log('NOTIFICATION_PREFS_LOAD_SUCCESS', {
        userId: activeAppUserId,
        spotName: selectedSpot,
        rawPreferences: data,
      });
      const loadedPreferences: SpotNotificationPreferences = {
        session_planning_notification_mode: resolveNotificationMode(data?.session_planning_notification_mode),
        checkin_notification_mode: resolveNotificationMode(data?.checkin_notification_mode),
        chat_notification_mode: resolveNotificationMode(data?.chat_notification_mode),
      };
      setSpotNotificationPreferences(loadedPreferences);
      console.log('NOTIFICATION_PREFS_LOADED_VALUES_AFTER_REFRESH', {
        userId: activeAppUserId,
        spotName: selectedSpot,
        loadedPreferences,
      });
      setLoadingSpotNotificationPreferences(false);
    };

    void loadSpotNotificationPreferences();

    return () => {
      isCancelled = true;
    };
  }, [selectedSpot, activeAppUserId]);

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
    console.log('WEB_GPS_REQUEST_STARTED');

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setCurrentCoordinates(null);
      setNearestSpotResult(null);
      setIsResolvingNearestSpot(false);
      const error = {
        reason: 'GEOLOCATION_UNAVAILABLE',
        platform: Platform.OS,
      };
      console.log('WEB_GPS_LOCATION_ERROR', error);
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
        const nearest = getNearestSpot(coordinates, spotDefinitions);
        setNearestSpotResult(nearest);
        console.log('WEB_GPS_LOCATION_SUCCESS', { latitude, longitude });
        setIsResolvingNearestSpot(false);
      },
      (error) => {
        if (!active) {
          return;
        }

        setCurrentCoordinates(null);
        setNearestSpotResult(null);
        setIsResolvingNearestSpot(false);
        console.log('WEB_GPS_LOCATION_ERROR', error);
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
  }, [isNativePlatform, spotDefinitions]);

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
      console.log('GPS_MONITORING_STOPPED', {
        reason,
      });
    };

    if (!isNativePlatform) {
      stopWatcher('NON_NATIVE_PLATFORM');
      console.log('GPS_AUTO_CHECKOUT_SKIPPED', {
        reason: 'NON_NATIVE_PLATFORM',
        platform: Platform.OS,
      });
      return () => {
        active = false;
      };
    }

    const shouldRunGpsWatcher = Boolean(
      gpsActiveCheckedInSession
      && (gpsActiveCheckedInSession.status === 'live' || gpsActiveCheckedInSession.status === 'Is er al'),
    );
    if (!shouldRunGpsWatcher || !gpsActiveCheckedInSession) {
      console.log('GPS_AUTO_CHECKOUT_SKIPPED', {
        reason: 'NO_LIVE_SESSION_FOR_MONITORING',
      });
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
        console.log('GPS_NATIVE_PERMISSION_STATUS', {
          status: permissionResponse.status,
          canAskAgain: permissionResponse.canAskAgain,
          granted: permissionResponse.granted,
        });

        if (permissionResponse.status !== 'granted') {
          stopWatcher('PERMISSION_NOT_GRANTED');
          setCurrentCoordinates(null);
          setNearestSpotResult(null);
          setIsResolvingNearestSpot(false);
          return;
        }

        const applyCoordinates = (coordinates: SpotCoordinates) => {
          setCurrentCoordinates(coordinates);
          const nearest = getNearestSpot(coordinates, spotDefinitions);
          setNearestSpotResult(nearest);
          console.log('GPS_POSITION_UPDATED', {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            nearestSpot: nearest?.spot ?? null,
            nearestDistanceMeters: nearest?.distanceMeters ?? null,
          });
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
        console.log('GPS_MONITORING_STARTED', {
          sessionId: gpsActiveCheckedInSession.id,
          distanceIntervalMeters: 75,
        });
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
  }, [gpsActiveCheckedInSession, isNativePlatform, spotDefinitions]);

  useEffect(() => {
    console.log('HOME_NEAREST_SPOT_NAME', {
      nearestSpotName: nearestSpotResult?.spot ?? null,
      distanceMeters: nearestSpotResult?.distanceMeters ?? null,
    });
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
      console.log("ACTIVE_CHECKED_IN_SESSION_RESOLVED", { userId, chosenSession, duplicateCount });
    }
    return chosenSession;
  }, [activeDateEnd, activeDateStart, activeAppUserId, sessionsBySpot]);
  const hasActiveCheckedInSession = Boolean(activeCheckedInSession);
  useEffect(() => {
    console.log("ACTIVE_DAY_LIVE_RULES", { activeDay });
  }, [activeDay]);
  useEffect(() => {
    console.log("CHECKOUT_STATE_EVALUATION", {
      activeDay,
      userId: activeAppUserId ?? null,
      spotName: selectedSpot ?? null,
      hasActiveCheckedInSession,
      activeSession: activeCheckedInSession ?? null
    });
  }, [activeCheckedInSession, activeDay, hasActiveCheckedInSession, selectedSpot, activeAppUserId]);
  useEffect(() => {
    console.log("ACTIVE_DAY", activeDay);
  }, [activeDay]);
  const plannedSession = useMemo(() => {
    const currentUserId = session?.user?.id;
    if (!currentUserId) {
      return null;
    }

    const allCandidateSessions = Object.values(sessionsBySpot)
      .flat()
      .filter((sessionItem) => sessionItem.userId === currentUserId)
      .filter((sessionItem) => isIsoInRange(sessionItem.createdAt, activeDateStart, activeDateEnd));
    const userSessions = allCandidateSessions
      .filter((sessionItem) => getSessionState(sessionItem) === 'planned');
    console.log("SESSION_FILTER_RESULT", {
      activeDay,
      count: userSessions.length,
    });

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
  }, [activeDateEnd, activeDateStart, activeDay, sessionsBySpot, session?.user?.id]);
  const activeBannerSession = activeCheckedInSession ?? plannedSession;
  useEffect(() => {
    console.log("USER_STATUS_BANNER_SESSION", activeBannerSession);
  }, [activeBannerSession]);
  const plannedSessionIntentLabel = useMemo(() => {
    if (!plannedSession) {
      return null;
    }
    const resolvedIntent = resolveSessionIntent(plannedSession.intent);
    return getIntentGoingLabel(resolvedIntent);
  }, [plannedSession]);
  const sessions = selectedSpot ? sessionsBySpot[selectedSpot] : [];
  const messages = selectedSpot ? messagesBySpot[selectedSpot] : [];
  const areAnySpotNotificationsEnabled =
    spotNotificationPreferences.session_planning_notification_mode !== 'off'
    || spotNotificationPreferences.checkin_notification_mode !== 'off'
    || spotNotificationPreferences.chat_notification_mode !== 'off';
  const daySessionsBySpot = useMemo(() => {
    const next = createSpotRecord<SpotSession[]>(spotNames, () => []);
    for (const spot of spotNames) {
      next[spot] = sessionsBySpot[spot].filter((item) => isIsoInRange(item.createdAt, activeDateStart, activeDateEnd));
    }
    console.log("SESSION_FILTER_RESULT", { activeDay, count: Object.values(next).flat().length });
    return next;
  }, [activeDateEnd, activeDateStart, activeDay, sessionsBySpot, spotNames]);
  const allUserSessions = useMemo(() => {
    if (!activeAppUserId) {
      return [];
    }

    const allSessions = Object.values(sessionsBySpot)
      .flat()
      .filter((sessionItem) => sessionItem.userId === activeAppUserId);
    const filteredSessions = allSessions.filter((sessionItem) => !isSessionExpired(sessionItem));
    console.log("ACTIVE_SESSION_FILTERED", {
      beforeCount: allSessions.length,
      afterCount: filteredSessions.length
    });

    return filteredSessions;
  }, [activeAppUserId, sessionsBySpot]);
  const upcomingPlannedSession = useMemo(() => {
    const nowMinutes = getCurrentLocalMinutes();
    const currentDateKey = getCurrentLocalDateKey();

    return allUserSessions
      .filter(
        (sessionItem) =>
          isPlannedSession(sessionItem)
          && isCreatedOnLocalDate(sessionItem.createdAt, currentDateKey)
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
    return buddyRequests.filter((r) => r.status === 'pending').length;
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
        console.log('GPS_AUTO_CHECKOUT_SKIPPED', {
          reason: 'NON_NATIVE_PLATFORM',
          platform: Platform.OS,
        });
        return;
      }

      const isActiveLiveStatus = gpsActiveCheckedInSession?.status === 'live' || gpsActiveCheckedInSession?.status === 'Is er al';
      if (!activeAppUserId || !currentCoordinates || !gpsActiveCheckedInSession || !isActiveLiveStatus) {
        autoCheckoutOutsideCountRef.current = 0;
        autoCheckoutOutsideSinceRef.current = null;
        console.log('AUTO_CHECKOUT_SKIPPED', {
          reason: 'not_checked_in',
        });
        console.log('GPS_AUTO_CHECKOUT_SKIPPED', {
          reason: 'MISSING_REQUIREMENTS',
          hasUser: Boolean(activeAppUserId),
          hasCoordinates: Boolean(currentCoordinates),
          hasActiveCheckedInSession: Boolean(gpsActiveCheckedInSession),
          isActiveLiveStatus,
        });
        return;
      }

      const activeSpotDefinition = spotDefinitions.find(
        (spot) => normalizeSpotName(spot.spot) === normalizeSpotName(gpsActiveCheckedInSession.spot),
      );
      if (!activeSpotDefinition) {
        autoCheckoutOutsideCountRef.current = 0;
        autoCheckoutOutsideSinceRef.current = null;
        console.log('GPS_AUTO_CHECKOUT_SKIPPED', {
          reason: 'SPOT_COORDINATES_MISSING',
          sessionId: gpsActiveCheckedInSession.id,
          sessionSpot: gpsActiveCheckedInSession.spot,
        });
        return;
      }

      const spotCoordinates = {
        latitude: activeSpotDefinition.latitude,
        longitude: activeSpotDefinition.longitude,
      };
      const distanceMeters = getDistanceMeters(currentCoordinates, spotCoordinates);
      const isOutsideRadius = distanceMeters > AUTO_CHECKOUT_RADIUS_METERS;
      const spotId = gpsActiveCheckedInSession.id;
      console.log('AUTO_CHECKOUT_DISTANCE_CHECK', {
        distanceMeters,
        thresholdMeters: AUTO_CHECKOUT_RADIUS_METERS,
        selectedSpot: gpsActiveCheckedInSession.spot,
      });
      console.log('GPS_DISTANCE_FROM_SPOT', {
        sessionId: gpsActiveCheckedInSession.id,
        spot: gpsActiveCheckedInSession.spot,
        distanceMeters,
        outsideRadiusMeters: AUTO_CHECKOUT_RADIUS_METERS,
        isOutsideRadius,
      });

      if (!isOutsideRadius) {
        console.log('AUTO_CHECKOUT_SKIPPED', {
          reason: 'still_inside_radius',
        });
        if (autoCheckoutOutsideCountRef.current !== 0 || autoCheckoutOutsideSinceRef.current !== null) {
          console.log('GPS_BACK_INSIDE', {
            sessionId: gpsActiveCheckedInSession.id,
            distanceMeters,
          });
        }
        autoCheckoutOutsideCountRef.current = 0;
        autoCheckoutOutsideSinceRef.current = null;
        hasAutoCheckedOutRef.current = false;
        return;
      }

      if (hasAutoCheckedOutRef.current) {
        console.log('AUTO_CHECKOUT_SKIPPED', {
          reason: 'already_auto_checked_out',
        });
        return;
      }

      if (autoCheckoutInFlightRef.current) {
        console.log('GPS_AUTO_CHECKOUT_SKIPPED', {
          reason: 'CHECKOUT_ALREADY_IN_FLIGHT',
          sessionId: gpsActiveCheckedInSession.id,
        });
        return;
      }

      autoCheckoutInFlightRef.current = true;
      hasAutoCheckedOutRef.current = true;
      console.log('AUTO_CHECKOUT_TRIGGERED', {
        distanceMeters,
        threshold: AUTO_CHECKOUT_RADIUS_METERS,
        spotId,
      });
      console.log('GPS_AUTO_CHECKOUT_TRIGGERED', { sessionId: gpsActiveCheckedInSession.id, distanceMeters });

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
        console.log('GPS_MONITORING_STOPPED', {
          reason: 'AUTO_CHECKOUT_COMPLETED',
        });
      }
      setAutoCheckoutNotice('Automatically checked out\nYou appear to have left the spot');
      await fetchSharedData();
    };

    void runAutoCheckOutIfNeeded();
  }, [currentCoordinates, gpsActiveCheckedInSession, isNativePlatform, activeAppUserId, spotDefinitions]);
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
    if (!nowReference.isToday) {
      return {
        startMinutes: timelineStartMinutes,
        endMinutes: timelineEndMinutes,
        mode: 'full_day',
      };
    }

    const anchoredStartMinutes = nowReference.currentLocalMinutes - timelinePastWindowMinutes;
    const startMinutes = clamp(anchoredStartMinutes, timelineStartMinutes, timelineEndMinutes);
    const endMinutes = timelineEndMinutes;
    return {
      startMinutes,
      endMinutes,
      mode: 'live_today',
    };
  }, [nowReference]);
  const timelineMode = windowInfo.mode;
  useEffect(() => {
    console.log("TIMELINE_CONTEXT", { activeDay, now: new Date() });
  }, [activeDay, timelineMode]);
  const timelineWindow = useMemo(
    () => ({
      startMinutes: windowInfo.startMinutes,
      endMinutes: windowInfo.endMinutes,
    }),
    [windowInfo.endMinutes, windowInfo.startMinutes],
  );
  const timelineLabels = useMemo(
    () => getTimelineLabelsForRange(timelineWindow.startMinutes, timelineWindow.endMinutes),
    [timelineWindow.endMinutes, timelineWindow.startMinutes],
  );
  useEffect(() => {
    console.log("TIMELINE_RANGE_ACTIVE", {
      startHour: Math.floor(timelineWindow.startMinutes / 60),
      endHour: Math.floor(timelineWindow.endMinutes / 60),
    });
  }, [timelineWindow.endMinutes, timelineWindow.startMinutes]);
  useEffect(() => {
    console.log("TIMELINE_LABELS_RENDERED", timelineLabels);
  }, [timelineLabels]);
  useEffect(() => {
    console.log("TIMELINE_NOW_REFERENCE", nowReference);
  }, [nowReference]);
  useEffect(() => {
    console.log("TIMELINE_WINDOW_COMPUTED", windowInfo);
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
  const currentPlanningStart = startHour === null ? null : `${formatTimePart(startHour)}:${formatTimePart(startMinute)}`;
  const currentPlanningEnd = endHour === null ? null : `${formatTimePart(endHour)}:${formatTimePart(endMinute)}`;
  const planningOverlapBlockingSession = useMemo(() => {
    if (!activeAppUserId || !currentPlanningStart || !currentPlanningEnd) {
      return null;
    }

    if (toMinutes(currentPlanningEnd) <= toMinutes(currentPlanningStart)) {
      return null;
    }

    return (
      allUserSessions
        .filter((sessionItem) => sessionItem.userId === activeAppUserId)
        .filter((sessionItem) => !editingSessionId || sessionItem.id !== editingSessionId)
        .filter((sessionItem) => isIsoInRange(sessionItem.createdAt, activeDateStart, activeDateEnd))
        .filter((sessionItem) => isSessionStillRelevantForPlanning(sessionItem, currentLocalMinutes))
        .find((sessionItem) => hasTimeOverlap(currentPlanningStart, currentPlanningEnd, sessionItem.start, sessionItem.end))
      ?? null
    );
  }, [activeDateEnd, activeDateStart, allUserSessions, currentLocalMinutes, currentPlanningEnd, currentPlanningStart, editingSessionId, activeAppUserId]);
  useEffect(() => {
    console.log('PLANNING_NOW_REFERENCE', planningNowReference);
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
    console.log('PLANNING_START_TIME_ADJUSTED', {
      reason: 'start_in_past_for_today',
      from: startTotalMinutes,
      to: planningNowReference.earliestStartMinutes,
    });
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
    console.log('PLANNING_START_TIME_ADJUSTED', {
      reason: 'end_realigned_after_start_change',
      start: startTotalMinutes,
      previousEnd: currentEndTotalMinutes,
      nextEnd: adjustedEndMinutes,
    });
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
          && getSessionState(sessionItem) === 'planned'
          && isIsoInRange(sessionItem.createdAt, activeDateStart, activeDateEnd),
      ),
  );
  const withinRange = selectedSpotWithinCheckInRadius;
  const shouldShowSpotCheckIn = activeDay === 'today' && !isCheckedInAtSelectedSpot;
  const shouldShowSpotCheckOut = activeDay === 'today' && isCheckedInAtSelectedSpot;
  const canCheckIn = shouldShowSpotCheckIn && withinRange && !hasPlannedSession && !hasActiveCheckedInSession;
  const checkInCtaVisible = canCheckIn;
  useEffect(() => {
    console.log("CHECKIN_CTA_VISIBLE", { activeDay, withinRange, hasActiveCheckedInSession, visible: checkInCtaVisible });
  }, [activeDay, withinRange, hasActiveCheckedInSession, checkInCtaVisible]);
  const canCheckOut = shouldShowSpotCheckOut;
  useEffect(() => {
    console.log("SPOT_PAGE_CHECKOUT_BUTTON_VISIBLE", { visible: shouldShowSpotCheckOut, activeDay, spotName: selectedSpot ?? null });
  }, [activeDay, selectedSpot, shouldShowSpotCheckOut]);
  const selectedSpotMomentumLabel = useMemo(
    () => {
      if (!selectedSpot) {
        return null;
      }

      const momentumLabels = getSpotMomentumLabels(selectedSpot, sessions);
      const label = activeDay === 'today' ? momentumLabels.today : momentumLabels.tomorrow;
      console.log("SPOT_STATUS_LABEL", { activeDay, label });
      return label;
    },
    [activeDay, selectedSpot, sessions],
  );
  console.log('SPOT_PAGE_CHECKIN_VISIBLE', { selectedSpot, visible: shouldShowSpotCheckIn });
  console.log('SPOT_PAGE_CHECKOUT_VISIBLE', { selectedSpot, visible: shouldShowSpotCheckOut });
  const currentUserEditableSession = useMemo(() => {
    if (!activeAppUserId || !selectedSpot) {
      return null;
    }

    return (
      [...sessions]
        .filter((sessionItem) => sessionItem.userId === activeAppUserId)
        .filter((sessionItem) => isPlannedSession(sessionItem))
        .sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        })[0] ?? null
    );
  }, [selectedSpot, activeAppUserId, sessions]);
  const hasPlannedSessionAtSelectedSpot = Boolean(currentUserEditableSession);
  const hasConflictingSession = Boolean(
    allUserSessions.some(
      (sessionItem) =>
        (!editingSessionId || sessionItem.id !== editingSessionId)
        && isIsoInRange(sessionItem.createdAt, activeDateStart, activeDateEnd)
        && isSessionStillRelevantForPlanning(sessionItem, currentLocalMinutes),
    ),
  );
  const canPlanSession = !hasPlannedSessionAtSelectedSpot && !hasConflictingSession;
  const shouldHidePlanSessionButton = hasPlannedSessionAtSelectedSpot || hasConflictingSession;
  const shouldDisablePlanSessionButton = !shouldHidePlanSessionButton && !canPlanSession;
  const planSessionVisible = !shouldHidePlanSessionButton && !shouldDisablePlanSessionButton;
  useEffect(() => {
    console.log("PLAN_SESSION_CTA_VISIBLE", { activeDay, hasConflictingSession, visible: planSessionVisible });
  }, [activeDay, hasConflictingSession, planSessionVisible]);

  console.log('SPOT_PAGE_HAS_PLANNED_SESSION', {
    selectedSpot,
    hasPlannedSessionAtSelectedSpot,
    editableSessionId: currentUserEditableSession?.id ?? null,
  });
  if (shouldHidePlanSessionButton) {
    console.log('SPOT_PAGE_PLAN_BUTTON_HIDDEN', { selectedSpot });
  }
  if (shouldDisablePlanSessionButton) {
    console.log('SPOT_PAGE_PLAN_BUTTON_DISABLED', { selectedSpot });
  }
  const handleCancelPlannedSession = async (sessionToCancel: SpotSession) => {
    console.log('SPOT_PAGE_CANCEL_CLICKED');
    console.log('SPOT_PAGE_CANCEL_SESSION_ID', { sessionId: sessionToCancel.id });
    console.log('SPOT_PAGE_CANCEL_CURRENT_AUTH_USER_ID', { userId: activeAppUserId ?? null });

    if (!activeAppUserId) {
      setSessionActionError('Could not cancel session');
      return;
    }
    const authUserId = activeAppUserId;

    if (sessionToCancel.userId !== authUserId || !isPlannedSession(sessionToCancel)) {
      setSessionActionError('Could not cancel session');
      console.log('SPOT_PAGE_CANCEL_BLOCKED', {
        sessionId: sessionToCancel.id,
        sessionUserId: sessionToCancel.userId,
        currentUserId: authUserId,
        isPlannedSession: isPlannedSession(sessionToCancel),
      });
      return;
    }

    console.log("SESSIONS WRITE PATH ACTIVE");
    const deleteResult = await supabase
      .from('sessions')
      .delete()
      .eq('id', sessionToCancel.id)
      .eq('user_id', authUserId)
      .is('checked_in_at', null)
      .is('checked_out_at', null)
      .not('start_time', 'is', null)
      .not('end_time', 'is', null)
      .select('id, user_id, start_time, end_time, checked_in_at, checked_out_at');

    if (deleteResult.error) {
      setSessionActionError('Could not cancel session');
      console.log('SPOT_PAGE_CANCEL_DELETE_ERROR', deleteResult.error);
      return;
    }

    if (!deleteResult.data || deleteResult.data.length === 0) {
      setSessionActionError('Could not cancel session');
      console.log('SPOT_PAGE_CANCEL_DELETE_ERROR', {
        message: 'No planned session row deleted',
        sessionId: sessionToCancel.id,
      });
      return;
    }

    console.log('SPOT_PAGE_CANCEL_DELETE_RESULT', deleteResult.data);
    await fetchSharedData();
    setSessionActionError('');
    setEditingSessionId(null);
    if (editingSessionId === sessionToCancel.id) {
      resetForm();
    }
  };
  const quickCheckInWindowError = getQuickCheckInWindowError(currentLocalMinutes);
  const canQuickCheckIn = !quickCheckInWindowError;
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
  const nearestSpotName = nearestSpotResult?.spot ?? null;
  const distanceMeters = nearestSpotResult?.distanceMeters ?? null;
  const nearestSpotWithinRange = nearestSpotResult ? nearestSpotResult.distanceMeters <= CHECK_IN_RADIUS_METERS : false;
  const nearestSpotDistanceLabel = nearestSpotResult ? formatDistance(nearestSpotResult.distanceMeters) : null;
  const nearestSpotCanCheckIn = activeDay === 'today' && !hasActiveCheckedInSession && canQuickCheckIn && nearestSpotWithinRange;
  const isHomeCheckoutButtonVisible = Boolean(activeDay === 'today' && nearestSpotResult && nearestSpotDistanceLabel && hasActiveCheckedInSession);
  useEffect(() => {
    console.log("HOME_CHECKOUT_BUTTON_VISIBLE", { visible: isHomeCheckoutButtonVisible, activeDay, nearestSpotName });
  }, [activeDay, isHomeCheckoutButtonVisible, nearestSpotName]);
  console.log('HOME_TOP_RIGHT_CONTROLS_ACTIVE');
  console.log('SPOT_SEARCH_COMPACT_MODE');
  console.log('NEAREST_SPOT_COMPACT_LAYOUT', { nearestSpot: nearestSpotName, distanceMeters });
  console.log('NEAREST_SPOT_CARD_STATE', { nearestSpot: nearestSpotName, distanceMeters, canCheckIn: nearestSpotCanCheckIn });
  useEffect(() => {
    if (!homeQuickCheckInError) {
      return;
    }

    if (!activeCheckedInSession || !quickCheckInWindowError || nearestSpotWithinRange) {
      setHomeQuickCheckInError('');
    }
  }, [activeCheckedInSession, homeQuickCheckInError, nearestSpotWithinRange, quickCheckInWindowError]);
  useEffect(() => {
    console.log('AUTO_CHECKIN_DEBUG', {
      nearestSpotName,
      distanceMeters,
      activeCheckedInSession,
    });
    const isWithinAutoCheckInRadius = distanceMeters !== null && distanceMeters <= AUTO_CHECKIN_PROMPT_RADIUS_METERS;
    console.log('AUTO_CHECKIN_DISTANCE_CHECK', {
      distance: distanceMeters,
      threshold: AUTO_CHECKIN_PROMPT_RADIUS_METERS,
    });

    if (autoCheckInPromptShownRef.current || autoCheckInPromptDismissed) {
      return;
    }

    if (
      nearestSpotName &&
      isWithinAutoCheckInRadius &&
      !hasActiveCheckedInSession
    ) {
      console.log('AUTO_CHECKIN_PROMPT_SHOWN', {
        nearestSpotName,
        distanceMeters,
      });
      console.log('AUTO_CHECKIN_CANDIDATE', {
        spot: nearestSpotName,
        distanceMeters,
      });
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
    console.log("HOME_SORTED_SPOTS", sortedSpotsForLog.map((s) => s.name));
    return orderedSpots;
  }, [currentCoordinates, favoriteSpots, manualOrder, orderMode, spotDefinitions]);
  useEffect(() => {
    console.log("HOME_SELECTED_SPOTS_ORDER_MODE", orderMode);
  }, [orderMode]);
  const homeLiveCountBySpot = useMemo(
    () =>
      spotNames.reduce((result, spot) => {
        result[spot] = getLiveSessions(sessionsBySpot[spot] ?? []).length;
        return result;
      }, {} as Record<SpotName, number>),
    [sessionsBySpot, spotNames],
  );
  const homeMomentumBySpot = useMemo(
    () =>
      spotNames.reduce((result, spot) => {
        result[spot] = getSpotMomentumLabels(spot, sessionsBySpot[spot] ?? []);
        return result;
      }, {} as Record<SpotName, SpotMomentumBuckets>),
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
    console.log("HOME LIVE COUNT SOURCE", homeSessionsSource);
  }, [sessionsBySpot]);
  useEffect(() => {
    console.log('HOME_LIVE_COUNT_BY_SPOT', homeLiveCountBySpot);
  }, [homeLiveCountBySpot]);
  useEffect(() => {
    console.log('HOME_CURRENT_USER_LIVE_SESSION', {
      userId: activeAppUserId ?? null,
      liveSessionId: activeCheckedInSession?.id ?? null,
      spot: activeCheckedInSession?.spot ?? null,
      checkedInAt: activeCheckedInSession?.checkedInAt ?? null,
      checkedOutAt: activeCheckedInSession?.checkedOutAt ?? null,
    });
  }, [activeCheckedInSession, activeAppUserId]);
  useEffect(() => {
    console.log('ACTIVE_SESSION_LOAD', {
      activeCheckedInSessionId: activeCheckedInSession?.id ?? null,
      activeSpot: activeCheckedInSession?.spot ?? null,
      blockingSessionId: planningOverlapBlockingSession?.id ?? null,
      blockingStatus: planningOverlapBlockingSession?.status ?? null,
    });
  }, [activeCheckedInSession, planningOverlapBlockingSession]);
  const filteredMessages = useMemo(
    () =>
      messages.filter((message) => {
        const belongsToDay = isIsoInRange(message.createdAt, activeDateStart, activeDateEnd);
        console.log("MESSAGE_DAY_CLASSIFICATION", { id: message.id, createdAt: message.createdAt, activeDay, belongsToDay });
        return belongsToDay;
      }),
    [activeDateEnd, activeDateStart, activeDay, messages],
  );
  const newestFirstMessages = useMemo(
    () =>
      filteredMessages
        .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      }),
    [filteredMessages],
  );
  useEffect(() => {
    console.log("DAY_FILTERED_MESSAGES", { activeDay, count: filteredMessages.length, messageIds: filteredMessages.map((m) => m.id) });
  }, [activeDay, filteredMessages]);

  const timelineSessions = useMemo(() => {
    const dedupedSessions = Array.from(new Map(sessions.map((item) => [item.id, item])).values());
    const toggleMode = timelineFilter;
    console.log("SESSIONS FILTER INPUT", { selectedSpot, currentUserId: activeAppUserId ?? null, toggleMode });
    const filteredSessions = dedupedSessions.filter((item) => {
      if (!isIsoInRange(item.createdAt, activeDateStart, activeDateEnd)) {
        return false;
      }

      return getSessionState(item) !== 'finished';
    });
    console.log("SESSION_FILTER_RESULT", { activeDay, count: filteredSessions.length });
    console.log("SESSIONS AFTER SPOT FILTER", filteredSessions);
    const visibleSessions = filteredSessions.filter((item) => {
      if (timelineFilter === 'buddies') {
        return followingUserIds.includes(item.userId);
      }
      return true;
    });
    const resolvedLiveSessionIdsByUser = new Map<string, string>();
    for (const item of visibleSessions) {
      const isActiveCheckedInSession = Boolean(item.checkedInAt)
        && !item.checkedOutAt
        && (item.status === 'Is er al' || item.status === 'live')
        && isLiveSession(item)
        && !isSessionExpired(item);
      if (!isActiveCheckedInSession) {
        continue;
      }
      const existingSessionId = resolvedLiveSessionIdsByUser.get(item.userId);
      if (!existingSessionId) {
        resolvedLiveSessionIdsByUser.set(item.userId, item.id);
        continue;
      }
      const existingSession = visibleSessions.find((sessionItem) => sessionItem.id === existingSessionId);
      if (!existingSession || getSessionRecencyMs(item) > getSessionRecencyMs(existingSession)) {
        resolvedLiveSessionIdsByUser.set(item.userId, item.id);
      }
    }
    console.log("SESSIONS AFTER VISIBILITY FILTER", visibleSessions);
    return visibleSessions
      .filter((item) => {
        const resolvedSessionId = resolvedLiveSessionIdsByUser.get(item.userId);
        if (!resolvedSessionId) {
          return true;
        }
        const isActiveCheckedInSession = Boolean(item.checkedInAt)
          && !item.checkedOutAt
          && (item.status === 'Is er al' || item.status === 'live')
          && isLiveSession(item)
          && !isSessionExpired(item);
        if (!isActiveCheckedInSession) {
          return true;
        }
        return item.id === resolvedSessionId;
      })
      .map((item) => {
        const state = getTimelineState(item);
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
  }, [activeDateEnd, activeDateStart, activeDay, followingUserIds, selectedSpot, activeAppUserId, sessions, timelineFilter]);
  const selectedTimelineSession = useMemo(
    () => timelineSessions.find(({ item }) => item.id === selectedTimelineSessionId) ?? null,
    [selectedTimelineSessionId, timelineSessions],
  );
  const openEmptyPlanningForm = () => {
    const nowReference = getPlanningNowReference(selectedPlanningDateKey, getCurrentLocalMinutes());
    setEditingSessionId(null);
    setIntent('likely');
    if (nowReference.isToday && nowReference.hasValidStartSlot) {
      const defaultStart = minuteValueToHourMinute(nowReference.earliestStartMinutes);
      const defaultEndMinutes = getDefaultEndMinutesForStart(nowReference.earliestStartMinutes);
      const defaultEnd = minuteValueToHourMinute(defaultEndMinutes);
      console.log('PLANNING_START_TIME_ADJUSTED', {
        reason: 'default_start_when_opening_today_form',
        selectedPlanningDateKey,
        defaultStartMinutes: nowReference.earliestStartMinutes,
        defaultEndMinutes,
      });
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

    const exists = timelineSessions.some(({ item }) => item.id === selectedTimelineSessionId);
    if (!exists) {
      setSelectedTimelineSessionId(null);
    }
  }, [selectedTimelineSessionId, timelineSessions]);
  useEffect(() => {
    console.log('TIMELINE_FILTERED_SESSIONS', {
      selectedSpot,
      totalSpotSessions: sessions.length,
      plannedSessions: sessions.filter((item) => isPlannedSession(item)).map((item) => ({
        id: item.id,
        start: item.start,
        end: item.end,
        intent: item.intent,
        checkedInAt: item.checkedInAt,
      })),
      liveSessions: sessions.filter((item) => isLiveSession(item)).map((item) => ({
        id: item.id,
        start: item.start,
        end: item.end,
        intent: item.intent,
        checkedInAt: item.checkedInAt,
      })),
      timelineSessions: timelineSessions.map(({ item, state }) => ({
        id: item.id,
        status: item.status,
        intent: item.intent,
        timelineState: state,
        start: item.start,
        end: item.end,
        checkedInAt: item.checkedInAt,
      })),
    });
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
      console.log("NOW_AT_SPOT_REAL_CHECKED_IN_USERS", dedupedUsers.map((u) => (u as SpotSession & { user_id?: string; name?: string }).user_id || u.userId || (u as SpotSession & { name?: string }).name));
      return dedupedUsers;
    },
    [activeDateEnd, activeDateStart, sessions],
  );
  const upcomingSessions = useMemo(
    () =>
      sessions
        .filter((sessionItem) => isIsoInRange(sessionItem.createdAt, activeDateStart, activeDateEnd))
        .filter((sessionItem) => getSessionState(sessionItem) === 'planned')
        .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
        .slice(0, 3),
    [activeDateEnd, activeDateStart, sessions],
  );
  const mode: 'live' | 'upcoming' | 'empty' = checkedInUsers.length > 0
    ? 'live'
    : upcomingSessions.length > 0
      ? 'upcoming'
      : 'empty';
  console.log("NOW_AT_SPOT_LIVE_USERS", checkedInUsers);
  console.log("NOW_AT_SPOT_UPCOMING_SESSIONS", upcomingSessions);
  console.log("NOW_AT_SPOT_MODE", mode);
  const liveKiterCountLabel = `${checkedInUsers.length} ${checkedInUsers.length === 1 ? 'kiter' : 'kiters'} now at the spot`;
  const shouldShowNowAtSpotPanel = activeDay === 'today' && checkedInUsers.length > 0;
  useEffect(() => {
    console.log("NOW_AT_SPOT_VISIBLE", { activeDay, visible: shouldShowNowAtSpotPanel, checkedInCount: checkedInUsers.length });
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
  const createPlannedSession = async (payload: {
    spot_name: string;
    user_id: string;
    start_time: string;
    end_time: string;
    status: 'Gaat';
    intent: SessionIntent;
    checked_in_at: null;
    checked_out_at: null;
    created_at?: string;
  }) => {
    console.log("SESSIONS WRITE PATH ACTIVE");
    return supabase
      .from('sessions')
      .insert(payload)
      .select('id, spot_name, start_time, end_time, checked_in_at, checked_out_at, status, user_id, intent')
      .single();
  };

  const saveSpotNotificationPreferences = async (nextPreferences: SpotNotificationPreferences, preferenceKey: 'sessionPlanning' | 'checkin' | 'chat') => {
    if (!selectedSpot || !activeAppUserId) {
      return false;
    }

    console.log('NOTIFICATION_MODE_SAVE_START', {
      userId: activeAppUserId,
      spotName: selectedSpot,
      preferenceKey,
      nextPreferences,
    });
    setSavingNotificationPreferenceKey(preferenceKey);
    setNotificationPreferencesError('');
    const savePayload = {
      user_id: activeAppUserId,
      spot_name: selectedSpot,
      session_planning_notification_mode: nextPreferences.session_planning_notification_mode,
      checkin_notification_mode: nextPreferences.checkin_notification_mode,
      chat_notification_mode: nextPreferences.chat_notification_mode,
    };
    console.log('NOTIFICATION_MODE_SAVE_PAYLOAD', savePayload);

    const saveResult = await supabase
      .from('spot_notification_preferences')
      .upsert(
        savePayload,
        {
          onConflict: 'user_id,spot_name',
        },
      );
    const { error } = saveResult;
    console.log('NOTIFICATION_MODE_SAVE_RESULT', {
      userId: activeAppUserId,
      spotName: selectedSpot,
      preferenceKey,
      error: error ?? null,
    });

    setSavingNotificationPreferenceKey(null);

    if (error) {
      console.error('Failed to save notification preference:', error);
      setNotificationPreferencesError('Saving notification preferences failed.');
      return false;
    }

    console.log('NOTIFICATION_MODE_SAVE_SUCCESS', {
      userId: activeAppUserId,
      spotName: selectedSpot,
      preferenceKey,
      nextPreferences,
    });
    return true;
  };


  const runCheckInFlowForSpot = async ({
    spot,
    source,
  }: {
    spot: SpotName;
    source: 'spot_page' | 'home_quick';
  }): Promise<{ ok: true; spot: SpotName } | { ok: false; reason: string; error?: unknown }> => {
    if (!activeAppUserId) {
      return { ok: false, reason: 'missing_auth_or_profile' };
    }
    const authUserId = activeAppUserId;

    const canonicalSpot =
      spotDefinitions.find((spotDefinition) => normalizeSpotName(spotDefinition.spot) === normalizeSpotName(spot))?.spot
      ?? spot;
    if (!canonicalSpot) {
      return { ok: false, reason: 'missing_spot' };
    }

    const nowIso = new Date().toISOString();
    const getLatestOpenSession = async () =>
      supabase
        .from('sessions')
        .select('id, spot_name, status, created_at')
        .eq('user_id', authUserId)
        .is('checked_out_at', null)
        .in('status', ['Gaat', 'Is er al'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    const getExistingActiveCheckedInSessionsForDay = async () =>
      supabase
        .from('sessions')
        .select('id, spot_name, status, created_at, checked_in_at, checked_out_at')
        .eq('user_id', authUserId)
        .is('checked_out_at', null)
        .in('status', ['Is er al', 'live'])
        .gte('checked_in_at', activeDateStart.toISOString())
        .lt('checked_in_at', activeDateEnd.toISOString())
        .order('checked_in_at', { ascending: false });
    const deleteGhostSessionsForUser = async (userId: string) => {
      console.log("SESSIONS WRITE PATH ACTIVE");
      const cleanupResponse = await supabase
        .from('sessions')
        .delete()
        .eq('user_id', userId)
        .is('checked_in_at', null)
        .is('checked_out_at', null);

      if (cleanupResponse.error) {
        console.log('SESSION_GHOST_CLEANUP_ERROR', { userId, error: cleanupResponse.error, source });
      }
    };

    const latestOpenSessionResponse = await getLatestOpenSession();
    if (latestOpenSessionResponse.error) {
      console.log('SPOT_PAGE_CHECKIN_ERROR', { stage: 'fetch_latest_open_session', error: latestOpenSessionResponse.error, source });
      return { ok: false, reason: 'fetch_latest_open_session_failed', error: latestOpenSessionResponse.error };
    }
    const existingCheckedInSessionsForDayResponse = await getExistingActiveCheckedInSessionsForDay();
    if (existingCheckedInSessionsForDayResponse.error) {
      console.log('SPOT_PAGE_CHECKIN_ERROR', {
        stage: 'fetch_existing_checked_in_sessions_for_day',
        error: existingCheckedInSessionsForDayResponse.error,
        source,
      });
      return { ok: false, reason: 'fetch_existing_checked_in_sessions_for_day_failed', error: existingCheckedInSessionsForDayResponse.error };
    }
    const existingCheckedInSessionsForDay = existingCheckedInSessionsForDayResponse.data ?? [];
    console.log("CHECKIN_DUPLICATE_GUARD", {
      userId: authUserId,
      activeDay,
      existingCheckedInSessionsCount: existingCheckedInSessionsForDay.length,
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
      console.log("CHECKIN_BLOCKED_DUPLICATE", { userId: authUserId, activeSession });
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
        console.log('CHECKIN_OVERRIDE_PLANNED_SESSION_FOUND', {
          source,
          plannedSessionId: latestOpenSession.id,
          plannedSpot: latestOpenSession.spot_name,
          targetSpot: canonicalSpot,
        });
        console.log("SESSIONS WRITE PATH ACTIVE");
        const clearPlannedResult = await supabase
          .from('sessions')
          .delete()
          .eq('id', latestOpenSession.id)
          .eq('user_id', authUserId);

        if (clearPlannedResult.error) {
          console.log('SPOT_PAGE_CHECKIN_ERROR', { stage: 'clear_planned_session_other_spot', error: clearPlannedResult.error, source });
          return { ok: false, reason: 'clear_planned_session_other_spot_failed', error: clearPlannedResult.error };
        }

        console.log('CHECKIN_OVERRIDE_PLANNED_SESSION_CLEARED', {
          source,
          clearedSessionId: latestOpenSession.id,
          clearedSpot: latestOpenSession.spot_name,
          targetSpot: canonicalSpot,
        });
        await deleteGhostSessionsForUser(authUserId);
      } else {

      const updatePayload = {
        status: 'Is er al',
        intent: 'definitely',
        checked_in_at: nowIso,
        checked_out_at: null,
      } as const;
      console.log('SPOT_PAGE_CHECKIN_PAYLOAD', { mode: 'update', sessionId: latestOpenSession.id, payload: updatePayload, source });
      if (source === 'home_quick') {
        console.log('HOME_QUICK_CHECKIN_PAYLOAD_USED', { mode: 'update', sessionId: latestOpenSession.id, payload: updatePayload, spot: canonicalSpot });
      }
      console.log("SESSIONS WRITE PATH ACTIVE");
      const checkInResponse = await supabase
        .from('sessions')
        .update(updatePayload)
        .eq('id', latestOpenSession.id)
        .eq('user_id', authUserId);

      if (checkInResponse.error) {
        console.log('SPOT_PAGE_CHECKIN_ERROR', { stage: 'update_existing_session', error: checkInResponse.error, source });
        return { ok: false, reason: 'update_existing_session_failed', error: checkInResponse.error };
      }

      console.log('SPOT_PAGE_CHECKIN_SUCCESS', { mode: 'updated_planned_session', sessionId: latestOpenSession.id, selectedSpot: canonicalSpot, source });
      await fetchSharedData();
      return { ok: true, spot: canonicalSpot };
      }
    }

    await deleteGhostSessionsForUser(authUserId);

    const insertPayload = {
      spot_name: canonicalSpot,
      user_id: authUserId,
      start_time: getNowLocalHourMinute(),
      end_time: getQuickCheckInEndTime(),
      status: 'Is er al',
      intent: 'definitely' as const,
      checked_in_at: nowIso,
      checked_out_at: null,
    };
    console.log("SESSIONS WRITE PATH ACTIVE");
    console.log('SPOT_PAGE_CHECKIN_PAYLOAD', { mode: 'insert', payload: insertPayload, source });
    if (source === 'home_quick') {
      console.log('HOME_QUICK_CHECKIN_PAYLOAD_USED', { mode: 'insert', payload: insertPayload, spot: canonicalSpot });
    }
    const insertResult = await supabase.from('sessions').insert(insertPayload);

    if (insertResult.error) {
      console.log('SPOT_PAGE_CHECKIN_ERROR', { stage: 'insert_new_live_session', error: insertResult.error, payload: insertPayload, source });
      if (isUniqueConstraintError(insertResult.error)) {
        return { ok: false, reason: 'unique_constraint_live_session', error: insertResult.error };
      }
      return { ok: false, reason: 'insert_new_live_session_failed', error: insertResult.error };
    }

    console.log('SPOT_PAGE_CHECKIN_SUCCESS', { mode: 'inserted_live_session', selectedSpot: canonicalSpot, source });
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
    console.log('CHECKIN_SHARED_FLOW_SPOT_USED', { source, spot });
    const checkInResult = await runCheckInFlowForSpot({ spot, source });
    if (!checkInResult.ok) {
      const failureResult = checkInResult as { ok: false; reason: string; error?: unknown };
      const failureReason = failureResult.reason;
      const failureError = failureResult.error ?? null;
      console.log('CHECKIN_SHARED_FLOW_ERROR_RESULT', { source, spot, reason: failureReason, error: failureError });
      return { errorMessage: mapCheckInFailureToMessage(failureReason), checkedInSpot: null };
    }

    console.log('CHECKIN_SHARED_FLOW_SUCCESS_RESULT', { source, spot: checkInResult.spot });
    return { errorMessage: null, checkedInSpot: checkInResult.spot };
  };

  const handleUpdateSessionStatus = async (status: SessionStatus) => {
    setSessionActionError('');
    const actionLabel = status === 'Is er al' ? 'SPOT_PAGE_CHECKIN' : 'SPOT_PAGE_CHECKOUT';
    console.log(`${actionLabel}_BUTTON_PRESSED`, { selectedSpot, status });

    const authUserId = activeAppUserId;
    if (!authUserId) {
      return;
    }

    const nowIso = new Date().toISOString();
    const getLatestOpenSession = async () =>
      supabase
        .from('sessions')
        .select('id, spot_name, status, created_at')
        .eq('user_id', authUserId)
        .is('checked_out_at', null)
        .in('status', ['Gaat', 'Is er al'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (status === 'Is er al') {
      if (!selectedSpot) {
        console.warn('SPOT_PAGE_CHECKIN_MISSING_SPOT_NAME', { selectedSpot });
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
      console.log('SPOT_PAGE_CHECKOUT_RESULT', { ok: false, error: latestOpenSessionResponse.error });
      setSessionActionError('Check-out failed. Please try again.');
      return;
    }

    const checkedInSession = latestOpenSessionResponse.data?.status === 'Is er al' ? latestOpenSessionResponse.data : null;
    if (!checkedInSession) {
      setSessionActionError('Check eerst in');
      return;
    }

    console.log("SESSIONS WRITE PATH ACTIVE");
    const result = await supabase
      .from('sessions')
      .update({
        status: 'Uitchecken',
        checked_out_at: nowIso,
      })
      .eq('id', checkedInSession.id)
      .eq('user_id', authUserId);

    if (result.error) {
      console.log('SPOT_PAGE_CHECKOUT_RESULT', { ok: false, error: result.error });
      setSessionActionError('Check-out failed. Please try again.');
      return;
    }

    console.log('SPOT_PAGE_CHECKOUT_RESULT', { ok: true, sessionId: checkedInSession.id });
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
    setIntent('likely');
    setEditingSessionId(null);
    setFormError('');
    setSaveError(null);
  };

  const handleQuickCheckIn = async (spot: SpotName) => {
    console.log('HOME_QUICK_CHECKIN_PRESSED', { spot, activeCheckedInSessionId: activeCheckedInSession?.id ?? null });
    console.log('CHECKIN_HERE_PRESSED', { spot, activeCheckedInSessionId: activeCheckedInSession?.id ?? null });
    setHomeQuickCheckInError('');

    if (quickCheckInWindowError) {
      setHomeQuickCheckInError(quickCheckInWindowError);
      console.log('HOME_QUICK_CHECKIN_RESULT', { ok: false, reason: 'outside_window', quickCheckInWindowError });
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
      console.log('HOME_QUICK_CHECKIN_RESULT', {
        ok: false,
        reason: 'out_of_range',
        spot,
        nearestSpotResult: nearestSpotResult
          ? { spot: nearestSpotResult.spot, distanceMeters: nearestSpotResult.distanceMeters }
          : null,
      });
      return;
    }

    setQuickCheckInSpotInFlight(spot);
    console.log('HOME_QUICK_CHECKIN_SELECTED_SPOT', { spot });
    const { errorMessage: checkInErrorMessage, checkedInSpot } = await handleCheckInWithSharedFlow({ spot, source: 'home_quick' });
    setQuickCheckInSpotInFlight(null);

    if (checkInErrorMessage) {
      setHomeQuickCheckInError(checkInErrorMessage);
      console.log('HOME_QUICK_CHECKIN_ERROR_RESULT', { spot, error: checkInErrorMessage });
      console.log('HOME_QUICK_CHECKIN_RESULT', { ok: false, spot, reason: checkInErrorMessage });
      return;
    }

    const resolvedSpot = checkedInSpot ?? spot;
    setSelectedSpot(resolvedSpot);
    console.log('CHECKIN_HERE_SUCCESS', { spot: resolvedSpot });
    console.log('CHECKIN_HERE_NAVIGATE_TO_SPOT', { spot: resolvedSpot });
    setHomeQuickCheckInError('');
    console.log('HOME_QUICK_CHECKIN_SUCCESS_RESULT', { spot: resolvedSpot });
    console.log('HOME_QUICK_CHECKIN_RESULT', { ok: true, spot: resolvedSpot });
  };
  const handleAutoCheckInDismiss = () => {
    setAutoCheckInPromptDismissed(true);
    setShowAutoCheckinPrompt(false);
    console.log('AUTO_CHECKIN_DISMISSED', {
      nearestSpotName,
      distanceMeters,
    });
  };
  const handleAutoCheckInConfirm = async () => {
    if (!nearestSpotName || distanceMeters === null) {
      return;
    }

    setShowAutoCheckinPrompt(false);
    console.log('AUTO_CHECKIN_CONFIRMED', {
      nearestSpotName,
      distanceMeters,
    });
    await handleQuickCheckIn(nearestSpotName);
  };

  const handleQuickCheckOut = async () => {
    console.log('HOME_QUICK_CHECKOUT_PRESSED', { activeCheckedInSessionId: activeCheckedInSession?.id ?? null });
    setHomeQuickCheckInError('');

    if (!activeAppUserId) {
      return;
    }
    const authUserId = activeAppUserId;

    if (!activeCheckedInSession) {
      setHomeQuickCheckInError('Check eerst in');
      console.log('HOME_QUICK_CHECKOUT_RESULT', { ok: false, reason: 'no_live_session' });
      return;
    }

    setHomeQuickCheckOutInFlight(true);
    console.log("SESSIONS WRITE PATH ACTIVE");
    const result = await supabase
      .from('sessions')
      .update({
        status: 'Uitchecken',
        checked_out_at: new Date().toISOString(),
      })
      .eq('id', activeCheckedInSession.id)
      .eq('user_id', authUserId);

    setHomeQuickCheckOutInFlight(false);

    if (result.error) {
      console.log('HOME_QUICK_CHECKOUT_FAILURE', { error: result.error, activeCheckedInSessionId: activeCheckedInSession.id });
      setHomeQuickCheckInError('Check-out failed. Please try again.');
      console.log('HOME_QUICK_CHECKOUT_RESULT', { ok: false, error: result.error, activeCheckedInSessionId: activeCheckedInSession.id });
      return;
    }

    console.log('HOME_QUICK_CHECKOUT_SUCCESS', { activeCheckedInSessionId: activeCheckedInSession.id });
    console.log('HOME_QUICK_CHECKOUT_RESULT', { ok: true, activeCheckedInSessionId: activeCheckedInSession.id });
    setHomeQuickCheckInError('');
    await fetchSharedData();
  };

  if (loadingSession || loadingProfile || loadingData) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgElevated, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: theme.text }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <AuthScreen
      onSignupSuccess={() => {
        void supabase.auth.getSession().then(({ data }) => {
          if (data.session) {
            void fetchProfile(data.session.user.id);
            void fetchSharedData();
          }
        });
      }}
      onPasswordResetRequest={handlePasswordResetRequest}
    />;
  }

  if (!profile) {
    return <NameSetupScreen userId={session.user.id} onSaved={setProfile} />;
  }

  if (showYourSpotsPage) {
    const query = homeSpotSearchQuery.trim().toLowerCase();
    const filteredSearchableSpots = spotDefinitions
      .filter((spot) => !favoriteSpots.includes(spot.spot))
      .filter((spot) => spot.spot.toLowerCase().includes(query));
    const isResultsVisible = isSearchFocused;
    console.log("YOUR_SPOTS_SEARCH_RESULTS_VISIBLE", isResultsVisible);
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
          <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: theme.text, fontSize: 26, fontWeight: '700' }}>Your spots (max 5)</Text>
              <Pressable
                onPress={() => setShowYourSpotsPage(false)}
                style={{ backgroundColor: theme.bgElevated, borderRadius: 8, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10, paddingVertical: 6 }}
              >
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Back home</Text>
              </Pressable>
            </View>

            <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 6 }}>Search spots</Text>
            <TextInput
              value={homeSpotSearchQuery}
              onChangeText={setHomeSpotSearchQuery}
              onFocus={() => {
                if (searchBlurTimeoutRef.current) {
                  clearTimeout(searchBlurTimeoutRef.current);
                  searchBlurTimeoutRef.current = null;
                }
                setIsSearchFocused(true);
              }}
              onBlur={() => {
                if (searchBlurTimeoutRef.current) {
                  clearTimeout(searchBlurTimeoutRef.current);
                }
                searchBlurTimeoutRef.current = setTimeout(() => {
                  setIsSearchFocused(false);
                  searchBlurTimeoutRef.current = null;
                }, 120);
              }}
              placeholder="Search spots"
              placeholderTextColor={theme.textMuted}
              style={{ backgroundColor: theme.cardStrong, color: theme.text, borderRadius: 10, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 11, paddingVertical: 9, fontSize: 14 }}
            />
            {isResultsVisible ? (
              filteredSearchableSpots.length > 0 ? (
                <View style={{ marginTop: 8 }}>
                  {filteredSearchableSpots.slice(0, 8).map((spotItem) => (
                    <Pressable
                      key={`your-spots-page-search-${spotItem.spot}`}
                      onPressIn={() => handleSearchResultPress(spotItem.spot)}
                      style={{ paddingVertical: 9, borderTopWidth: 1, borderTopColor: theme.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, flex: 1, marginRight: 8 }}>{spotItem.spot}</Text>
                      <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>Add</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 10 }}>No matching spots to add.</Text>
              )
            ) : null}
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
                  borderWidth: 1,
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
                  borderWidth: 1,
                  borderColor: orderMode === 'manual' ? theme.primary : theme.border,
                  backgroundColor: orderMode === 'manual' ? '#123868' : theme.cardStrong,
                }}
              >
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Manual</Text>
              </Pressable>
            </View>

            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', marginTop: 6 }}>Selected spots</Text>
            {selectedSpotCards.length > 0 ? (
              <View style={{ marginTop: 8 }}>
                {selectedSpotCards.map(({ spot, distanceMeters }, manualIndex) => {
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
                      console.log("YOUR_SPOTS_DRAG_START", { spotName: spot });
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
                      console.log("YOUR_SPOTS_DRAG_END", { fromIndex, toIndex });
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
    const filteredBuddyUsers = buddyUsers.filter((userItem) => {
      if (!trimmedSearch) {
        return true;
      }

      const searchableName = userItem.display_name.toLowerCase();
      return searchableName.includes(trimmedSearch);
    });
    console.log('BUDDIES_SEARCH_RESULTS', {
      query: searchUsersInput,
      normalizedQuery: trimmedSearch,
      resultCount: filteredBuddyUsers.length,
      results: filteredBuddyUsers.map((userItem) => ({
        id: userItem.id,
        display_name: userItem.display_name,
      })),
    });
    const followedUsers = buddyUsers.filter((userItem) => followingUserIds.includes(userItem.id));

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgElevated, paddingHorizontal: 20, paddingTop: 20 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
          <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 16 }}>
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
                        borderWidth: 1,
                        borderColor: theme.border,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        marginBottom: 10,
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
                            paddingVertical: 7,
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
                            paddingVertical: 7,
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
                    <Text style={{ color: theme.text, marginLeft: 8, fontSize: 15 }}>{userItem.display_name}</Text>
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
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 9,
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
                      borderWidth: 1,
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

      if (!trimmedName) {
        setProfileEditError('Name is required');
        return;
      }

      if (trimmedName.length < 2) {
        setProfileEditError('Name must be at least 2 characters');
        return;
      }

      if (trimmedName.length > 20) {
        setProfileEditError('Name can be at most 20 characters');
        return;
      }

      const normalizedEmail = normalizeEmail(session.user.email ?? '');

      if (hasBlockedSpotbuddyName(trimmedName, normalizedEmail)) {
        console.log('SPOTBUDDY_NAME_BLOCKED', trimmedName);
        setProfileEditError('Username not allowed');
        return;
      }

      if (hasRestrictedWord(trimmedName)) {
        console.log('USERNAME_VALIDATION_FAILED', trimmedName);
        setProfileEditError('Username contains restricted words');
        return;
      }

      setProfileEditError('');
      setIsSavingProfile(true);

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

      let avatarUrl = profile.avatar_url;
      if (profileAvatarInputUri) {
        const { error: uploadError, publicUrl } = await uploadAvatar(session.user.id, profileAvatarInputUri);
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
      }

      const payload = {
        display_name: trimmedName,
        avatar_url: avatarUrl,
      };
      console.log('profile update payload', payload);

      const updateResult = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', session.user.id);
      console.log('profile update result', updateResult);
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

      const { data: freshProfile, error: freshProfileError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, created_at')
        .eq('id', session.user.id)
        .single();
      console.log('reloaded profile', freshProfile);

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
        <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 16 }}>
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
              style={{ backgroundColor: theme.bgElevated, color: theme.text, borderRadius: 10, padding: 12, marginBottom: 10 }}
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
                    console.log("ACCOUNT_SWITCHER_OPENED");
                    void loadSwitchableAccounts();
                  }
                }}
                style={{ backgroundColor: theme.bgElevated, borderRadius: 10, padding: 12 }}
              >
                <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Switch account</Text>
              </Pressable>
              {showAccountSwitcher ? (
                <View style={{ marginTop: 8, backgroundColor: theme.bgElevated, borderRadius: 10, borderWidth: 1, borderColor: theme.border, padding: 8 }}>
                  {switchableAccounts.map((account) => {
                    const isActive = account.id === activeAppUserId;
                    return (
                      <Pressable
                        key={`switch-account-${account.id}`}
                        onPress={() => {
                          void handleSelectAccount(account);
                        }}
                        style={{
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: theme.border,
                          backgroundColor: isActive ? theme.primaryPressed : theme.cardStrong,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          marginBottom: 6,
                        }}
                      >
                        <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{account.display_name}</Text>
                        <Text style={{ color: theme.textSoft, fontSize: 12 }}>
                          {account.email ?? account.id}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          <Pressable onPress={() => {
            resetFlow();
            void supabase.auth.signOut();
          }} style={{ marginTop: 16, backgroundColor: theme.bgElevated, borderRadius: 10, padding: 12 }}>
            <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Log out</Text>
          </Pressable>

          <Pressable onPress={() => {
            setShowProfile(false);
            setShowAccountSwitcher(false);
            setProfileAvatarInputUri(null);
            setProfileEditError('');
          }} style={{ marginTop: 10, backgroundColor: theme.bgElevated, borderRadius: 10, padding: 12 }}>
            <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (selectedSpot) {
    const showAlert = (message: string) => {
      setSessionActionError(message);
    };

    const handleJoinTimelineSession = async (sessionToJoin: SpotSession) => {
      const now = new Date();
      const sessionStart = new Date(now);
      const sessionEnd = new Date(now);
      const [startHour, startMinute] = sessionToJoin.start.split(':').map((value) => Number.parseInt(value ?? '', 10));
      const [endHour, endMinute] = sessionToJoin.end.split(':').map((value) => Number.parseInt(value ?? '', 10));
      sessionStart.setHours(Number.isNaN(startHour) ? 0 : startHour, Number.isNaN(startMinute) ? 0 : startMinute, 0, 0);
      sessionEnd.setHours(Number.isNaN(endHour) ? 0 : endHour, Number.isNaN(endMinute) ? 0 : endMinute, 0, 0);

      console.log('JOIN_VALIDATION_START', { sessionId: sessionToJoin.id, start: sessionToJoin.start, end: sessionToJoin.end });

      if (sessionStart > now) {
        console.log('JOIN_BLOCKED_NOT_STARTED', { sessionId: sessionToJoin.id });
        showAlert("Session hasn’t started yet");
        return;
      }

      if (sessionEnd < now) {
        console.log('JOIN_BLOCKED_ENDED', { sessionId: sessionToJoin.id });
        showAlert('This session has already ended');
        return;
      }

      console.log('JOIN_ALLOWED_ACTIVE', { sessionId: sessionToJoin.id });

      if (!activeAppUserId) {
        const errorMessage = 'Session could not be saved';
        setSessionActionError(errorMessage);
        console.log('SPOT_PAGE_JOIN_ABORTED_MISSING_AUTH_OR_PROFILE', {
          selectedSourceSession: sessionToJoin,
          currentUserId: activeAppUserId ?? null,
          spot_name: sessionToJoin.spot,
          start_time: sessionToJoin.start,
          end_time: sessionToJoin.end,
          hasProfile: Boolean(profile),
          reason: errorMessage,
        });
        return;
      }

      const currentAuthenticatedUserId = activeAppUserId;
      const clickedSessionUserId = sessionToJoin.userId;
      const clickedSpotName = sessionToJoin.spot;
      const clickedStartTime = sessionToJoin.start;
      const clickedEndTime = sessionToJoin.end;
      const duplicateCandidates = sessions.map((candidateSession) => ({
        id: candidateSession.id,
        user_id: candidateSession.userId,
        spot_name: candidateSession.spot,
        start_time: candidateSession.start,
        end_time: candidateSession.end,
        user_id_matches_current_auth_user: candidateSession.userId === currentAuthenticatedUserId,
        spot_name_matches_clicked_session: candidateSession.spot === clickedSpotName,
        start_time_matches_clicked_session: candidateSession.start === clickedStartTime,
        end_time_matches_clicked_session: candidateSession.end === clickedEndTime,
      }));
      const exactDuplicateCandidatesForCurrentUser = duplicateCandidates.filter(
        (candidate) => (
          candidate.user_id === currentAuthenticatedUserId
          && candidate.spot_name === clickedSpotName
          && candidate.start_time === clickedStartTime
          && candidate.end_time === clickedEndTime
        ),
      );
      const exactDuplicateForCurrentUser = exactDuplicateCandidatesForCurrentUser.length > 0;
      console.log('SPOT_PAGE_JOIN_EXACT_DUPLICATE_CHECK', {
        selectedSourceSession: sessionToJoin,
        currentAuthenticatedUserId,
        clickedSessionUserId,
        spot_name: clickedSpotName,
        start_time: clickedStartTime,
        end_time: clickedEndTime,
        duplicateCandidateCount: duplicateCandidates.length,
        duplicateCandidates,
        exactDuplicateCount: exactDuplicateCandidatesForCurrentUser.length,
        exactDuplicateCandidatesForCurrentUser,
        exactDuplicateForCurrentUser,
      });
      if (exactDuplicateForCurrentUser) {
        setSessionActionError('');
        console.log('SPOT_PAGE_JOIN_BLOCKED_EXACT_DUPLICATE', {
          selectedSourceSession: sessionToJoin,
          currentAuthenticatedUserId,
          clickedSessionUserId,
          spot_name: clickedSpotName,
          start_time: clickedStartTime,
          end_time: clickedEndTime,
          duplicateCandidateCount: duplicateCandidates.length,
          duplicateCandidates,
          exactDuplicateCount: exactDuplicateCandidatesForCurrentUser.length,
          exactDuplicateCandidatesForCurrentUser,
          exactDuplicateForCurrentUser,
          exactErrorReasonShownToUI: '',
        });
        return;
      }

      const joinPayload = {
        spot_name: clickedSpotName,
        user_id: currentAuthenticatedUserId,
        start_time: clickedStartTime,
        end_time: clickedEndTime,
        status: 'Gaat' as const,
        intent: resolveSessionIntent(sessionToJoin.intent),
        checked_in_at: null,
        checked_out_at: null,
        created_at: getIsoDateFromLocalDateKey(selectedPlanningDateKey) ?? undefined,
      };
      console.log('JOIN_INSERT_VALUES', {
        currentUserId: currentAuthenticatedUserId,
        clickedSessionUserId,
        insertUserId: joinPayload.user_id,
      });
      console.log('SPOT_PAGE_JOIN_INSERT_ATTEMPT', {
        selectedSourceSession: sessionToJoin,
        currentUserId: currentAuthenticatedUserId,
        clickedSessionUserId,
        insertedUserId: joinPayload.user_id,
        spot_name: clickedSpotName,
        start_time: clickedStartTime,
        end_time: clickedEndTime,
        joinPayload,
      });
      const joinResult = await createPlannedSession(joinPayload);
      if (joinResult.error) {
        const errorMessage = getSessionPersistenceErrorMessage(joinResult.error, 'Session could not be saved');
        setSessionActionError(errorMessage);
        console.log('SPOT_PAGE_JOIN_ERROR', {
          selectedSourceSession: sessionToJoin,
          currentUserId: currentAuthenticatedUserId,
          clickedSessionOwnerUserId: clickedSessionUserId,
          spot_name: clickedSpotName,
          start_time: clickedStartTime,
          end_time: clickedEndTime,
          duplicateCandidateCount: duplicateCandidates.length,
          duplicateCandidates,
          exactDuplicateCount: exactDuplicateCandidatesForCurrentUser.length,
          exactDuplicateCandidatesForCurrentUser,
          exactDuplicateForCurrentUser,
          supabaseError: joinResult.error,
          joinPayload,
          exactErrorReasonShownToUI: errorMessage,
        });
        return;
      }

      console.log('SPOT_PAGE_JOIN_SUCCESS', {
        currentUserId: currentAuthenticatedUserId,
        clickedSessionUserId,
        insertedUserId: joinResult.data.user_id,
        joinPayload,
        insertedSession: joinResult.data,
      });
      await fetchSharedData();
      setSelectedTimelineSessionId(null);
      setSessionActionError('');
    };
    const handleSave = async () => {
      console.log('SPOT_PAGE_PLANNING_SAVE_PRESSED');
      setSaveError(null);
      console.log('SPOT_PAGE_PLANNING_SELECTED_SPOT', { selectedSpot });
      console.log('SPOT_PAGE_PLANNING_TIME_PAYLOAD', {
        startHour,
        startMinute,
        endHour,
        endMinute,
        selectedPlanningDateKey,
      });

      if (startHour === null) {
        setFormError('Choose a start time first.');
        return;
      }

      if (endHour === null) {
        setFormError('Choose an end time first.');
        return;
      }

      const startTotalMinutes = startHour * 60 + startMinute;
      const endTotalMinutes = endHour * 60 + endMinute;
      if (startTotalMinutes < timelineStartMinutes) {
        setFormError('You can only plan from 08:00');
        return;
      }

      if (endTotalMinutes > planningEndMinutes) {
        setFormError('You cannot plan later than 22:00');
        return;
      }

      if (endTotalMinutes <= startTotalMinutes) {
        setFormError('End time must be later than start time');
        return;
      }

      const nowReference = getPlanningNowReference(selectedPlanningDateKey, getCurrentLocalMinutes());
      if (nowReference.isToday && startTotalMinutes < nowReference.earliestStartMinutes) {
        console.log('PLANNING_PAST_TIME_BLOCKED', {
          startTotalMinutes,
          earliestStartMinutes: nowReference.earliestStartMinutes,
          selectedPlanningDateKey,
          editingSessionId,
        });
        setFormError('Start time cannot be in the past.');
        return;
      }

      console.log('BLOCKING_SESSION', planningOverlapBlockingSession);
      if (planningOverlapBlockingSession) {
        setFormError('You already have a session at this time');
        return;
      }

      if (!activeAppUserId) {
        setFormError('Planning the session failed. Please try again.');
        setSaveError({ message: 'missing_auth_or_profile' });
        console.log('SPOT_PAGE_PLANNING_SAVE_ERROR', {
          reason: 'missing_auth_or_profile',
          selectedSpot,
          hasSessionUserId: Boolean(activeAppUserId),
        });
        return;
      }

      const payload = {
        spot_name: selectedSpot,
        user_id: activeAppUserId,
        start_time: `${formatTimePart(startHour)}:${formatTimePart(startMinute)}`,
        end_time: `${formatTimePart(endHour)}:${formatTimePart(endMinute)}`,
        status: 'Gaat' as const,
        intent,
        checked_in_at: null,
        checked_out_at: null,
        created_at: getIsoDateFromLocalDateKey(selectedPlanningDateKey) ?? undefined,
      };
      console.log("PLAN_SESSION_ACTIVE_DAY", { activeDay, plannedDate: selectedPlanningDateKey });
      console.log('SESSION_INTENT_SAVE_PAYLOAD', payload);
      const plannedDateRange = getIsoDateRangeForLocalDateKey(selectedPlanningDateKey);
      const exactDuplicateQuery = supabase
        .from('sessions')
        .select('id, user_id, spot_name, start_time, end_time, status, checked_in_at, checked_out_at')
        .eq('user_id', payload.user_id)
        .eq('spot_name', payload.spot_name)
        .eq('start_time', payload.start_time)
        .eq('end_time', payload.end_time)
        .eq('status', payload.status)
        .is('checked_in_at', null)
        .is('checked_out_at', null)
        .gte('created_at', plannedDateRange?.dayStartIso ?? '1900-01-01T00:00:00.000Z')
        .lt('created_at', plannedDateRange?.dayEndIso ?? '9999-12-31T00:00:00.000Z');

      const exactDuplicateResult = editingSessionId
        ? await exactDuplicateQuery.neq('id', editingSessionId).maybeSingle()
        : await exactDuplicateQuery.maybeSingle();

      if (exactDuplicateResult.error) {
        setFormError('Planning the session failed. Please try again.');
        setSaveError({
          message: exactDuplicateResult.error.message,
          details: exactDuplicateResult.error.details,
          hint: exactDuplicateResult.error.hint,
          code: exactDuplicateResult.error.code,
          response: exactDuplicateResult,
        });
        console.log('SPOT_PAGE_PLANNING_SAVE_DUPLICATE_QUERY_ERROR', { error: exactDuplicateResult.error, payload, editingSessionId });
        return;
      }

      if (exactDuplicateResult.data) {
        setFormError('You already have a session at this time');
        setSaveError({
          message: 'sessions_unique',
          details: `duplicate_planned_session_id:${exactDuplicateResult.data.id}`,
        });
        console.log('SPOT_PAGE_PLANNING_SAVE_BLOCKED_DUPLICATE', {
          payload,
          editingSessionId,
          duplicateSessionId: exactDuplicateResult.data.id,
        });
        return;
      }

      console.log('SPOT_PAGE_PLANNING_SAVE_PAYLOAD', {
        payload,
        payloadInspection: {
          userId: payload.user_id,
          spot: payload.spot_name,
          dateDaySource: currentLocalDateKey,
          start: payload.start_time,
          end: payload.end_time,
          status: payload.status,
          checkedInAt: payload.checked_in_at,
          checkedOutAt: payload.checked_out_at,
        },
      });
      let result;
      if (editingSessionId) {
        console.log("SESSIONS WRITE PATH ACTIVE");
        result = await supabase
          .from('sessions')
          .update({
            start_time: payload.start_time,
            end_time: payload.end_time,
            intent: payload.intent,
          })
          .eq('id', editingSessionId)
          .eq('user_id', user.id)
          .select('id, spot_name, start_time, end_time, checked_in_at, checked_out_at, status, intent')
          .single();
      } else {
        result = await createPlannedSession(payload);
      }
      if (result.error) {
        setFormError(getSessionPersistenceErrorMessage(result.error, 'Planning the session failed. Please try again.'));
        setSaveError({
          message: result.error.message,
          details: result.error.details,
          hint: result.error.hint,
          code: result.error.code,
          response: result,
        });
        console.log('SPOT_PAGE_PLANNING_SAVE_ERROR', { error: result.error, payload, editingSessionId });
        console.log('SPOT_PAGE_PLANNING_SAVE_ERROR_MESSAGE', result.error.message ?? null);
        console.log('SPOT_PAGE_PLANNING_SAVE_ERROR_DETAILS', result.error.details ?? null);
        console.log('SPOT_PAGE_PLANNING_SAVE_ERROR_HINT', result.error.hint ?? null);
        console.log('SPOT_PAGE_PLANNING_SAVE_ERROR_FULL_RESPONSE', result);
        return;
      }

      console.log('SPOT_PAGE_PLANNING_SAVE_RESULT', result.data);
      await fetchSharedData();
      resetForm();
      setSessionActionError('');
    };
    const primaryButtonStyle = {
      backgroundColor: '#1d4ed8',
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
      <View style={{ backgroundColor: '#16324d', borderWidth: 1, borderColor: '#2f5f86', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }}>
        <Text style={{ color: '#d9eeff', fontSize: 13, fontWeight: '700' }}>Automatically checked out</Text>
        <Text style={{ color: '#d9eeff', fontSize: 13, marginTop: 2 }}>You appear to have left the spot</Text>
      </View>
    ) : null;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 34 }}>
        <Pressable onPress={() => setSelectedSpot(null)} style={{ marginBottom: 18 }}>
          <Text style={{ color: theme.textSoft, fontSize: 15, letterSpacing: 0.2 }}>← Back to spots</Text>
        </Pressable>
        {autoCheckoutBanner}

        <View style={{ backgroundColor: theme.card, borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: theme.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1.3 }}>SPOT STATUS</Text>
              <Text style={{ color: theme.text, fontSize: 26, fontWeight: '700', marginTop: 6 }}>{selectedSpot}</Text>
              {selectedSpotMomentumLabel ? (
                <View style={{ alignSelf: 'flex-start', marginTop: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.bgElevated, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '700' }}>{selectedSpotMomentumLabel}</Text>
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={() => setIsNotificationPanelExpanded((prev) => !prev)}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.bgElevated,
                paddingHorizontal: 10,
                paddingVertical: 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: '600' }}>Notifications</Text>
              <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: areAnySpotNotificationsEnabled ? theme.primary : theme.textMuted }} />
            </Pressable>
          </View>

          {isNotificationPanelExpanded ? (
            <View
              style={{
                alignSelf: 'flex-end',
                marginTop: 10,
                width: 332,
                maxWidth: '100%',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.bgElevated,
                paddingHorizontal: 14,
                paddingVertical: 12,
                zIndex: 20,
                elevation: 8,
                shadowColor: '#000000',
                shadowOpacity: 0.35,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
              }}
            >
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700', marginBottom: 10 }}>Notifications for this spot</Text>

              {[
                {
                  key: 'sessionPlanning' as const,
                  label: 'Session planned',
                  preferenceField: 'session_planning_notification_mode' as const,
                },
                {
                  key: 'checkin' as const,
                  label: 'Check-ins',
                  preferenceField: 'checkin_notification_mode' as const,
                },
                {
                  key: 'chat' as const,
                  label: 'Chat messages',
                  preferenceField: 'chat_notification_mode' as const,
                },
              ].map((notificationType, index) => (
                <View
                  key={notificationType.key}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: index === 2 ? 0 : 10, minHeight: 32 }}
                >
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', paddingRight: 10, flexShrink: 1 }}>{notificationType.label}</Text>
                  <View style={{ flexDirection: 'row', borderRadius: 999, borderWidth: 1, borderColor: theme.border, overflow: 'hidden', marginLeft: 8 }}>
                    {notificationModeOptions.map((option) => {
                      const isSelected = spotNotificationPreferences[notificationType.preferenceField] === option.value;
                      return (
                        <Pressable
                          key={`${notificationType.key}-${option.value}`}
                          disabled={loadingSpotNotificationPreferences || savingNotificationPreferenceKey !== null}
                          onPress={() => {
                            const previousPreferences = spotNotificationPreferences;
                            const nextPreferences = {
                              ...previousPreferences,
                              [notificationType.preferenceField]: option.value,
                            };
                            setSpotNotificationPreferences(nextPreferences);
                            void saveSpotNotificationPreferences(nextPreferences, notificationType.key).then((didSave) => {
                              if (!didSave) {
                                setSpotNotificationPreferences(previousPreferences);
                              }
                            });
                          }}
                          style={{
                            paddingVertical: 5,
                            paddingHorizontal: 9,
                            backgroundColor: isSelected ? '#2563eb' : theme.bg,
                            opacity: loadingSpotNotificationPreferences ? 0.55 : 1,
                          }}
                        >
                          <Text style={{ color: theme.text, fontSize: 11, fontWeight: isSelected ? '700' : '600' }}>{option.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}

              {notificationPreferencesError ? <Text style={{ color: '#ff7e7e', fontSize: 12, marginTop: 8 }}>{notificationPreferencesError}</Text> : null}
            </View>
          ) : null}

          {!shouldHidePlanSessionButton ? (
            <Pressable
              disabled={shouldDisablePlanSessionButton}
              onPress={() => {
                if (shouldDisablePlanSessionButton) {
                  setSessionActionError('Finish your current session first');
                  return;
                }
                if (hasConflictingSession) {
                  setSessionActionError('You already have a session at this time');
                  return;
                }
                openEmptyPlanningForm();
              }}
              style={{ marginTop: 14, ...primaryButtonStyle, opacity: shouldDisablePlanSessionButton ? 0.45 : 1 }}
            >
              <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>Plan session</Text>
            </Pressable>
          ) : null}
          {currentUserEditableSession ? (
            <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={() => {
                  setEditingSessionId(currentUserEditableSession.id);
                  const parsedStart = parseHourMinuteParts(currentUserEditableSession.start);
                  const parsedEnd = parseHourMinuteParts(currentUserEditableSession.end);
                  setStartHour(parsedStart.hour);
                  setStartMinute(parsedStart.minute);
                  setEndHour(parsedEnd.hour);
                  setEndMinute(parsedEnd.minute);
                  setIntent(resolveSessionIntent(currentUserEditableSession.intent));
                  setShowForm(true);
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
                  void handleCancelPlannedSession(currentUserEditableSession);
                }}
                style={{ ...sessionActionButtonBaseStyle, backgroundColor: '#8b1f38' }}
              >
                <Text style={{ color: '#ffd7de', fontSize: 14, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}
          {showForm ? <Text style={{ color: theme.textSoft, marginTop: 6 }}>Form open</Text> : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            {checkInCtaVisible ? (
              <Pressable
                disabled={!canCheckIn}
                onPress={() => {
                  void handleUpdateSessionStatus('Is er al');
                }}
                style={{
                  ...sessionActionButtonBaseStyle,
                  backgroundColor: '#15803d',
                  opacity: canCheckIn ? 1 : 0.45,
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>Check in</Text>
              </Pressable>
            ) : null}
            {shouldShowSpotCheckOut ? (
              <Pressable
                disabled={!canCheckOut}
                onPress={() => {
                  void handleUpdateSessionStatus('Uitchecken');
                }}
                style={{ ...sessionActionButtonBaseStyle, backgroundColor: '#7c2d12', opacity: canCheckOut ? 1 : 0.45 }}
              >
                <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>Check out</Text>
              </Pressable>
            ) : null}
          </View>

          {hasPlannedSession ? <Text style={{ color: theme.textSoft, marginTop: 6 }}>You already have an active session</Text> : null}
          {sessionActionError ? <Text style={{ color: '#ff7e7e', fontSize: 14, marginTop: 8 }}>{sessionActionError}</Text> : null}

          {showForm ? (
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: theme.textSoft, fontSize: 14, marginBottom: 6 }}>Start time</Text>

              <View style={{ flexDirection: 'row', marginBottom: 6, gap: 8 }}>
                <Pressable onPress={() => { setActivePicker((prev) => (prev === 'startHour' ? null : 'startHour')); setFormError(''); }} style={{ flex: 1, backgroundColor: theme.bgElevated, borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ color: theme.text, fontSize: 15 }}>Hour: {startHour === null ? '--' : formatTimePart(startHour)}</Text>
                </Pressable>
                <Pressable onPress={() => { setActivePicker((prev) => (prev === 'startMinute' ? null : 'startMinute')); setFormError(''); }} style={{ flex: 1, backgroundColor: theme.bgElevated, borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10 }}>
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
                      style={{ backgroundColor: startHour === hour ? theme.primary : theme.bgElevated, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}
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
                        return true;
                      }
                      const selectedStartMinutes = (startHour * 60) + minute;
                      if (planningNowReference.isToday && selectedStartMinutes < planningNowReference.earliestStartMinutes) {
                        return false;
                      }
                      return selectedStartMinutes <= planningNowReference.latestPlanningStartMinutes;
                    })
                    .map((minute) => (
                    <Pressable key={`start-minute-${minute}`} onPress={() => setStartMinute(minute)} style={{ backgroundColor: startMinute === minute ? theme.primary : theme.bgElevated, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}>
                      <Text style={{ color: theme.text }}>{formatTimePart(minute)}</Text>
                    </Pressable>
                    ))}
                </View>
              ) : null}

              <Text style={{ color: theme.textSoft, fontSize: 14, marginBottom: 6 }}>End time</Text>
              <View style={{ flexDirection: 'row', marginBottom: 6, gap: 8 }}>
                <Pressable onPress={() => { setActivePicker((prev) => (prev === 'endHour' ? null : 'endHour')); setFormError(''); }} style={{ flex: 1, backgroundColor: theme.bgElevated, borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ color: theme.text, fontSize: 15 }}>Hour: {endHour === null ? '--' : formatTimePart(endHour)}</Text>
                </Pressable>
                <Pressable onPress={() => { setActivePicker((prev) => (prev === 'endMinute' ? null : 'endMinute')); setFormError(''); }} style={{ flex: 1, backgroundColor: theme.bgElevated, borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ color: theme.text, fontSize: 15 }}>Minute: {formatTimePart(endMinute)}</Text>
                </Pressable>
              </View>
              {activePicker === 'endHour' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                  {hours.filter((hour) => hour >= 8 && hour <= 22).map((hour) => (
                    <Pressable key={`end-hour-${hour}`} onPress={() => setEndHour(hour)} style={{ backgroundColor: endHour === hour ? theme.primary : theme.bgElevated, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}>
                      <Text style={{ color: theme.text }}>{formatTimePart(hour)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {activePicker === 'endMinute' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                  {minuteOptions.map((minute) => (
                    <Pressable key={`end-minute-${minute}`} onPress={() => setEndMinute(minute)} style={{ backgroundColor: endMinute === minute ? theme.primary : theme.bgElevated, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}>
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
                        console.log('SESSION_INTENT_SELECTED', option.value);
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: isActive ? theme.primary : theme.bgElevated,
                        borderRadius: 10,
                        borderWidth: 1,
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
                <Pressable onPress={handleSave} style={{ ...primaryButtonStyle, flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{editingSessionId ? 'Update' : 'Save'}</Text>
                </Pressable>
                <Pressable onPress={resetForm} style={{ ...primaryButtonStyle, flex: 1, backgroundColor: theme.bgElevated }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        {shouldShowNowAtSpotPanel ? (
          <View style={{ backgroundColor: theme.card, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: theme.border }}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 6 }}>Now at the spot</Text>

            {mode === 'live' ? (
            <>
              <Text style={{ color: theme.textSoft, fontSize: 14, marginBottom: 10 }}>{liveKiterCountLabel}</Text>
              <View>
                {checkedInUsers.map((liveSession) => (
                  <View key={`live-${liveSession.id}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 }} numberOfLines={1}>
                      {liveSession.userName}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                      {`checked in at ${formatToHourMinute(liveSession.checkedInAt)}`}
                    </Text>
                  </View>
                ))}
              </View>
            </>
            ) : mode === 'upcoming' ? (
            <>
              <Text style={{ color: theme.textSoft, fontSize: 14, marginBottom: 10 }}>
                {activeDay === 'today' ? 'Coming up today' : 'Coming up tomorrow'}
              </Text>
              <View>
                {upcomingSessions.map((upcomingSession) => (
                  <View key={`upcoming-${upcomingSession.id}`} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 }} numberOfLines={1}>
                        {upcomingSession.userName}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                        {`${upcomingSession.start}–${upcomingSession.end}`}
                      </Text>
                    </View>
                    <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                      {getIntentGoingLabel(resolveSessionIntent(upcomingSession.intent))}
                    </Text>
                  </View>
                ))}
              </View>
            </>
            ) : (
              <Text style={{ color: theme.textMuted, fontSize: 14 }}>No one at the spot yet</Text>
            )}
          </View>
        ) : null}

        <View style={{ backgroundColor: theme.card, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: theme.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Sessions</Text>
            <View style={{ flexDirection: 'row', backgroundColor: theme.bgElevated, borderRadius: 999, borderWidth: 1, borderColor: theme.border, padding: 2 }}>
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
                      backgroundColor: isActive ? theme.primary : 'transparent',
                    }}
                  >
                    <Text style={{ color: isActive ? '#ffffff' : theme.textSoft, fontSize: 12, fontWeight: '700' }}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ marginBottom: 10 }}>
            <View style={{ marginLeft: 98, flexDirection: 'row', justifyContent: 'space-between' }}>
              {timelineLabels.map((label) => (
                <Text key={label} style={{ color: theme.textMuted, fontSize: 11 }}>
                  {label}
                </Text>
              ))}
            </View>
          </View>
          <SessionTimeline
            timelineSessions={timelineSessions}
            selectedTimelineSessionId={selectedTimelineSessionId}
            currentUserId={activeAppUserId}
            currentLocalMinutes={activeDay === 'today' ? currentLocalMinutes : timelineStartMinutes}
            timelineWindowStartMinutes={timelineWindow.startMinutes}
            timelineWindowEndMinutes={timelineWindow.endMinutes}
            timelineFilter={timelineFilter}
            showNowMarker={activeDay === 'today'}
            onSelectSession={(sessionId) => setSelectedTimelineSessionId(sessionId)}
            onClearSelection={() => setSelectedTimelineSessionId(null)}
            onJoinSession={(sessionItem) => {
              void handleJoinTimelineSession(sessionItem);
            }}
          />
          {selectedTimelineSession ? (
            <View style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.bgElevated, padding: 10 }}>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>
                {selectedTimelineSession.item.userName} · {selectedTimelineSession.item.start}–{selectedTimelineSession.item.end}
              </Text>
              <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 4 }}>
                Status: {getTimelineLabel(selectedTimelineSession.state, false)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: theme.border }}>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Chat</Text>

          <TextInput
            value={messageInput}
            onChangeText={setMessageInput}
            placeholder="Type a message"
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.bgElevated, color: theme.text, borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 }}
          />
          <Pressable
            onPress={() => {
              void (async () => {
                const messageText = messageInput.trim();
                if (!messageText || !selectedSpot) {
                  return;
                }

                console.log('USER OBJECT', { id: activeAppUserId });
                const activeMessageDateIso = getIsoDateFromLocalDateKey(activeDateKey) ?? new Date().toISOString();
                const payload = {
                  user_id: activeAppUserId,
                  text: messageText,
                  spot_name: selectedSpot,
                  created_at: activeMessageDateIso,
                };
                console.log('INSERT PAYLOAD', payload);
                if (!activeAppUserId) {
                  console.error('NO AUTH USER');
                  return;
                }

                console.log('USER ID', activeAppUserId);
                console.log('SENDING MESSAGE', payload);
                const { error } = await supabase.from('messages').insert(payload);

                if (error) {
                  console.error('FULL ERROR', error);
                  console.error('ERROR MESSAGE', error.message);
                  console.error('ERROR DETAILS', error.details);
                  console.error('ERROR HINT', error.hint);
                  return;
                }

                setMessageInput('');
                await fetchSharedData();
              })();
            }}
            style={{ backgroundColor: theme.primaryPressed, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, alignItems: 'center' }}
          >
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>Send</Text>
          </Pressable>

          {newestFirstMessages.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              {newestFirstMessages.map((message) => (
                <View key={message.id} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
                  <Avatar uri={message.avatar_url} size={24} />
                  <View style={{ marginLeft: 8, flex: 1, backgroundColor: theme.cardStrong, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }}>
                    <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 2 }}>
                      {message.display_name} · {formatToHourMinute(message.createdAt)}
                    </Text>
                    <Text style={{ color: theme.text, fontSize: 15 }}>{message.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: theme.textSoft, fontSize: 15, marginTop: 12 }}>No messages yet</Text>
          )}
        </View>


      </ScrollView>
    );
  }
  const visibleSpots = homeSpotCards.map(({ spot, distanceMeters }) => ({ name: spot, distanceMeters }));
  console.log("HOME_VISIBLE_SPOTS", visibleSpots.map((s) => s.name));
  console.log("YOUR_SPOTS_ORDER_MODE", orderMode);
  console.log("YOUR_SPOTS_MANUAL_ORDER", manualOrder);
  console.log("YOUR_SPOTS_VISIBLE_ORDER", visibleSpots.map((s) => s.name));
  console.log("HOME_SCROLL_CONTAINER_ACTIVE");
  console.log("HOME_SPOTS_RENDER_COUNT", visibleSpots.length);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 }}>
      <View style={{ marginBottom: 18, borderWidth: 1, borderColor: theme.border, borderRadius: 20, backgroundColor: theme.card, paddingHorizontal: 14, paddingVertical: 20, minHeight: 172, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Image
            source={require('./assets/logo.png')}
            style={{ width: 140, height: 140, marginRight: 18 }}
            resizeMode="contain"
          />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={{ color: theme.text, fontSize: 30, fontWeight: '800' }}>See who’s going. Ride together.</Text>
          </View>
        </View>
        <View style={{ marginLeft: 10, width: 260 }}>
          <Pressable
            key={headerProfile?.userId ?? 'header-profile-empty'}
            onPress={() => setShowProfile(true)}
            style={{ backgroundColor: theme.cardStrong, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.border }}
          >
            <Avatar uri={headerProfile?.avatarUrl ?? null} size={24} />
            <Text style={{ color: theme.text, fontWeight: '600', marginLeft: 8 }}>
              {headerProfile?.displayName ?? 'Profile'}
            </Text>
          </Pressable>
          {plannedSession && (
            <Pressable
              onPress={() => {
                setSelectedSpot(plannedSession.spot);
              }}
              style={{
                marginTop: 8,
                marginBottom: 8,
                backgroundColor: theme.cardStrong,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 12,
                paddingVertical: 8,
                paddingHorizontal: 12,
                width: '100%',
              }}
            >
              <Text
                style={{
                  color: theme.text,
                  fontSize: 13,
                  fontWeight: '700',
                  textAlign: 'center',
                }}
              >
                🚨 Planned: {plannedSession.spot}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2, textAlign: 'center' }}>
                {plannedSessionIntentLabel}
              </Text>
            </Pressable>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Pressable
              onPress={() => setShowYourSpotsPage(true)}
              style={{ flex: 1, backgroundColor: theme.bgElevated, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.border }}
            >
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>
                Your spots
              </Text>
            </Pressable>
            <View style={{ width: 8 }} />
            <View style={{ flex: 1, position: 'relative' }}>
              <Pressable
                onPress={() => setShowBuddies(true)}
                style={{ backgroundColor: theme.bgElevated, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.border }}
              >
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>Your buddies</Text>
              </Pressable>
              {hasPendingRequests && (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: 'red',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {pendingRequestsCount !== null ? (
                    <Text style={{ color: 'white', fontSize: 10, fontWeight: '700' }}>{pendingRequestsCount}</Text>
                  ) : null}
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      <View>
        {autoCheckoutNotice ? (
          <View style={{ backgroundColor: '#16324d', borderWidth: 1, borderColor: '#2f5f86', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 }}>
            <Text style={{ color: '#d9eeff', fontSize: 13, fontWeight: '700' }}>Automatically checked out</Text>
            <Text style={{ color: '#d9eeff', fontSize: 13, marginTop: 2 }}>You appear to have left the spot</Text>
          </View>
        ) : null}
        {!isWebPlatform && showAutoCheckinPrompt && nearestSpotName ? (
          <Text style={{ color: theme.textSoft, marginBottom: 10, fontSize: 13 }}>
            {`You're near ${nearestSpotName}.`}
          </Text>
        ) : null}
        {homeQuickCheckInError ? <Text style={{ color: '#ff7e7e', marginBottom: 10 }}>{homeQuickCheckInError}</Text> : null}
        <View style={{ marginBottom: 12 }}>
          {(() => {
            console.log("HOME_DAY_TOGGLE_RENDERED");
            return null;
          })()}
          <View style={{ flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: theme.bgElevated, borderRadius: 999, borderWidth: 1, borderColor: theme.border, padding: 2 }}>
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
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: isActive ? theme.primary : 'transparent',
                  }}
                >
                  <Text style={{ color: isActive ? '#ffffff' : theme.textSoft, fontSize: 12, fontWeight: '700' }}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={{ marginBottom: 12 }}>
          {(() => {
            console.log("HOME_SEARCH_REMOVED_FROM_MAIN_PAGE");
            return null;
          })()}
          {isResolvingNearestSpot ? (
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>Nearest spot · Getting location...</Text>
          ) : nearestSpotResult && nearestSpotDistanceLabel ? (
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              Nearest spot · <Text style={{ color: theme.textSoft, fontWeight: '700' }}>{nearestSpotResult.spot}</Text> · {nearestSpotDistanceLabel}
            </Text>
          ) : (
            <View>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>Nearest spot · No nearby spot</Text>
              {locationPermissionStatus !== 'granted' ? (
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>Enable location for quick check-ins.</Text>
              ) : null}
            </View>
          )}
          {nearestSpotResult && (
            (() => {
              console.log("HOME_NEAREST_SPOT_CONTEXT_ROW", { nearestSpot: nearestSpotResult.spot, distanceMeters: nearestSpotResult.distanceMeters });
              return null;
            })()
          )}
          {nearestSpotResult && nearestSpotDistanceLabel ? (
            <View style={{ marginTop: 10 }}>
              {isHomeCheckoutButtonVisible ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Pressable
                    disabled={homeQuickCheckOutInFlight}
                    onPress={() => {
                      void handleQuickCheckOut();
                    }}
                    style={{
                      borderRadius: 10,
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                      alignItems: 'center',
                      backgroundColor: '#7c2d12',
                      opacity: homeQuickCheckOutInFlight ? 0.45 : 1,
                    }}
                  >
                    <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>
                      {homeQuickCheckOutInFlight ? 'Check out...' : 'Check out here'}
                    </Text>
                  </Pressable>
                  {activeCheckedInSession.spot !== nearestSpotResult.spot ? (
                    <Text numberOfLines={1} style={{ color: theme.textMuted, marginLeft: 8, fontSize: 11, maxWidth: 156 }}>
                      You are checked in at {activeCheckedInSession.spot}
                    </Text>
                  ) : null}
                </View>
              ) : (
                nearestSpotCanCheckIn ? (
                  <Pressable
                    disabled={quickCheckInSpotInFlight !== null}
                    onPress={() => {
                      void handleQuickCheckIn(nearestSpotResult.spot);
                    }}
                    style={{
                      borderRadius: 10,
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                      alignItems: 'center',
                      alignSelf: 'flex-start',
                      backgroundColor: '#15803d',
                      opacity: quickCheckInSpotInFlight !== null ? 0.45 : 1,
                    }}
                  >
                    <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>
                      {quickCheckInSpotInFlight === nearestSpotResult.spot ? 'Check in...' : 'Check in here'}
                    </Text>
                  </Pressable>
                ) : null
              )}
            </View>
          ) : null}
        </View>
        {visibleSpots.length === 0 ? (
          <View style={{ backgroundColor: theme.card, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12, borderWidth: 1, borderColor: theme.border }}>
            <Text style={{ color: theme.textSoft, fontSize: 14 }}>No spots selected yet</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>Manage your list from Your spots.</Text>
          </View>
        ) : null}
        {visibleSpots.map((spot) => {
          const daySpotSessions = daySessionsBySpot[spot.name] ?? [];
          const plannedCount = daySpotSessions.filter((sessionItem) => getSessionState(sessionItem) === 'planned').length;
          const activeCount = daySpotSessions.filter((sessionItem) => getSessionState(sessionItem) === 'active').length;
          const spotMomentum = homeMomentumBySpot[spot.name];
          const todayLabel = spotMomentum?.today ?? null;
          const tomorrowLabel = spotMomentum?.tomorrow ?? null;
          const activeMomentumLabel = activeDay === 'today' ? todayLabel : tomorrowLabel;
          console.log("HOME_CARD_TODAY_LABEL", { spotName: spot.name, label: todayLabel });
          console.log("HOME_CARD_TOMORROW_LABEL", { spotName: spot.name, label: tomorrowLabel });
          console.log("HOME_CARD_MOMENTUM_RENDER", { spotName: spot.name, todayLabel, tomorrowLabel });

          return (
            <Pressable
              key={spot.name}
              onPress={() => setSelectedSpot(spot.name)}
              style={{
                backgroundColor: theme.card,
                borderRadius: 16,
                paddingHorizontal: 16,
                paddingVertical: 14,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}>{spot.name}</Text>
              </View>
              <Text style={{ color: theme.textSoft, marginTop: 4, fontSize: 13 }}>
                Distance: {spot.distanceMeters === null ? 'Unknown' : formatDistance(spot.distanceMeters)}
              </Text>
              {activeMomentumLabel ? (
                <View style={{ marginTop: 8, alignSelf: 'flex-start', gap: 4 }}>
                  <View style={{ backgroundColor: activeDay === 'today' ? '#0f2e25' : '#0a2640', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
                    <Text style={{ color: activeDay === 'today' ? '#83d8b0' : '#6ab7ff', fontSize: 11, fontWeight: '700' }}>{activeMomentumLabel}</Text>
                  </View>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
                <View style={{ flex: 1, backgroundColor: theme.bgElevated, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>Planned</Text>
                  <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700', marginTop: 2 }}>{plannedCount}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#10271f', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 }}>
                  <Text style={{ color: '#6ee7b7', fontSize: 12, fontWeight: '600' }}>Active</Text>
                  <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700', marginTop: 2 }}>{activeCount}</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}
