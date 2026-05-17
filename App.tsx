import { useEffect, useMemo, useRef, useState } from 'react';

import { Session as AuthSession } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import DiscoverMap from './src/components/DiscoverMap';
import * as Buzz from 'expo-notifications';
import { Image, Keyboard, KeyboardAvoidingView, PanResponder, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Zap, Users, HelpCircle } from 'lucide-react-native';

import { uploadAvatar } from './src/lib/avatar';
import { sendExpoPushNotification } from './src/lib/pushNotifications';
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

const COUNTRIES: { code: string; flag: string; name: string }[] = [
  { code: 'AF', flag: '🇦🇫', name: 'Afghanistan' },
  { code: 'AL', flag: '🇦🇱', name: 'Albania' },
  { code: 'DZ', flag: '🇩🇿', name: 'Algeria' },
  { code: 'AD', flag: '🇦🇩', name: 'Andorra' },
  { code: 'AO', flag: '🇦🇴', name: 'Angola' },
  { code: 'AR', flag: '🇦🇷', name: 'Argentina' },
  { code: 'AM', flag: '🇦🇲', name: 'Armenia' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: 'AT', flag: '🇦🇹', name: 'Austria' },
  { code: 'AZ', flag: '🇦🇿', name: 'Azerbaijan' },
  { code: 'BS', flag: '🇧🇸', name: 'Bahamas' },
  { code: 'BH', flag: '🇧🇭', name: 'Bahrain' },
  { code: 'BD', flag: '🇧🇩', name: 'Bangladesh' },
  { code: 'BY', flag: '🇧🇾', name: 'Belarus' },
  { code: 'BE', flag: '🇧🇪', name: 'Belgium' },
  { code: 'BZ', flag: '🇧🇿', name: 'Belize' },
  { code: 'BJ', flag: '🇧🇯', name: 'Benin' },
  { code: 'BO', flag: '🇧🇴', name: 'Bolivia' },
  { code: 'BA', flag: '🇧🇦', name: 'Bosnia & Herzegovina' },
  { code: 'BW', flag: '🇧🇼', name: 'Botswana' },
  { code: 'BR', flag: '🇧🇷', name: 'Brazil' },
  { code: 'BN', flag: '🇧🇳', name: 'Brunei' },
  { code: 'BG', flag: '🇧🇬', name: 'Bulgaria' },
  { code: 'BF', flag: '🇧🇫', name: 'Burkina Faso' },
  { code: 'KH', flag: '🇰🇭', name: 'Cambodia' },
  { code: 'CM', flag: '🇨🇲', name: 'Cameroon' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: 'CV', flag: '🇨🇻', name: 'Cape Verde' },
  { code: 'CL', flag: '🇨🇱', name: 'Chile' },
  { code: 'CN', flag: '🇨🇳', name: 'China' },
  { code: 'CO', flag: '🇨🇴', name: 'Colombia' },
  { code: 'CR', flag: '🇨🇷', name: 'Costa Rica' },
  { code: 'HR', flag: '🇭🇷', name: 'Croatia' },
  { code: 'CU', flag: '🇨🇺', name: 'Cuba' },
  { code: 'CY', flag: '🇨🇾', name: 'Cyprus' },
  { code: 'CZ', flag: '🇨🇿', name: 'Czech Republic' },
  { code: 'DK', flag: '🇩🇰', name: 'Denmark' },
  { code: 'DO', flag: '🇩🇴', name: 'Dominican Republic' },
  { code: 'EC', flag: '🇪🇨', name: 'Ecuador' },
  { code: 'EG', flag: '🇪🇬', name: 'Egypt' },
  { code: 'SV', flag: '🇸🇻', name: 'El Salvador' },
  { code: 'EE', flag: '🇪🇪', name: 'Estonia' },
  { code: 'ET', flag: '🇪🇹', name: 'Ethiopia' },
  { code: 'FJ', flag: '🇫🇯', name: 'Fiji' },
  { code: 'FI', flag: '🇫🇮', name: 'Finland' },
  { code: 'FR', flag: '🇫🇷', name: 'France' },
  { code: 'GE', flag: '🇬🇪', name: 'Georgia' },
  { code: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: 'GH', flag: '🇬🇭', name: 'Ghana' },
  { code: 'GR', flag: '🇬🇷', name: 'Greece' },
  { code: 'GT', flag: '🇬🇹', name: 'Guatemala' },
  { code: 'HN', flag: '🇭🇳', name: 'Honduras' },
  { code: 'HK', flag: '🇭🇰', name: 'Hong Kong' },
  { code: 'HU', flag: '🇭🇺', name: 'Hungary' },
  { code: 'IS', flag: '🇮🇸', name: 'Iceland' },
  { code: 'IN', flag: '🇮🇳', name: 'India' },
  { code: 'ID', flag: '🇮🇩', name: 'Indonesia' },
  { code: 'IR', flag: '🇮🇷', name: 'Iran' },
  { code: 'IQ', flag: '🇮🇶', name: 'Iraq' },
  { code: 'IE', flag: '🇮🇪', name: 'Ireland' },
  { code: 'IL', flag: '🇮🇱', name: 'Israel' },
  { code: 'IT', flag: '🇮🇹', name: 'Italy' },
  { code: 'JM', flag: '🇯🇲', name: 'Jamaica' },
  { code: 'JP', flag: '🇯🇵', name: 'Japan' },
  { code: 'JO', flag: '🇯🇴', name: 'Jordan' },
  { code: 'KZ', flag: '🇰🇿', name: 'Kazakhstan' },
  { code: 'KE', flag: '🇰🇪', name: 'Kenya' },
  { code: 'KR', flag: '🇰🇷', name: 'South Korea' },
  { code: 'KW', flag: '🇰🇼', name: 'Kuwait' },
  { code: 'LV', flag: '🇱🇻', name: 'Latvia' },
  { code: 'LB', flag: '🇱🇧', name: 'Lebanon' },
  { code: 'LY', flag: '🇱🇾', name: 'Libya' },
  { code: 'LI', flag: '🇱🇮', name: 'Liechtenstein' },
  { code: 'LT', flag: '🇱🇹', name: 'Lithuania' },
  { code: 'LU', flag: '🇱🇺', name: 'Luxembourg' },
  { code: 'MK', flag: '🇲🇰', name: 'North Macedonia' },
  { code: 'MG', flag: '🇲🇬', name: 'Madagascar' },
  { code: 'MY', flag: '🇲🇾', name: 'Malaysia' },
  { code: 'MV', flag: '🇲🇻', name: 'Maldives' },
  { code: 'MT', flag: '🇲🇹', name: 'Malta' },
  { code: 'MU', flag: '🇲🇺', name: 'Mauritius' },
  { code: 'MX', flag: '🇲🇽', name: 'Mexico' },
  { code: 'MD', flag: '🇲🇩', name: 'Moldova' },
  { code: 'MC', flag: '🇲🇨', name: 'Monaco' },
  { code: 'MN', flag: '🇲🇳', name: 'Mongolia' },
  { code: 'ME', flag: '🇲🇪', name: 'Montenegro' },
  { code: 'MA', flag: '🇲🇦', name: 'Morocco' },
  { code: 'MZ', flag: '🇲🇿', name: 'Mozambique' },
  { code: 'NA', flag: '🇳🇦', name: 'Namibia' },
  { code: 'NP', flag: '🇳🇵', name: 'Nepal' },
  { code: 'NL', flag: '🇳🇱', name: 'Netherlands' },
  { code: 'NZ', flag: '🇳🇿', name: 'New Zealand' },
  { code: 'NI', flag: '🇳🇮', name: 'Nicaragua' },
  { code: 'NG', flag: '🇳🇬', name: 'Nigeria' },
  { code: 'NO', flag: '🇳🇴', name: 'Norway' },
  { code: 'OM', flag: '🇴🇲', name: 'Oman' },
  { code: 'PK', flag: '🇵🇰', name: 'Pakistan' },
  { code: 'PA', flag: '🇵🇦', name: 'Panama' },
  { code: 'PY', flag: '🇵🇾', name: 'Paraguay' },
  { code: 'PE', flag: '🇵🇪', name: 'Peru' },
  { code: 'PH', flag: '🇵🇭', name: 'Philippines' },
  { code: 'PL', flag: '🇵🇱', name: 'Poland' },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal' },
  { code: 'QA', flag: '🇶🇦', name: 'Qatar' },
  { code: 'RO', flag: '🇷🇴', name: 'Romania' },
  { code: 'RU', flag: '🇷🇺', name: 'Russia' },
  { code: 'SA', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: 'SN', flag: '🇸🇳', name: 'Senegal' },
  { code: 'RS', flag: '🇷🇸', name: 'Serbia' },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore' },
  { code: 'SK', flag: '🇸🇰', name: 'Slovakia' },
  { code: 'SI', flag: '🇸🇮', name: 'Slovenia' },
  { code: 'ZA', flag: '🇿🇦', name: 'South Africa' },
  { code: 'ES', flag: '🇪🇸', name: 'Spain' },
  { code: 'LK', flag: '🇱🇰', name: 'Sri Lanka' },
  { code: 'SE', flag: '🇸🇪', name: 'Sweden' },
  { code: 'CH', flag: '🇨🇭', name: 'Switzerland' },
  { code: 'TW', flag: '🇹🇼', name: 'Taiwan' },
  { code: 'TZ', flag: '🇹🇿', name: 'Tanzania' },
  { code: 'TH', flag: '🇹🇭', name: 'Thailand' },
  { code: 'TN', flag: '🇹🇳', name: 'Tunisia' },
  { code: 'TR', flag: '🇹🇷', name: 'Turkey' },
  { code: 'UG', flag: '🇺🇬', name: 'Uganda' },
  { code: 'UA', flag: '🇺🇦', name: 'Ukraine' },
  { code: 'AE', flag: '🇦🇪', name: 'United Arab Emirates' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'US', flag: '🇺🇸', name: 'United States' },
  { code: 'UY', flag: '🇺🇾', name: 'Uruguay' },
  { code: 'UZ', flag: '🇺🇿', name: 'Uzbekistan' },
  { code: 'VE', flag: '🇻🇪', name: 'Venezuela' },
  { code: 'VN', flag: '🇻🇳', name: 'Vietnam' },
  { code: 'ZM', flag: '🇿🇲', name: 'Zambia' },
  { code: 'ZW', flag: '🇿🇼', name: 'Zimbabwe' },
];

const COUNTRY_MAP = new Map(COUNTRIES.map((c) => [c.code, c]));
const getCountry = (code: string | null | undefined) =>
  code ? (COUNTRY_MAP.get(code) ?? null) : null;
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
  userNationality?: string | null;
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
const timelineStartMinutes = 7 * 60;
const planningEndMinutes = 22 * 60;
const timelineEndMinutes = planningEndMinutes;
const planningMinuteStep = minuteOptions[1] - minuteOptions[0];
const latestPlanningStartMinutes = planningEndMinutes - planningMinuteStep;
const roundMinutesUpToStep = (minutes: number, step: number) => Math.ceil(minutes / step) * step;
const minuteValueToHourMinute = (totalMinutes: number) => ({
  hour: Math.floor(totalMinutes / 60),
  minute: totalMinutes % 60,
});
const formatMinutesAsHourMinute = (totalMinutes: number) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return String(hours);
  }

  return `${formatTimePart(hours)}:${formatTimePart(minutes)}`;
};

const formatMinutesAsHourMinuteFull = (totalMinutes: number) =>
  `${formatTimePart(Math.floor(totalMinutes / 60))}:${formatTimePart(totalMinutes % 60)}`;
const getTimelineLabelsForRange = (windowStartMinutes: number, windowEndMinutes: number) => {
  if (windowEndMinutes <= windowStartMinutes) {
    return [formatMinutesAsHourMinute(windowStartMinutes)];
  }

  const labels: string[] = [formatMinutesAsHourMinute(windowStartMinutes)];
  const stepMinutes = 60;
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

function WheelPicker({ values, selected, onSelect, label, formatVal }: { values: number[]; selected: number | null; onSelect: (v: number) => void; label: string; formatVal: (v: number) => string }) {
  const ITEM_H = 44;
  const VISIBLE = 3;
  const HEIGHT = ITEM_H * VISIBLE;
  const scrollRef = useRef<ScrollView>(null);
  const isScrolling = useRef(false);

  useEffect(() => {
    if (selected === null) return;
    const idx = values.indexOf(selected);
    if (idx >= 0) {
      setTimeout(() => scrollRef.current?.scrollTo({ y: idx * ITEM_H, animated: false }), 30);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</Text>
      <View style={{ height: HEIGHT, width: 80, overflow: 'hidden', position: 'relative' }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: ITEM_H, left: 0, right: 0, height: ITEM_H, backgroundColor: 'rgba(77,184,255,0.10)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(77,184,255,0.2)', zIndex: 1 }} />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_H}
          decelerationRate="fast"
          contentContainerStyle={{ paddingTop: ITEM_H, paddingBottom: ITEM_H }}
          onScrollBeginDrag={() => { isScrolling.current = true; }}
          onMomentumScrollEnd={(e) => {
            isScrolling.current = false;
            const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
            const clamped = Math.max(0, Math.min(idx, values.length - 1));
            onSelect(values[clamped]);
          }}
          scrollEventThrottle={16}
        >
          {values.map((v) => {
            const isSelected = v === selected;
            return (
              <Pressable key={v} onPress={() => {
                onSelect(v);
                const idx = values.indexOf(v);
                scrollRef.current?.scrollTo({ y: idx * ITEM_H, animated: true });
              }} style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.35)', fontSize: isSelected ? 24 : 18, fontWeight: isSelected ? '800' : '400' }}>
                  {formatVal(v)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

function Avatar({ uri, size = 28, nationality }: { uri: string | null; size?: number; nationality?: string | null }) {
  const flagSize = Math.max(10, Math.round(size * 0.42));
  const flag = getCountry(nationality)?.flag ?? null;
  const inner = !uri
    ? <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.card }} />
    : <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.card }} />;

  if (!flag) return inner;

  return (
    <View style={{ width: size, height: size }}>
      {inner}
      <View style={{
        position: 'absolute', bottom: -1, right: -1,
        backgroundColor: theme.bg, borderRadius: 999,
        width: flagSize + 4, height: flagSize + 4,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: flagSize - 2, lineHeight: flagSize }}>{flag}</Text>
      </View>
    </View>
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
    startTime: formatMinutesAsHourMinuteFull(roundedStartMinutes),
    endTime: formatMinutesAsHourMinuteFull(roundedEndMinutes),
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

  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const safeFollowingUserIds = Array.isArray(followingUserIds) ? followingUserIds : [];
  const followingUserIdSet = new Set(safeFollowingUserIds);
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

  const groupedSessions: TimelineGroupedSession[] = orderedGroups
    .map((group) => {
      const visibleSessions = getSortedVisibleGroupSessions(
        (Array.isArray(group.sessions) ? group.sessions : []).filter(({ item }) => {
          const normalizedActiveProfileId = activeProfileId ?? null;
          const visible =
            item.userId === normalizedActiveProfileId
              ? !isSessionExpired(item)
              : buddiesMode === 'everyone' || followingUserIdSet.has(item.userId);


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
  onAvatarPress?: (userId: string) => void;
  onEditSession?: (session: { id: string; start: string | null; end: string | null; intent: string | null }) => void;
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
  onAvatarPress,
  onEditSession,
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

  return (
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
              <Pressable key={`session-avatar-${group.key}-${item.id}`} style={{ marginLeft: index === 0 ? 0 : -8 }} onPress={() => item.userId && onAvatarPress?.(item.userId)}>
                <Avatar uri={item.userAvatarUrl ?? null} size={40} nationality={item.userNationality} />
              </Pressable>
            ))}
            {sortedVisibleSessions.length > 3 ? (
              <View style={{
                marginLeft: -8,
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.16)',
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
              <Text style={{ color: theme.primary, fontSize: 10, fontWeight: '700' }}>
                💬 Group chat →
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ position: 'absolute', left: 104, right: 104, height: 24 }}>
          <SessionBar
            leftPercent={leftPercent}
            widthPercent={widthPercent}
            state={getCleanSessionStatus(session) === 'live' ? 'live' : 'planned'}
            intent={rowIntent}
            isSelected={isSelected}
            showJoinButton={false}
            onPress={() => {
              const isOwnBar = session?.userId === currentProfileId;
              if (isOwnBar && onEditSession) {
                onEditSession({ id: session.id, start: session.start ?? null, end: session.end ?? null, intent: session.intent ?? null });
              } else {
                onSelect(group.key);
              }
            }}
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
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: theme.primary,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#061421', fontSize: 12, fontWeight: '900' }}>JOIN</Text>
          </Pressable>
        ) : (
          <View style={{ width: 8 }} />
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
              borderRadius: 18,
                          minHeight: 138,
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
                marginBottom: 10,
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
  onAvatarPress?: (userId: string) => void;
  onEditSession?: (session: { id: string; start: string | null; end: string | null; intent: string | null }) => void;
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
  onAvatarPress,
  onEditSession,
}: SessionTimelineProps) {
  const isWebPlatform = Platform.OS === 'web';
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


  if (!isWebPlatform) {
    const mobileSections = [
      { key: 'live', title: 'LIVE NOW', groups: liveGroups, color: '#5EF0D0' },
      { key: 'going', title: 'GOING', groups: goingGroups, color: '#4DB8FF' },
      { key: 'maybe', title: 'MAYBE', groups: maybeGroups, color: '#5F83A6' },
    ].filter((section) => section.groups.length > 0);

    return (
      <Pressable onPress={onClearSelection}>
        <View style={{ gap: 8 }}>
          {mobileSections.length === 0 ? (
            <Text style={{ color: theme.textSoft, fontSize: 14 }}>
              {timelineFilter === 'buddies'
                ? 'No buddy sessions on the timeline yet'
                : 'No sessions on the timeline yet'}
            </Text>
          ) : null}

          {mobileSections.map((section, sectionIndex) => (
            <View
              key={`mobile-timeline-section-${sectionIndex}-${section.key}`}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.06)',
                backgroundColor: 'rgba(8,24,39,0.34)',
                padding: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: section.color, marginRight: 8 }} />
                  <Text style={{ color: section.color, fontSize: 13, fontWeight: '900', letterSpacing: 0.4 }}>
                    {section.title}
                  </Text>
                </View>
                <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '700' }}>
                  {section.groups.length} {section.groups.length === 1 ? 'session' : 'sessions'}
                </Text>
              </View>

              {section.groups.map((group, rowIndex) => {
                const sessionEntry = group.visibleSessions?.[0] ?? group.sessions?.[0] ?? null;
                const sessionItem = sessionEntry?.item ?? null;
                const riderName = sessionItem?.userName?.replace(/\s*-\s*(Buddy|You|Other)\s*$/i, '').trim() || 'Rider';

                const clampedStartMinutes = clamp(group.startMinutes, timelineWindowStartMinutes, timelineWindowEndMinutes);
                const clampedEndMinutes = clamp(Math.max(group.endMinutes, clampedStartMinutes + 20), timelineWindowStartMinutes, timelineWindowEndMinutes);
                const leftPercent = clamp(((clampedStartMinutes - timelineWindowStartMinutes) / totalRange) * 100, 0, 100);
                const widthPercent = clamp(((clampedEndMinutes - clampedStartMinutes) / totalRange) * 100, 2, 100 - leftPercent);
                const mobileWidthPercent = widthPercent;
                const mobileLeftPercent = clamp(leftPercent, 0, 100 - mobileWidthPercent);
                const isSelected = selectedTimelineSessionId === group.key;

                return (
                  <Pressable
                    key={`mobile-timeline-row-${sectionIndex}-${section.key}-${rowIndex}`}
                    onPress={(event) => {
                      event.stopPropagation();
                      onSelectSession(group.key);
                    }}
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: 'rgba(255,255,255,0.055)',
                      paddingTop: 10,
                      marginTop: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 }}>
                      {/* Avatars: stacked for groups */}
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {(group.visibleSessions ?? []).slice(0, 3).map(({ item }, avatarIndex) => (
                          <View key={`avatar-${group.key}-${item.id}`} style={{ marginLeft: avatarIndex === 0 ? 0 : -12, zIndex: 3 - avatarIndex }}>
                            <Avatar uri={item.userAvatarUrl ?? null} size={38} nationality={item.userNationality} />
                          </View>
                        ))}
                        {(group.visibleSessions?.length ?? 0) > 3 ? (
                          <View style={{ marginLeft: -12, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', zIndex: 0 }}>
                            <Text style={{ color: theme.text, fontSize: 11, fontWeight: '900' }}>+{(group.visibleSessions?.length ?? 0) - 3}</Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={{ flex: 1 }}>
                        {(group.visibleSessions?.length ?? 0) > 1 ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <View style={{ backgroundColor: 'rgba(77,184,255,0.15)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(77,184,255,0.25)' }}>
                              <Text style={{ color: '#9EDBFF', fontSize: 10, fontWeight: '900' }}>👥 GROUP · {group.visibleSessions?.length} riders</Text>
                            </View>
                          </View>
                        ) : null}
                        <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }} numberOfLines={1}>
                          {(group.visibleSessions ?? []).map(({ item }) => item.userName?.replace(/\s*-\s*(Buddy|You|Other)\s*$/i, '').trim()).filter(Boolean).join(' · ')}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700', marginTop: 1 }}>
                          {group.startTime} – {group.endTime}
                        </Text>
                      </View>

                      {(group.visibleSessions?.length ?? 0) > 1 ? (
                        <Pressable
                          onPress={(event) => {
                            event.stopPropagation();
                            onOpenGroupChat(group.key);
                          }}
                          style={{
                            borderRadius: 999,
                            backgroundColor: 'rgba(77,184,255,0.15)',
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderWidth: 1,
                            borderColor: 'rgba(77,184,255,0.30)',
                          }}
                        >
                          <Text style={{ color: '#4DB8FF', fontSize: 10, fontWeight: '900' }}>
                            💬 Chat →
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>

                    <View style={{ height: 16, position: 'relative', marginTop: 6 }}>
                      <View style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 2, backgroundColor: 'rgba(255,255,255,0.10)' }} />
                      <View
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          left: `${mobileLeftPercent}%`,
                          width: `${mobileWidthPercent}%`,
                          minWidth: 6,
                          top: 5,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: section.color,
                          opacity: isSelected ? 1 : 0.85,
                        }}
                      />
                      {isCurrentTimeMarkerVisible ? (
                        <View
                          pointerEvents="none"
                          style={{
                            position: 'absolute',
                            left: `${nowPosition}%`,
                            top: 0,
                            width: 2,
                            height: 16,
                            borderRadius: 1,
                            backgroundColor: 'rgba(255,255,255,0.35)',
                            marginLeft: -1,
                          }}
                        />
                      ) : null}
                    </View>

                    {/* Ledenlijst — zichtbaar als geselecteerd en groep */}
                    {isSelected && (group.visibleSessions?.length ?? 0) > 1 ? (
                      <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 10, gap: 8 }}>
                        <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                          Riders in this group
                        </Text>
                        {(group.visibleSessions ?? []).map(({ item }) => (
                          <View key={`member-${item.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Avatar uri={item.userAvatarUrl ?? null} size={30} nationality={item.userNationality} />
                            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>
                              {item.userName?.replace(/\s*-\s*(Buddy|You|Other)\s*$/i, '').trim() || 'Rider'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onClearSelection}>
      <View style={{ position: 'relative' }}>
        {isCurrentTimeMarkerVisible ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
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

                  <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 42, bottom: 10 }}>
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
                      onAvatarPress={onAvatarPress}
                      onEditSession={onEditSession}
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
  const [buddiesTab, setBuddiesTab] = useState<'myBuddies' | 'find'>('myBuddies');
  const [showChat, setShowChat] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [followPromptSpot, setFollowPromptSpot] = useState<string | null>(null);
  const [viewingOtherUserId, setViewingOtherUserId] = useState<string | null>(null);
  const [viewingOtherProfile, setViewingOtherProfile] = useState<{ id: string; display_name: string; avatar_url: string | null; nationality?: string | null; skill_level?: number | null } | null>(null);
  const [chatSubTab, setChatSubTab] = useState<'spot' | 'session' | 'dm'>('spot');
  const [activeChatSpot, setActiveChatSpot] = useState<string | null>(null);
  const [chatSpotMessages, setChatSpotMessages] = useState<Record<string, { conversationId: string | null; messages: any[]; loaded: boolean }>>({});
  // Één state voor welke chat open is — voorkomt conflicten tussen de drie types
  const [openChatState, setOpenChatState] = useState<{ type: 'spot' | 'session' | 'dm'; id: string } | null>(null);
  const expandedChatSpot = openChatState?.type === 'spot' ? openChatState.id : null;
  const expandedChatSession = openChatState?.type === 'session' ? openChatState.id : null;
  const expandedDmId = openChatState?.type === 'dm' ? openChatState.id : null;
  const setExpandedChatSpot = (v: string | null) => v ? setOpenChatState({ type: 'spot', id: v }) : setOpenChatState(null);
  const setExpandedChatSession = (v: string | null) => v ? setOpenChatState({ type: 'session', id: v }) : setOpenChatState(null);
  const setExpandedDmId = (v: string | null) => v ? setOpenChatState({ type: 'dm', id: v }) : setOpenChatState(null);
  const [spotChatInputInChat, setSpotChatInputInChat] = useState('');
  const [chatMySessions, setChatMySessions] = useState<any[]>([]);
  const [chatSessionMessages, setChatSessionMessages] = useState<Record<string, { conversationId: string | null; messages: any[]; loaded: boolean }>>({});
  const [sessionChatInput, setSessionChatInput] = useState('');
  const [showMessagesAlertSettings, setShowMessagesAlertSettings] = useState(false);
  const [spotsWithUnread, setSpotsWithUnread] = useState<Record<string, number>>({}); // lowercase spotName → count
  const [_dbgEventCount, _setDbgEventCount] = useState(0); // tijdelijk debug
  const [unreadBySession, setUnreadBySession] = useState<Record<string, number>>({});
  const [unreadByDm, setUnreadByDm] = useState<Record<string, number>>({});
  // chatUnreadCount = computed: som van alle ongelezen (voor badge)
  const unreadSessionTotal = Object.values(unreadBySession).reduce((a, b) => a + b, 0);
  const unreadDmTotal = Object.values(unreadByDm).reduce((a, b) => a + b, 0);
  const chatUnreadCount = Object.values(spotsWithUnread).reduce((a, b) => a + b, 0) + unreadSessionTotal + unreadDmTotal;
  const [messagesAlertSettings, setMessagesAlertSettings] = useState<{
    spotChats: 'everyone' | 'buddies' | 'off';
    sessionChats: 'everyone' | 'buddies' | 'off';
    messageRequests: boolean;
  }>({ spotChats: 'everyone', sessionChats: 'everyone', messageRequests: true });
  const [dmConversations, setDmConversations] = useState<{ id: string; otherUserId: string; otherName: string; otherAvatar: string | null; lastMessage: string | null; lastMessageAt: string | null }[]>([]);
  const [dmMessages, setDmMessages] = useState<Record<string, any[]>>({});
  const [dmInput, setDmInput] = useState('');
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profileAvatarInputUri, setProfileAvatarInputUri] = useState<string | null>(null);
  const [profileEditError, setProfileEditError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isEditingProfileName, setIsEditingProfileName] = useState(false);
  const [showNationalityPicker, setShowNationalityPicker] = useState(false);
  const [nationalitySearch, setNationalitySearch] = useState('');
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
  const showChatRef = useRef(false);
  const myConvIdsRef = useRef<Set<string>>(new Set());
  const chatSpotMessagesRef = useRef<Record<string, { conversationId: string | null; messages: any[]; loaded: boolean }>>({});
  const favoriteSpotsRef = useRef<string[]>([]);
  const chatSessionMessagesRef = useRef<Record<string, { conversationId: string | null; messages: any[]; loaded: boolean }>>({});
  const expandedChatSpotRef = useRef<string | null>(null);
  const sessionConvIdsRef = useRef<Set<string>>(new Set()); // convIds die tot sessie chats horen
  const chatSpotScrollRef = useRef<ScrollView>(null);
  const chatSessionScrollRef = useRef<ScrollView>(null);
  const chatDmScrollRef = useRef<ScrollView>(null);
  const [chatKeyboardHeight, setChatKeyboardHeight] = useState(0);

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
  const spotDetailScrollRef = useRef<ScrollView | null>(null);
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
        void refreshUnreadBuzzState();
        // Delayed refresh to catch async notification inserts (race condition)
        setTimeout(() => void refreshUnreadBuzzState(), 3000);
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
  const [recommendedViaBuddyNameByUserId, setRecommendedViaBuddyNameByUserId] = useState<Record<string, string>>({});
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

    if (!normalizedQuery) {
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

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    setNotificationRows(
      (data ?? [])
        .filter((row) => {
          if (row.read !== true) {
            return true;
          }

          if (!row.created_at) {
            return false;
          }

          return new Date(row.created_at) >= startOfToday;
        })
        .map((row) => ({
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

  useEffect(() => {
    if (!activeAppUserId) return;
    const interval = setInterval(() => {
      void refreshUnreadBuzzState();
    }, 15000);
    return () => clearInterval(interval);
  }, [activeAppUserId]);

  const sendPushToRecipients = async (
    recipientIds: string[],
    title: string,
    body: string,
    data: Record<string, unknown>,
  ) => {
    if (recipientIds.length === 0) return;
    const { data: tokenRows } = await supabase
      .from('push_tokens')
      .select('expo_push_token')
      .in('profile_id', recipientIds);
    const tokens = [...new Set((tokenRows ?? []).map((r) => r.expo_push_token).filter(Boolean))];
    for (const token of tokens) {
      void sendExpoPushNotification({ to: token, title, body, data });
    }
  };

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
    const actorName = (() => {
      const fromProfile = typeof notificationRow.actor_profile?.display_name === 'string' && notificationRow.actor_profile.display_name.trim()
        ? notificationRow.actor_profile.display_name.trim()
        : null;
      const fromData = data && typeof data === 'object'
        ? [data.actorName, data.actorDisplayName, data.actor_name, data.display_name]
          .find((v): v is string => typeof v === 'string' && v.trim().length > 0) ?? null
        : null;
      return fromProfile || fromData || 'Someone';
    })();
    const spotName = data && typeof data === 'object' && typeof data.spot_name === 'string' ? data.spot_name.trim() : null;

    if (notificationRow.type === 'session_joined') {
      return spotName
        ? `${actorName} joined your session at ${spotName}`
        : `${actorName} joined your session`;
    }
    if (notificationRow.type === 'chat_message') {
      const preview = data && typeof data === 'object' && typeof data.message_preview === 'string' ? data.message_preview.trim() : null;
      return spotName
        ? `${actorName} at ${spotName}: ${preview || 'sent a message'}`
        : `${actorName}: ${preview || 'sent a message'}`;
    }
    if (notificationRow.type === 'checkin') {
      return spotName ? `${actorName} checked in at ${spotName}` : `${actorName} checked in`;
    }
    if (notificationRow.type === 'session_planned') {
      return spotName ? `${actorName} is going to ${spotName}` : `${actorName} planned a session`;
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
        .select('id, display_name, avatar_url, owner_uid, created_at, nationality')
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
    // Push ook tonen als de app in de foreground is
    if (Platform.OS !== 'web') {
      Buzz.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    }
  }, []);

  useEffect(() => {
    const FALLBACK_EAS_PROJECT_ID = "6420f442-2be4-4803-9620-f769bc5def4f";

    const register = async () => {
      try {
        if (Platform.OS === 'web') {
          return;
        }

        const { status } = await Buzz.requestPermissionsAsync();

        const projectId =
          Constants?.expoConfig?.extra?.eas?.projectId ??
          Constants?.easConfig?.projectId ??
          FALLBACK_EAS_PROJECT_ID;


        const token = await Buzz.getExpoPushTokenAsync({
          projectId,
        });


        if (!activeAppUserId || !token.data) {
          return;
        }

        const { error: pushTokenSaveError } = await supabase
          .from('push_tokens')
          .upsert(
            {
              profile_id: activeAppUserId,
              expo_push_token: token.data,
              platform: Platform.OS,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'profile_id,expo_push_token' }
          );

        if (pushTokenSaveError) {
          console.error('PUSH_TOKEN_SAVE_ERROR', pushTokenSaveError);
        } else {
        }
      } catch (e) {
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
        // Sync favoriteSpots naar DB zodat notificaties ook voor volgers werken
        if (activeAppUserId && loadedFavoriteSpots.length > 0) {
          void supabase.from('spot_followers').upsert(
            loadedFavoriteSpots.map((spot) => ({ user_id: activeAppUserId, spot_name: spot })),
            { onConflict: 'user_id,spot_name' }
          );
        }
        
        
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
      });
      if (activeAppUserId) {
        void supabase.from('spot_followers').upsert(
          { user_id: activeAppUserId, spot_name: spotName },
          { onConflict: 'user_id,spot_name' }
        );
      }
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
    if (activeAppUserId) {
      void supabase.from('spot_followers').delete().eq('user_id', activeAppUserId).eq('spot_name', spotName);
    }
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
    setRecommendedViaBuddyNameByUserId({});
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
      setRecommendedViaBuddyNameByUserId({});
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

      const loadedBuddyUsers = ((usersResponse.data ?? []) as BuddyUser[]);
      const usersById = loadedBuddyUsers.reduce<Record<string, BuddyUser>>((acc, userItem) => {
        acc[userItem.id] = userItem;
        return acc;
      }, {});

      if (acceptedFollowingUserIds.length === 0) {
        setRecommendedViaBuddyNameByUserId({});
      } else {
        const secondDegreeResponse = await supabase
          .from('user_follows')
          .select('follower_id, following_id, status')
          .in('follower_id', acceptedFollowingUserIds)
          .eq('status', 'accepted');

        if (secondDegreeResponse.error) {
          console.error('BUDDIES_SECOND_DEGREE_LOAD_ERROR', secondDegreeResponse.error);
          setRecommendedViaBuddyNameByUserId({});
        } else {
          const nextRecommendations = (secondDegreeResponse.data ?? []).reduce<Record<string, string>>((acc, relation) => {
            const recommendedUserId = relation.following_id;
            const viaBuddy = usersById[relation.follower_id];
            if (!viaBuddy || recommendedUserId === activeProfileId || acceptedFollowingUserIds.includes(recommendedUserId)) {
              return acc;
            }
            if (!acc[recommendedUserId]) {
              acc[recommendedUserId] = viaBuddy.display_name;
            }
            return acc;
          }, {});
          setRecommendedViaBuddyNameByUserId(nextRecommendations);
        }
      }
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
      userNationality: row.nationality ?? null,
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
    
    
    

    const dayBounds = getDayBoundsForDayKey(selectedDayKey);
    const sessionsResponse = dayBounds
      ? await supabase
          .from('sessions')
          .select('*')
          .eq('session_day', selectedDayKey)
          .order('created_at', { ascending: true })
      : { data: [], error: { message: 'INVALID_DAY_KEY' } };
    const sessionsData = sessionsResponse.data ?? [];
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
    const [
      { data: profilesByIdData, error: profilesByIdError },
      { data: profilesByOwnerUidData, error: profilesByOwnerUidError },
    ] = await Promise.all([
      sessionIdentityValues.length
        ? supabase.from('profiles').select('id, display_name, avatar_url, owner_uid, nationality').in('id', sessionIdentityValues)
        : Promise.resolve({ data: [] as any[], error: null }),
      sessionIdentityValues.length
        ? supabase.from('profiles').select('id, display_name, avatar_url, owner_uid, nationality').in('owner_uid', sessionIdentityValues)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);
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
        if (droppedRow) {
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
        nextSessionsBySpot[resolvedSpotName].push(mappedSession);
      }

      const loadedSessions = Object.values(nextSessionsBySpot).flat();

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

      // Als een ANDERE auth user inlogt: profiel direct wissen (synchroon)
      // zodat er geen sessies aangemaakt worden met het vorige profiel ID
      if (activeProfileOwnerUidRef.current !== null && activeProfileOwnerUidRef.current !== nextSession.user.id) {
        setProfile(null);
        activeProfileOwnerUidRef.current = null;
        activeProfileIdRef.current = null;
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
    if (!viewingOtherUserId) { setViewingOtherProfile(null); return; }
    void (async () => {
      const { data } = await supabase.from('profiles').select('id, display_name, avatar_url, nationality, skill_level').eq('id', viewingOtherUserId).maybeSingle();
      if (data) setViewingOtherProfile(data);
    })();
  }, [viewingOtherUserId]);

  useEffect(() => {
    if (!showChat || !activeAppUserId) return;
    if (chatSubTab === 'spot') {
      for (const spotName of favoriteSpots) {
        if (!chatSpotMessages[spotName]?.loaded) {
          void loadSpotChatForTab(spotName);
        }
      }
    }
    if (chatSubTab === 'session') {
      void loadMySessionsForChatTab();
    }
    // DMs altijd laden als chat opent (niet alleen bij tab-switch)
    void loadDmConversations();
  }, [showChat, chatSubTab, activeAppUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeChatSpot && showChat) {
      setExpandedChatSession(null);
      setExpandedDmId(null);
      setExpandedChatSpot(activeChatSpot);
      setChatSubTab('spot');
      if (!chatSpotMessages[activeChatSpot]?.loaded) {
        void loadSpotChatForTab(activeChatSpot);
      }
      // Reset na gebruik zodat hij niet opnieuw vuurt bij volgende showChat
      setActiveChatSpot(null);
    }
  }, [activeChatSpot, showChat]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-conversation subscriptions verwijderd — de globale subscription (hieronder) verwerkt alles

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

      });

    return () => {
      void supabase.removeChannel(realtimeChannel);
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


          scheduleRealtimeRefetch();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
        }
      });

    return () => {
      void supabase.removeChannel(realtimeChannel);
    };
  }, [activeAppUserId, selectedSpot, selectedDayKey]);

  useEffect(() => {
    if (!activeAppUserId) return;
    const channel = supabase
      .channel(`notifications-realtime-${activeAppUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const row = payload?.new as { user_id?: string } | null;
          if (row?.user_id === activeAppUserId) {
            void refreshUnreadBuzzState();
          }
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeAppUserId]);

  // Keyboard hoogte bijhouden voor chat input bar (native only)
  useEffect(() => {
    if (isWebPlatform) return;
    const showSub = Keyboard.addListener('keyboardWillShow', (e) => {
      setChatKeyboardHeight(e.endCoordinates.height);
      // Scroll naar onderaan zodat laatste bericht zichtbaar is boven toetsenbord
      setTimeout(() => {
        chatSpotScrollRef.current?.scrollToEnd({ animated: true });
        chatSessionScrollRef.current?.scrollToEnd({ animated: true });
        chatDmScrollRef.current?.scrollToEnd({ animated: true });
      }, 50);
    });
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setChatKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Preload spot conversation IDs zodat realtime werkt ook als Messages tab nooit geopend is
  useEffect(() => {
    if (!activeAppUserId || !favoriteSpots.length) return;
    const today = new Date().toISOString().split('T')[0];
    void (async () => {
      const { data } = await supabase
        .from('conversations')
        .select('id, spot_name')
        .eq('type', 'spot')
        .in('spot_name', favoriteSpots)
        .eq('session_day', today);
      for (const conv of (data ?? [])) {
        myConvIdsRef.current.add(conv.id);
        setChatSpotMessages((prev) => ({
          ...prev,
          [conv.spot_name]: prev[conv.spot_name]
            ? { ...prev[conv.spot_name], conversationId: conv.id }
            : { conversationId: conv.id, messages: [], loaded: false },
        }));
      }
    })();
  }, [activeAppUserId, favoriteSpots]); // eslint-disable-line react-hooks/exhaustive-deps

  // DM convIds proactief in myConvIdsRef laden (inlined — loadDmConversations is nog niet gedeclareerd op dit punt)
  useEffect(() => {
    if (!activeAppUserId) return;
    void supabase.from('conversations')
      .select('id')
      .eq('type', 'dm')
      .like('group_key', `%${activeAppUserId}%`)
      .then(({ data }) => { for (const c of (data ?? [])) myConvIdsRef.current.add(c.id); });
  }, [activeAppUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refs bijhouden voor gebruik in realtime callbacks (stale closure vermijden)
  useEffect(() => { showChatRef.current = showChat; }, [showChat]);
  useEffect(() => { chatSpotMessagesRef.current = chatSpotMessages; }, [chatSpotMessages]);
  useEffect(() => { chatSessionMessagesRef.current = chatSessionMessages; }, [chatSessionMessages]);
  useEffect(() => { favoriteSpotsRef.current = favoriteSpots; }, [favoriteSpots]);
  useEffect(() => { expandedChatSpotRef.current = expandedChatSpot; }, [expandedChatSpot]);
  useEffect(() => {
    const ids = new Set<string>();
    for (const dm of dmConversations) ids.add(dm.id);
    for (const [, val] of Object.entries(chatSpotMessages)) {
      if (val.conversationId) ids.add(val.conversationId);
    }
    for (const [, val] of Object.entries(chatSessionMessages)) {
      if (val.conversationId) ids.add(val.conversationId);
    }
    myConvIdsRef.current = ids;
  }, [dmConversations, chatSpotMessages, chatSessionMessages]);

  // Globale realtime subscription — zonder server-side filter (werkt bij RLS)
  useEffect(() => {
    if (!activeAppUserId) return;
    const channel = supabase.channel(`global-messages-${activeAppUserId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        _setDbgEventCount(n => n + 1); // telt elk raw event
        const row = payload.new as { id?: string; user_id?: string; conversation_id?: string; text?: string; created_at?: string };
        if (!row?.id || !row.user_id) return;

        const convId = row.conversation_id ?? '';
        if (!convId) return;

        // Als convId nog niet in de ref staat: voeg toe (preload was nog niet klaar)
        if (!myConvIdsRef.current.has(convId)) {
          // Controleer of dit een spot chat is via spot_name in het bericht
          const rowFull2 = payload.new as { spot_name?: string };
          const rawName = rowFull2.spot_name ?? null;
          const matchedInFavorites = rawName
            ? favoriteSpotsRef.current.find((s) => s.toLowerCase() === rawName.toLowerCase())
            : null;
          if (!matchedInFavorites) return; // niet van een gevolgde spot, negeer
          myConvIdsRef.current.add(convId); // voeg toe zodat volgende berichten direct werken
        }

        // Profiel ophalen voor de afzender
        const { data: p } = await supabase.from('profiles').select('display_name, avatar_url').eq('id', row.user_id).maybeSingle();
        const newMsg = { id: row.id, text: row.text ?? '', createdAt: row.created_at ?? new Date().toISOString(), userId: row.user_id, display_name: p?.display_name ?? 'Unknown', avatar_url: p?.avatar_url ?? null };

        // Spot naam: direct uit het bericht of via ref
        // favoriteSpotsRef.current gebruiken (NIET favoriteSpots — stale closure!)
        const rowFull = payload.new as { spot_name?: string };
        const spotNameFromMsg = rowFull.spot_name ?? null;
        const spotNameFromRef = Object.entries(chatSpotMessagesRef.current).find(([, data]) => data.conversationId === convId)?.[0] ?? null;
        const rawSpotName = spotNameFromMsg ?? spotNameFromRef;
        // Als geen spot_name bekend: zoek via conversations tabel
        let matchedSpotName: string | null = rawSpotName
          ? (favoriteSpotsRef.current.find((s) => s.toLowerCase() === rawSpotName.toLowerCase()) ?? rawSpotName)
          : null;
        if (!matchedSpotName) {
          const { data: convRow } = await supabase.from('conversations').select('spot_name').eq('id', convId).maybeSingle();
          if (convRow?.spot_name) {
            matchedSpotName = favoriteSpotsRef.current.find((s) => s.toLowerCase() === convRow.spot_name.toLowerCase()) ?? convRow.spot_name;
          }
        }

        // Sla spot check over als dit een bekende sessie convId is
        if (matchedSpotName && !sessionConvIdsRef.current.has(convId)) {
          // Badge alleen voor berichten van anderen
          const isOwnMessage = row.user_id === (activeProfile?.id ?? activeAppUserId);
          if (!isOwnMessage) {
            setSpotsWithUnread((prev) => {
              const key = matchedSpotName.toLowerCase();
              return { ...prev, [key]: (prev[key] ?? 0) + 1 };
            });
          }
          // Bericht toevoegen aan chatSpotMessages
          setChatSpotMessages((prev) => {
            const data = prev[matchedSpotName];
            if (!data) return { ...prev, [matchedSpotName]: { conversationId: convId, messages: [newMsg], loaded: false } };
            // Dedup: zelfde ID óf zelfde user+tekst binnen 10 seconden (vangt optimistische duplicaten)
            const isDup = data.messages.some((m) =>
              m.id === row.id ||
              (m.userId === row.user_id && m.text === row.text &&
               Math.abs(new Date(m.createdAt ?? 0).getTime() - new Date(row.created_at ?? 0).getTime()) < 10000)
            );
            if (isDup) return prev;
            const existing = data ?? { conversationId: convId, messages: [], loaded: false };
            return { ...prev, [matchedSpotName]: { ...existing, conversationId: convId, messages: [...existing.messages, newMsg] } };
          });
          return; // verwerkt als spot chat
        }

        // Sessie chat bijwerken — vlag voor setState-buiten-setState
        const sessionEntry = Object.entries(chatSessionMessagesRef.current).find(([, d]) => d.conversationId === convId);
        if (sessionEntry) {
          const [sessionGk] = sessionEntry;
          if (!showChatRef.current) {
            setUnreadBySession((prev2) => ({ ...prev2, [sessionGk]: (prev2[sessionGk] ?? 0) + 1 }));
          }
          setChatSessionMessages((prev) => {
            const data = prev[sessionGk];
            if (!data) return prev;
            const isDup = data.messages.some((m) =>
              m.id === row.id ||
              (m.userId === row.user_id && m.text === row.text &&
               Math.abs(new Date(m.createdAt ?? 0).getTime() - new Date(row.created_at ?? 0).getTime()) < 10000)
            );
            if (isDup) return prev;
            return { ...prev, [sessionGk]: { ...data, messages: [...data.messages, newMsg] } };
          });
          return;
        }

        // DM bijwerken — vlag buiten setState
        const isDmConv = myConvIdsRef.current.has(convId);
        if (isDmConv) {
          if (!showChatRef.current) {
            setUnreadByDm((prev2) => ({ ...prev2, [convId]: (prev2[convId] ?? 0) + 1 }));
          }
          setDmMessages((prev) => {
            const existing = prev[convId] ?? [];
            const isDup = existing.some((m: any) =>
              m.id === row.id ||
              (m.userId === row.user_id && m.text === row.text &&
               Math.abs(new Date(m.createdAt ?? 0).getTime() - new Date(row.created_at ?? 0).getTime()) < 10000)
            );
            if (isDup) return prev;
            return { ...prev, [convId]: [...existing, newMsg] };
          });
        }
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeAppUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setHomeQuickCheckInError('');
  }, []);

  useEffect(() => {
    if (!selectedSpot) {
      setHomeQuickCheckInError('');
    }
  }, [selectedSpot]);


  useEffect(() => {
    if (!selectedSpot) {
      return;
    }


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
      const normalizedPreferences = normalizeSpotNotificationPreferences(data);
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
    if (!isNativePlatform) return;
    let active = true;
    let subscription: Location.LocationSubscription | null = null;
    const startBackgroundWatch = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!active || status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!active) return;
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setCurrentCoordinates(coords);
        setNearestSpotResult(getNearestSpot(coords, verifiedSpotDefinitions));
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 100 },
          (position) => {
            if (!active) return;
            const c = { latitude: position.coords.latitude, longitude: position.coords.longitude };
            setCurrentCoordinates(c);
            setNearestSpotResult(getNearestSpot(c, verifiedSpotDefinitions));
          },
        );
      } catch {}
    };
    void startBackgroundWatch();
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [isNativePlatform, verifiedSpotDefinitions]);


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

  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const followingUserIdsSet = useMemo(() => new Set(followingUserIds), [followingUserIds]);
  const timelineSessions = useMemo(() => {
    const safeTimelineSessions = Array.isArray(sessions) ? sessions : [];
    const dedupedSessions = Array.from(new Map(safeTimelineSessions.map((item) => [item.id, item])).values());
    const filteredSessions = (Array.isArray(dedupedSessions) ? dedupedSessions : []).filter((item) => {
      const sameDay = item.sessionDay === activeDayKey;
      const state = getSessionViewState(item);

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
          isBuddy: followingUserIdsSet.has(item.userId),
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
    void fetchSharedData();
  }, [selectedSpot]);

  useEffect(() => {
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
    const oneHourBack = currentLocalMinutes - 60;
    const roundedStart = Math.floor(oneHourBack / 60) * 60;
    const dynamicTodayStart = clamp(roundedStart, timelineStartMinutes, timelineEndMinutes - 60);

    return {
      startMinutes: activeDay === 'today' ? dynamicTodayStart : timelineStartMinutes,
      endMinutes: timelineEndMinutes,
      mode: activeDay === 'today' ? 'rolling_today' : 'full_day',
    };
  }, [activeDay, currentLocalMinutes]);
  const timelineMode = windowInfo.mode;
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
  const canCheckOut = shouldShowSpotCheckOut;
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
  const headerStateLabel = hasOwnSessionOnSelectedSpotDay ? 'You have a session today' : null;
  const headerHelperText = hasOwnSessionOnSelectedSpotDay
    ? 'You’re going today. Others can join you.'
    : '';  const liveCount = (spotState?.sessionsForSpot ?? []).filter((session) => {
    return getSessionState(session) === "active";
  }).length;
  const nowSummaryLabel = liveCount > 0
    ? `${liveCount} rider${liveCount === 1 ? '' : 's'} live now.`
    : 'No live riders yet.';
  const nativeSwipeStartXRef = useRef<number | null>(null);

  const handleNativeSwipeStart = (event: any) => {
    if (isWebPlatform) return;
    nativeSwipeStartXRef.current = event?.nativeEvent?.pageX ?? null;
  };

  const handleNativeSwipeEnd = (event: any) => {
    if (isWebPlatform) return;
    const startX = nativeSwipeStartXRef.current;
    nativeSwipeStartXRef.current = null;
    const endX = event?.nativeEvent?.pageX ?? null;
    if (typeof startX !== 'number' || typeof endX !== 'number') return;

    // Only trigger back-swipe when gesture starts from the left edge (< 40pt)
    // This prevents map pinch/zoom gestures from triggering navigation
    if (startX > 40) return;

    const deltaX = endX - startX;
    const isNotHome = Boolean(selectedSpot || showYourSpotsPage || showDiscoverSpotsPage || showBuddies || showProfile || showChat || isNotificationInboxExpanded);

    if (deltaX > 70 && isNotHome) {
      goHomeFromNativeSwipe();
    }
  };

  const renderNativeTopBar = () => {
    if (isWebPlatform) return null;

    return (
      <View
        style={{
          height: 88,
          backgroundColor: theme.bg,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.08)',
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View style={{ width: 88, height: 88, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginLeft: 24 }}>
          <Image
            source={require('./assets/logo.png')}
            resizeMode="contain"
            style={{ width: 160, height: 160 }}
          />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Image
            source={require('./assets/wordmark.png')}
            resizeMode="contain"
            style={{ width: 220, height: 58 }}
          />
        </View>
        <Pressable
          onPress={() => {
            navigateNative('home');
            setIsNotificationInboxExpanded((prev) => {
              if (!prev) void markAllBuzzAsRead();
              return !prev;
            });
          }}
          style={{
            width: 60,
            height: 88,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ position: 'relative' }}>
            <Ionicons name="notifications-outline" size={26} color="#ffffff" />
            {unreadCount > 0 ? (
              <View style={{
                position: 'absolute', top: -4, right: -6,
                minWidth: 16, height: 16, borderRadius: 8,
                backgroundColor: '#ff3b30',
                alignItems: 'center', justifyContent: 'center',
                paddingHorizontal: 3,
              }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
        <Pressable
          onPress={() => setShowProfile(true)}
          style={{ width: 60, height: 88, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
        >
          <Avatar uri={profile?.avatar_url ?? null} size={32} nationality={profile?.nationality} />
        </Pressable>
      </View>
    );
  };

  const renderNativeBottomNav = () => {
    if (isWebPlatform) return null;

    const isHome = !selectedSpot && !showYourSpotsPage && !showDiscoverSpotsPage && !showBuddies && !showProfile && !showChat;
    const isSpots = showYourSpotsPage || showDiscoverSpotsPage;
    const isBuddies = showBuddies;
    const isChat = showChat;

    type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];
    const items: { key: string; icon: IoniconsName; iconActive: IoniconsName; label: string; onPress: () => void; badge: number | null; isActive: boolean }[] = [
      { key: 'home', icon: 'home-outline', iconActive: 'home', label: 'Home', onPress: () => navigateNative('home'), badge: unreadCount > 0 && !isHome ? unreadCount : null, isActive: isHome },
      { key: 'spots', icon: 'location-outline', iconActive: 'location', label: 'Spots', onPress: () => navigateNative('spots'), badge: null, isActive: isSpots },
      { key: 'buddies', icon: 'people-outline', iconActive: 'people', label: 'Buddies', onPress: () => navigateNative('buddies'), badge: hasPendingRequests && pendingRequestsCount !== null ? pendingRequestsCount : null, isActive: isBuddies },
      { key: 'chat', icon: 'chatbubbles-outline', iconActive: 'chatbubbles', label: 'Messages', onPress: () => navigateNative('chat'), badge: chatUnreadCount > 0 ? chatUnreadCount : null, isActive: isChat },
    ];

    return (
      <>
        {/* FAB — Instagram-stijl: grijs pill aan rechterrand, deels buiten beeld */}
        <Pressable
          onPress={() => setShowPlanModal(true)}
          style={{
            position: 'absolute',
            bottom: 108,
            right: -4,
            zIndex: 100,
            elevation: 100,
          }}
        >
          <View style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            backgroundColor: 'rgba(58,64,80,0.92)',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: -2, height: 2 },
            shadowOpacity: 0.22,
            shadowRadius: 8,
            elevation: 8,
          }}>
            <Ionicons name="add" size={26} color="rgba(255,255,255,0.90)" />
          </View>
        </Pressable>

        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 84,
            backgroundColor: theme.bg,
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.10)',
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-around',
            paddingHorizontal: 10,
            paddingTop: 10,
            zIndex: 50,
            elevation: 50,
          }}
        >
        {items.map((item) => (
          <Pressable
            key={`native-bottom-nav-${item.key}`}
            onPress={item.onPress}
            style={{
              minWidth: 68,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 6,
              borderRadius: 999,
            }}
          >
            <Ionicons
              name={item.isActive ? item.iconActive : item.icon}
              size={26}
              color={item.isActive ? '#ffffff' : 'rgba(255,255,255,0.45)'}
            />
            <Text style={{ color: item.isActive ? '#ffffff' : 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: item.isActive ? '700' : '500', marginTop: 3 }}>
              {item.label}
            </Text>
            {item.badge ? (
              <View style={{ position: 'absolute', top: 4, right: 8, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: theme.bg, fontSize: 9, fontWeight: '900' }}>{item.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
      </>
    );
  };

  const goHomeFromNativeSwipe = () => {
    if (isWebPlatform) return;

    setSelectedSpot(null);
    setShowYourSpotsPage(false);
    setShowDiscoverSpotsPage(false);
    setShowBuddies(false);
    setShowProfile(false);
    setShowChat(false);
    setIsNotificationInboxExpanded(false);
  };

  const navigateNative = (
    destination: 'home' | 'spots' | 'discover' | 'buddies' | 'buzz' | 'chat'
  ) => {
    goHomeFromNativeSwipe();

    if (destination === 'spots') {
      setShowYourSpotsPage(true);
    }

    if (destination === 'discover') {
      setShowDiscoverSpotsPage(true);
      void Location.requestForegroundPermissionsAsync()
        .then(({ status }) => {
          if (status !== 'granted') return null;
          return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        })
        .then((pos) => {
          if (pos) setDiscoverMapCenter({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        })
        .catch(() => {});
    }

    if (destination === 'buddies') {
      setShowBuddies(true);
    }

    if (destination === 'buzz') {
      setIsNotificationInboxExpanded(true);
      void markAllBuzzAsRead();
    }

    if (destination === 'chat') {
      setShowChat(true);
      // Ga naar Spot chats tab als er ongelezen spots zijn
      const hasUnreadSpots = Object.values(spotsWithUnread).some(n => n > 0);
      if (hasUnreadSpots) setChatSubTab('spot');
          }
  };


  const nativeBackSwipeResponder = !isWebPlatform ? PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => {
      const isHorizontalSwipe = Math.abs(gestureState.dx) > 42 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.6;
      const isNotHome = Boolean(selectedSpot || showYourSpotsPage || showDiscoverSpotsPage || showBuddies || showProfile || showChat || isNotificationInboxExpanded);
      return isHorizontalSwipe && isNotHome;
    },
    onPanResponderRelease: (_, gestureState) => {
      if (Math.abs(gestureState.dx) > 70) {
        goHomeFromNativeSwipe();
      }
    },
  }) : null;
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
    const result = await cancelSessionAction(input);
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
  useEffect(() => {  }, [messages]);
  useEffect(() => {  }, [orderedMessages]);
  useEffect(() => {  }, [orderedMessages]);

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
    
    const checkInResult = await runCheckInFlowForSpot({ spot, source });
    if (!checkInResult.ok) {
      const failureResult = checkInResult as { ok: false; reason: string; error?: unknown };
      const failureReason = failureResult.reason;
      const failureError = failureResult.error ?? null;
      
      return { errorMessage: mapCheckInFailureToMessage(failureReason), checkedInSpot: null };
    }

    

    await fetchSharedData({ skipLoadingState: true });

    if (checkInResult.spot) {
      setSelectedSpot(checkInResult.spot);
    }

    const checkedInActorId = activeProfile?.id ?? activeAppUserId ?? null;
    if (checkedInActorId && checkInResult.spot) {
      const dayKey = selectedDayKey;
      void supabase.rpc('create_checkin_notification', {
        actor_profile_id: checkedInActorId,
        spot_name_param: checkInResult.spot,
        session_day_param: dayKey,
      }).then(({ data: recipients }) => {
        const ids = (recipients ?? []).map((r: { recipient_profile_id: string }) => r.recipient_profile_id).filter(Boolean);
        const actorName = activeProfile?.display_name?.trim() || 'Someone';
        void sendPushToRecipients(ids, `${actorName} checked in`, `${actorName} checked in at ${checkInResult.spot}`, { type: 'checkin', spotName: checkInResult.spot });
      });
    }

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
        if (selectedSpotDistanceMeters === null) {
          setSessionActionError('Location not available. Make sure GPS is on.');
        } else {
          setSessionActionError(`You are too far from the spot (${Math.round(selectedSpotDistanceMeters)} m, max 1 km)`);
        }
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
    const pressedSpotDefinition = spotDefinitions.find(
      (s) => normalizeSpotName(s.spot) === normalizeSpotName(spot)
    );
    const pressedSpotDistanceMeters = currentCoordinates && pressedSpotDefinition
      ? getDistanceMeters(currentCoordinates, { latitude: pressedSpotDefinition.latitude, longitude: pressedSpotDefinition.longitude })
      : null;
    const isPressedSpotWithinRange = pressedSpotDistanceMeters !== null && pressedSpotDistanceMeters <= CHECK_IN_RADIUS_METERS;
    if (!isPressedSpotWithinRange) {
      if (pressedSpotDistanceMeters === null) {
        setHomeQuickCheckInError('Location not available. Make sure GPS is on.');
      } else {
        setHomeQuickCheckInError(`You are too far from the spot (${Math.round(pressedSpotDistanceMeters)} m, max 1 km)`);
      }
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
    if (!currentCoordinates) return;
    setDiscoverMapCenter(currentCoordinates);
  }, [currentCoordinates]);

  if (loadingSession || loadingProfile || loadingData) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.045)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
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
            borderRadius: 18,
                        minHeight: 138,
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
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
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
  const loadSpotChatForTab = async (spotName: string) => {
    const today = new Date().toISOString().split('T')[0];
    const convResponse = await supabase.from('conversations').select('id').eq('type', 'spot').eq('spot_name', spotName).eq('session_day', today).limit(1);
    const convId = convResponse.data?.[0]?.id ?? null;
    if (!convId) {
      setChatSpotMessages((prev) => ({ ...prev, [spotName]: { conversationId: null, messages: [], loaded: true } }));
      return;
    }
    const msgResponse = await supabase.from('messages').select('id, user_id, text, created_at').eq('conversation_id', convId).order('created_at', { ascending: true });
    const rows = msgResponse.data ?? [];
    const userIds = [...new Set(rows.map((m) => m.user_id).filter(Boolean))];
    const profilesResponse = userIds.length ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds) : { data: [] };
    const pmap = new Map((profilesResponse.data ?? []).map((p) => [p.id, p]));
    const enriched = rows.map((m) => ({
      id: m.id, text: m.text, createdAt: m.created_at, userId: m.user_id,
      display_name: pmap.get(m.user_id)?.display_name ?? 'Unknown',
      avatar_url: pmap.get(m.user_id)?.avatar_url ?? null,
    }));
    myConvIdsRef.current.add(convId);
    setChatSpotMessages((prev) => ({ ...prev, [spotName]: { conversationId: convId, messages: enriched, loaded: true } }));
  };

  const sendSpotMessageInChatTab = async (spotName: string) => {
    const text = spotChatInputInChat.trim();
    const senderId = activeProfile?.id ?? activeAppUserId ?? null;
    if (!text || !spotName || !senderId) return;
    const today = new Date().toISOString().split('T')[0];
    let convId = chatSpotMessages[spotName]?.conversationId ?? null;
    if (!convId) {
      const existing = await supabase.from('conversations').select('id').eq('type', 'spot').eq('spot_name', spotName).eq('session_day', today).limit(1);
      convId = existing.data?.[0]?.id ?? null;
      if (!convId) {
        const { data: created } = await supabase.from('conversations').insert({ type: 'spot', spot_name: spotName, session_day: today }).select('id').single();
        convId = created?.id ?? null;
      }
    }
    if (!convId) return;
    const { error } = await supabase.from('messages').insert({ user_id: senderId, text, spot_name: spotName, session_day: today, conversation_id: convId, created_at: new Date().toISOString() });
    if (error) { console.error('CHAT_TAB_SPOT_SEND_ERROR', error); return; }
    setSpotChatInputInChat('');
    setTimeout(() => chatSpotScrollRef.current?.scrollToEnd({ animated: true }), 50);
    const newMsg = { id: `${convId}-${Date.now()}`, text, createdAt: new Date().toISOString(), userId: senderId, display_name: activeProfile?.display_name ?? 'You', avatar_url: activeProfile?.avatar_url ?? null };
    setChatSpotMessages((prev) => ({ ...prev, [spotName]: { conversationId: convId, messages: [...(prev[spotName]?.messages ?? []), newMsg], loaded: true } }));
    // Push naar spot-volgers — GEEN create_chat_notification (dat gaat naar bell, niet Messages)
    void (async () => {
      const { data: followers } = await supabase
        .from('spot_followers')
        .select('user_id')
        .eq('spot_name', spotName)
        .neq('user_id', activeAppUserId ?? '');
      const followerUids = (followers ?? []).map((f) => f.user_id).filter(Boolean);
      if (!followerUids.length) return;
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .in('owner_uid', followerUids);
      const ids = (profiles ?? []).map((p) => p.id).filter(Boolean);
      const actorName = activeProfile?.display_name?.trim() || 'Someone';
      void sendPushToRecipients(ids, `${actorName} · ${spotName}`, text, { type: 'chat_message', spotName });
    })();
  };

  const loadMySessionsForChatTab = async () => {
    if (!activeAppUserId) return;
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const { data } = await supabase.from('sessions')
      .select('id, spot_name, session_day, start_time, end_time, group_key, user_id')
      .eq('user_id', activeAppUserId)
      .in('session_day', [today, tomorrow])
      .order('session_day').order('start_time');
    if (data) {
      // Merge: handmatig toegevoegde sessies (groupKey als ID) behouden
      setChatMySessions((prev) => {
        const dbIds = new Set((data).map((s) => s.id));
        const manual = prev.filter((s) => !dbIds.has(s.id)); // handmatige sessies
        return [...(data), ...manual];
      });
    }
  };

  const loadSessionChatForTab = async (groupKey: string, spotName: string, sessionDay: string) => {
    // Initialiseer entry direct zodat realtime berichten niet worden gedropped tijdens laden
    setChatSessionMessages((prev) => prev[groupKey] ? prev : { ...prev, [groupKey]: { conversationId: null, messages: [], loaded: false } });
    const convResponse = await supabase.from('conversations').select('id').eq('type', 'group').eq('spot_name', spotName).eq('group_key', groupKey).limit(1);
    let convId = convResponse.data?.[0]?.id ?? null;
    if (!convId) {
      const { data: created, error } = await supabase.from('conversations').insert({ type: 'group', spot_name: spotName, session_day: sessionDay, group_key: groupKey }).select('id').single();
      if (error) console.error('GROUP_CONV_CREATE_ERROR', error);
      convId = created?.id ?? null;
    }
    if (!convId) {
      setChatSessionMessages((prev) => ({ ...prev, [groupKey]: { conversationId: null, messages: [], loaded: true } }));
      return;
    }
    myConvIdsRef.current.add(convId);
    sessionConvIdsRef.current.add(convId); // markeer als sessie convId
    const msgResponse = await supabase.from('messages').select('id, user_id, text, created_at').eq('conversation_id', convId).order('created_at', { ascending: true });
    const rows = msgResponse.data ?? [];
    const userIds = [...new Set(rows.map((m) => m.user_id).filter(Boolean))];
    const profilesResponse = userIds.length ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds) : { data: [] };
    const pmap = new Map((profilesResponse.data ?? []).map((p) => [p.id, p]));
    const enriched = rows.map((m) => ({
      id: m.id, text: m.text, createdAt: m.created_at, userId: m.user_id,
      display_name: pmap.get(m.user_id)?.display_name ?? 'Unknown',
      avatar_url: pmap.get(m.user_id)?.avatar_url ?? null,
    }));
    setChatSessionMessages((prev) => ({ ...prev, [groupKey]: { conversationId: convId, messages: enriched, loaded: true } }));
  };

  const sendSessionMessageInChatTab = async (groupKey: string, spotName: string, sessionDay: string) => {
    const text = sessionChatInput.trim();
    const senderId = activeProfile?.id ?? activeAppUserId ?? null;
    if (!text || !groupKey || !senderId) return;
    let convId = chatSessionMessages[groupKey]?.conversationId ?? null;
    if (!convId) {
      const existing = await supabase.from('conversations').select('id').eq('type', 'group').eq('spot_name', spotName).eq('group_key', groupKey).limit(1);
      convId = existing.data?.[0]?.id ?? null;
      if (!convId) {
        const { data: created, error } = await supabase.from('conversations').insert({ type: 'group', spot_name: spotName, session_day: sessionDay, group_key: groupKey }).select('id').single();
        if (error) console.error('SESSION_CHAT_CREATE_ERROR', error);
        convId = created?.id ?? null;
      }
      if (convId) { myConvIdsRef.current.add(convId); sessionConvIdsRef.current.add(convId); }
    }
    if (!convId) return;
    const { error } = await supabase.from('messages').insert({ user_id: senderId, text, spot_name: spotName, session_day: sessionDay, conversation_id: convId, created_at: new Date().toISOString() });
    if (error) { console.error('CHAT_TAB_SESSION_SEND_ERROR', error); return; }
    setSessionChatInput('');
    setTimeout(() => chatSessionScrollRef.current?.scrollToEnd({ animated: true }), 50);
    const newMsg = { id: `${convId}-${Date.now()}`, text, createdAt: new Date().toISOString(), userId: senderId, display_name: activeProfile?.display_name ?? 'You', avatar_url: activeProfile?.avatar_url ?? null };
    setChatSessionMessages((prev) => ({ ...prev, [groupKey]: { conversationId: convId, messages: [...(prev[groupKey]?.messages ?? []), newMsg], loaded: true } }));
  };

  // DM group_key = 'dm_SMALLERID_LARGERID' (geen participant kolommen nodig)
  const getDmGroupKey = (idA: string, idB: string) => {
    const sorted = [idA, idB].sort();
    return `dm_${sorted[0]}_${sorted[1]}`;
  };

  const loadDmConversations = async () => {
    if (!activeAppUserId) return;
    // Zoek alle DM conversations waar de gebruiker in zit via group_key
    const { data: convs, error: convErr } = await supabase.from('conversations')
      .select('id, group_key, created_at')
      .eq('type', 'dm')
      .like('group_key', `%${activeAppUserId}%`);
    if (convErr) { console.error('DM_LOAD_ERROR', convErr); setDmConversations([]); return; }
    if (!convs?.length) { setDmConversations([]); return; }

    // Haal otherUserId uit de group_key (dm_ID1_ID2)
    const withOtherId = convs.map((c) => {
      const parts = (c.group_key ?? '').replace('dm_', '').split('_');
      const otherId = parts.find((p) => p !== activeAppUserId) ?? parts[1] ?? null;
      return { ...c, otherUserId: otherId };
    }).filter((c) => c.otherUserId);

    const otherUserIds = [...new Set(withOtherId.map((c) => c.otherUserId).filter(Boolean))];
    const convIds = convs.map((c) => c.id);
    const [profilesResp, lastMsgsResp] = await Promise.all([
      otherUserIds.length ? supabase.from('profiles').select('id, display_name, avatar_url').in('id', otherUserIds) : Promise.resolve({ data: [] as any[] }),
      convIds.length ? supabase.from('messages').select('conversation_id, text, created_at').in('conversation_id', convIds).order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] as any[] }),
    ]);
    const profileMap = new Map((profilesResp.data ?? []).map((p: any) => [p.id, p]));
    const lastMsgMap = new Map<string, { text: string; created_at: string }>();
    for (const msg of (lastMsgsResp.data ?? [])) {
      if (!lastMsgMap.has(msg.conversation_id)) lastMsgMap.set(msg.conversation_id, msg);
    }
    const result = withOtherId.map((c) => {
      const p = profileMap.get(c.otherUserId);
      const lm = lastMsgMap.get(c.id);
      return { id: c.id, otherUserId: c.otherUserId!, otherName: p?.display_name ?? 'Unknown', otherAvatar: p?.avatar_url ?? null, lastMessage: lm?.text ?? null, lastMessageAt: lm?.created_at ?? null };
    }).sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
    // Voeg DM convIds direct toe aan myConvIdsRef zodat realtime werkt zonder chat openen
    for (const c of result) myConvIdsRef.current.add(c.id);
    setDmConversations(result);
  };

  const loadDmMessages = async (conversationId: string) => {
    const { data: msgs } = await supabase.from('messages').select('id, user_id, text, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: true });
    const rows = msgs ?? [];
    const userIds = [...new Set(rows.map((m) => m.user_id).filter(Boolean))];
    const { data: profiles } = userIds.length ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds) : { data: [] };
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const enriched = rows.map((m) => ({ id: m.id, text: m.text, createdAt: m.created_at, userId: m.user_id, display_name: pmap.get(m.user_id)?.display_name ?? 'Unknown', avatar_url: pmap.get(m.user_id)?.avatar_url ?? null }));
    setDmMessages((prev) => ({ ...prev, [conversationId]: enriched }));
  };

  const sendDmMessage = async (conversationId: string) => {
    const text = dmInput.trim();
    const senderId = activeProfile?.id ?? activeAppUserId ?? null;
    if (!text || !conversationId || !senderId) return;
    const { error } = await supabase.from('messages').insert({ user_id: senderId, text, conversation_id: conversationId, spot_name: null, session_day: null, created_at: new Date().toISOString() });
    if (error) { console.error('DM_SEND_ERROR', error); return; }
    setDmInput('');
    setTimeout(() => chatDmScrollRef.current?.scrollToEnd({ animated: true }), 50);
    const newMsg = { id: `dm-${Date.now()}`, text, createdAt: new Date().toISOString(), userId: senderId, display_name: activeProfile?.display_name ?? 'You', avatar_url: activeProfile?.avatar_url ?? null };
    setDmMessages((prev) => ({ ...prev, [conversationId]: [...(prev[conversationId] ?? []), newMsg] }));
    setDmConversations((prev) => prev.map((c) => c.id === conversationId ? { ...c, lastMessage: text, lastMessageAt: new Date().toISOString() } : c));
  };

  const openDmWithUser = async (otherUserId: string) => {
    if (!activeAppUserId || !otherUserId) return null;
    const gk = getDmGroupKey(activeAppUserId, otherUserId);
    // Zoek bestaand DM gesprek
    const { data: existing } = await supabase.from('conversations').select('id').eq('type', 'dm').eq('group_key', gk).limit(1);
    let convId = existing?.[0]?.id ?? null;
    if (!convId) {
      // participant_a_id + participant_b_id zodat RLS SELECT de rij ziet
      const { data: created, error } = await supabase.from('conversations').insert({
        type: 'dm',
        group_key: gk,
        participant_a_id: activeAppUserId,
        participant_b_id: otherUserId,
      }).select('id').single();
      if (error) console.error('DM_CREATE_ERROR', error);
      convId = created?.id ?? null;
    }
    if (convId) myConvIdsRef.current.add(convId);
    return convId;
  };

  const withNativeShell = (screen: React.ReactNode) => {
    if (isWebPlatform) return screen;

    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.bg }}
        onTouchStart={handleNativeSwipeStart}
        onTouchEnd={handleNativeSwipeEnd}
      >
        <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
        {renderNativeTopBar()}
        <View style={{ flex: 1, backgroundColor: theme.bg, paddingBottom: 96 }}>
          {screen}
        </View>
        {renderNativeBottomNav()}
      </SafeAreaView>
    );
  };

  if (showDiscoverSpotsPage) {
    const discoverSpots = spotDefinitions
      .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
      .map((s) => {
        const spotSessions = (daySessionsBySpot[s.spot] ?? []).filter((ss) => getCleanSessionStatus(ss) !== 'finished');
        const liveCount = new Set(spotSessions.filter((ss) => getCleanSessionStatus(ss) === 'live').map((ss) => ss.userId).filter(Boolean)).size;
        const goingCount = new Set(spotSessions.filter((ss) => getCleanSessionStatus(ss) === 'going').map((ss) => ss.userId).filter(Boolean)).size;
        return {
          name: s.spot,
          latitude: s.latitude,
          longitude: s.longitude,
          isAdded: favoriteSpots.includes(s.spot),
          coordinateStatus: s.coordinateStatus,
          liveCount,
          goingCount,
        };
      });

    const discoverQuery = (homeSpotSearchQuery ?? '').trim().toLowerCase();
    const discoverSuggestions = discoverQuery.length >= 1
      ? spotDefinitions
          .filter((s) => s.spot.toLowerCase().includes(discoverQuery))
          .slice(0, 6)
      : [];

    const discoverFlyTarget = discoverSuggestions.length > 0 && discoverSuggestions[0]
      ? { latitude: discoverSuggestions[0].latitude, longitude: discoverSuggestions[0].longitude }
      : null;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
        <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
        {renderNativeTopBar()}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text style={{ color: theme.text, fontSize: 26, fontWeight: '900' }}>Discover</Text>
          <Pressable
            onPress={() => { setShowDiscoverSpotsPage(false); setHomeSpotSearchQuery(''); }}
            style={{ display: isWebPlatform ? 'flex' : 'none', backgroundColor: theme.cardStrong, borderRadius: 999, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Back home</Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 14, paddingBottom: 8, zIndex: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, marginRight: 8 }}>🔍</Text>
            <TextInput
              value={homeSpotSearchQuery}
              onChangeText={setHomeSpotSearchQuery}
              placeholder="Search spots..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              clearButtonMode="while-editing"
              returnKeyType="search"
              style={{ flex: 1, color: '#ffffff', fontSize: 15, padding: 0 } as any}
            />
          </View>
          {discoverSuggestions.length > 0 ? (
            <View style={{ backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border, marginTop: 4, overflow: 'hidden' }}>
              {discoverSuggestions.map((s) => (
                <Pressable
                  key={s.spot}
                  onPress={() => {
                    setHomeSpotSearchQuery(s.spot);
                    Keyboard.dismiss();
                  }}
                  style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}
                >
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{s.spot}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <View style={{ flex: 1 }}>
          <DiscoverMap
            center={{
              latitude: discoverMapCenter?.latitude ?? 52.3676,
              longitude: discoverMapCenter?.longitude ?? 4.9041,
            }}
            flyToTarget={discoverFlyTarget}
            spots={discoverSpots}
            userLocation={currentCoordinates}
            onOpenSpot={(spotName) => {
              setSelectedSpot(spotName);
              setShowDiscoverSpotsPage(false);
              setHomeSpotSearchQuery('');
            }}
            onAddSpot={(spotName) => addSelectedSpot(spotName)}
            onMapClick={(latitude, longitude) => setCoordinateReviewPoint({ latitude, longitude })}
          />
        </View>

        {renderNativeBottomNav()}
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

    return withNativeShell(
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, paddingHorizontal: 20, paddingTop: isWebPlatform ? 20 : 0 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 28 }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.025)', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: theme.text, fontSize: 26, fontWeight: '700' }}>My spots (max 5)</Text>
              <Pressable
                onPress={() => setShowYourSpotsPage(false)}
                style={{ display: isWebPlatform ? 'flex' : 'none', backgroundColor: theme.cardStrong, borderRadius: 999, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10, paddingVertical: 6 }}
              >
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Back home</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 10 }}>
              <TextInput
                placeholderTextColor="rgba(255,255,255,0.38)"
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
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  color: theme.text,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.08)',
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
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
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

  if (showChat) {
    const spotUnreadTotal = Object.values(spotsWithUnread).reduce((a, b) => a + b, 0);
    const chatTabs = [
      { key: 'spot' as const, label: 'Spot chats', badge: spotUnreadTotal },
      { key: 'session' as const, label: 'Session chats', badge: unreadSessionTotal },
      { key: 'dm' as const, label: 'DMs', badge: unreadDmTotal },
    ];

    const renderChatMessages = (messages: any[], isOwn: (userId: string) => boolean) =>
      messages.map((msg) => {
        const own = isOwn(msg.userId ?? msg.user_id);
        const time = msg.createdAt ? formatToHourMinute(msg.createdAt) : '';
        const msgUserId = msg.userId ?? msg.user_id;
        return (
          <View key={msg.id} style={{ flexDirection: own ? 'row-reverse' : 'row', alignItems: 'flex-end', marginBottom: 8 }}>
            {!own && <Pressable onPress={() => msgUserId && setViewingOtherUserId(msgUserId)}><Avatar uri={msg.avatar_url} size={22} /></Pressable>}
            <View style={{ marginLeft: own ? 0 : 6, marginRight: own ? 6 : 0, maxWidth: '82%', backgroundColor: own ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.045)', borderRadius: 14, borderBottomLeftRadius: own ? 14 : 4, borderBottomRightRadius: own ? 4 : 14, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: own ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.065)' }}>
              {!own && <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: '800' }} numberOfLines={1}>{msg.display_name}</Text>}
              <Text style={{ color: theme.text, fontSize: 14, marginTop: own ? 0 : 2 }}>{msg.text}</Text>
              {time ? <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2, textAlign: own ? 'right' : 'left' }}>{time}</Text> : null}
            </View>
          </View>
        );
      });

    // Bepaal welk gesprek open is
    const openSpotConv = expandedChatSpot ? chatSpotMessages[expandedChatSpot] : null;
    const openSessionConv = expandedChatSession ? chatSessionMessages[expandedChatSession] : null;
    const openDmConv = expandedDmId ? dmConversations.find((d) => d.id === expandedDmId) : null;
    const isAnyConvOpen = !!(expandedChatSpot || expandedChatSession || expandedDmId);

    const openMessages: any[] = expandedChatSpot
      ? (openSpotConv?.messages ?? [])
      : expandedChatSession
      ? (openSessionConv?.messages ?? [])
      : expandedDmId
      ? (dmMessages[expandedDmId] ?? [])
      : [];

    const openConvName = expandedChatSpot
      ? expandedChatSpot
      : expandedChatSession
      ? (chatMySessions.find((s) => (s.group_key ?? s.id) === expandedChatSession)?.spot_name ?? 'Session chat')
      : openDmConv?.otherName ?? 'DM';

    const openConvSub = expandedChatSession
      ? (() => { const s = chatMySessions.find((x) => (x.group_key ?? x.id) === expandedChatSession); return s ? `${s.session_day}${s.start_time ? ' · ' + s.start_time : ''}` : ''; })()
      : expandedChatSpot ? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

    const openScrollRef = expandedChatSpot ? chatSpotScrollRef : expandedChatSession ? chatSessionScrollRef : chatDmScrollRef;

    const openInput = expandedChatSpot ? spotChatInputInChat : expandedChatSession ? sessionChatInput : dmInput;
    const setOpenInput = expandedChatSpot
      ? setSpotChatInputInChat
      : expandedChatSession
      ? setSessionChatInput
      : setDmInput;

    const handleOpenSend = () => {
      // Keyboard.dismiss() verwijderd — toetsenbord blijft open na verzenden
      if (expandedChatSpot) void sendSpotMessageInChatTab(expandedChatSpot);
      else if (expandedChatSession) {
        const s = chatMySessions.find((x) => (x.group_key ?? x.id) === expandedChatSession);
        // Fallback: gebruik openConvName (spot naam) en openConvSub (datum) als sessie niet in lijst staat
        const spotName = s?.spot_name ?? openConvName;
        const sessionDay = s?.session_day ?? (openConvSub?.split(' ·')?.[0] ?? new Date().toISOString().split('T')[0]);
        void sendSessionMessageInChatTab(expandedChatSession, spotName, sessionDay);
      }
      else if (expandedDmId) void sendDmMessage(expandedDmId);
    };

    const handleOpenBack = () => {
      setExpandedChatSpot(null);
      setExpandedChatSession(null);
      setExpandedDmId(null);
    };

    const chatContent = (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
        <KeyboardAvoidingView behavior={isWebPlatform ? undefined : 'padding'} style={{ flex: 1 }}>

        {/* ── Volledig-scherm chat-modus ── */}
        {isAnyConvOpen ? (
          <View style={{ flex: 1 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', gap: 10 }}>
              <Pressable onPress={handleOpenBack} hitSlop={10} style={{ padding: 4 }}>
                <Ionicons name="chevron-back" size={22} color={theme.text} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{openConvName}</Text>
                {openConvSub ? <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 1 }}>{openConvSub}</Text> : null}
              </View>
            </View>

            {/* Berichten */}
            <ScrollView
              ref={openScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => openScrollRef.current?.scrollToEnd({ animated: false })}
              onLayout={() => openScrollRef.current?.scrollToEnd({ animated: false })}
            >
              {!openMessages.length ? (
                <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 40 }}>No messages yet. Say something!</Text>
              ) : (
                renderChatMessages(openMessages, (uid) => uid === (activeProfile?.id ?? activeAppUserId))
              )}
            </ScrollView>

            {/* Invoerbalk — pill style */}
            <View style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 10, paddingBottom: 10, backgroundColor: theme.bg, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingLeft: 14, paddingRight: 5, paddingVertical: 5 }}>
                <TextInput
                  value={openInput}
                  onChangeText={setOpenInput}
                  onSubmitEditing={handleOpenSend}
                  blurOnSubmit={false}
                  placeholder="Type a message…"
                  placeholderTextColor={theme.textMuted}
                  style={({ flex: 1, color: theme.text, paddingVertical: 7, paddingRight: 6, fontSize: 15, outlineStyle: 'none', boxShadow: 'none' } as any)}
                />
                <Pressable
                  onPress={handleOpenSend}
                  disabled={!openInput.trim()}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: openInput.trim() ? theme.primary : 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', opacity: openInput.trim() ? 1 : 0.4 }}
                >
                  <Ionicons name="arrow-up" size={17} color="#ffffff" />
                </Pressable>
              </View>
            </View>
          </View>
        ) : (

        /* ── Lijst-modus (tabs + gesprekken) ── */
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, paddingTop: isWebPlatform ? 20 : 0 }}>
          {/* Header */}
          {isWebPlatform ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ color: theme.text, fontSize: 26, fontWeight: '700' }}>Messages <Text style={{ color: '#ff6666', fontSize: 12 }}>({_dbgEventCount})</Text></Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Pressable onPress={() => setShowMessagesAlertSettings((v) => !v)} style={{ backgroundColor: theme.bgElevated, borderRadius: 999, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '700' }}>Alert settings</Text>
                  <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: showMessagesAlertSettings ? theme.primary : theme.textMuted }} />
                </Pressable>
                <Pressable onPress={() => setShowChat(false)} style={{ backgroundColor: theme.cardStrong, borderRadius: 999, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Back home</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>
              <Pressable onPress={() => setShowMessagesAlertSettings((v) => !v)} style={{ backgroundColor: theme.bgElevated, borderRadius: 999, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '700' }}>Alert settings</Text>
                <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: showMessagesAlertSettings ? theme.primary : theme.textMuted }} />
              </Pressable>
            </View>
          )}

          {/* Messages Alert Settings panel — zelfde opmaak als spot alert settings */}
          {showMessagesAlertSettings && (
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', backgroundColor: 'rgba(8,24,39,0.82)', overflow: 'hidden', marginBottom: 16 }}>
              <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>Alert settings</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>Choose who can trigger alerts for chat messages</Text>
              </View>

              {([
                { key: 'spotChats' as const, label: 'Spot chats', icon: '📍' },
                { key: 'sessionChats' as const, label: 'Session chats', icon: '👥' },
              ]).map(({ key, label, icon }, index) => {
                const currentValue = messagesAlertSettings[key];
                return (
                  <View key={key} style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: 'rgba(255,255,255,0.05)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <Text style={{ fontSize: 16 }}>{icon}</Text>
                      <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: '700', flex: 1 }}>{label}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {(['everyone', 'buddies', 'off'] as const).map((opt) => {
                        const selected = currentValue === opt;
                        return (
                          <Pressable key={opt} onPress={() => setMessagesAlertSettings((prev) => ({ ...prev, [key]: opt }))} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: selected ? 'rgba(77,184,255,0.2)' : 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: selected ? 'rgba(77,184,255,0.45)' : 'rgba(255,255,255,0.07)' }}>
                            <Text style={{ color: selected ? '#AEE8FF' : theme.textMuted, fontSize: 11, fontWeight: '800' }}>{opt === 'off' ? 'Off' : opt === 'buddies' ? 'Buddies' : 'Everyone'}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              {/* Message requests */}
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Text style={{ fontSize: 16 }}>✉️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: '700' }}>Message requests</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 11 }}>DMs from non-buddies</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(['on', 'off'] as const).map((opt) => {
                    const selected = (opt === 'on') === messagesAlertSettings.messageRequests;
                    return (
                      <Pressable key={opt} onPress={() => setMessagesAlertSettings((prev) => ({ ...prev, messageRequests: opt === 'on' }))} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: selected ? 'rgba(77,184,255,0.2)' : 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: selected ? 'rgba(77,184,255,0.45)' : 'rgba(255,255,255,0.07)' }}>
                        <Text style={{ color: selected ? '#AEE8FF' : theme.textMuted, fontSize: 11, fontWeight: '800' }}>{opt === 'on' ? 'On' : 'Off'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* DMs always on */}
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Text style={{ fontSize: 16 }}>💬</Text>
                  <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: '700', flex: 1 }}>Direct messages</Text>
                </View>
                <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '700' }}>Always on</Text>
                </View>
              </View>
            </View>
          )}

          {/* Sub-tabs */}
          <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 999, padding: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 20, alignSelf: 'flex-start' }}>
            {chatTabs.map((tab) => {
              const active = chatSubTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => {
                    setChatSubTab(tab.key);
                    // Reset teller voor dit type bij openen
                    if (tab.key === 'spot') setSpotsWithUnread({});
                    if (tab.key === 'session') setUnreadBySession({});
                    if (tab.key === 'dm') setUnreadByDm({});
                  }}
                  style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: active ? '#202833' : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 5 }}
                >
                  <Text style={{ color: active ? '#ffffff' : theme.textMuted, fontSize: 13, fontWeight: '800' }}>{tab.label}</Text>
                  {tab.badge > 0 && (
                    <View style={{ minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#4DB8FF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>{tab.badge}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Spot chats */}
          {chatSubTab === 'spot' && (
            <View style={{ gap: 8 }}>
              {favoriteSpots.length === 0 && (
                <Text style={{ color: theme.textMuted, fontSize: 14 }}>You're not following any spots yet. Add spots in the Spots tab.</Text>
              )}
              {favoriteSpots.map((spotName) => {
                const chatData = chatSpotMessages[spotName]
                  ?? Object.entries(chatSpotMessages).find(([k]) => k.toLowerCase() === spotName.toLowerCase())?.[1];
                const msgs = chatData?.messages ?? [];
                const lastMsg = msgs[msgs.length - 1];
                const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                // Directe spotName lookup — geen convId of case matching nodig
                // Directe spotNaam check — geen convId nodig
                const unread = spotsWithUnread[spotName.toLowerCase()] ?? 0;
                return (
                  <Pressable key={spotName} onPress={() => {
                    setExpandedChatSpot(spotName);
                    setSpotsWithUnread((p) => { const n = { ...p }; delete n[spotName.toLowerCase()]; return n; });
                    if (!chatData?.loaded) void loadSpotChatForTab(spotName);
                  }} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14, paddingVertical: 12, gap: 12 }}>
                    <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="location" size={18} color="rgba(255,255,255,0.35)" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontSize: 15, fontWeight: unread > 0 ? '900' : '700' }}>{spotName}</Text>
                      <Text style={{ color: unread > 0 ? theme.textSoft : theme.textMuted, fontSize: 12, marginTop: 2, fontWeight: unread > 0 ? '700' : '400' }} numberOfLines={1}>
                        {lastMsg ? `${lastMsg.display_name}: ${lastMsg.text}` : `Today · ${today}`}
                      </Text>
                    </View>
                    {unread > 0
                      ? <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>{unread}</Text></View>
                      : <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                    }
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Session chats */}
          {chatSubTab === 'session' && (
            <View style={{ gap: 8 }}>
              {chatMySessions.length === 0 && (
                <Text style={{ color: theme.textMuted, fontSize: 14 }}>No sessions planned for today or tomorrow.</Text>
              )}
              {chatMySessions.map((session) => {
                const groupKey = session.group_key ?? session.id;
                const chatData = chatSessionMessages[groupKey];
                const msgs = chatData?.messages ?? [];
                const lastMsg = msgs[msgs.length - 1];
                return (
                  <Pressable key={session.id} onPress={() => { setExpandedChatSpot(null); setExpandedDmId(null); setExpandedChatSession(groupKey); setUnreadBySession((p) => ({ ...p, [groupKey]: 0 })); if (!chatData?.loaded) void loadSessionChatForTab(groupKey, session.spot_name, session.session_day); }} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14, paddingVertical: 12, gap: 12 }}>
                    <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="people" size={18} color="rgba(255,255,255,0.35)" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{session.spot_name}</Text>
                      <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                        {session.start_time ? `${session.session_day} · ${session.start_time}–${session.end_time ?? '?'}` : session.session_day}
                        {lastMsg ? ` · ${lastMsg.text}` : ''}
                      </Text>
                    </View>
                    {(unreadBySession[groupKey] ?? 0) > 0
                      ? <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>{unreadBySession[groupKey]}</Text></View>
                      : <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                    }
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* DMs */}
          {chatSubTab === 'dm' && (
            <View style={{ gap: 8 }}>
              {dmConversations.length === 0 && (
                <View style={{ alignItems: 'center', paddingTop: 40, gap: 12 }}>
                  <Text style={{ fontSize: 32 }}>✉️</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center', maxWidth: 280 }}>
                    No direct messages yet.
                  </Text>
                  <Pressable
                    onPress={() => {
                      setShowChat(false);
                      setShowBuddies(true);
                      setBuddiesTab('myBuddies');
                    }}
                    style={{ backgroundColor: 'rgba(77,184,255,0.15)', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(77,184,255,0.35)' }}
                  >
                    <Text style={{ color: '#4DB8FF', fontSize: 14, fontWeight: '800' }}>Message a buddy →</Text>
                  </Pressable>
                </View>
              )}
              {dmConversations.map((dm) => {
                const isBuddy = followingUserIds.includes(dm.otherUserId);
                return (
                  <Pressable key={dm.id} onPress={() => { setExpandedChatSpot(null); setExpandedChatSession(null); setExpandedDmId(dm.id); setUnreadByDm((p) => ({ ...p, [dm.id]: 0 })); if (!dmMessages[dm.id]) void loadDmMessages(dm.id); }} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14, paddingVertical: 12, gap: 12 }}>
                    <Avatar uri={dm.otherAvatar} size={42} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{dm.otherName}</Text>
                        {isBuddy ? <View style={{ backgroundColor: 'rgba(77,184,255,0.2)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ color: '#4DB8FF', fontSize: 10, fontWeight: '800' }}>BUDDY</Text></View> : <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '800' }}>REQUEST</Text></View>}
                      </View>
                      {dm.lastMessage ? <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{dm.lastMessage}</Text> : null}
                    </View>
                    {(unreadByDm[dm.id] ?? 0) > 0
                      ? <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>{unreadByDm[dm.id]}</Text></View>
                      : <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                    }
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
        )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );

    // Native: eigen shell renderen zodat KAV direct onder de topbar zit
    if (!isWebPlatform) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} onTouchStart={handleNativeSwipeStart} onTouchEnd={handleNativeSwipeEnd}>
          <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
          {renderNativeTopBar()}
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            {isAnyConvOpen ? (
              /* Volledig-scherm chat */
              <View style={{ flex: 1 }}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', gap: 10 }}>
                  <Pressable onPress={handleOpenBack} hitSlop={10} style={{ padding: 4 }}>
                    <Ionicons name="chevron-back" size={22} color={theme.text} />
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{openConvName}</Text>
                    {openConvSub ? <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 1 }}>{openConvSub}</Text> : null}
                  </View>
                </View>
                {/* Berichten */}
                <ScrollView
                  ref={openScrollRef}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
                  keyboardDismissMode="on-drag"
                  keyboardShouldPersistTaps="handled"
                  onContentSizeChange={() => openScrollRef.current?.scrollToEnd({ animated: false })}
                  onLayout={() => openScrollRef.current?.scrollToEnd({ animated: false })}
                >
                  {!openMessages.length
                    ? <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 40 }}>No messages yet. Say something!</Text>
                    : renderChatMessages(openMessages, (uid) => uid === (activeProfile?.id ?? activeAppUserId))
                  }
                </ScrollView>
                {/* Invoerbalk */}
                <View style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 12, backgroundColor: theme.bg, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingLeft: 14, paddingRight: 5, paddingVertical: 5 }}>
                    <TextInput
                      value={openInput}
                      onChangeText={setOpenInput}
                      onSubmitEditing={handleOpenSend}
                      blurOnSubmit={false}
                      placeholder="Type a message…"
                      placeholderTextColor={theme.textMuted}
                      style={{ flex: 1, color: theme.text, paddingVertical: 7, paddingRight: 6, fontSize: 15 }}
                    />
                    <Pressable onPress={handleOpenSend} disabled={!openInput.trim()} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: openInput.trim() ? theme.primary : 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', opacity: openInput.trim() ? 1 : 0.4 }}>
                      <Ionicons name="arrow-up" size={17} color="#ffffff" />
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              /* Lijst-modus */
              <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 100 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>
                  <Pressable onPress={() => setShowMessagesAlertSettings((v) => !v)} style={{ backgroundColor: theme.bgElevated, borderRadius: 999, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '700' }}>Alert settings</Text>
                    <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: showMessagesAlertSettings ? theme.primary : theme.textMuted }} />
                  </Pressable>
                </View>
                {showMessagesAlertSettings && (
                  <View style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', backgroundColor: 'rgba(8,24,39,0.82)', overflow: 'hidden', marginBottom: 16 }}>
                    <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                      <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>Alert settings</Text>
                      <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>Choose who can trigger alerts for chat messages</Text>
                    </View>
                    {([{ key: 'spotChats' as const, label: 'Spot chats', icon: '📍' }, { key: 'sessionChats' as const, label: 'Session chats', icon: '👥' }]).map(({ key, label, icon }, index) => (
                      <View key={key} style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: 'rgba(255,255,255,0.05)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <Text style={{ fontSize: 16 }}>{icon}</Text>
                          <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: '700', flex: 1 }}>{label}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {(['everyone', 'buddies', 'off'] as const).map((opt) => {
                            const selected = messagesAlertSettings[key] === opt;
                            return <Pressable key={opt} onPress={() => setMessagesAlertSettings((prev) => ({ ...prev, [key]: opt }))} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: selected ? 'rgba(77,184,255,0.2)' : 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: selected ? 'rgba(77,184,255,0.45)' : 'rgba(255,255,255,0.07)' }}><Text style={{ color: selected ? '#AEE8FF' : theme.textMuted, fontSize: 11, fontWeight: '800' }}>{opt === 'off' ? 'Off' : opt === 'buddies' ? 'Buddies' : 'Everyone'}</Text></Pressable>;
                          })}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 999, padding: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 16, alignSelf: 'flex-start' }}>
                  {chatTabs.map((tab) => { const active = chatSubTab === tab.key; return <Pressable key={tab.key} onPress={() => { setChatSubTab(tab.key); if (tab.key === 'spot') setSpotsWithUnread({}); if (tab.key === 'session') setUnreadBySession({}); if (tab.key === 'dm') setUnreadByDm({}); }} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: active ? '#202833' : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 5 }}><Text style={{ color: active ? '#ffffff' : theme.textMuted, fontSize: 13, fontWeight: '800' }}>{tab.label}</Text>{tab.badge > 0 && <View style={{ minWidth: 16, height: 16, borderRadius: 8, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}><Text style={{ color: '#000', fontSize: 9, fontWeight: '900' }}>{tab.badge}</Text></View>}</Pressable>; })}
                </View>
                {chatSubTab === 'spot' && <View style={{ gap: 8 }}>
                  {favoriteSpots.length === 0 && <Text style={{ color: theme.textMuted, fontSize: 14 }}>You're not following any spots yet.</Text>}
                  {favoriteSpots.map((spotName) => {
                    const msgs = (chatSpotMessages[spotName] ?? Object.entries(chatSpotMessages).find(([k]) => k.toLowerCase() === spotName.toLowerCase())?.[1])?.messages ?? [];
                    const lastMsg = msgs[msgs.length - 1];
                    const spotUnreadCount = spotsWithUnread[spotName.toLowerCase()] ?? 0;
                    const hasUnread = spotUnreadCount > 0;
                    return <Pressable key={spotName} onPress={() => { setExpandedChatSession(null); setExpandedDmId(null); setExpandedChatSpot(spotName); setSpotsWithUnread(p => { const n = { ...p }; delete n[spotName.toLowerCase()]; return n; }); if (!chatSpotMessages[spotName]?.loaded) void loadSpotChatForTab(spotName); }} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14, paddingVertical: 12, gap: 12 }}>
                      <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="location" size={18} color="rgba(255,255,255,0.35)" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{spotName}</Text>
                        {lastMsg ? <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '400' }} numberOfLines={1}>{lastMsg.display_name}: {lastMsg.text}</Text> : null}
                      </View>
                      {hasUnread
                        ? <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>{spotUnreadCount}</Text></View>
                        : <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                      }
                    </Pressable>;
                  })}
                </View>}
                {chatSubTab === 'session' && <View style={{ gap: 8 }}>
                  {chatMySessions.length === 0 && <Text style={{ color: theme.textMuted, fontSize: 14 }}>No sessions planned for today or tomorrow.</Text>}
                  {chatMySessions.map((session) => {
                    const gk = session.group_key ?? session.id;
                    const msgs = chatSessionMessages[gk]?.messages ?? [];
                    const lastMsg = msgs[msgs.length - 1];
                    const sessionUnread = unreadBySession[gk] ?? 0;
                    return <Pressable key={session.id} onPress={() => { setExpandedChatSpot(null); setExpandedDmId(null); setExpandedChatSession(gk); setUnreadBySession(p => ({ ...p, [gk]: 0 })); if (!chatSessionMessages[gk]?.loaded) void loadSessionChatForTab(gk, session.spot_name, session.session_day); }} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14, paddingVertical: 12, gap: 12 }}>
                      <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="people" size={18} color="rgba(255,255,255,0.35)" /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{session.spot_name}</Text>
                        {lastMsg ? <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={1}>{lastMsg.text}</Text> : <Text style={{ color: theme.textMuted, fontSize: 12 }}>{session.session_day}{session.start_time ? ' · ' + session.start_time : ''}</Text>}
                      </View>
                      {sessionUnread > 0
                        ? <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>{sessionUnread}</Text></View>
                        : <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                      }
                    </Pressable>;
                  })}
                </View>}
                {chatSubTab === 'dm' && <View style={{ gap: 8 }}>
                  {dmConversations.length === 0 && <View style={{ alignItems: 'center', paddingTop: 40, gap: 12 }}><Text style={{ fontSize: 32 }}>✉️</Text><Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center' }}>No DMs yet.</Text><Pressable onPress={() => { setShowChat(false); setShowBuddies(true); setBuddiesTab('myBuddies'); }} style={{ backgroundColor: 'rgba(77,184,255,0.15)', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(77,184,255,0.35)' }}><Text style={{ color: '#4DB8FF', fontSize: 14, fontWeight: '800' }}>Message a buddy →</Text></Pressable></View>}
                  {dmConversations.map((dm) => {
                    const dmUnread = unreadByDm[dm.id] ?? 0;
                    return <Pressable key={dm.id} onPress={() => { setExpandedDmId(dm.id); setUnreadByDm(p => ({ ...p, [dm.id]: 0 })); if (!dmMessages[dm.id]) void loadDmMessages(dm.id); }} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14, paddingVertical: 12, gap: 12 }}>
                      <Avatar uri={dm.otherAvatar} size={42} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{dm.otherName}</Text>
                        {dm.lastMessage ? <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={1}>{dm.lastMessage}</Text> : null}
                      </View>
                      {dmUnread > 0
                        ? <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>{dmUnread}</Text></View>
                        : <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                      }
                    </Pressable>;
                  })}
                </View>}
              </ScrollView>
            )}
          </KeyboardAvoidingView>
          {/* Bottom nav alleen in lijst-modus */}
          {!isAnyConvOpen && renderNativeBottomNav()}
        </SafeAreaView>
      );
    }

    return chatContent;
  }

  if (showBuddies) {
    const normalizedBuddySearch = normalizeSearch(searchUsersInput);
    const followingSet = new Set(followingUserIds);
    const followedUsers = (Array.isArray(buddyUsers) ? buddyUsers : []).filter((u) => followingSet.has(u.id));
    const suggestions = (Array.isArray(buddyUsers) ? buddyUsers : []).filter((u) => !followingSet.has(u.id));
    const filteredSuggestions = normalizedBuddySearch
      ? suggestions.filter((u) => normalizeSearch(u.display_name).includes(normalizedBuddySearch))
      : suggestions;
    const filteredBuddies = normalizedBuddySearch
      ? followedUsers.filter((u) => normalizeSearch(u.display_name).includes(normalizedBuddySearch))
      : followedUsers;

    const UserRow = ({ avatar, name, sub, right }: { avatar: string | null; name: string; sub?: string; right: React.ReactNode }) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 12 }}>
        <Avatar uri={avatar} size={42} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>{name}</Text>
          {sub ? <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>{sub}</Text> : null}
        </View>
        {right}
      </View>
    );

    const TabBtn = ({ label, tab, badge }: { label: string; tab: 'myBuddies' | 'find'; badge?: number }) => {
      const active = buddiesTab === tab;
      return (
        <Pressable
          onPress={() => { setBuddiesTab(tab); setSearchUsersInput(''); setShowAllSuggestions(false); }}
          style={{
            flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10,
            backgroundColor: active ? 'rgba(255,255,255,0.12)' : 'transparent',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: active ? theme.text : theme.textMuted, fontSize: 14, fontWeight: active ? '900' : '700' }}>{label}</Text>
            {badge ? (
              <View style={{ backgroundColor: '#ff3b30', borderRadius: 999, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>{badge}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      );
    };

    return withNativeShell(
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, paddingTop: isWebPlatform ? 20 : 0 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 }}>
          <Text style={{ color: theme.text, fontSize: 26, fontWeight: '900' }}>Buddies</Text>
          <Pressable
            onPress={() => { setShowBuddies(false); setBuddiesError(''); }}
            style={{ display: isWebPlatform ? 'flex' : 'none', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Back home</Text>
          </Pressable>
        </View>

        {/* Tab switcher */}
        <View style={{ flexDirection: 'row', marginHorizontal: 20, marginBottom: 16, backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
          <TabBtn label={`My buddies${followedUsers.length > 0 ? ` (${followedUsers.length})` : ''}`} tab="myBuddies" />
          <TabBtn label="Find" tab="find" badge={incomingFollowRequests.length > 0 ? incomingFollowRequests.length : undefined} />
        </View>

        {/* Search */}
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <TextInput
            value={searchUsersInput}
            onChangeText={setSearchUsersInput}
            placeholder={buddiesTab === 'myBuddies' ? 'Search your buddies' : 'Search riders by name'}
            placeholderTextColor={theme.textMuted}
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              color: theme.text,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
              paddingHorizontal: 14,
              paddingVertical: 10,
              fontSize: 13,
            }}
          />
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>

          {/* MY BUDDIES TAB */}
          {buddiesTab === 'myBuddies' ? (
            <>
              {/* Incoming requests — also visible in My Buddies */}
              {incomingFollowRequests.length > 0 && (
                <View style={{ backgroundColor: 'rgba(77,184,255,0.07)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(77,184,255,0.2)', padding: 14, marginBottom: 16 }}>
                  <Text style={{ color: '#4DB8FF', fontSize: 12, fontWeight: '900', marginBottom: 8, letterSpacing: 0.4 }}>
                    BUDDY REQUESTS · {incomingFollowRequests.length}
                  </Text>
                  {incomingFollowRequests.map((req) => (
                    <UserRow
                      key={`mybuddies-req-${req.id}`}
                      avatar={req.requester?.avatar_url ?? null}
                      name={req.requester?.display_name ?? 'Someone'}
                      sub="wants to buddy up"
                      right={
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Pressable
                            onPress={() => void handleAcceptFollowRequest(req)}
                            disabled={followRequestActionId === req.id}
                            style={{ backgroundColor: '#4DB8FF', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, opacity: followRequestActionId === req.id ? 0.5 : 1 }}
                          >
                            <Text style={{ color: '#061421', fontSize: 12, fontWeight: '900' }}>Accept</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => void handleRejectFollowRequest(req)}
                            disabled={followRequestActionId === req.id}
                            style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', opacity: followRequestActionId === req.id ? 0.5 : 1 }}
                          >
                            <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '700' }}>Decline</Text>
                          </Pressable>
                        </View>
                      }
                    />
                  ))}
                </View>
              )}

              {followedUsers.length === 0 ? (
                <View style={{ alignItems: 'center', paddingTop: 40, gap: 8 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 15 }}>No buddies yet</Text>
                  <Pressable onPress={() => setBuddiesTab('find')}>
                    <Text style={{ color: '#4DB8FF', fontSize: 14, fontWeight: '800' }}>Find riders →</Text>
                  </Pressable>
                </View>
              ) : filteredBuddies.length === 0 ? (
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>No buddies match "{normalizedBuddySearch}"</Text>
              ) : (
                <>
                  {filteredBuddies.map((u) => (
                    <UserRow
                      key={`buddy-list-${u.id}`}
                      avatar={u.avatar_url}
                      name={u.display_name}
                      right={
                        <View style={{ flexDirection: 'row', gap: 8, opacity: buddyActionUserId === u.id ? 0.4 : 1 }}>
                          <Pressable
                            onPress={async () => {
                              const convId = await openDmWithUser(u.id);
                              setShowBuddies(false);
                              if (convId) {
                                setShowChat(true);
                                setChatSubTab('dm');
                                setExpandedDmId(convId);
                                void loadDmMessages(convId);
                                void loadDmConversations();
                              }
                            }}
                            style={{ backgroundColor: 'rgba(77,184,255,0.12)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(77,184,255,0.25)' }}
                          >
                            <Text style={{ color: '#4DB8FF', fontSize: 12, fontWeight: '800' }}>Message</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setViewingOtherUserId(u.id)}
                            style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
                          >
                            <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700' }}>Profile</Text>
                          </Pressable>
                        </View>
                      }
                    />
                  ))}
                  <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 8 }}>Tap "Profile" to view or remove a buddy</Text>
                </>
              )}
            </>
          ) : null}

          {/* FIND TAB */}
          {buddiesTab === 'find' ? (
            <>
              {/* Incoming requests */}
              {incomingFollowRequests.length > 0 ? (
                <View style={{ backgroundColor: 'rgba(77,184,255,0.07)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(77,184,255,0.2)', padding: 14, marginBottom: 16 }}>
                  <Text style={{ color: '#4DB8FF', fontSize: 12, fontWeight: '900', marginBottom: 8, letterSpacing: 0.4 }}>
                    REQUESTS · {incomingFollowRequests.length}
                  </Text>
                  {incomingFollowRequests.map((req) => (
                    <UserRow
                      key={`req-${req.id}`}
                      avatar={req.requester?.avatar_url ?? null}
                      name={req.requester?.display_name ?? 'Someone'}
                      sub="wants to buddy up"
                      right={
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Pressable
                            onPress={() => void handleAcceptFollowRequest(req)}
                            disabled={followRequestActionId === req.id}
                            style={{ backgroundColor: '#4DB8FF', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, opacity: followRequestActionId === req.id ? 0.5 : 1 }}
                          >
                            <Text style={{ color: '#061421', fontSize: 12, fontWeight: '900' }}>Accept</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => void handleRejectFollowRequest(req)}
                            disabled={followRequestActionId === req.id}
                            style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', opacity: followRequestActionId === req.id ? 0.5 : 1 }}
                          >
                            <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '700' }}>Decline</Text>
                          </Pressable>
                        </View>
                      }
                    />
                  ))}
                </View>
              ) : null}

              {/* Suggestions */}
              {loadingBuddies ? (
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>Loading...</Text>
              ) : !normalizedBuddySearch && filteredSuggestions.length === 0 && incomingFollowRequests.length === 0 ? (
                <View style={{ alignItems: 'center', paddingTop: 30, gap: 6 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 15 }}>Search for riders by name</Text>
                </View>
              ) : filteredSuggestions.length === 0 && normalizedBuddySearch ? (
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>No riders found for "{normalizedBuddySearch}"</Text>
              ) : (
                <>
                  {buddiesError ? <Text style={{ color: '#ff7e7e', fontSize: 13, marginBottom: 8 }}>{buddiesError}</Text> : null}
                  {(showAllSuggestions || normalizedBuddySearch ? filteredSuggestions : filteredSuggestions.slice(0, 20)).map((u) => {
                    const isPending = outgoingFollowStatusesByUserId[u.id] === 'pending';
                    const inFlight = buddyActionUserId === u.id;
                    const via = recommendedViaBuddyNameByUserId[u.id];
                    return (
                      <UserRow
                        key={`sug-${u.id}`}
                        avatar={u.avatar_url}
                        name={u.display_name}
                        sub={via ? `via ${via}` : undefined}
                        right={
                          <Pressable
                            onPress={() => !isPending && !inFlight && void handleFollowUser(u.id)}
                            disabled={isPending || inFlight}
                            style={{
                              backgroundColor: isPending ? 'rgba(255,255,255,0.06)' : 'rgba(77,184,255,0.15)',
                              borderRadius: 999,
                              paddingHorizontal: 14,
                              paddingVertical: 7,
                              borderWidth: 1,
                              borderColor: isPending ? 'rgba(255,255,255,0.08)' : 'rgba(77,184,255,0.35)',
                              opacity: inFlight ? 0.5 : 1,
                            }}
                          >
                            <Text style={{ color: isPending ? theme.textMuted : '#4DB8FF', fontSize: 12, fontWeight: '800' }}>
                              {inFlight ? '...' : isPending ? 'Requested' : 'Add'}
                            </Text>
                          </Pressable>
                        }
                      />
                    );
                  })}
                  {!showAllSuggestions && !normalizedBuddySearch && filteredSuggestions.length > 20 ? (
                    <Pressable onPress={() => setShowAllSuggestions(true)} style={{ paddingVertical: 14, alignItems: 'center' }}>
                      <Text style={{ color: '#4DB8FF', fontSize: 13, fontWeight: '800' }}>Show {filteredSuggestions.length - 20} more</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </>
          ) : null}

        </ScrollView>
      </SafeAreaView>
    );
  }

  if (showProfile) {
    const handlePickProfileAvatar = async () => {
      setProfileEditError('');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setProfileEditError('Allow photo access to choose a profile photo');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (result.canceled) return;

      const uri = result.assets[0].uri;
      setProfileAvatarInputUri(uri);
      setIsSavingProfile(true);

      const avatarUploadId = activeProfile?.id ?? session.user.id;
      const { error: uploadError, publicUrl } = await uploadAvatar(avatarUploadId, uri);

      if (uploadError || !publicUrl) {
        setIsSavingProfile(false);
        setProfileEditError('Photo upload failed. Please try again.');
        setProfileAvatarInputUri(null);
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', avatarUploadId);

      setIsSavingProfile(false);

      if (updateError) {
        setProfileEditError('Failed to update photo. Please try again.');
        setProfileAvatarInputUri(null);
        return;
      }

      setProfile((prev) => prev ? { ...prev, avatar_url: publicUrl } : prev);
      setProfileAvatarInputUri(null);
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

    const goBack = () => {
      setShowProfile(false);
      setProfileAvatarInputUri(null);
      setProfileEditError('');
      setIsEditingProfileName(false);
    };

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, paddingHorizontal: 20, paddingTop: isWebPlatform ? 20 : 0 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingVertical: 14 }}>
          <Pressable
            onPress={goBack}
            style={{ display: isWebPlatform ? 'flex' : 'none', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Back home</Text>
          </Pressable>
        </View>

        {/* Avatar + naam */}
        <View style={{ alignItems: 'center', marginVertical: 28 }}>
          <Avatar uri={profile.avatar_url} size={90} nationality={profile.nationality} />
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900', marginTop: 14 }}>{profile.display_name}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>{session.user.email}</Text>
        </View>

        {/* Acties */}
        <View style={{ gap: 10 }}>
          <Pressable
            onPress={() => void handlePickProfileAvatar()}
            disabled={isSavingProfile}
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.10)',
              alignItems: 'center',
              opacity: isSavingProfile ? 0.6 : 1,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>
              {isSavingProfile ? 'Uploading photo…' : 'Change photo'}
            </Text>
          </Pressable>

          {/* Nationaliteit */}
          <Pressable
            onPress={() => setShowNationalityPicker((v) => { if (v) setNationalitySearch(''); return !v; })}
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: showNationalityPicker ? 'rgba(77,184,255,0.4)' : 'rgba(255,255,255,0.10)',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '700' }}>Nationality</Text>
            <Text style={{ color: theme.text, fontSize: 14 }}>
              {(() => { const c = getCountry(profile.nationality); return c ? `${c.flag}  ${c.name}` : 'Not set'; })()}
            </Text>
          </Pressable>

          {showNationalityPicker ? (
            <View style={{
              backgroundColor: 'rgba(8,24,39,0.95)',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
              maxHeight: 320,
              overflow: 'hidden',
            }}>
              <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                <TextInput
                  value={nationalitySearch}
                  onChangeText={setNationalitySearch}
                  placeholder="Search country…"
                  placeholderTextColor={theme.textMuted}
                  autoFocus
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    color: theme.text,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    fontSize: 14,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.08)',
                  }}
                />
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                {(() => {
                  const q = nationalitySearch.trim().toLowerCase();
                  return COUNTRIES.filter((c) => !q || c.name.toLowerCase().includes(q));
                })().map((country) => {
                  const isSelected = profile.nationality === country.code;
                  return (
                    <Pressable
                      key={country.code}
                      onPress={async () => {
                        setShowNationalityPicker(false);
                        setNationalitySearch('');
                        const { error } = await supabase
                          .from('profiles')
                          .update({ nationality: country.code })
                          .eq('id', activeAppUserId);
                        if (!error) {
                          setProfile((prev) => prev ? { ...prev, nationality: country.code } : prev);
                        }
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        backgroundColor: isSelected ? 'rgba(77,184,255,0.12)' : 'transparent',
                        borderBottomWidth: 1,
                        borderBottomColor: 'rgba(255,255,255,0.05)',
                        gap: 12,
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>{country.flag}</Text>
                      <Text style={{ color: isSelected ? '#4DB8FF' : theme.text, fontSize: 14, fontWeight: isSelected ? '800' : '600', flex: 1 }}>
                        {country.name}
                      </Text>
                      {isSelected ? <Text style={{ color: '#4DB8FF', fontSize: 16 }}>✓</Text> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {/* Skill level */}
          <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }}>
            <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 12 }}>Skill level</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([
                { level: 1, name: 'Grom' },
                { level: 2, name: 'Ripper' },
                { level: 3, name: 'Freerider' },
                { level: 4, name: 'Shredder' },
                { level: 5, name: 'Storm Chaser' },
              ] as const).map(({ level, name }) => {
                const isSelected = profile.skill_level === level;
                return (
                  <Pressable
                    key={`skill-${level}`}
                    onPress={async () => {
                      const newLevel = isSelected ? null : level;
                      const { error } = await supabase.from('profiles').update({ skill_level: newLevel }).eq('id', activeAppUserId);
                      if (!error) setProfile((prev) => prev ? { ...prev, skill_level: newLevel } : prev);
                    }}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 8,
                      borderRadius: 10,
                      backgroundColor: isSelected ? 'rgba(77,184,255,0.18)' : 'rgba(255,255,255,0.04)',
                      borderWidth: 1,
                      borderColor: isSelected ? 'rgba(77,184,255,0.4)' : 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <Text style={{ color: isSelected ? '#4DB8FF' : theme.textMuted, fontSize: 18, marginBottom: 2 }}>{'⬤'}</Text>
                    <Text style={{ color: isSelected ? '#4DB8FF' : theme.textMuted, fontSize: 9, fontWeight: '800', textAlign: 'center' }} numberOfLines={1}>{name}</Text>
                  </Pressable>
                );
              })}
            </View>
            {profile.skill_level ? (
              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 10, textAlign: 'center' }}>
                {['', 'Grom — just started', 'Ripper — first real rides', 'Freerider — comfortable riding', 'Shredder — big air & toeside', 'Storm Chaser — heavy conditions'][profile.skill_level]}
              </Text>
            ) : null}
          </View>

          {profileEditError ? <Text style={{ color: '#ff7e7e', fontSize: 12, textAlign: 'center' }}>{profileEditError}</Text> : null}

          <Pressable
            onPress={() => { resetFlow(); void supabase.auth.signOut(); }}
            style={{ marginTop: 8, borderRadius: 14, padding: 14, alignItems: 'center' }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, fontWeight: '600' }}>Log out</Text>
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

    const liveCount = new Set(liveSessions.map((s) => s.userId).filter(Boolean)).size;
    const goingCount = new Set(goingSessions.map((s) => s.userId).filter(Boolean)).size;
    const maybeCount = new Set(maybeSessions.map((s) => s.userId).filter(Boolean)).size;
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

      const groupSenderId = activeProfile?.id ?? activeAppUserId ?? null;
      if (groupSenderId && selectedSpot && selectedDayKey) {
        void supabase.rpc('create_chat_notification', {
          actor_profile_id: groupSenderId,
          spot_name_param: selectedSpot,
          session_day_param: selectedDayKey,
          message_preview_param: messageText,
        }).then(({ data: recipients, error: rpcError }) => {
          console.log('GROUP_CHAT_NOTIF_RPC', { groupSenderId, selectedSpot, selectedDayKey, recipients, rpcError });
          const ids = (recipients ?? []).map((r: { recipient_profile_id: string }) => r.recipient_profile_id).filter(Boolean);
          const actorName = activeProfile?.display_name?.trim() || 'Someone';
          void sendPushToRecipients(ids, `${actorName} in group chat`, messageText, { type: 'chat_message', spotName: selectedSpot });
        });
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
      const senderId = activeProfile?.id ?? activeAppUserId ?? null;


      if (!messageText || !selectedSpot || !senderId) {
        return;
      }

      const payload = {
        user_id: senderId,
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
          console.error('SPOT_CHAT_CONVERSATION_CREATE_ERROR', createConversationResponse.error);
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
        console.error('SPOT_CHAT_INSERT_ERROR', error);
        return;
      }

      if (senderId && selectedSpot && selectedDayKey) {
        void supabase.rpc('create_chat_notification', {
          actor_profile_id: senderId,
          spot_name_param: selectedSpot,
          session_day_param: selectedDayKey,
          message_preview_param: messageText,
        }).then(({ data: recipients, error: rpcError }) => {
          console.log('CHAT_NOTIF_RPC', { senderId, selectedSpot, selectedDayKey, recipients, rpcError });
          const ids = (recipients ?? []).map((r: { recipient_profile_id: string }) => r.recipient_profile_id).filter(Boolean);
          void sendPushToRecipients(ids, `New message at ${selectedSpot}`, messageText, { type: 'chat_message', spotName: selectedSpot });
        });
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
      logSessionUiActionStart({
        type: 'joinSession',
        selectedSpot,
        activeDay,
      });
      try {
        const result = await joinSessionAction(input);
        const joinResultReason = 'reason' in result ? result.reason : null;
        logSessionUiActionResult('joinSession', result);
        if (!result.ok) {
          const joinReason = joinResultReason;
          console.error('JOIN_FAILED', joinReason, result);
          setSessionActionError(getJoinErrorMessageByReason(joinReason) || `Join failed: ${joinReason}`);
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

  if (!activeProfile?.id || !selectedSpot) return;

  const now = new Date();

  const start = now;
  const end = new Date(now.getTime() + (2 * 60 * 60 * 1000));

};

const handleSave = async () => {
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
      const result = await planSessionAction(input);
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
        let formErrorMessage: string;
        if (resultReason === 'USER_ALREADY_HAS_SESSION_ON_SPOT_DAY') {
          formErrorMessage = 'You already have a session at this spot during this time.';
        } else if (resultReason === 'USER_ALREADY_HAS_SESSION_SAME_TIME_OTHER_SPOT') {
          formErrorMessage = 'You already have a session at another spot during this time.';
        } else {
          formErrorMessage = getSessionPersistenceErrorMessage(persistenceError, 'Planning the session failed. Please try again.');
        }
        setFormError(formErrorMessage);
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

      // Smart follow prompt: als de spot nog niet gevolgd wordt
      if (selectedSpot && !favoriteSpots.includes(selectedSpot) && !editingSessionId) {
        setFollowPromptSpot(selectedSpot);
      }

      const planningActorId = activeProfile?.id ?? null;
      const plannedSessionId = 'data' in result && result.data ? result.data.id : null;
      if (planningActorId && selectedSpot && selectedPlanningDateKey && plannedSessionId && !editingSessionId) {
        void supabase.rpc('create_session_planning_notification', {
          actor_profile_id: planningActorId,
          spot_name_param: selectedSpot,
          session_day_param: selectedPlanningDateKey,
          session_id_param: plannedSessionId,
        }).then(({ data: recipients }) => {
          const ids = (recipients ?? []).map((r: { recipient_profile_id: string }) => r.recipient_profile_id).filter(Boolean);
          const actorName = activeProfile?.display_name?.trim() || 'Someone';
          void sendPushToRecipients(ids, `${actorName} planned a session`, `${actorName} is going to ${selectedSpot}`, { type: 'session_planned', spotName: selectedSpot });
        });
      }
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
      flex: 0,
      alignSelf: 'flex-start',
      borderRadius: 999,
      minHeight: 0,
      paddingVertical: 6,
      paddingHorizontal: 11,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
    } as const;
    const autoCheckoutBanner = autoCheckoutNotice ? (
      <View style={{ backgroundColor: '#16324d',  borderColor: '#2f5f86', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }}>
        <Text style={{ color: '#d9eeff', fontSize: 13, fontWeight: '700' }}>Automatically checked out</Text>
        <Text style={{ color: '#d9eeff', fontSize: 13, marginTop: 2 }}>You appear to have left the spot</Text>
      </View>
    ) : null;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} onTouchStart={handleNativeSwipeStart} onTouchEnd={handleNativeSwipeEnd}>
        <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
        {renderNativeTopBar()}
        <ScrollView
          ref={spotDetailScrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentInset={Platform.OS === 'ios' ? { bottom: 90 } : undefined}
          style={{ flex: 1, backgroundColor: theme.bg }}
          contentContainerStyle={{ paddingHorizontal: isWebPlatform ? 20 : 14, paddingTop: isWebPlatform ? 10 : 16, paddingBottom: isWebPlatform ? 120 : 0 }}
        >
        <Pressable onPress={() => setSelectedSpot(null)} style={{ marginBottom: 10 }}>
          <Text style={{ color: theme.textSoft, fontSize: 15, letterSpacing: 0.2 }}>← Back to spots</Text>
        </Pressable>

        {!isSelectedSpotSaved && canAddSelectedSpotToMySpots ? (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 }}>
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
          </View>
        ) : null}
        {autoCheckoutBanner}

        <View style={{ backgroundColor: 'transparent', borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 4, marginBottom: 0, borderWidth: 0, borderBottomWidth: 0, borderColor: 'transparent' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: isWebPlatform ? 28 : 25, fontWeight: '900', letterSpacing: -0.4, paddingRight: 8 }} numberOfLines={2}>{selectedSpot}</Text>
              <Text style={{ color: liveCount > 0 ? '#5EF0D0' : theme.textMuted, fontSize: 13, fontWeight: '800', marginTop: 5 }}>
                {liveCount > 0 ? 'Live now' : 'No one live now'}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setIsNotificationPanelExpanded((prev) => !prev);
              }}
              style={{
                borderRadius: 999,
                
                borderColor: theme.border,
                backgroundColor: theme.bgElevated,
                paddingHorizontal: isWebPlatform ? 10 : 8,
                paddingVertical: isWebPlatform ? 6 : 5,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text style={{ color: theme.textSoft, fontSize: isWebPlatform ? 13 : 11, fontWeight: '700' }}>Alert settings</Text>
              <View style={{ width: 6, height: 8, borderRadius: 999, backgroundColor: areAnySpotBuzzEnabled ? theme.primary : theme.textMuted }} />
            </Pressable>
          </View>
          
          {false && selectedSpotMomentumLabel ? (
            <View style={{ alignSelf: 'flex-start', marginTop: 8, borderRadius: 999,  borderColor: theme.border, backgroundColor: theme.bgElevated, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '700' }}>{selectedSpotMomentumLabel}</Text>
            
</View>
          ) : null}
          {isNotificationPanelExpanded ? (
            <View
              style={{
                marginTop: 10,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.07)',
                backgroundColor: 'rgba(8,24,39,0.82)',
                overflow: 'hidden',
              }}
            >
              <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>Alert settings</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>Choose who can trigger alerts for this spot</Text>
              </View>

              {spotNotificationPreferencesModel.map((preference, index) => {
                const currentValue = spotNotificationPreferences[preference.dbField];
                const icons: Record<string, string> = {
                  sessionPlanning: '📅',
                  checkin: '📍',
                  sessionJoined: '👥',
                };

                return (
                  <View
                    key={preference.key}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: 'rgba(255,255,255,0.05)',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <Text style={{ fontSize: 16 }}>{icons[preference.key] ?? '🔔'}</Text>
                      <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: '700', flex: 1 }}>
                        {preference.label}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {notificationModeOptions.map((option) => {
                        const selected = currentValue === option.value;
                        return (
                          <Pressable
                            key={option.value}
                            onPress={async () => {
                              const nextPreferences = { ...spotNotificationPreferences, [preference.dbField]: option.value };
                              setSpotNotificationPreferences(nextPreferences);
                              const ok = await saveSpotNotificationPreferences(nextPreferences, preference.key);
                              if (!ok) setSpotNotificationPreferences(spotNotificationPreferences);
                            }}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 8,
                              backgroundColor: selected ? 'rgba(77,184,255,0.2)' : 'rgba(255,255,255,0.04)',
                              borderWidth: 1,
                              borderColor: selected ? 'rgba(77,184,255,0.45)' : 'rgba(255,255,255,0.07)',
                            }}
                          >
                            <Text style={{ color: selected ? '#AEE8FF' : theme.textMuted, fontSize: 11, fontWeight: '800' }}>
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              {notificationPreferencesError ? (
                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                  <Text style={{ color: '#FF7B7B', fontSize: 12, fontWeight: '600' }}>{notificationPreferencesError}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        
{isWebPlatform ? (
          <TargetSpotSummaryCards
            metrics={[
              ...(activeDay === 'today' ? [{ icon: '⚡', label: 'LIVE' as const, helper: 'Checked in', value: liveCount, color: '#5EF0D0', sessions: liveSessions }] : []),
              { icon: '👥', label: 'GOING' as const, helper: 'Definitely coming', value: goingCount, color: '#4DB8FF', sessions: goingSessions },
              { icon: '◌', label: 'MAYBE' as const, helper: 'Might come', value: maybeCount, color: '#5F83A6', sessions: maybeSessions },
            ]}
          />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12, marginBottom: 14 }}>
            {[
              ...(activeDay === 'today' ? [{ label: 'LIVE', helper: 'Checked in', value: liveCount, color: '#5EF0D0', sessions: liveSessions }] : []),
              { label: 'GOING', helper: 'Definitely coming', value: goingCount, color: '#4DB8FF', sessions: goingSessions },
              { label: 'MAYBE', helper: 'Might come', value: maybeCount, color: '#5F83A6', sessions: maybeSessions },
            ].map((metric) => (
              <View
                key={`mobile-summary-${metric.label}`}
                style={{
                  width: '48.5%',
                  minHeight: 84,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.075)',
                  backgroundColor: 'rgba(8,24,39,0.52)',
                  padding: 10,
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  {metric.label === 'LIVE' ? <Zap size={22} color={metric.color} strokeWidth={2.5} /> : metric.label === 'GOING' ? <Users size={22} color={metric.color} strokeWidth={2.5} /> : <HelpCircle size={22} color={metric.color} strokeWidth={2.5} />}
                  <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900' }}>{metric.value}</Text>
                </View>
                <View>
                  <Text style={{ color: metric.color, fontSize: 11, fontWeight: '900' }}>{metric.label}</Text>
                  <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: '700', marginTop: 3 }}>{metric.helper}</Text>
                </View>
              </View>
            ))}
          </View>
        )}


<View style={{ marginTop: isWebPlatform ? 10 : 6, marginBottom: isWebPlatform ? 18 : 14, gap: 10 }}>

          {/* Check in CTA */}
          {checkInCtaVisible ? (
            <Pressable
              onPress={() => void handleUpdateSessionStatus('Is er al')}
              style={{
                backgroundColor: '#5EF0D0',
                borderRadius: 16,
                paddingVertical: 16,
                paddingHorizontal: 20,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#061421' }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#061421', fontSize: 15, fontWeight: '900' }}>Check in now</Text>
                <Text style={{ color: 'rgba(6,20,33,0.65)', fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                  {selectedSpotDistanceMeters !== null ? `${Math.round(selectedSpotDistanceMeters)} m from the spot` : 'You\'re at the spot'}
                </Text>
              </View>
            </Pressable>
          ) : null}

          {/* Plan session */}
          {topCtaMode === 'plan' ? (
            <Pressable
              onPress={() => { if (!hasOwnSessionOnSelectedSpotDay) openEmptyPlanningForm(); }}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.12)',
                backgroundColor: 'rgba(255,255,255,0.06)',
                paddingVertical: 14,
                paddingHorizontal: 20,
                alignItems: 'center',
                alignSelf: isWebPlatform ? 'flex-start' : 'stretch',
              }}
            >
              <Text style={{ color: theme.textSoft, fontSize: 14, fontWeight: '700' }}>Plan a session</Text>
            </Pressable>
          ) : null}

          {/* Edit mode: checked in or session planned */}
          {topCtaMode === 'edit' ? (
            <View style={{ gap: 10 }}>
              {canCheckOut ? (
                <View style={{
                  backgroundColor: 'rgba(8,24,39,0.72)',
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(94,240,208,0.18)',
                  padding: 16,
                  gap: 12,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#5EF0D0' }} />
                    <Text style={{ color: '#5EF0D0', fontSize: 13, fontWeight: '800' }}>You're live</Text>
                    {activeCheckedInSession?.checkedInAt ? (
                      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>
                        since {formatToHourMinute(activeCheckedInSession.checkedInAt)}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => void handleUpdateSessionStatus('Uitchecken')}
                    style={{
                      backgroundColor: 'rgba(139,31,56,0.85)',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: 'rgba(255,95,125,0.25)',
                      paddingVertical: 12,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '900' }}>Check out</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.045)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.06)',
                    borderRadius: 999,
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                  }}
                >
                  <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '700' }}>☰ Manage</Text>
                </Pressable>
                {ownSessionCount === 1 ? (
                  <Pressable
                    disabled={!joinedSession || !canCancelJoinedSession}
                    onPress={() => { if (joinedSession && canCancelJoinedSession) void handleCancelPlannedSession(); }}
                    style={{
                      backgroundColor: 'rgba(255,95,125,0.10)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,95,125,0.18)',
                      borderRadius: 999,
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      opacity: joinedSession && canCancelJoinedSession ? 1 : 0.35,
                    }}
                  >
                    <Text style={{ color: '#ffb8c4', fontSize: 12, fontWeight: '700' }}>× Cancel</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => { setShowManageSessions(false); setSessionActionError(''); openEmptyPlanningForm(); }}
                  style={{
                    borderRadius: 999,
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.06)',
                    backgroundColor: 'rgba(255,255,255,0.045)',
                  }}
                >
                  <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '700' }}>＋ Add session</Text>
                </Pressable>
                {showManageSessions ? (
                  <Pressable onPress={() => setShowManageSessions(false)} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
                    <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700' }}>Close</Text>
                  </Pressable>
                ) : null}
              </View>
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
              {ownActiveSessions.map((sessionItem) => {
                const toMinutes = (value?: string | null) => {
                  if (!value) return null;
                  const [h, m] = value.split(':').map(Number);
                  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
                  return h * 60 + m;
                };

                const myStart = toMinutes(sessionItem.start);
                const myEnd = toMinutes(sessionItem.end);
                const overlaps = myStart !== null && myEnd !== null && myEnd > myStart
                  ? (spotState.sessionsForSpot ?? [])
                    .filter((otherSession) => otherSession.id !== sessionItem.id)
                    .map((otherSession) => {
                      const otherStart = toMinutes(otherSession.start);
                      const otherEnd = toMinutes(otherSession.end);
                      if (otherStart === null || otherEnd === null || otherEnd <= otherStart) return null;

                      const overlapMinutes = Math.max(0, Math.min(myEnd, otherEnd) - Math.max(myStart, otherStart));
                      if (overlapMinutes <= 0) return null;

                      const overlapPercent = Math.round((overlapMinutes / (myEnd - myStart)) * 100);
                      if (overlapPercent < 25) return null;

                      return {
                        name: otherSession.userName || 'Someone',
                        overlapPercent,
                      };
                    })
                    .filter(Boolean)
                    .slice(0, 1)
                  : [];

                const primaryOverlap = overlaps[0];

                return (
                  <View key={sessionItem.id} style={{ borderColor: theme.border, borderRadius: 14, paddingVertical: 8, gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>
                        {sessionItem.start} - {sessionItem.end}
                      </Text>

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
                        style={{
                          minWidth: 78,
                          borderRadius: 999,
                          paddingVertical: 8,
                          paddingHorizontal: 14,
                          backgroundColor: 'rgba(255,255,255,0.045)',
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.06)',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: '700' }}>Edit</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          void handleCancelPlannedSession(sessionItem);
                          setShowManageSessions(false);
                        }}
                        style={{
                          minWidth: 78,
                          borderRadius: 999,
                          paddingVertical: 8,
                          paddingHorizontal: 14,
                          backgroundColor: 'rgba(255,95,125,0.10)',
                          borderWidth: 1,
                          borderColor: 'rgba(255,95,125,0.18)',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: '#ffb8c4', fontSize: 13, fontWeight: '700' }}>Cancel</Text>
                      </Pressable>

                      {primaryOverlap ? (
                        <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '600' }}>
                          {primaryOverlap.overlapPercent}% overlap with {primaryOverlap.name}
                        </Text>
                      ) : (
                        <Text style={{ color: '#64748b', fontSize: 12 }}>
                          no overlap
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
          <Text style={{ color: theme.textSoft, fontSize: isWebPlatform ? 12 : 13, marginTop: 8, lineHeight: 18 }}>{headerHelperText}</Text>
          {sessionActionError ? <Text style={{ color: '#ff7e7e', fontSize: 14, marginTop: 8 }}>{sessionActionError}</Text> : null}

          {showForm ? (
            <View
              style={{
                marginTop: 12,
                maxWidth: 640,
                alignSelf: 'flex-start',
                backgroundColor: 'rgba(8,24,39,0.52)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.06)',
                borderRadius: 18,
                padding: 12,
                gap: 10,
              }}
            >
              {isWebPlatform ? (
                /* Web: grid pickers */
                <>
                  <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 }}>Start time</Text>
                  <View style={{ flexDirection: 'row', gap: 8, width: 420, maxWidth: '100%' }}>
                    <Pressable onPress={() => { setActivePicker((prev) => (prev === 'startHour' ? null : 'startHour')); setFormError(''); }} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 14, borderWidth: 1, borderColor: activePicker === 'startHour' ? 'rgba(77,184,255,0.4)' : 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 9 }}>
                      <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 }}>Hour</Text>
                      <Text style={{ color: startHour === null ? theme.textMuted : theme.text, fontSize: 20, fontWeight: '700' }}>{startHour === null ? '--' : formatTimePart(startHour)}</Text>
                    </Pressable>
                    <Pressable onPress={() => { setActivePicker((prev) => (prev === 'startMinute' ? null : 'startMinute')); setFormError(''); }} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 14, borderWidth: 1, borderColor: activePicker === 'startMinute' ? 'rgba(77,184,255,0.4)' : 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 9 }}>
                      <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 }}>Minute</Text>
                      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>{formatTimePart(startMinute)}</Text>
                    </Pressable>
                  </View>
                  {activePicker === 'startHour' && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                      {startHourOptions.map((hour) => (
                        <Pressable key={`sh-${hour}`} onPress={() => { setStartHour(hour); if (planningNowReference.isToday) { const e = minuteOptions.find((m) => (hour * 60) + m >= planningNowReference.earliestStartMinutes); if (e !== undefined && startMinute < e) setStartMinute(e); } }} style={{ backgroundColor: startHour === hour ? theme.primary : theme.bgElevated, borderColor: theme.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, marginRight: 6, marginBottom: 6 }}>
                          <Text style={{ color: theme.text }}>{formatTimePart(hour)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {activePicker === 'startMinute' && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                      {minuteOptions.filter((m) => startHour !== null && (!planningNowReference.isToday || (startHour * 60) + m >= planningNowReference.earliestStartMinutes) && (startHour * 60) + m <= planningNowReference.latestPlanningStartMinutes).map((m) => (
                        <Pressable key={`sm-${m}`} onPress={() => setStartMinute(m)} style={{ backgroundColor: startMinute === m ? theme.primary : theme.bgElevated, borderColor: theme.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, marginRight: 6, marginBottom: 6 }}>
                          <Text style={{ color: theme.text }}>{formatTimePart(m)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 }}>End time</Text>
                  <View style={{ flexDirection: 'row', gap: 8, width: 420, maxWidth: '100%' }}>
                    <Pressable onPress={() => { setActivePicker((prev) => (prev === 'endHour' ? null : 'endHour')); setFormError(''); }} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 14, borderWidth: 1, borderColor: activePicker === 'endHour' ? 'rgba(77,184,255,0.4)' : 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 9 }}>
                      <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 }}>Hour</Text>
                      <Text style={{ color: endHour === null ? theme.textMuted : theme.text, fontSize: 20, fontWeight: '700' }}>{endHour === null ? '--' : formatTimePart(endHour)}</Text>
                    </Pressable>
                    <Pressable onPress={() => { setActivePicker((prev) => (prev === 'endMinute' ? null : 'endMinute')); setFormError(''); }} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 14, borderWidth: 1, borderColor: activePicker === 'endMinute' ? 'rgba(77,184,255,0.4)' : 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 9 }}>
                      <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 }}>Minute</Text>
                      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>{formatTimePart(endMinute)}</Text>
                    </Pressable>
                  </View>
                  {activePicker === 'endHour' && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                      {(Array.isArray(hours) ? hours : []).filter((h) => h >= 8 && h <= 22).map((h) => (
                        <Pressable key={`eh-${h}`} onPress={() => setEndHour(h)} style={{ backgroundColor: endHour === h ? theme.primary : theme.bgElevated, borderColor: theme.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, marginRight: 6, marginBottom: 6 }}>
                          <Text style={{ color: theme.text }}>{formatTimePart(h)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {activePicker === 'endMinute' && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                      {minuteOptions.map((m) => (
                        <Pressable key={`em-${m}`} onPress={() => setEndMinute(m)} style={{ backgroundColor: endMinute === m ? theme.primary : theme.bgElevated, borderColor: theme.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, marginRight: 6, marginBottom: 6 }}>
                          <Text style={{ color: theme.text }}>{formatTimePart(m)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </>
              ) : (
                /* Native: wheel pickers */
                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 2 }}>
                    <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>Van</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>Tot</Text>
                  </View>
                <View style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-start', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 10 }}>
                  <WheelPicker
                    values={startHourOptions}
                    selected={startHour}
                    onSelect={(h) => {
                      setStartHour(h);
                      if (planningNowReference.isToday) {
                        const earliest = minuteOptions.find((m) => (h * 60) + m >= planningNowReference.earliestStartMinutes);
                        if (earliest !== undefined && startMinute < earliest) setStartMinute(earliest);
                      }
                    }}
                    label="Uur"
                    formatVal={formatTimePart}
                  />
                  <WheelPicker values={minuteOptions} selected={startMinute} onSelect={setStartMinute} label="Min" formatVal={formatTimePart} />
                  <View style={{ alignSelf: 'center', paddingTop: 18, paddingHorizontal: 4 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 22, fontWeight: '300' }}>→</Text>
                  </View>
                  <WheelPicker
                    values={(Array.isArray(hours) ? hours : []).filter((h) => h >= 8 && h <= 22)}
                    selected={endHour}
                    onSelect={setEndHour}
                    label="Uur"
                    formatVal={formatTimePart}
                  />
                  <WheelPicker values={minuteOptions} selected={endMinute} onSelect={setEndMinute} label="Min" formatVal={formatTimePart} />
                </View>
                </View>
              )}
              <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 }}>
                Intent
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'flex-start' }}>
                {sessionIntentOptions.map((option) => {
                  const isActive = intent === option.value;
                  return (
                    <Pressable
                      key={`intent-${option.value}`}
                      onPress={() => {
                        setIntent(option.value);
                        
                      }}
                      style={{
                        minWidth: 120,
                        backgroundColor: isActive
                          ? (option.value === 'definitely' ? '#4DB8FF' : '#5F83A6')
                          : 'rgba(255,255,255,0.045)',
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: isActive ? 'transparent' : 'rgba(255,255,255,0.10)',
                        paddingVertical: 8,
                        paddingHorizontal: 12,
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

              <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-start', alignItems: 'center', flexWrap: 'wrap' }}>
                <Pressable
                  onPress={() => {
                    void handleSave();
                  }}
                  style={{ ...primaryButtonStyle, width: 120, paddingVertical: 8, minHeight: 0, borderRadius: 14 }}
                >
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{editingSessionId ? 'Update' : 'Save'}</Text>
                </Pressable>
                <Pressable onPress={resetForm} style={{ ...primaryButtonStyle, width: 120, backgroundColor: 'rgba(255,255,255,0.045)', paddingVertical: 8, minHeight: 0, borderRadius: 14 }}>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        <View style={{ backgroundColor: 'transparent', padding: 0, marginBottom: isWebPlatform ? 14 : 18 }}>
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
          <View style={{ marginBottom: isWebPlatform ? 14 : 8 }}>
            <View style={{ height: 16, position: 'relative', overflow: 'hidden' }}>
              {(() => {
                const totalMinutes = Math.max(timelineWindow.endMinutes - timelineWindow.startMinutes, 1);
                const useEveryTwoHours = !isWebPlatform && totalMinutes > 600;
                return timelineLabels
                  .filter((item) => !useEveryTwoHours || item.minutes % 120 === 0 || item.minutes === timelineWindow.startMinutes)
                  .map((item) => {
                    const leftPercent = clamp(((item.minutes - timelineWindow.startMinutes) / totalMinutes) * 100, 0, 100);
                    return (
                      <Text
                        key={item.label}
                        style={{
                          position: 'absolute',
                          left: `${leftPercent}%`,
                          color: theme.textMuted,
                          fontSize: 11,
                        }}
                      >
                        {item.label}
                      </Text>
                    );
                  });
              })()}
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
              // Navigate naar Messages tab > Session chats en open direct die groepschat
              if (!selectedSpot || !selectedDayKey) return;
              void loadSessionChatForTab(groupKey, selectedSpot, selectedDayKey);
              setActiveChatSpot(null); // voorkom dat activeChatSpot effect expandedChatSpot overschrijft
              setExpandedChatSpot(null);
              setExpandedDmId(null);
              setChatSubTab('session');
              setExpandedChatSession(groupKey);
              // Voeg de sessie ook toe aan chatMySessions als die er nog niet in zit
              setChatMySessions((prev) => {
                if (prev.some((s) => (s.group_key ?? s.id) === groupKey)) return prev;
                return [...prev, { id: groupKey, group_key: groupKey, spot_name: selectedSpot, session_day: selectedDayKey, start_time: null, end_time: null, user_id: activeAppUserId }];
              });
              setShowChat(true);
              setSelectedSpot(null);
            }}
            activeGroupChatKey={activeGroupChatKey}
            onAvatarPress={(userId) => {
              if (userId !== activeAppUserId) setViewingOtherUserId(userId);
            }}
            onEditSession={(s) => {
              const parsed = parseHourMinuteParts(s.start ?? '');
              const parsedEnd = parseHourMinuteParts(s.end ?? '');
              setEditingSessionId(s.id);
              setStartHour(parsed.hour);
              setStartMinute(parsed.minute);
              setEndHour(parsedEnd.hour);
              setEndMinute(parsedEnd.minute);
              setIntent(resolveSessionIntent(s.intent));
              setShowForm(true);
              setShowManageSessions(false);
              setActivePicker(null);
              setFormError('');
              setSaveError(null);
            }}
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
          <View style={{ backgroundColor: 'transparent', borderRadius: 22, padding: 14, marginBottom: isWebPlatform ? 14 : 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.055)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                <Text style={{ fontSize: 16 }}>💬</Text>
              </View>
              <View>
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: '900' }}>
                  {activeGroupChatContext?.title ?? 'Group Chat'}
                </Text>
                {activeGroupChatContext?.subtitle ? (
                  <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                    {activeGroupChatContext.subtitle}
                  </Text>
                ) : null}
              </View>
            </View>

            {groupMessages.length > 0 ? (
              <ScrollView
                ref={groupChatScrollRef}
                style={{ maxHeight: 250, marginTop: 12 }}
                keyboardDismissMode="interactive"
                onContentSizeChange={() => {
                  groupChatScrollRef.current?.scrollToEnd({ animated: false });
                }}
              >
                {groupMessages.map((message) => {
                  const renderedTime = message.createdAt ? formatToHourMinute(message.createdAt) : '';
                  const isOwn = message.userId === activeAppUserId;
                  return (
                    <View key={message.id} style={{ flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'flex-end', marginBottom: 10 }}>
                      {!isOwn && <Avatar uri={message.avatar_url} size={24} />}
                      <View style={{ marginLeft: isOwn ? 0 : 8, marginRight: isOwn ? 0 : 0, maxWidth: '84%', backgroundColor: isOwn ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.045)', borderRadius: 16, borderBottomLeftRadius: isOwn ? 16 : 5, borderBottomRightRadius: isOwn ? 5 : 16, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: isOwn ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.065)' }}>
                        {!isOwn && (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                            <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: '800', flexShrink: 1 }} numberOfLines={1}>
                              {message.display_name}
                            </Text>
                            {renderedTime ? <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '700' }}>{renderedTime}</Text> : null}
                          </View>
                        )}
                        <Text style={{ color: theme.text, fontSize: 15, marginTop: isOwn ? 0 : 3 }}>{message.text}</Text>
                        {isOwn && renderedTime ? <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '700', marginTop: 3, textAlign: 'right' }}>{renderedTime}</Text> : null}
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
                onFocus={() => {
                  spotDetailScrollRef.current?.scrollToEnd({ animated: true });
                }}
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

        <Pressable
          onPress={() => {
            if (selectedSpot) {
              setActiveChatSpot(selectedSpot);
              setShowChat(true);
              setChatSubTab('spot');
              setSelectedSpot(null);
            }
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 14, marginBottom: isWebPlatform ? 14 : 90 }}
        >
          <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chatbubbles-outline" size={18} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>Spot Chat</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>Open in Messages tab</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </Pressable>


        </ScrollView>
        {renderNativeBottomNav()}
      </SafeAreaView>
    );
  }
  const visibleSpots = homeSpotCards.map(({ spot, distanceMeters }) => ({ name: spot, distanceMeters }));
  
  
  
  
  
  
  
  const homeHorizontalPadding = isWebPlatform ? 20 : 14;
  const homeTopPadding = isWebPlatform ? 18 : 8;
  const homeLogoBoxSize = isWebPlatform ? 120 : 72;
  const homeLogoImageSize = isWebPlatform ? 210 : 126;
  const homeWordmarkWidth = isWebPlatform ? 470 : 250;
  const homeWordmarkHeight = isWebPlatform ? 110 : 58;
  const homeWordmarkMarginLeft = isWebPlatform ? -125 : -70;
  const homeActionButtonWidth = isWebPlatform ? 170 : '48%';
  const homeSpotCardPadding = isWebPlatform ? 22 : 16;
  const homeSpotCardRadius = isWebPlatform ? 24 : 18;
  const homeForecastBarWidth = isWebPlatform ? 18 : 10;
  const homeForecastHeight = isWebPlatform ? 96 : 72;
  const homeBottomPadding = isWebPlatform ? 32 : 118;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
      <View style={{ flex: 1, backgroundColor: theme.bg }} onTouchStart={handleNativeSwipeStart} onTouchEnd={handleNativeSwipeEnd}>
        {renderNativeTopBar()}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: homeHorizontalPadding, paddingTop: isWebPlatform ? homeTopPadding : 18, paddingBottom: homeBottomPadding }}>

        <View style={{ marginBottom: 8 }}>
          <View style={{ display: isWebPlatform ? 'flex' : 'none', flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
            <View
              style={{
                width: homeLogoBoxSize,
                height: homeLogoBoxSize,
                overflow: 'hidden',
                marginRight: -12,
                marginLeft: -4,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Image
                source={require('./assets/logo.png')}
                style={{ width: homeLogoImageSize, height: homeLogoImageSize, marginLeft: 8 }}
                resizeMode="contain"
              />
            </View>

            <Image
              source={require('./assets/wordmark.png')}
              style={{ width: homeWordmarkWidth, height: homeWordmarkHeight, marginLeft: homeWordmarkMarginLeft }}
              resizeMode="contain"
            />

            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Pressable onPress={() => setShowProfile(true)}>
                <Avatar uri={profile?.avatar_url ?? null} size={38} nationality={profile?.nationality} />
              </Pressable>
            </View>
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

        <View style={{ display: isWebPlatform ? 'flex' : 'none', flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'center' }}>
          <Pressable
            onPress={() => setShowYourSpotsPage(true)}
            style={{
              width: homeActionButtonWidth,
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
            onPress={() => setShowBuddies(true)}
            style={{
              width: homeActionButtonWidth,
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
            onPress={() => setShowChat(true)}
            style={{
              width: homeActionButtonWidth,
              backgroundColor: 'rgba(255,255,255,0.075)',
              borderRadius: 999,
              paddingVertical: 7,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>Messages</Text>
          </Pressable>

          {/* Bell — compact, rechts uitgelijnd */}
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Pressable
              onPress={() => {
                setIsNotificationInboxExpanded((prev) => {
                  const nextExpanded = !prev;
                  if (nextExpanded) void markAllBuzzAsRead();
                  return nextExpanded;
                });
              }}
              style={{
                width: 36, height: 36,
                backgroundColor: isNotificationInboxExpanded ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)',
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: isNotificationInboxExpanded ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
                position: 'relative',
              }}
            >
              <Ionicons name={isNotificationInboxExpanded ? 'notifications' : 'notifications-outline'} size={18} color="#ffffff" />
              {unreadCount > 0 ? (
                <View style={{
                  position: 'absolute', top: -3, right: -3,
                  minWidth: 15, height: 15, borderRadius: 8,
                  backgroundColor: '#ff3b30',
                  alignItems: 'center', justifyContent: 'center',
                  paddingHorizontal: 3,
                }}>
                  <Text style={{ color: '#fff', fontSize: 8, fontWeight: '900' }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        {isNotificationInboxExpanded ? (
          <View
            style={{
              marginBottom: 14,
              borderTopWidth: 1,
              borderTopColor: 'rgba(255,255,255,0.06)',
              paddingTop: 10,
              gap: 2,
            }}
          >
            <Text
              style={{
                color: theme.textMuted,
                fontSize: 11,
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                marginBottom: 6,
              }}
            >
              Activity
            </Text>

            {notificationRows.length === 0 ? (
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                No notifications yet.
              </Text>
            ) : (
              notificationRows.map((notificationRow) => (
                <View
                  key={notificationRow.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      color: notificationRow.read === false ? theme.text : theme.textSoft,
                      fontSize: 12,
                      fontWeight: notificationRow.read === false ? '700' : '500',
                    }}
                  >
                    {getNotificationInboxSummary(notificationRow)}
                  </Text>

                  {notificationRow.created_at ? (
                    <Text
                      style={{
                        color: theme.textMuted,
                        fontSize: 10,
                        fontWeight: '600',
                      }}
                    >
                      {new Date(notificationRow.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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
          const goingSessions = cleanDaySpotSessions.filter((sessionItem) => getCleanSessionStatus(sessionItem) === 'going');
          const maybeSessions = cleanDaySpotSessions.filter((sessionItem) => getCleanSessionStatus(sessionItem) === 'maybe');
          const activeCount = new Set(liveSessions.map((s) => s.userId).filter(Boolean)).size;
          const goingCount = new Set(goingSessions.map((s) => s.userId).filter(Boolean)).size;
          const maybeCount = new Set(maybeSessions.map((s) => s.userId).filter(Boolean)).size;
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
                borderRadius: homeSpotCardRadius,
                padding: homeSpotCardPadding,
                marginBottom: 18,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.07)',
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <View style={{ flexDirection: isWebPlatform ? 'row' : 'column', justifyContent: 'space-between', alignItems: isWebPlatform ? 'flex-start' : 'stretch', gap: isWebPlatform ? 18 : 10 }}>
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

                <View style={{ alignItems: isWebPlatform ? 'flex-end' : 'flex-start', minWidth: isWebPlatform ? 150 : 0 }}>
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
                    {bestWindowLabel ? `Best window ${bestWindowLabel}` : 'No sessions planned'}
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
                    height: homeForecastHeight,
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
                          width: homeForecastBarWidth,
                          height: isWebPlatform ? item.h : Math.min(item.h, 60),
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
      </View>
      {renderNativeBottomNav()}

      {/* Other user profile modal */}
      {viewingOtherUserId && (
        <Pressable
          onPress={() => setViewingOtherUserId(null)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 200, justifyContent: 'flex-end' }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#0d1b2a', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            {viewingOtherProfile ? (
              <>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <Avatar uri={viewingOtherProfile.avatar_url} size={60} nationality={viewingOtherProfile.nationality} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>{viewingOtherProfile.display_name}</Text>
                    {viewingOtherProfile.nationality ? (() => { const c = getCountry(viewingOtherProfile.nationality); return c ? <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 2 }}>{c.flag}  {c.name}</Text> : null; })() : null}
                    {viewingOtherProfile.skill_level ? (
                      <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                        {['', 'Grom', 'Ripper', 'Freerider', 'Shredder', 'Storm Chaser'][viewingOtherProfile.skill_level]}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable onPress={() => setViewingOtherUserId(null)}>
                    <Ionicons name="close" size={22} color={theme.textMuted} />
                  </Pressable>
                </View>

                {/* Actions */}
                <View style={{ gap: 10 }}>
                  {followingUserIds.includes(viewingOtherUserId) ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(77,184,255,0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(77,184,255,0.18)' }}>
                      <Ionicons name="people" size={16} color="#4DB8FF" />
                      <Text style={{ color: '#4DB8FF', fontSize: 14, fontWeight: '700' }}>You're buddies</Text>
                    </View>
                  ) : outgoingFollowStatusesByUserId[viewingOtherUserId] === 'pending' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                      <Ionicons name="time-outline" size={16} color={theme.textMuted} />
                      <Text style={{ color: theme.textMuted, fontSize: 14, fontWeight: '700' }}>Buddy request sent</Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={async () => {
                        await handleFollowUser(viewingOtherUserId);
                        setViewingOtherUserId(null);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(77,184,255,0.15)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(77,184,255,0.35)' }}
                    >
                      <Ionicons name="person-add-outline" size={16} color="#4DB8FF" />
                      <Text style={{ color: '#4DB8FF', fontSize: 14, fontWeight: '800' }}>Add buddy</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={async () => {
                      const convId = await openDmWithUser(viewingOtherUserId);
                      setViewingOtherUserId(null);
                      if (convId) {
                        setShowChat(true);
                        setChatSubTab('dm');
                        setExpandedDmId(convId);
                        void loadDmMessages(convId);
                        void loadDmConversations();
                      }
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
                  >
                    <Ionicons name="chatbubble-outline" size={16} color={theme.textSoft} />
                    <Text style={{ color: theme.textSoft, fontSize: 14, fontWeight: '700' }}>Send message</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Text style={{ color: theme.textMuted, fontSize: 14 }}>Loading…</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      )}

      {/* Follow spot prompt */}
      {followPromptSpot && (
        <Pressable
          onPress={() => setFollowPromptSpot(null)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 200, justifyContent: 'flex-end' }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#0d1b2a', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(77,184,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="location" size={20} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>Follow {followPromptSpot}?</Text>
                <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 2 }}>
                  {favoriteSpots.length >= 5
                    ? "You're following 5 spots. Remove one first in the Spots tab."
                    : 'Get session alerts and spot chat for this spot.'}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {favoriteSpots.length < 5 ? (
                <Pressable
                  onPress={() => {
                    addSelectedSpot(followPromptSpot as any);
                    setFollowPromptSpot(null);
                  }}
                  style={{ flex: 1, backgroundColor: 'rgba(77,184,255,0.15)', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(77,184,255,0.35)' }}
                >
                  <Text style={{ color: '#4DB8FF', fontSize: 15, fontWeight: '800' }}>Yes, follow</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => { setFollowPromptSpot(null); navigateNative('spots'); }}
                  style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }}
                >
                  <Text style={{ color: theme.textSoft, fontSize: 15, fontWeight: '700' }}>Manage spots</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setFollowPromptSpot(null)}
                style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
              >
                <Text style={{ color: theme.textMuted, fontSize: 15, fontWeight: '700' }}>Not now</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      )}

      {/* Plan session modal */}
      {showPlanModal && (
        <Pressable
          onPress={() => setShowPlanModal(false)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 200, justifyContent: 'flex-end' }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#0d1b2a', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Plan a session</Text>
              <Pressable onPress={() => setShowPlanModal(false)}>
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </Pressable>
            </View>
            <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>My spots</Text>
            {favoriteSpots.length === 0 && (
              <Text style={{ color: theme.textMuted, fontSize: 14, marginBottom: 12 }}>Add spots first in the Spots tab.</Text>
            )}
            {favoriteSpots.map((spotName) => (
              <Pressable
                key={`plan-modal-${spotName}`}
                onPress={() => {
                  setShowPlanModal(false);
                  setSelectedSpot(spotName as SpotName);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(77,184,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="location-outline" size={16} color={theme.primary} />
                </View>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600', flex: 1 }}>{spotName}</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                setShowPlanModal(false);
                navigateNative('spots');
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, marginTop: 4 }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="search-outline" size={16} color={theme.textMuted} />
              </View>
              <Text style={{ color: theme.textMuted, fontSize: 15, fontWeight: '600' }}>Search other spots</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}

    </SafeAreaView>
  );
}
