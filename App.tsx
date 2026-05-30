import { useEffect, useMemo, useRef, useState } from 'react';

import { Session as AuthSession } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import DiscoverMap from './src/components/DiscoverMap';
import * as Buzz from 'expo-notifications';
import { Alert, Image, Keyboard, KeyboardAvoidingView, Linking, PanResponder, Platform, Pressable, RefreshControl, SafeAreaView, ScrollView, StatusBar, Text, TextInput, View } from 'react-native';
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
import OnboardingScreen from './src/screens/OnboardingScreen';
import { theme as appTheme } from './src/theme/theme';
import { SpotSummaryCards as TargetSpotSummaryCards } from './components/SpotSummaryCards';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://027daa0beeb038f4751889f33984309b@o4511466267410432.ingest.de.sentry.io/4511466280779856',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

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
  userSkillLevel?: number | null;
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
type BuddyUser = Pick<Profile, 'id' | 'display_name' | 'avatar_url'> & { skill_level?: number | null };
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
// Spot chat sleutels zijn dag-bewust: "SpotName|||2026-05-18"
const spotChatKey = (spotName: string, dayKey: string) => `${spotName}|||${dayKey}`;
const spotNameFromChatKey = (key: string) => key.split('|||')[0] ?? key;
const dayFromChatKey = (key: string) => key.split('|||')[1] ?? getTodayLocalDateKey();
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
    return 'You can only check in from 07:00';
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
const formatChatTimestamp = (value: string | null | undefined): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (isToday) return time;
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${date} ${time}`;
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
  if (sessionItem.checkedOutAt) {
    return 'finished';
  }

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
    .filter((sessionItem) => Boolean(sessionItem.checkedInAt) && isIsoInRange(sessionItem.checkedInAt, activeDateStart, activeDateEnd));

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
const parseSessionBaseDate = (sessionItem: SpotSession): Date => {
  if (sessionItem.sessionDay) {
    const parts = sessionItem.sessionDay.split('-').map(Number);
    if (parts.length === 3 && parts.every(Number.isFinite)) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
  }
  const createdDate = sessionItem.createdAt ? new Date(sessionItem.createdAt) : new Date();
  return Number.isNaN(createdDate.getTime()) ? new Date() : createdDate;
};
const getSessionStartTime = (sessionItem: SpotSession) => {
  const sessionDate = new Date(parseSessionBaseDate(sessionItem));
  const { hour, minute } = parseHourMinuteParts(sessionItem.start);
  sessionDate.setHours(hour ?? 0, minute ?? 0, 0, 0);
  return sessionDate;
};
const getSessionEndTime = (sessionItem: SpotSession) => {
  const sessionDate = new Date(parseSessionBaseDate(sessionItem));
  const { hour, minute } = parseHourMinuteParts(sessionItem.end);
  sessionDate.setHours(hour ?? 0, minute ?? 0, 0, 0);
  return sessionDate;
};
const isSessionExpired = (sessionItem: SpotSession, now = new Date()) => {
  if (!hasPlannedTimeWindow(sessionItem)) {
    return false;
  }
  // Ingecheckte sessies verlopen nooit — ze lopen door tot uitchecken
  if (sessionItem.checkedInAt && !sessionItem.checkedOutAt) {
    return false;
  }
  const sessionEndTime = getSessionEndTime(sessionItem);
  return sessionEndTime.getTime() < now.getTime();
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
const CONTACT_EMAIL = 'spotbuddynl@gmail.com';
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
type WindData = { speed: number; direction: number; gusts: number };

async function fetchWind(latitude: number, longitude: number): Promise<WindData | null> {
  try {
    const isWeb = typeof document !== 'undefined';
    const url = isWeb
      ? `/api/weather?latitude=${latitude}&longitude=${longitude}`
      : `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kn`;
    const res = await fetch(url);
    const json = await res.json();
    const c = json?.current;
    if (!c) return null;
    return {
      speed: Math.round(c.wind_speed_10m ?? 0),
      direction: Math.round(c.wind_direction_10m ?? 0),
      gusts: Math.round(c.wind_gusts_10m ?? 0),
    };
  } catch {
    return null;
  }
}

function degreesToCompass(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function windColor(kn: number): string {
  if (kn < 8) return '#5F83A6';
  if (kn < 15) return '#4DB8FF';
  if (kn < 25) return '#5EF0D0';
  if (kn < 35) return '#FFB347';
  return '#FF6B6B';
}

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

const WHEEL_ITEM_H = 52;
const WHEEL_BG = '#071421';

function WheelColumn({ values, selected, onSelect, formatVal, flex = 1 }: { values: number[]; selected: number | null; onSelect: (v: number) => void; formatVal: (v: number) => string; flex?: number }) {
  const scrollRef = useRef<ScrollView>(null);
  const isScrolling = useRef(false);

  useEffect(() => {
    if (isScrolling.current) return;
    if (selected === null && values.length > 0) { onSelect(values[0]); setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 30); return; }
    const idx = values.indexOf(selected!);
    const safeIdx = idx >= 0 ? idx : 0;
    setTimeout(() => scrollRef.current?.scrollTo({ y: safeIdx * WHEEL_ITEM_H, animated: false }), 30);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex }}
      showsVerticalScrollIndicator={false}
      snapToInterval={WHEEL_ITEM_H}
      decelerationRate="fast"
      contentContainerStyle={{ paddingTop: WHEEL_ITEM_H, paddingBottom: WHEEL_ITEM_H }}
      onScrollBeginDrag={() => { isScrolling.current = true; }}
      onMomentumScrollEnd={(e) => {
        isScrolling.current = false;
        const idx = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_H);
        onSelect(values[Math.max(0, Math.min(idx, values.length - 1))]);
      }}
      scrollEventThrottle={16}
    >
      {values.map((v) => {
        const isSelected = v === selected;
        return (
          <Pressable key={v} onPress={() => { onSelect(v); scrollRef.current?.scrollTo({ y: values.indexOf(v) * WHEEL_ITEM_H, animated: true }); }}
            style={{ height: WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: isSelected ? '#fff' : 'rgba(255,255,255,0.22)', fontSize: isSelected ? 28 : 18, fontWeight: isSelected ? '600' : '400' }}>
              {formatVal(v)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// Legacy wrapper kept for any remaining usages
function WheelPicker({ values, selected, onSelect, label, formatVal }: { values: number[]; selected: number | null; onSelect: (v: number) => void; label: string; formatVal: (v: number) => string }) {
  return <WheelColumn values={values} selected={selected} onSelect={onSelect} formatVal={formatVal} />;
}

const AVATAR_COLORS = ['#1a6b8a','#2d7a4f','#7a2d6b','#8a5a1a','#1a3d8a','#6b1a1a','#2d6b6b','#5a2d8a'];
function avatarColor(name: string | null | undefined) {
  if (!name) return AVATAR_COLORS[0];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function Avatar({ uri, size = 28, name }: { uri: string | null; size?: number; nationality?: string | null; skillLevel?: number | null; name?: string | null }) {
  if (!uri) {
    const initials = name ? name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?';
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(name), alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#ffffff', fontSize: Math.max(8, size * 0.38), fontWeight: '700' }}>{initials}</Text>
      </View>
    );
  }
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.card }} />;
}

function Flag({ code, size = 20 }: { code: string; size?: number }) {
  const c = getCountry(code);
  return c ? <Text style={{ fontSize: size }}>{c.flag}</Text> : null;
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
          shadowColor: '#000000',
          shadowOpacity: 0.08,
          shadowRadius: 2,
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
              color: state === 'live' ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.92)',
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
  hasPlannedWindow: boolean;
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
const getRoundedSessionWindow = (sessionItem: SpotSession, nowMinutes?: number) => {
  const hasPlannedWindow = hasPlannedTimeWindow(sessionItem);
  const currentMinutes = nowMinutes ?? getCurrentLocalMinutes();
  const checkedInAndActive = Boolean(sessionItem.checkedInAt) && !sessionItem.checkedOutAt;
  if (checkedInAndActive) {
    const checkedInMinutes = getLocalMinutesFromIso(sessionItem.checkedInAt) ?? currentMinutes;
    const roundedEnd = roundMinutesToNearestFive(Math.min(currentMinutes + 60, timelineEndMinutes));
    return {
      startMinutes: checkedInMinutes,
      endMinutes: roundedEnd,
      startTime: formatMinutesAsHourMinuteFull(checkedInMinutes),
      endTime: formatMinutesAsHourMinuteFull(roundedEnd),
      hasPlannedWindow: false,
    };
  }
  const checkedInMinutes = getLocalMinutesFromIso(sessionItem.checkedInAt);
  const plannedStartMinutes = hasPlannedWindow ? toMinutes(sessionItem.start) : null;
  const rawStartMinutes = plannedStartMinutes !== null
    ? (checkedInMinutes !== null && checkedInMinutes < plannedStartMinutes ? checkedInMinutes : plannedStartMinutes)
    : (checkedInMinutes ?? timelineStartMinutes);
  const plannedEndMinutes = hasPlannedWindow ? toMinutes(sessionItem.end) : null;
  const showPlannedEnd = hasPlannedWindow && plannedEndMinutes !== null;
  const rawEndMinutes = showPlannedEnd
    ? plannedEndMinutes!
    : Math.min(currentMinutes + 60, timelineEndMinutes);
  const roundedStartMinutes = roundMinutesToNearestFive(rawStartMinutes);
  const roundedEndMinutes = roundMinutesToNearestFive(rawEndMinutes);
  return {
    startMinutes: roundedStartMinutes,
    endMinutes: roundedEndMinutes,
    startTime: formatMinutesAsHourMinuteFull(roundedStartMinutes),
    endTime: formatMinutesAsHourMinuteFull(roundedEndMinutes),
    hasPlannedWindow: showPlannedEnd,
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
  nowMinutes,
}: {
  sessions: Array<{ item: SpotSession; state: TimelineState; isBuddy: boolean }>;
  activeDayKey: string;
  selectedSpot: SpotName | null;
  activeProfileId: string | null | undefined;
  buddiesMode: TimelineFilter;
  followingUserIds: string[];
  nowMinutes?: number;
}) => {

  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const safeFollowingUserIds = Array.isArray(followingUserIds) ? followingUserIds : [];
  const followingUserIdSet = new Set(safeFollowingUserIds);
  const groups = new Map<string, SessionGroup>();

  // Bouw source-keten map om altijd de echte root te vinden
  const sourceMap = new Map<string, string | null>();
  for (const s of safeSessions) sourceMap.set(s.item.id, s.item.sourceSessionId ?? null);
  const findRoot = (id: string): string => {
    let cur = id; let depth = 0;
    while (depth++ < 10) { const src = sourceMap.get(cur); if (!src) return cur; cur = src; }
    return cur;
  };

  for (const timelineSession of safeSessions) {
    const {
      startMinutes: roundedStartMinutes,
      endMinutes: roundedEndMinutes,
      startTime,
      endTime,
      hasPlannedWindow,
    } = getRoundedSessionWindow(timelineSession.item, nowMinutes);
    const groupRootId = timelineSession.item.sourceSessionId
      ? findRoot(timelineSession.item.sourceSessionId)
      : timelineSession.item.id;

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
        hasPlannedWindow,
        sessions: [entry],
      });
    } else {
      existing.sessions.push(entry);
      if (timelineSession.state === 'live') {
        existing.startMinutes = roundedStartMinutes;
        existing.startTime = startTime;
        existing.endMinutes = roundedEndMinutes;
        existing.endTime = endTime;
        existing.hasPlannedWindow = hasPlannedWindow;
      }
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
              : !isSessionExpired(item) && (buddiesMode === 'everyone' || followingUserIdSet.has(item.userId));


          return visible;
        }),
      );
      return {
        ...group,
        visibleSessions,
        // Gebruik altijd de root sessie (geen source) als representative — niet de joined sessie
        representative: (visibleSessions.find(e => !e.item?.sourceSessionId) ?? visibleSessions[0]) ?? (Array.isArray(group.sessions) ? (group.sessions.find(e => !e.item?.sourceSessionId) ?? group.sessions[0]) : null) ?? null,
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
  nowMinutes,
}: {
  sessions: SpotSession[];
  selectedSpot: SpotName | null;
  activeDayKey: string;
  activeProfile: Profile | null;
  timelineSessions: Array<{ item: SpotSession; state: TimelineState; isBuddy: boolean }>;
  timelineFilter: TimelineFilter;
  followingUserIds: string[];
  nowMinutes?: number;
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
    nowMinutes,
  });
  // Build lookup: sessionId → all participant userIds in the same group
  const sessionToGroupUserIds = new Map<string, string[]>();
  for (const group of groupedSessions) {
    const groupUserIds = group.sessions.map((e) => e.item?.userId).filter((id): id is string => Boolean(id));
    for (const entry of group.sessions) {
      if (entry.item?.id) sessionToGroupUserIds.set(entry.item.id, groupUserIds);
    }
  }
  const safeFollowingUserIds = Array.isArray(followingUserIds) ? followingUserIds : [];

  const joinStateBySession = (Array.isArray(timelineSessions) ? timelineSessions : []).reduce((result, entry) => {
    if (!entry?.item?.id) {
      return result;
    }
    const groupUserIds = sessionToGroupUserIds.get(entry.item.id) ?? (entry.item.userId ? [entry.item.userId] : []);
    const joinState = getJoinState({
      session: entry.item,
      ownSessionForSpotDay: ownSessionStateForBlocking,
      activeDayKey,
      followingUserIds: safeFollowingUserIds,
      groupParticipantUserIds: groupUserIds,
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
  // Geen JOIN als gebruiker al een sessie heeft in dezelfde groep (ongeacht hoe hij er in zit)
  const isAlreadyInGroup = safeGroupSessions.some(entry => entry.item?.userId === currentProfileId);
  const canJoinGroup = Boolean(joinTarget) && !isAlreadyInGroup && joinState.allowed;
  // "You're in" alleen tonen als je in een groep zit MET anderen (niet je eigen solo-sessie)
  const isJoinedGroup = isAlreadyInGroup && safeGroupSessions.some(e => e.item?.userId !== currentProfileId);
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
                <Avatar uri={item.userAvatarUrl ?? null} size={40} nationality={item.userNationality} skillLevel={item.userSkillLevel} name={item.userName} />
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
            <View style={{ alignItems: 'center', marginTop: 4 }}>
              <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '500', textAlign: 'center', width: 64 }} numberOfLines={1}>
                {getRiderRowName(sortedVisibleSessions[0]?.item)}
              </Text>
              {isLiveRow && session?.checkedInAt ? (
                <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: '600', marginTop: 2 }}>
                  {formatToHourMinute(session.checkedInAt)}
                </Text>
              ) : null}
            </View>
          ) : null}

        </View>

        <View style={{ position: 'absolute', left: 104, right: canJoinGroup ? 110 : 104, height: 24, zIndex: 1 }}>
          <SessionBar
            leftPercent={leftPercent}
            widthPercent={widthPercent}
            state={getCleanSessionStatus(session) === 'live' ? 'live' : 'planned'}
            intent={rowIntent}
            isSelected={isSelected}
            showJoinButton={false}
            onPress={() => {
              const isOwnBar = session?.userId === currentProfileId;
              const isGroup = safeGroupSessions.length > 1;
              if (isOwnBar && !isGroup && onEditSession) {
                onEditSession({ id: session.id, start: session.start ?? null, end: session.end ?? null, intent: session.intent ?? null });
              } else {
                onSelect(group.key);
              }
            }}
            label={group.hasPlannedWindow ? `${group.startTime} – ${group.endTime}` : group.startTime}
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

        {/* Rechts: Join knop of Group Chat knop */}
        {canJoinGroup ? (
          <View
            style={{ marginLeft: 'auto', zIndex: 2, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 5 }}
            {...({ onClick: (e: any) => { e.stopPropagation(); if (!joinTarget) return; onJoin({ sessionId: joinTarget.id, sessionDay: joinTarget.sessionDay, sessionStatus: joinTarget.status ?? null, normalizedStart: group.startTime, normalizedEnd: group.endTime }); } } as any)}
          >
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '800' }}>Join</Text>
          </View>
        ) : sortedVisibleSessions.length > 1 ? (
          <View
            style={{ marginLeft: 'auto', zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4, paddingVertical: 5 }}
            {...({ onClick: (e: any) => { e.stopPropagation(); onOpenGroupChat(group.key); } } as any)}
          >
            <Ionicons name="chatbubble" size={12} color="#ffffff" />
            <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>Group Chat</Text>
          </View>
        ) : (
          <>
            <View style={{ width: 92 }} />
            <View style={{ width: 8 }} />
          </>
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
                // JOIN check voor native
                const mGSessions = Array.isArray(group.sessions) ? group.sessions : [];
                const mJoinTarget = mGSessions.find(e => e.item?.userId !== currentProfileId)?.item ?? null;
                const mAlreadyIn = mGSessions.some(e => e.item?.userId === currentProfileId);
                const mJoinState = mJoinTarget?.id ? (joinStateBySession[mJoinTarget.id] ?? { allowed: false, reason: null }) : { allowed: false, reason: null };
                const mCanJoin = Boolean(mJoinTarget) && !mAlreadyIn && mJoinState.allowed;
                const mJoinedGroup = mAlreadyIn && mGSessions.some(e => e.item?.userId !== currentProfileId);

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
                      <View style={{ alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {(group.visibleSessions ?? []).slice(0, 3).map(({ item }, avatarIndex) => (
                            <Pressable key={`avatar-${group.key}-${item.id}`} style={{ marginLeft: avatarIndex === 0 ? 0 : -12, zIndex: 3 - avatarIndex }} onPress={() => item.userId && item.userId !== currentProfileId && onAvatarPress?.(item.userId)}>
                              <Avatar uri={item.userAvatarUrl ?? null} size={38} nationality={item.userNationality} skillLevel={item.userSkillLevel} name={item.userName} />
                            </Pressable>
                          ))}
                          {(group.visibleSessions?.length ?? 0) > 3 ? (
                            <View style={{ marginLeft: -12, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', zIndex: 0 }}>
                              <Text style={{ color: theme.text, fontSize: 11, fontWeight: '900' }}>+{(group.visibleSessions?.length ?? 0) - 3}</Text>
                            </View>
                          ) : null}
                        </View>
                        {(group.visibleSessions?.length ?? 0) > 1 ? (
                          <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '700', marginTop: 3 }}>{group.visibleSessions?.length} riders</Text>
                        ) : null}
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }} numberOfLines={1}>
                          {(group.visibleSessions ?? []).map(({ item }) => item.userName?.replace(/\s*-\s*(Buddy|You|Other)\s*$/i, '').trim()).filter(Boolean).join(' · ')}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700', marginTop: 1 }}>
                          {group.hasPlannedWindow ? `${group.startTime} – ${group.endTime}` : group.startTime}
                        </Text>
                      </View>

                      {(group.visibleSessions?.length ?? 0) > 1 ? (
                        <Pressable
                          onPress={(event) => {
                            event.stopPropagation();
                            onOpenGroupChat(group.key);
                          }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 4 }}
                        >
                          <Ionicons name="chatbubble" size={13} color="#ffffff" />
                          <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>Group Chat</Text>
                        </Pressable>
                      ) : null}

                      {/* JOIN knop naast Chat knop */}
                      {mCanJoin ? (
                        <Pressable
                          onPress={(event) => {
                            event.stopPropagation();
                            if (!mJoinTarget) return;
                            onJoinSession({
                              sessionId: mJoinTarget.id,
                              sessionDay: mJoinTarget.sessionDay,
                              sessionStatus: mJoinTarget.status ?? null,
                              normalizedStart: group.startTime,
                              normalizedEnd: group.endTime,
                            });
                          }}
                          style={{ borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 6 }}
                        >
                          <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: '800' }}>Join</Text>
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
                          <Pressable key={`member-${item.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => item.userId && item.userId !== currentProfileId && onAvatarPress?.(item.userId)}>
                            <Avatar uri={item.userAvatarUrl ?? null} size={30} nationality={item.userNationality} skillLevel={item.userSkillLevel} name={item.userName} />
                            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>
                              {item.userName?.replace(/\s*-\s*(Buddy|You|Other)\s*$/i, '').trim() || 'Rider'}
                            </Text>
                          </Pressable>
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
              left: 126,
              right: 126,
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
                  shadowColor: '#000',
                  shadowOpacity: 0.08,
                  shadowRadius: 2,
                  shadowOffset: { width: 0, height: 1 },
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

                  <View pointerEvents="none" style={{ position: 'absolute', left: 126, right: 126, top: 42, bottom: 10 }}>
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


export default Sentry.wrap(function App() {
  const isNativePlatform = Platform.OS === 'ios' || Platform.OS === 'android';
  const isWebPlatform = Platform.OS === 'web';
  const [isPasswordResetRoute, setIsPasswordResetRoute] = useState(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return false;
    }
    const href = window.location.href;
    const hash = window.location.hash;
    return (
      window.location.pathname === '/reset-password'
      || href.includes('/reset-password#')
      || hash.includes('type=recovery')
      || href.includes('type=recovery')
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
  const [showGuide, setShowGuide] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showBuddies, setShowBuddies] = useState(false);
  const [buddiesTab, setBuddiesTab] = useState<'myBuddies' | 'find'>('myBuddies');
  const [showChat, setShowChat] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [followPromptSpot, setFollowPromptSpot] = useState<string | null>(null);
  const [viewingOtherUserId, setViewingOtherUserId] = useState<string | null>(null);
  const [viewingOtherProfile, setViewingOtherProfile] = useState<{ id: string; display_name: string; avatar_url: string | null; nationality?: string | null; skill_level?: number | null } | null>(null);
  const [showFullscreenAvatar, setShowFullscreenAvatar] = useState(false);
  const [chatSubTab, setChatSubTab] = useState<'spot' | 'session' | 'dm' | 'group'>('spot');
  const [dmSearchQuery, setDmSearchQuery] = useState('');
  const [activeChatSpot, setActiveChatSpot] = useState<string | null>(null);
  const [activeChatDayKey, setActiveChatDayKey] = useState<string | null>(null);
  const [chatSpotMessages, setChatSpotMessages] = useState<Record<string, { conversationId: string | null; messages: any[]; loaded: boolean; dayKey?: string }>>({});
  // Één state voor welke chat open is — voorkomt conflicten tussen de drie types
  const [openChatState, setOpenChatState] = useState<{ type: 'spot' | 'session' | 'dm' | 'group'; id: string } | null>(null);
  const expandedChatSpot = openChatState?.type === 'spot' ? openChatState.id : null;
  const expandedChatSession = openChatState?.type === 'session' ? openChatState.id : null;
  const expandedDmId = openChatState?.type === 'dm' ? openChatState.id : null;
  const expandedPersistentGroupId = openChatState?.type === 'group' ? openChatState.id : null;
  const setExpandedChatSpot = (v: string | null) => v ? setOpenChatState({ type: 'spot', id: v }) : setOpenChatState(null);
  const setExpandedChatSession = (v: string | null) => v ? setOpenChatState({ type: 'session', id: v }) : setOpenChatState(null);
  const setExpandedDmId = (v: string | null) => v ? setOpenChatState({ type: 'dm', id: v }) : setOpenChatState(null);
  const setExpandedPersistentGroupId = (v: string | null) => v ? setOpenChatState({ type: 'group', id: v }) : setOpenChatState(null);
  const [spotChatInputInChat, setSpotChatInputInChat] = useState('');
  const [pendingMediaUri, setPendingMediaUri] = useState<string | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [chatMySessions, setChatMySessions] = useState<any[]>([]);
  const [chatSessionMessages, setChatSessionMessages] = useState<Record<string, { conversationId: string | null; messages: any[]; loaded: boolean; spotName?: string; sessionDay?: string; sessionStart?: string; sessionEnd?: string }>>({});
  const [sessionChatInput, setSessionChatInput] = useState('');
  const [showMessagesAlertSettings, setShowMessagesAlertSettings] = useState(false);
  const [spotsWithUnread, setSpotsWithUnread] = useState<Record<string, number>>({}); // lowercase spotName → count
  const [_dbgEventCount, _setDbgEventCount] = useState(0); // tijdelijk debug
  const [unreadBySession, setUnreadBySession] = useState<Record<string, number>>({});
  const [unreadByDm, setUnreadByDm] = useState<Record<string, number>>({});
  // chatUnreadCount = computed: som van alle ongelezen (voor badge)
  const unreadSessionTotal = Object.values(unreadBySession).reduce((a, b) => a + b, 0);
  const unreadDmTotal = Object.values(unreadByDm).reduce((a, b) => a + b, 0);
  const [myPersistentGroups, setMyPersistentGroups] = useState<Array<{ id: string; name: string; role: 'admin' | 'member'; conversationId: string | null; lastMessage: string | null; lastMessageAt: string | null; pendingRequests: number; avatar_url: string | null; memberIds: string[]; muted: boolean }>>([]);
  const [persistentGroupMessages, setPersistentGroupMessages] = useState<Record<string, { messages: any[]; loaded: boolean }>>({});
  const [persistentGroupInput, setPersistentGroupInput] = useState('');
  const [unreadByPersistentGroup, setUnreadByPersistentGroup] = useState<Record<string, number>>({});
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [createGroupAvatarUri, setCreateGroupAvatarUri] = useState<string | null>(null);
  const [createGroupName, setCreateGroupName] = useState('');
  const [createGroupSelectedIds, setCreateGroupSelectedIds] = useState<string[]>([]);
  const [showNominateModal, setShowNominateModal] = useState<{ groupId: string; groupName: string } | null>(null);
  const [addBuddySelectedIds, setAddBuddySelectedIds] = useState<string[]>([]);
  const [nominateSearchQuery, setNominateSearchQuery] = useState('');
  const [nominateSelectedUserId, setNominateSelectedUserId] = useState<string | null>(null);
  const [nominateSearchResults, setNominateSearchResults] = useState<Array<{ id: string; display_name: string; avatar_url: string | null }>>([]);
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null);
  const [groupMembersPopup, setGroupMembersPopup] = useState<Array<{ id: string; display_name: string; avatar_url: string | null; role: string }> | null>(null);
  const unreadPersistentGroupTotal = Object.values(unreadByPersistentGroup).reduce((a, b) => a + b, 0);
  const chatUnreadCount = Object.values(spotsWithUnread).reduce((a, b) => a + b, 0) + unreadSessionTotal + unreadDmTotal + unreadPersistentGroupTotal;
  const [messagesAlertSettings, setMessagesAlertSettings] = useState<{
    spotChats: 'everyone' | 'buddies' | 'off';
    sessionChats: 'everyone' | 'buddies' | 'off';
    messageRequests: boolean;
  }>({ spotChats: 'everyone', sessionChats: 'everyone', messageRequests: true });
  const [dmConversations, setDmConversations] = useState<{ id: string; otherUserId: string; otherName: string; otherAvatar: string | null; otherSkillLevel?: number | null; lastMessage: string | null; lastMessageAt: string | null }[]>([]);
  const loadDmConversationsRef = useRef<(() => Promise<void>) | null>(null);
  const loadMyPersistentGroupsRef = useRef<(() => Promise<void>) | null>(null);
  const loadDmMessagesRef = useRef<((conversationId: string) => Promise<void>) | null>(null);
  const loadSessionChatForTabRef = useRef<((groupKey: string, spotName: string, sessionDay: string) => Promise<void>) | null>(null);
  const [dmMessages, setDmMessages] = useState<Record<string, any[]>>({});
  const [dmInput, setDmInput] = useState('');
  const [showBroadcastDm, setShowBroadcastDm] = useState(false);
  const [broadcastSelectedIds, setBroadcastSelectedIds] = useState<string[]>([]);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profileAvatarInputUri, setProfileAvatarInputUri] = useState<string | null>(null);
  const [profileEditError, setProfileEditError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isEditingProfileName, setIsEditingProfileName] = useState(false);
  const [showNationalityPicker, setShowNationalityPicker] = useState(false);
  const [nationalitySearch, setNationalitySearch] = useState('');
  const [pendingSpots, setPendingSpots] = useState<{ id: string; name: string; latitude: number; longitude: number; submitterName: string; submittedBy: string }[]>([]);
  const [pendingSpotsLoaded, setPendingSpotsLoaded] = useState(false);
  const [coordSuggestions, setCoordSuggestions] = useState<{ id: string; spotName: string; currentLat: number | null; currentLng: number | null; suggestedLat: number | null; suggestedLng: number | null; submitterName: string }[]>([]);
  const [coordSuggestionsLoaded, setCoordSuggestionsLoaded] = useState(false);
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
  const fetchSharedDataVersionRef = useRef(0);
  const fetchSharedDataRef = useRef<(() => Promise<void>) | null>(null);
  const showChatRef = useRef(false);
  const chatSubTabRef = useRef<string>('spot');
  const expandedChatSessionRef2 = useRef<string | null>(null);
  const unreadBySessionRef = useRef<Record<string, number>>({});
  const myConvIdsRef = useRef<Set<string>>(new Set());
  const chatSpotMessagesRef = useRef<Record<string, { conversationId: string | null; messages: any[]; loaded: boolean; dayKey?: string }>>({});
  const favoriteSpotsRef = useRef<string[]>([]);
  const chatSessionMessagesRef = useRef<Record<string, { conversationId: string | null; messages: any[]; loaded: boolean; spotName?: string; sessionDay?: string; sessionStart?: string; sessionEnd?: string }>>({});
  const chatMySessionsRef = useRef<any[]>([]);
  const expandedChatSpotRef = useRef<string | null>(null);
  const sessionConvIdsRef = useRef<Set<string>>(new Set()); // convIds die tot sessie chats horen
  const profileCacheRef = useRef<Map<string, { display_name: string; avatar_url: string | null }>>(new Map());
  const chatSpotScrollRef = useRef<ScrollView>(null);
  const chatSessionScrollRef = useRef<ScrollView>(null);
  const chatDmScrollRef = useRef<ScrollView>(null);
  const chatGroupScrollRef = useRef<ScrollView>(null);
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
  const [showReportCoords, setShowReportCoords] = useState(false);
  const [showAddSpot, setShowAddSpot] = useState(false);
  const [addSpotName, setAddSpotName] = useState('');
  const [addSpotSubmitting, setAddSpotSubmitting] = useState(false);
  const [addSpotSuccess, setAddSpotSuccess] = useState(false);
  const [formError, setFormError] = useState('');
  const [saveError, setSaveError] = useState<SaveDebugError>(null);
  const planningHelperText = 'You go live at the spot after check-in.';
  const [sessionActionError, setSessionActionError] = useState('');
  const [summaryPopup, setSummaryPopup] = useState<{ label: string; color: string; helper: string; sessions: SpotSession[] } | null>(null);
  const [showConditionsRating, setShowConditionsRating] = useState(false);
  const [planSessionBtnSize, setPlanSessionBtnSize] = useState<{ width: number; height: number } | null>(null);
  const [conditionsRatingSpot, setConditionsRatingSpot] = useState<SpotName | null>(null);
  const [conditionsWindKnots, setConditionsWindKnots] = useState<number | null>(null);
  const [conditionsCrowd, setConditionsCrowd] = useState<number | null>(null);
  const [conditionsWindDir, setConditionsWindDir] = useState<string | null>(null);
  const [conditionsWater, setConditionsWater] = useState<string | null>(null);
  const [spotRatingsMap, setSpotRatingsMap] = useState<Record<string, { windKnots: number | null; crowdRating: number | null; windDirection: string | null; waterConditions: string | null; ratedAt: string | null }>>({});
  const [pendingCheckinPush, setPendingCheckinPush] = useState<{ ids: string[]; actorName: string; spotName: string } | null>(null);
  const [joinInFlightSessionId, setJoinInFlightSessionId] = useState<string | null>(null);
  const [homeQuickCheckInError, setHomeQuickCheckInError] = useState('');
  const [quickCheckInSpotInFlight, setQuickCheckInSpotInFlight] = useState<SpotName | null>(null);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  const [isResolvingNearestSpot, setIsResolvingNearestSpot] = useState(false);
  const [nearestSpotResult, setNearestSpotResult] = useState<NearestSpotResult | null>(null);
  const [windBySpot, setWindBySpot] = useState<Record<string, WindData | null>>({});
  const [isRefreshingWind, setIsRefreshingWind] = useState(false);
  const [windLastFetched, setWindLastFetched] = useState<Date | null>(null);
  const [currentCoordinates, setCurrentCoordinates] = useState<SpotCoordinates | null>(null);
  const [topSpotsData, setTopSpotsData] = useState<{ name: string; shortName: string; count: number; dist: string }[]>([]);
  const [favoriteSpots, setFavoriteSpots] = useState<SpotName[]>([]);
  const [homeSpotsLimitMessage, setHomeSpotsLimitMessage] = useState('');
  const [orderMode, setOrderMode] = useState<SpotOrderMode>('distance');
  const [manualOrder, setManualOrder] = useState<SpotName[]>([]);
  const [showYourSpotsPage, setShowYourSpotsPage] = useState(false);
  const [showDiscoverSpotsPage, setShowDiscoverSpotsPage] = useState(false);
  const [pendingSpotFromDiscover, setPendingSpotFromDiscover] = useState<string | null>(null);
  const openedFromDiscoverRef = useRef(false);
  const [discoverMapCenter, setDiscoverMapCenter] = useState<{ latitude: number; longitude: number; pendingName?: string } | null>(null);
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
  const hasSyncedSpotFollowersRef = useRef(false);
  const isNewSignupRef = useRef(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
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
  const effectiveSpotsLimit = authenticatedUserEmail === adminAccountSwitcherEmail ? 20 : HOME_SPOTS_LIMIT;
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
          if (!['session_planned', 'session_joined'].includes(row.type)) return false;
          if (row.read !== true) return true;
          if (!row.created_at) return false;
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
      .eq('read', false)
      .in('type', ['session_planned', 'session_joined']);

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
    if (activeAppUserId) void loadMyPersistentGroupsRef.current?.();
  }, [activeAppUserId]);

  useEffect(() => {
    if (!activeAppUserId) return;
    const channel = supabase
      .channel(`notifications-unread-${activeAppUserId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${activeAppUserId}` }, () => {
        void refreshUnreadBuzzState();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeAppUserId]);

  useEffect(() => {
    if (!activeAppUserId || favoriteSpots.length === 0 || hasSyncedSpotFollowersRef.current) return;
    hasSyncedSpotFollowersRef.current = true;
    void supabase.from('spot_followers').upsert(
      favoriteSpots.map((spot) => ({ user_id: activeAppUserId, spot_name: spot })),
      { onConflict: 'user_id,spot_name' }
    );
  }, [activeAppUserId, favoriteSpots]);

  const sendPushToRecipients = (
    recipientIds: string[],
    title: string,
    body: string,
    data: Record<string, unknown>,
  ) => {
    if (recipientIds.length === 0) return;
    supabase.rpc('send_push_to_users', {
      recipient_ids: recipientIds,
      title,
      body,
      data,
    }).then(({ error }) => {
      if (error) console.error('PUSH_RPC_ERROR', error);
    });
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

  useEffect(() => {
    if (profile && isNewSignupRef.current) {
      isNewSignupRef.current = false;
      setShowOnboarding(true);
    }
  }, [profile]);
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
      setResetPasswordError(error.message ?? 'Could not update password.');
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

  const handleDeleteAccount = async () => {
    if (!activeAppUserId) return;
    setIsDeletingAccount(true);
    try {
      const { error } = await supabase.rpc('delete_my_account');
      if (error) {
        console.error('DELETE_ACCOUNT_ERROR', error);
        Alert.alert('Error', 'Something went wrong. Please try again or contact us at ' + CONTACT_EMAIL);
        setIsDeletingAccount(false);
        return;
      }
      setShowDeleteConfirm(false);
      resetFlow();
      await supabase.auth.signOut();
    } catch (err) {
      console.error('DELETE_ACCOUNT_ERROR', err);
      setIsDeletingAccount(false);
    }
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
        .select('id, display_name, avatar_url, owner_uid, created_at, nationality, skill_level, dm_push_enabled')
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
    if (Platform.OS === 'web') return;

    // Push tonen als de app in de foreground is
    Buzz.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    // Badge wissen zodra de app geopend wordt
    void Buzz.setBadgeCountAsync(0);

    // Navigeer naar het juiste gesprek als de gebruiker op een push tikt
    const subscription = Buzz.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | null;
      console.log('PUSH_TAP_DATA', JSON.stringify(data));
      if (!data) return;
      if (data.type === 'dm' && data.conversationId) {
        setShowChat(true);
        setChatSubTab('dm');
        setExpandedDmId(data.conversationId);
        void loadDmConversationsRef.current?.();
        void loadDmMessagesRef.current?.(data.conversationId);
      } else if (data.type === 'chat_message' && data.subType === 'group' && data.groupKey) {
        setShowChat(true);
        setChatSubTab('session');
        setExpandedChatSession(data.groupKey);
        void loadSessionChatForTabRef.current?.(data.groupKey, data.spotName ?? '', data.sessionDay ?? getTodayLocalDateKey());
      } else if (data.type === 'chat_message' && data.spotName) {
        setShowChat(true);
        setActiveChatSpot(data.spotName);
        setActiveChatDayKey(getTodayLocalDateKey());
      } else if ((data.type === 'session_planned' || data.type === 'session_joined') && data.spotName) {
        setSelectedSpot(data.spotName as SpotName);
        setShowYourSpotsPage(false);
        setShowChat(false);
        setShowBuddies(false);
        setShowProfile(false);
        if (data.activeDay === 'tomorrow') setActiveDay('tomorrow');
        else if (data.activeDay === 'today') setActiveDay('today');
        void fetchSharedDataRef.current?.();
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const FALLBACK_EAS_PROJECT_ID = "6420f442-2be4-4803-9620-f769bc5def4f";

    const register = async () => {
      try {
        if (Platform.OS === 'web') {
          return;
        }

        const { status } = await Buzz.requestPermissionsAsync();
        if (status !== 'granted') return;

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
        const loadedFavoriteSpots = loadedFavoriteSpotsRaw.slice(0, effectiveSpotsLimit);
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

      
      if (currentCount >= effectiveSpotsLimit) {
        setHomeSpotsLimitMessage(`Your home screen can show up to ${effectiveSpotsLimit} spots. Remove one to add another.`);
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
        supabase.from('spot_followers').upsert(
          { user_id: activeAppUserId, spot_name: spotName },
          { onConflict: 'user_id,spot_name' }
        ).then(({ error }) => { if (error) console.error('SPOT_FOLLOWERS_UPSERT_ERROR', error, { userId: activeAppUserId, spotName }); });
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
      supabase.from('spot_followers').delete().eq('user_id', activeAppUserId).eq('spot_name', spotName)
        .then(({ error }) => { if (error) console.error('SPOT_FOLLOWERS_DELETE_ERROR', error); });
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
        .select('id, display_name, avatar_url, skill_level')
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

    // Automatisch terug-volgen zodat beide users buddy zijn van elkaar
    await supabase.from('user_follows').upsert({
      follower_id: payload.following_id,
      following_id: payload.follower_id,
      status: 'accepted',
      responded_at: new Date().toISOString(),
    }, { onConflict: 'follower_id,following_id' });

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
      userSkillLevel: typeof row.skill_level === 'number' ? row.skill_level : null,
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
        .select('id, user_id, text, created_at, media_url, media_type')
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
          media_url: message.media_url ?? null,
          media_type: message.media_type ?? null,
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
    const myVersion = ++fetchSharedDataVersionRef.current;
    const dayKey = selectedDayKey;
    if (!skipLoadingState) {
      setLoadingData(true);
    }
    try {




    const dayBounds = getDayBoundsForDayKey(dayKey);
    // Twee queries: sessies met expliciete session_day + sessies zonder session_day binnen created_at bounds
    const [sessionsWithDay, sessionsWithoutDay] = dayBounds
      ? await Promise.all([
          supabase.from('sessions').select('*').eq('session_day', dayKey).order('created_at', { ascending: true }),
          supabase.from('sessions').select('*').is('session_day', null).gte('created_at', dayBounds.start).lt('created_at', dayBounds.endExclusive).order('created_at', { ascending: true }),
        ])
      : [{ data: [], error: { message: 'INVALID_DAY_KEY' } }, { data: [], error: null }];
    const sessionsData = [...(sessionsWithDay.data ?? []), ...(sessionsWithoutDay.data ?? [])];
    const conversationResponse = selectedSpot && dayKey
      ? await supabase
          .from('conversations')
          .select('id')
          .eq('type', 'spot')
          .eq('spot_name', selectedSpot)
          .eq('session_day', dayKey)
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
        ? supabase.from('profiles').select('id, display_name, avatar_url, owner_uid, nationality, skill_level').in('id', sessionIdentityValues)
        : Promise.resolve({ data: [] as any[], error: null }),
      sessionIdentityValues.length
        ? supabase.from('profiles').select('id, display_name, avatar_url, owner_uid, nationality, skill_level').in('owner_uid', sessionIdentityValues)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);
    const profilesData = [...(profilesByIdData ?? []), ...(profilesByOwnerUidData ?? [])];
    for (const prof of profilesData) {
      if (prof.id && prof.display_name) {
        profileCacheRef.current.set(prof.id, { display_name: prof.display_name, avatar_url: prof.avatar_url ?? null });
      }
    }

    if (profilesByIdError || profilesByOwnerUidError) {
      console.error('Failed to load profiles for sessions:', profilesByIdError ?? profilesByOwnerUidError);
    }

    if (sessionsWithDay.error) {
      console.error('Failed to load sessions:', sessionsWithDay.error);
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
      // Stale fetch check: als een nieuwere fetch klaar is, negeer deze verouderde resultaten
      if (myVersion !== fetchSharedDataVersionRef.current) {
        if (!skipLoadingState) setLoadingData(false);
        return;
      }
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
        const key = `${spot}-${dayKey}`;
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

      if (myVersion !== fetchSharedDataVersionRef.current) {
        if (!skipLoadingState) setLoadingData(false);
        return;
      }
      setMessagesBySpot(nextMessagesBySpot);
    } else {
      
    }

    if (!skipLoadingState) {
      setLoadingData(false);
    }
    } catch (err) {
      console.error('FETCH_SHARED_DATA_ERROR', err);
      if (!skipLoadingState) setLoadingData(false);
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
      if (_event === 'PASSWORD_RECOVERY') {
        setIsPasswordResetRoute(true);
        setSession(nextSession);
        return;
      }

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
    if (!isAccountSwitcherVisible) return;

    const fetchAll = async () => {
      try {
        const { data, error } = await supabase
          .from('pending_spots')
          .select('id, name, latitude, longitude, submitted_by')
          .eq('status', 'pending')
          .order('created_at', { ascending: true });
        if (error) console.error('PENDING_SPOTS_FETCH_ERROR', error);
        const rows = data ?? [];
        const userIds = [...new Set(rows.map((r: any) => r.submitted_by).filter(Boolean))];
        const { data: profiles } = userIds.length
          ? await supabase.from('profiles').select('id, display_name').in('id', userIds)
          : { data: [] };
        const nameById: Record<string, string> = {};
        for (const p of (profiles ?? [])) nameById[p.id] = p.display_name ?? p.id;
        setPendingSpots(rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          latitude: r.latitude,
          longitude: r.longitude,
          submittedBy: r.submitted_by,
          submitterName: nameById[r.submitted_by] ?? r.submitted_by,
        })));
      } finally {
        setPendingSpotsLoaded(true);
      }
    };

    void fetchAll();

    const fetchCoordSuggestions = async () => {
      try {
        const { data, error } = await supabase
          .from('spot_coordinate_suggestions')
          .select('id, spot_name, submitted_by, current_latitude, current_longitude, suggested_latitude, suggested_longitude')
          .order('created_at', { ascending: true });
        if (error) console.error('COORD_SUGGESTIONS_FETCH_ERROR', error);
        const rows = data ?? [];
        const userIds = [...new Set(rows.map((r: any) => r.submitted_by).filter(Boolean))];
        const { data: profiles } = userIds.length
          ? await supabase.from('profiles').select('id, display_name').in('id', userIds)
          : { data: [] };
        const nameById: Record<string, string> = {};
        for (const p of (profiles ?? [])) nameById[p.id] = p.display_name ?? p.id;
        setCoordSuggestions(rows.map((r: any) => ({
          id: r.id,
          spotName: r.spot_name,
          currentLat: r.current_latitude,
          currentLng: r.current_longitude,
          suggestedLat: r.suggested_latitude,
          suggestedLng: r.suggested_longitude,
          submitterName: nameById[r.submitted_by] ?? r.submitted_by,
        })));
      } finally {
        setCoordSuggestionsLoaded(true);
      }
    };

    void fetchCoordSuggestions();

    const channel = supabase
      .channel('pending_spots_admin')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pending_spots' }, async (payload) => {
        const r = payload.new as any;
        if (r.status !== 'pending') return;
        const { data: profiles } = await supabase.from('profiles').select('id, display_name').eq('id', r.submitted_by);
        const submitterName = profiles?.[0]?.display_name ?? r.submitted_by;
        setPendingSpots((prev) => [...prev, { id: r.id, name: r.name, latitude: r.latitude, longitude: r.longitude, submittedBy: r.submitted_by, submitterName }]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pending_spots' }, (payload) => {
        const r = payload.old as any;
        setPendingSpots((prev) => prev.filter((s) => s.id !== r.id));
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [isAccountSwitcherVisible]);

  useEffect(() => {
    if (!activeAppUserId) return;
    void fetchBuddiesData();
  }, [showBuddies, showChat, showBroadcastDm, activeAppUserId]);

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
      const today = getTodayLocalDateKey();
      for (const spotName of favoriteSpots) {
        if (spotName === activeChatSpot) continue;
        const cKey = spotChatKey(spotName, today);
        if (!chatSpotMessages[cKey]?.loaded) {
          void loadSpotChatForTab(spotName, today);
        }
      }
    }
    if (chatSubTab === 'session') {
      void loadMySessionsForChatTab();
    }
    if (chatSubTab === 'group') void loadMyPersistentGroupsRef.current?.();
    // DMs altijd laden als chat opent (niet alleen bij tab-switch)
    void loadDmConversationsRef.current?.();
  }, [showChat, chatSubTab, activeAppUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeChatSpot && showChat) {
      const day = activeChatDayKey ?? getTodayLocalDateKey();
      const cKey = spotChatKey(activeChatSpot, day);
      setExpandedChatSession(null);
      setExpandedDmId(null);
      setExpandedChatSpot(cKey);
      setChatSubTab('spot');
      if (!chatSpotMessages[cKey]?.loaded) {
        void loadSpotChatForTab(activeChatSpot, day);
      }
      setActiveChatSpot(null);
      setActiveChatDayKey(null);
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
      openedFromDiscoverRef.current = false;
      return;
    }

    // Vanuit Discover geopend — sla alle validatie over
    if (openedFromDiscoverRef.current) {
      openedFromDiscoverRef.current = false;
      return;
    }

    if (!spotNames.includes(selectedSpot)) {
      const selectedCanonicalName = normalizeSpotName(selectedSpot);
      const knownSpot = spotDefinitions.find((spot) =>
        spot.canonicalName === selectedCanonicalName
        || normalizeSpotName(spot.spot) === selectedCanonicalName
      );
      if (knownSpot) {
        if (knownSpot.spot !== selectedSpot) setSelectedSpot(knownSpot.spot);
        return;
      }
      if (spotDefinitions.length === 0) return;
      setSelectedSpot(null);
    }
  }, [selectedSpot, spotDefinitions, spotNames]);

  useEffect(() => {
    if (!selectedSpot) return;
    if (windBySpot[selectedSpot] !== undefined) return;
    const def = spotDefinitions.find((s) => s.spot === selectedSpot);
    if (!def || !Number.isFinite(def.latitude) || !Number.isFinite(def.longitude)) return;
    void fetchWind(def.latitude, def.longitude).then((data) =>
      setWindBySpot((prev) => ({ ...prev, [selectedSpot]: data }))
    );
  }, [selectedSpot, spotDefinitions]);

  useEffect(() => {
    if (!activeAppUserId || spotNames.length === 0) {
      return;
    }

    void fetchSharedDataRef.current?.();
  }, [activeAppUserId, selectedDayKey, spotNames]);

  // Top spots: laad activiteit van alle spots voor today/tomorrow
  useEffect(() => {
    if (!activeAppUserId) return;
    void (async () => {
      const dayKey = activeDay === 'today' ? getTodayLocalDateKey() : getTomorrowLocalDateKey();
      const { data } = await supabase
        .from('sessions')
        .select('spot_name, user_id, end_time')
        .eq('session_day', dayKey)
        .not('status', 'in', '("finished","Uitchecken")')
        .is('checked_out_at', null);

      if (!data || data.length === 0) { setTopSpotsData([]); return; }

      const nowMinutes = getCurrentLocalMinutes();

      // Tel unieke users per spot, sla verlopen sessies over — normaliseer naam als key
      const countMap: Record<string, Set<string>> = {};
      const canonicalNameMap: Record<string, string> = {};
      for (const row of data) {
        if (!row.spot_name || !row.user_id) continue;
        if (row.end_time) {
          const endMinutes = toMinutes(row.end_time);
          if (!Number.isNaN(endMinutes) && endMinutes < nowMinutes) continue;
        }
        const key = normalizeSpotName(row.spot_name);
        if (!countMap[key]) countMap[key] = new Set();
        if (!canonicalNameMap[key]) canonicalNameMap[key] = row.spot_name;
        countMap[key].add(row.user_id);
      }

      // Koppel aan spotDefinitions voor afstand
      const withDist = Object.entries(countMap).map(([key, users]) => {
        const def = verifiedSpotDefinitions.find(s => normalizeSpotName(s.spot) === key);
        const spotName = def?.spot ?? canonicalNameMap[key] ?? key;
        const dist = (currentCoordinates && def)
          ? getDistanceMeters(currentCoordinates, { latitude: def.latitude, longitude: def.longitude })
          : null;
        return { name: spotName, count: users.size, distM: dist };
      });

      // Filter 50km, fallback nationaal
      const nearby = withDist.filter(s => s.distM !== null && s.distM <= 50000);
      const pool = nearby.length >= 3 ? nearby : withDist;

      const top5 = pool
        .sort((a, b) => b.count - a.count)
        .slice(0, isWebPlatform ? 10 : 7)
        .map(s => ({
          name: s.name.length > 10 ? s.name.split(' ').pop() ?? s.name : s.name,
          shortName: s.name,
          count: s.count,
          dist: s.distM !== null ? (s.distM < 1000 ? `${Math.round(s.distM)} m` : `${(s.distM / 1000).toFixed(0)} km`) : '',
        }));

      setTopSpotsData(top5);
    })();
  }, [activeDay, activeAppUserId, currentCoordinates, verifiedSpotDefinitions]);

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
    const today = getTodayLocalDateKey();
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

  // Session convIds preload — exact zelfde patroon als spot chat preload
  useEffect(() => {
    if (!activeAppUserId || !favoriteSpots.length) return;
    const today = getTodayLocalDateKey();
    const tomorrow = getTomorrowLocalDateKey();
    void (async () => {
      const { data: convs } = await supabase.from('conversations')
        .select('id, group_key, spot_name, session_day')
        .eq('type', 'group')
        .in('spot_name', favoriteSpots)
        .in('session_day', [today, tomorrow]);
      for (const conv of (convs ?? [])) {
        const gk: string = conv.group_key ?? conv.id;
        sessionConvIdsRef.current.add(conv.id);
        myConvIdsRef.current.add(conv.id);
        setChatSessionMessages(prev => prev[gk] ? prev : {
          ...prev,
          [gk]: { conversationId: conv.id, messages: [], loaded: false, spotName: conv.spot_name ?? undefined, sessionDay: conv.session_day ? String(conv.session_day) : today }
        });
      }
    })();
  }, [activeAppUserId, favoriteSpots]); // eslint-disable-line react-hooks/exhaustive-deps

  // DM convIds proactief in myConvIdsRef laden via participant kolommen (werkt ook zonder group_key)
  useEffect(() => {
    if (!activeAppUserId) return;
    void supabase.from('conversations')
      .select('id')
      .eq('type', 'dm')
      .or(`participant_a_id.eq.${activeAppUserId},participant_b_id.eq.${activeAppUserId}`)
      .then(({ data }) => { for (const c of (data ?? [])) myConvIdsRef.current.add(c.id); });
  }, [activeAppUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Profiel modal sluiten bij schermwissel
  useEffect(() => { setViewingOtherUserId(null); setShowFullscreenAvatar(false); }, [selectedSpot, showBuddies, showChat, showProfile, showYourSpotsPage, showDiscoverSpotsPage]);

  useEffect(() => {
    if (selectedSpot && activeDay === 'today') {
      void fetchSpotRating(selectedSpot, getTodayLocalDateKey());
    }
  }, [selectedSpot, activeDay]);


  // Open spot nadat Discover gesloten is (pending spot van Discover kaart klik)
  useEffect(() => {
    if (pendingSpotFromDiscover && !showDiscoverSpotsPage) {
      setSelectedSpot(pendingSpotFromDiscover as any);
      setPendingSpotFromDiscover(null);
    }
  }, [pendingSpotFromDiscover, showDiscoverSpotsPage]);

  useEffect(() => {
    if (!showDiscoverSpotsPage) {
      setDiscoverMapCenter(null);
    }
  }, [showDiscoverSpotsPage]);

  // Refs bijhouden voor gebruik in realtime callbacks (stale closure vermijden)
  useEffect(() => { showChatRef.current = showChat; }, [showChat]);
  useEffect(() => { chatSubTabRef.current = chatSubTab; }, [chatSubTab]);
  useEffect(() => { expandedChatSessionRef2.current = expandedChatSession; }, [expandedChatSession]);
  useEffect(() => { chatSpotMessagesRef.current = chatSpotMessages; }, [chatSpotMessages]);
  useEffect(() => { chatSessionMessagesRef.current = chatSessionMessages; }, [chatSessionMessages]);
  useEffect(() => { chatMySessionsRef.current = chatMySessions; }, [chatMySessions]);
  useEffect(() => { unreadBySessionRef.current = unreadBySession; }, [unreadBySession]);
  useEffect(() => { favoriteSpotsRef.current = favoriteSpots; }, [favoriteSpots]);

  const refreshWindForFollowedSpots = async (showSpinner = false) => {
    if (spotDefinitions.length === 0 || favoriteSpots.length === 0) return;
    const spotsToFetch = spotDefinitions.filter((s) =>
      favoriteSpots.includes(s.spot) && Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
    );
    if (showSpinner) setIsRefreshingWind(true);
    await Promise.all(
      spotsToFetch.map(async (s) => {
        const data = await fetchWind(s.latitude, s.longitude);
        setWindBySpot((prev) => ({ ...prev, [s.spot]: data }));
      })
    );
    setWindLastFetched(new Date());
    if (showSpinner) setIsRefreshingWind(false);
  };

  useEffect(() => {
    void refreshWindForFollowedSpots();
    const interval = setInterval(() => void refreshWindForFollowedSpots(), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [favoriteSpots, spotDefinitions]);

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
          // Alleen negeren als spot_name wél gezet is maar niet gevolgd — DMs (spot_name null) altijd doorlaten
          if (rawName && !matchedInFavorites) return;
          if (matchedInFavorites) myConvIdsRef.current.add(convId);
        }

        // Profiel ophalen voor de afzender — cache om N+1 queries te vermijden
        let p = profileCacheRef.current.get(row.user_id) ?? null;
        if (!p) {
          const { data: fetched } = await supabase.from('profiles').select('display_name, avatar_url').eq('id', row.user_id).maybeSingle();
          if (fetched) {
            p = { display_name: fetched.display_name, avatar_url: fetched.avatar_url ?? null };
            profileCacheRef.current.set(row.user_id, p);
          }
        }
        const newMsg = { id: row.id, text: row.text ?? '', createdAt: row.created_at ?? new Date().toISOString(), userId: row.user_id, display_name: p?.display_name ?? 'Unknown', avatar_url: p?.avatar_url ?? null };

        // Spot naam: direct uit het bericht of via ref
        // favoriteSpotsRef.current gebruiken (NIET favoriteSpots — stale closure!)
        const rowFull = payload.new as { spot_name?: string };
        const spotNameFromMsg = rowFull.spot_name ?? null;
        // chatSpotMessages gebruikt compound keys (SpotName|||day) — extraheer alleen de spotnaam
        const chatKeyFromRef = Object.entries(chatSpotMessagesRef.current).find(([, data]) => data.conversationId === convId)?.[0] ?? null;
        const spotNameFromRef = chatKeyFromRef ? spotNameFromChatKey(chatKeyFromRef) : null;
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
        const isKnownSessionConv = sessionConvIdsRef.current.has(convId) ||
          Object.values(chatSessionMessagesRef.current).some((d) => d.conversationId === convId);

        // Type-check altijd uitvoeren — ook als matchedSpotName null is (spot niet gevolgd)
        // Fix: app→web session chat werkt ook als web de spot niet volgt
        if (!isKnownSessionConv) {
          const { data: typeRow } = await supabase.from('conversations')
            .select('type, spot_name').eq('id', convId).maybeSingle();
          if (typeRow?.type === 'group') {
            // Sessie chat — altijd doorsturen ook zonder spotName
            sessionConvIdsRef.current.add(convId);
            // Vul matchedSpotName in als we hem niet hadden
            if (!matchedSpotName && typeRow?.spot_name) {
              matchedSpotName = typeRow.spot_name;
            }
          } else if (typeRow?.type === 'spot' && matchedSpotName) {
            // Spot chat — alleen als spot bekend is
            const isOwnMessage = row.user_id === (activeProfile?.id ?? activeAppUserId);
            if (!isOwnMessage) {
              setSpotsWithUnread(prev => { const k = matchedSpotName!.toLowerCase(); return { ...prev, [k]: (prev[k] ?? 0) + 1 }; });
            }
            const msgDay = String((payload.new as any).session_day ?? getTodayLocalDateKey());
            const targetChatKey = chatKeyFromRef ?? spotChatKey(matchedSpotName ?? '', msgDay);
            setChatSpotMessages(prev => {
              const data = prev[targetChatKey];
              if (!data) return { ...prev, [targetChatKey]: { conversationId: convId, messages: [newMsg], loaded: false, dayKey: msgDay } };
              const isDup = data.messages.some(m => m.id === row.id || (m.userId === row.user_id && m.text === row.text && Math.abs(new Date(m.createdAt ?? 0).getTime() - new Date(row.created_at ?? 0).getTime()) < 10000));
              if (isDup) return prev;
              return { ...prev, [targetChatKey]: { ...data, conversationId: convId, messages: [...data.messages, newMsg] } };
            });
            return;
          } else if (typeRow?.type === 'dm') {
            // DM — verwerk ook als convId nog niet in myConvIdsRef zit
            myConvIdsRef.current.add(convId);
            const isOwnDm = row.user_id === (activeProfile?.id ?? activeAppUserId);
            const watchingDm = showChatRef.current && chatSubTabRef.current === 'dm';
            if (!watchingDm && !isOwnDm) {
              setUnreadByDm(prev => ({ ...prev, [convId]: (prev[convId] ?? 0) + 1 }));
            }
            setDmMessages(prev => {
              const existing = prev[convId] ?? [];
              const isDup = existing.some((m: any) => m.id === row.id || (m.userId === row.user_id && m.text === row.text && Math.abs(new Date(m.createdAt ?? 0).getTime() - new Date(row.created_at ?? 0).getTime()) < 10000));
              if (isDup) return prev;
              return { ...prev, [convId]: [...existing, newMsg] };
            });
            void loadDmConversationsRef.current?.();
            return;
          } else if (!typeRow?.type) {
            return; // onbekend type — negeer
          }
        }

        // === SESSION CHAT HANDLER (spot chat patroon) ===
        if (isKnownSessionConv || sessionConvIdsRef.current.has(convId)) {
          // Zoek bestaand entry via conversationId
          const existingEntry = Object.entries(chatSessionMessagesRef.current).find(([, d]) => d.conversationId === convId);
          let gk: string;
          let spotName: string | undefined;
          let sessionDay: string | undefined;

          if (existingEntry) {
            gk = existingEntry[0];
            spotName = existingEntry[1].spotName;
            sessionDay = existingEntry[1].sessionDay;
          } else {
            // Haal group_key + spotName + sessionDay op uit DB (éénmalig)
            const { data: conv } = await supabase.from('conversations')
              .select('group_key, spot_name, session_day').eq('id', convId).maybeSingle();
            gk = conv?.group_key ?? convId;
            spotName = conv?.spot_name ?? undefined;
            sessionDay = conv?.session_day ? String(conv.session_day) : getTodayLocalDateKey();
            myConvIdsRef.current.add(convId);
          }

          // Sla bericht op — exact zelfde patroon als spot chat
          setChatSessionMessages(prev => {
            const existing = prev[gk] ?? { conversationId: convId, messages: [], loaded: false, spotName, sessionDay };
            if (existing.messages.some((m: any) => m.id === row.id)) return prev;
            return { ...prev, [gk]: { ...existing, conversationId: convId, spotName: spotName ?? existing.spotName, sessionDay: sessionDay ?? existing.sessionDay, messages: [...existing.messages, newMsg] } };
          });

          // Badge — alleen als gebruiker deze sessie niet actief bekijkt én niet de afzender is
          const isOwnSessionMsg = row.user_id === (activeProfile?.id ?? activeAppUserId);
          const watching = showChatRef.current && chatSubTabRef.current === 'session' && expandedChatSessionRef2.current === gk;
          if (!watching && !isOwnSessionMsg) setUnreadBySession(prev => ({ ...prev, [gk]: (prev[gk] ?? 0) + 1 }));
          return;
        }

        // DM bijwerken — vlag buiten setState
        const isDmConv = myConvIdsRef.current.has(convId) && !sessionConvIdsRef.current.has(convId);
        if (isDmConv) {
          const watchingDm = showChatRef.current && chatSubTabRef.current === 'dm' && expandedChatSessionRef2.current === null && expandedChatSpot === null;
          if (!watchingDm) {
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
    const userId = activeAppUserId;
    if (!userId) return null;
    const openCheckedInSessions = allSessions
      .filter((s) => s.userId === userId)
      .filter((s) => Boolean(s.checkedInAt) && !s.checkedOutAt)
      .filter((s) => s.status === 'Is er al' || s.status === 'live');
    return getMostRecentSessionByCreatedAt(openCheckedInSessions);
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

    const onPosition = (position: GeolocationPosition) => {
      if (!active) return;
      const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setCurrentCoordinates(coordinates);
      setNearestSpotResult(getNearestSpot(coordinates, verifiedSpotDefinitions));
      setIsResolvingNearestSpot(false);
    };

    const onError = () => {
      if (!active) return;
      setCurrentCoordinates(null);
      setNearestSpotResult(null);
      setIsResolvingNearestSpot(false);
    };

    const watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
    });

    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
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
        nowMinutes: currentLocalMinutes,
      }),
    [safeSessions, selectedSpot, activeDayKey, activeProfile, timelineSessions, timelineFilter, followingUserIds, currentLocalMinutes],
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
      .filter((sessionItem) => {
        const state = getSessionViewState(sessionItem);
        return state === 'going' || state === 'maybe';
      })
      .filter((sessionItem) => !isSessionExpired(sessionItem));
    

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
      
      

      const checkoutSucceeded = await handleQuickCheckOut();
      if (!checkoutSucceeded) {
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
        .filter((hour) => hour >= 7 && hour <= 21)
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
  const canAddSelectedSpotToMySpots = Boolean(currentSpot && !isAlreadyAdded && safeMySpots.length < effectiveSpotsLimit);
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
  const shouldShowSpotCheckIn = activeDay === 'today' && !hasActiveCheckedInSession;
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
    && joinedSession.status !== 'finished'
    && joinedSession.status !== 'Uitchecken',
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
      // Als er een open gesprek is, sluit dat eerst (terug naar lijst)
      if (expandedDmId || expandedChatSpot || expandedChatSession) {
        setExpandedDmId(null);
        setExpandedChatSpot(null);
        setExpandedChatSession(null);
      } else {
        goHomeFromNativeSwipe();
      }
    }
  };

  const renderOtherUserProfileModal = () => {
    if (!viewingOtherUserId) return null;
    return (
      <Pressable
        onPress={() => { setViewingOtherUserId(null); setShowFullscreenAvatar(false); }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 200, justifyContent: 'flex-end' }}
      >
        <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#0d1b2a', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
          {viewingOtherProfile ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <Pressable onPress={() => { if (viewingOtherProfile.avatar_url) setShowFullscreenAvatar(true); }}>
                  <Avatar uri={viewingOtherProfile.avatar_url} size={60} name={viewingOtherProfile.display_name} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>{viewingOtherProfile.display_name}</Text>
                    {viewingOtherProfile.skill_level ? (
                      <Text style={{ color: '#FFD166', fontSize: 14 }}>{'★'.repeat(viewingOtherProfile.skill_level)}</Text>
                    ) : null}
                  </View>
                  {viewingOtherProfile.nationality ? (() => { const c = getCountry(viewingOtherProfile.nationality); return c ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}><Flag code={c.code} size={14} /><Text style={{ color: theme.textMuted, fontSize: 13 }}>{c.name}</Text></View> : null; })() : null}
                  {viewingOtherProfile.skill_level ? (
                    <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                      {['', 'Beginner', 'Novice', 'Intermediate', 'Advanced', 'Expert / Pro'][viewingOtherProfile.skill_level]}
                    </Text>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {followingUserIds.includes(viewingOtherUserId) ? (
                    <Pressable
                      onPress={async () => {
                        await handleUnfollowUser(viewingOtherUserId);
                        setViewingOtherUserId(null);
                        setShowFullscreenAvatar(false);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                    >
                      <Ionicons name="person-remove-outline" size={16} color="#ff4d4d" />
                      <Text style={{ color: '#ff4d4d', fontSize: 12, fontWeight: '700' }}>Remove buddy</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => { setViewingOtherUserId(null); setShowFullscreenAvatar(false); }}>
                    <Ionicons name="close" size={22} color={theme.textMuted} />
                  </Pressable>
                </View>
              </View>
              <View style={{ gap: 10 }}>
                {followingUserIds.includes(viewingOtherUserId) ? null : outgoingFollowStatusesByUserId[viewingOtherUserId] === 'pending' ? (
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
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}
                  >
                    <Ionicons name="person-add-outline" size={16} color="#4DB8FF" />
                    <Text style={{ color: theme.textSoft, fontSize: 14, fontWeight: '800' }}>Add buddy</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={async () => {
                    const convId = await openDmWithUser(viewingOtherUserId);
                    if (!convId) return;
                    void loadDmMessages(convId);
                    void loadDmConversationsRef.current?.();
                    setViewingOtherUserId(null);
                    setChatSubTab('dm');
                    setExpandedDmId(convId);
                    setShowChat(true);
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
        {showFullscreenAvatar && viewingOtherProfile?.avatar_url ? (
          <Pressable
            onPress={() => setShowFullscreenAvatar(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
          >
            <Image source={{ uri: viewingOtherProfile.avatar_url }} style={{ width: 300, height: 300, borderRadius: 150 }} resizeMode="cover" />
          </Pressable>
        ) : null}
      </Pressable>
    );
  };

  const renderNativeTopBar = () => {
    if (isWebPlatform) return null;

    return (
      <>
        <View
          style={{
            height: 88,
            backgroundColor: theme.bg,
            borderBottomWidth: isNotificationInboxExpanded ? 0 : 1,
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
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4, overflow: 'hidden' }}>
            <Image
              source={require('./assets/wordmark.png')}
              resizeMode="contain"
              style={{ width: 440, height: 110, transform: [{ translateY: 20 }] }}
            />
          </View>
          <Pressable
            onPress={() => {
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
              <Ionicons name={isNotificationInboxExpanded ? 'notifications' : 'notifications-outline'} size={26} color="#ffffff" />
              {unreadCount > 0 && !isNotificationInboxExpanded ? (
                <View style={{ position: 'absolute', top: -4, right: -6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: theme.bg, fontSize: 10, fontWeight: '900' }}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
          <Pressable
            onPress={() => { goHomeFromNativeSwipe(); setShowProfile(true); }}
            style={{ width: 60, height: 88, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
          >
            <Avatar uri={profile?.avatar_url ?? null} size={32} nationality={profile?.nationality} />
          </Pressable>
        </View>
        {isNotificationInboxExpanded ? (
          <View style={{ backgroundColor: theme.bg, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 }}>Activity</Text>
              <Pressable onPress={() => setIsNotificationInboxExpanded(false)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="close" size={16} color={theme.textMuted} />
              </Pressable>
            </View>
            {notificationRows.length === 0 ? (
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>No recent activity</Text>
            ) : (
              notificationRows.slice(0, 8).map((row) => {
                const summaryText = getNotificationInboxSummary(row);
                if (!summaryText) return null;
                const timeAgo = row.created_at ? (() => {
                  const diff = Date.now() - new Date(row.created_at).getTime();
                  const mins = Math.floor(diff / 60000);
                  if (mins < 60) return `${mins}m ago`;
                  const hrs = Math.floor(mins / 60);
                  if (hrs < 24) return `${hrs}h ago`;
                  return `${Math.floor(hrs / 24)}d ago`;
                })() : '';
                return (
                  <Pressable key={row.id} onPress={() => setIsNotificationInboxExpanded(false)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={row.read ? 'notifications-outline' : 'notifications'} size={16} color={row.read ? theme.textMuted : theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: row.read ? theme.textSoft : theme.text, fontSize: 13, fontWeight: row.read ? '400' : '700' }} numberOfLines={2}>{summaryText}</Text>
                      <Text style={{ color: theme.textMuted, fontSize: 11 }}>{timeAgo}</Text>
                    </View>
                    {!row.read && <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: theme.primary }} />}
                  </Pressable>
                );
              })
            )}
          </View>
        ) : null}
      </>
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
      { key: 'chat', icon: 'chatbubbles-outline', iconActive: 'chatbubbles', label: 'Messages', onPress: () => navigateNative('chat'), badge: chatUnreadCount > 0 && !isChat ? chatUnreadCount : null, isActive: isChat },
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
      {showPlanModal && (
        <Pressable
          onPress={() => setShowPlanModal(false)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 200, justifyContent: 'flex-end' }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#1e2530', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20 }}>
              <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900' }}>Plan a session</Text>
              <Pressable onPress={() => setShowPlanModal(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </Pressable>
            </View>
            {favoriteSpots.length === 0 && (
              <Text style={{ color: theme.textMuted, fontSize: 14, paddingHorizontal: 24, marginBottom: 12 }}>Add spots first in the Spots tab.</Text>
            )}
            {favoriteSpots.map((spotName) => (
              <Pressable
                key={`plan-modal-nav-${spotName}`}
                onPress={() => { setShowPlanModal(false); setSelectedSpot(spotName as SpotName); setShowYourSpotsPage(false); setShowDiscoverSpotsPage(false); setShowBuddies(false); setShowProfile(false); setShowChat(false); }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', opacity: pressed ? 0.7 : 1 })}
              >
                <Ionicons name="location-outline" size={20} color="#ffffff" />
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', flex: 1 }}>{spotName}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => { setShowPlanModal(false); navigateNative('spots'); }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 24, marginTop: 4, opacity: pressed ? 0.7 : 1 })}
            >
              <Ionicons name="search-outline" size={16} color={theme.textMuted} />
              <Text style={{ color: theme.textMuted, fontSize: 15, fontWeight: '600' }}>Search other spots</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}
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
    setViewingOtherUserId(null);
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

  useEffect(() => {
    if (activeDay !== 'today') return;
    const dayKey = getTodayLocalDateKey();
    for (const card of homeSpotCards) {
      void fetchSpotRating(card.spot as SpotName, dayKey);
    }
  }, [homeSpotCards.map(c => c.spot).join(','), activeDay]); // eslint-disable-line react-hooks/exhaustive-deps

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
      subtitle: `${group.hasPlannedWindow ? `${group.startTime} – ${group.endTime}` : group.startTime} · ${riderCount} rider${riderCount === 1 ? '' : 's'}`,
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
      const referenceIso = session.checked_in_at ?? session.created_at;
      const referenceMs = referenceIso ? new Date(referenceIso).getTime() : null;
      if (referenceMs === null || Number.isNaN(referenceMs)) return false;
      const ageHours = (Date.now() - referenceMs) / (1000 * 60 * 60);
      return ageHours < 24;
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
        // Stale active session at same spot not visible in UI (session_day mismatch) — check it out and create a fresh check-in
        await supabase
          .from('sessions')
          .update({ status: 'Uitchecken', checked_out_at: new Date().toISOString() })
          .eq('id', activeSession.id)
          .eq('user_id', activeProfileId);
        // Fall through to create fresh check-in
      } else {
        return { ok: false, reason: `already_checked_in_other_spot:${activeSession.spot_name}` };
      }
    }

    const latestOpenSession = latestOpenSessionResponse.data;
    if (latestOpenSession?.status === 'Is er al') {
      if (normalizeSpotName(latestOpenSession.spot_name) === normalizeSpotName(canonicalSpot)) {
        // Stale check-in at same spot (e.g. auto-checkout missed) — checkout old session and create fresh check-in
        const staleCheckoutResult = await supabase
          .from('sessions')
          .update({ status: 'Uitchecken', checked_out_at: new Date().toISOString() })
          .eq('id', latestOpenSession.id)
          .eq('user_id', activeProfileId);
        if (staleCheckoutResult.error) {
          return { ok: false, reason: 'stale_checkout_failed', error: staleCheckoutResult.error };
        }
        // Fall through to create new check-in below
      } else {
        return { ok: false, reason: `already_checked_in_other_spot:${latestOpenSession.spot_name}` };
      }
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

    // Check for existing session today at this spot (e.g. after checkout) — update instead of insert to avoid unique constraint
    const { data: existingTodaySession, error: existingTodaySessionError } = await supabase
      .from('sessions')
      .select('id, spot_name, session_day, status, checked_out_at')
      .eq('user_id', activeProfileId)
      .eq('spot_name', canonicalSpot)
      .eq('session_day', activeDayKey)
      .maybeSingle();


    if (existingTodaySession?.id) {
      const reuseResult = await supabase
        .from('sessions')
        .update({
          status: 'Is er al',
          intent: 'definitely',
          checked_in_at: nowIso,
          checked_out_at: null,
          start_time: getNowLocalHourMinute(),
          end_time: getQuickCheckInEndTime(),
        })
        .eq('id', existingTodaySession.id)
        .eq('user_id', activeProfileId);
      if (reuseResult.error) {
        return { ok: false, reason: 'reuse_session_failed', error: reuseResult.error };
      }
      await fetchSharedData();
      return { ok: true, spot: canonicalSpot };
    }

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
        setPendingCheckinPush({ ids, actorName, spotName: checkInResult.spot });
      });
    }

    return { errorMessage: null, checkedInSpot: checkInResult.spot };
  };

  const handleUpdateSessionStatus = async (status: SessionStatus) => {
    setSessionActionError('');
    const actionLabel = status === 'Is er al' ? 'SPOT_PAGE_CHECKIN' : 'SPOT_PAGE_CHECKOUT';
    

    const activeProfileId = activeProfile?.id ?? null;

    if (!activeProfileId) {
      setSessionActionError('Profile not loaded. Please wait and try again.');
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
      setConditionsRatingSpot(selectedSpot);
      setShowConditionsRating(true);
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

  const fetchSpotRating = async (spot: SpotName, dayKey: string) => {
    const { data, error } = await supabase
      .from('spot_ratings')
      .select('wind_knots, crowd_rating, wind_direction, water_conditions, created_at')
      .eq('spot_name', spot)
      .eq('session_day', dayKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) { console.error('fetchSpotRating error:', error); return; }
    if (!data) {
      setSpotRatingsMap((prev) => { const next = { ...prev }; delete next[spot]; return next; });
      return;
    }
    setSpotRatingsMap((prev) => ({
      ...prev,
      [spot]: {
        windKnots: data.wind_knots ?? null,
        crowdRating: data.crowd_rating ?? null,
        windDirection: data.wind_direction ?? null,
        waterConditions: data.water_conditions ?? null,
        ratedAt: data.created_at ?? null,
      },
    }));
  };

  const fireCheckinPush = (push: { ids: string[]; actorName: string; spotName: string } | null, conditionsParts: string[]) => {
    if (!push || !push.ids.length) return;
    const body = conditionsParts.length > 0
      ? `${push.actorName} checked in at ${push.spotName} · ${conditionsParts.join(' · ')}`
      : `${push.actorName} checked in at ${push.spotName}`;
    void sendPushToRecipients(push.ids, `${push.actorName} checked in`, body, { type: 'checkin', spotName: push.spotName });
    setPendingCheckinPush(null);
  };

  const saveConditionsRating = async () => {
    const ratingUserId = activeProfile?.id ?? activeAppUserId;
    const dayKey = selectedDayKey;
    if (!conditionsRatingSpot || !ratingUserId) {
      fireCheckinPush(pendingCheckinPush, []);
      setShowConditionsRating(false);
      return;
    }
    const { error: insertError } = await supabase.from('spot_ratings').insert({
      spot_name: conditionsRatingSpot,
      session_day: dayKey,
      user_id: ratingUserId,
      wind_knots: conditionsWindKnots,
      crowd_rating: conditionsCrowd,
      wind_direction: conditionsWindDir,
      water_conditions: conditionsWater,
    });
    if (insertError) console.error('spot_ratings insert error:', insertError);
    void fetchSpotRating(conditionsRatingSpot, dayKey);
    const parts: string[] = [];
    if (conditionsWindKnots != null) parts.push(`${conditionsWindKnots} kn`);
    if (conditionsWindDir) parts.push(conditionsWindDir);
    if (conditionsWater) parts.push(conditionsWater);
    fireCheckinPush(pendingCheckinPush, parts);
    setShowConditionsRating(false);
    setConditionsWindKnots(null);
    setConditionsCrowd(null);
    setConditionsWindDir(null);
    setConditionsWater(null);
  };

  const skipConditionsRating = () => {
    fireCheckinPush(pendingCheckinPush, []);
    setShowConditionsRating(false);
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
    setConditionsRatingSpot(resolvedSpot);
    setShowConditionsRating(true);
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

  const handleQuickCheckOut = async (): Promise<boolean> => {

    setHomeQuickCheckInError('');

    const activeProfileId = activeProfile?.id ?? null;

    if (!activeProfileId) {
      return false;
    }

    if (!activeCheckedInSession) {
      setHomeQuickCheckInError('Check eerst in');

      return false;
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

      return false;
    }



    setHomeQuickCheckInError('');
    await fetchSharedData();
    return true;
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
        isNewSignupRef.current = true;
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
    return <NameSetupScreen userId={session.user.id} userEmail={session.user.email ?? ''} onSaved={(savedProfile) => {
      setProfile(savedProfile);
      activeProfileOwnerUidRef.current = session.user.id;
      void AsyncStorage.setItem(getActiveProfileStorageKey(session.user.id), savedProfile.id);
    }} />;
  }

  if (showOnboarding) {
    return <OnboardingScreen
      profile={profile}
      onComplete={(selectedSpots) => {
        if (selectedSpots.length > 0) {
          setFavoriteSpots(selectedSpots);
          void AsyncStorage.setItem(favoriteSpotsStorageKey, JSON.stringify(selectedSpots));
        }
        setShowOnboarding(false);
      }}
    />;
  }

  const loadSpotChatForTab = async (spotName: string, dayKey?: string) => {
    const day = dayKey ?? getTodayLocalDateKey();
    const cKey = spotChatKey(spotName, day);
    const convResponse = await supabase.from('conversations').select('id').eq('type', 'spot').eq('spot_name', spotName).eq('session_day', day).limit(1);
    const convId = convResponse.data?.[0]?.id ?? null;
    if (!convId) {
      setChatSpotMessages((prev) => ({ ...prev, [cKey]: { conversationId: null, messages: [], loaded: true, dayKey: day } }));
      return;
    }
    const msgResponse = await supabase.from('messages').select('id, user_id, text, created_at, media_url, media_type').eq('conversation_id', convId).order('created_at', { ascending: true });
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
    setChatSpotMessages((prev) => ({ ...prev, [cKey]: { conversationId: convId, messages: enriched, loaded: true, dayKey: day } }));
  };

  const uploadGroupAvatar = async (localUri: string, groupId: string): Promise<string | null> => {
    try {
      const path = `group-${groupId}/avatar.jpg`;
      const response = await fetch(localUri);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      const { error } = await supabase.storage.from('avatars').upload(path, arrayBuffer, { upsert: true, contentType: 'image/jpeg' });
      if (error) { console.error('GROUP_AVATAR_UPLOAD_ERROR', error); return null; }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      return data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null;
    } catch (e) { console.error('GROUP_AVATAR_EXCEPTION', e); return null; }
  };

  const openGroupMembersPopup = async (groupId: string) => {
    // Gebruik memberIds al geladen in state — geen extra query nodig
    const grp = myPersistentGroups.find((g) => g.id === groupId);
    const ids = grp?.memberIds ?? [];
    if (!ids.length) { setGroupMembersPopup([]); return; }
    const { data: profiles } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', ids);
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const { data: memberRoles } = await supabase.from('group_members').select('user_id, role').eq('group_id', groupId);
    const roleMap = new Map((memberRoles ?? []).map((m) => [m.user_id, m.role]));
    setGroupMembersPopup(ids.map((id) => ({ id, display_name: pmap.get(id)?.display_name ?? 'Unknown', avatar_url: pmap.get(id)?.avatar_url ?? null, role: roleMap.get(id) ?? 'member' })));
  };

  const pickAndUploadGroupAvatar = async (groupId: string) => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (r.canceled || !r.assets[0]) return;
    const uri = r.assets[0].uri;
    try {
      const path = `group-avatars/${groupId}.jpg`;
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const { error: upErr } = await supabase.storage.from('chat-media').upload(path, arrayBuffer, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) { Alert.alert('Upload error', upErr.message); return; }
      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
      const newUrl = urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : null;
      if (!newUrl) { Alert.alert('URL error', 'Could not get public URL'); return; }
      const { error: dbErr } = await supabase.from('groups').update({ avatar_url: newUrl }).eq('id', groupId);
      if (dbErr) { Alert.alert('DB error', dbErr.message); return; }
      setMyPersistentGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, avatar_url: newUrl } : g));
    } catch (e: any) {
      Alert.alert('Exception', e?.message ?? String(e));
    }
  };

  const uploadChatMedia = async (localUri: string, userId: string): Promise<string | null> => {
    try {
      const filePath = `${userId}/${Date.now()}.jpg`;
      const response = await fetch(localUri);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      const { error } = await supabase.storage.from('chat-media').upload(filePath, arrayBuffer, { contentType: 'image/jpeg', upsert: false });
      if (error) { console.error('CHAT_MEDIA_UPLOAD_ERROR', error); return null; }
      const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
      return data.publicUrl ?? null;
    } catch (e) {
      console.error('CHAT_MEDIA_UPLOAD_EXCEPTION', e);
      return null;
    }
  };

  const handlePickChatMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.7 });
    if (!result.canceled && result.assets[0]) setPendingMediaUri(result.assets[0].uri);
  };

  const sendSpotMessageInChatTab = async (chatKey: string, mediaUrl: string | null = null) => {
    const text = spotChatInputInChat.trim();
    const senderId = activeProfile?.id ?? activeAppUserId ?? null;
    const spotName = spotNameFromChatKey(chatKey);
    const day = dayFromChatKey(chatKey);
    if (!text && !mediaUrl || !chatKey || !senderId) return;
    let convId = chatSpotMessages[chatKey]?.conversationId ?? null;
    if (!convId) {
      const existing = await supabase.from('conversations').select('id').eq('type', 'spot').eq('spot_name', spotName).eq('session_day', day).limit(1);
      convId = existing.data?.[0]?.id ?? null;
      if (!convId) {
        const { data: created } = await supabase.from('conversations').insert({ type: 'spot', spot_name: spotName, session_day: day }).select('id').single();
        convId = created?.id ?? null;
      }
    }
    if (!convId) return;
    const { error } = await supabase.from('messages').insert({ user_id: senderId, text: text || null, spot_name: spotName, session_day: day, conversation_id: convId, created_at: new Date().toISOString(), media_url: mediaUrl ?? null, media_type: mediaUrl ? 'image' : null });
    if (error) { console.error('CHAT_TAB_SPOT_SEND_ERROR', error); return; }
    setSpotChatInputInChat('');
    setTimeout(() => chatSpotScrollRef.current?.scrollToEnd({ animated: true }), 50);
    const newMsg = { id: `${convId}-${Date.now()}`, text: text || null, createdAt: new Date().toISOString(), userId: senderId, display_name: activeProfile?.display_name ?? 'You', avatar_url: activeProfile?.avatar_url ?? null, media_url: mediaUrl ?? null, media_type: mediaUrl ? 'image' : null };
    setChatSpotMessages((prev) => ({ ...prev, [chatKey]: { conversationId: convId, messages: [...(prev[chatKey]?.messages ?? []), newMsg], loaded: true } }));
    // Push naar spot-volgers via SECURITY DEFINER RPC (bypast RLS op spot_followers)
    if (activeProfile?.id) {
      const actorName = activeProfile.display_name?.trim() || 'Someone';
      supabase.rpc('send_spot_chat_push', {
        spot_name_param: spotName,
        actor_profile_id: activeProfile.id,
        title: `${actorName} · ${spotName}`,
        body: text,
        data: { type: 'chat_message', spotName },
      }).then(({ error }) => { if (error) console.error('SPOT_CHAT_PUSH_ERROR', error); });
    }
  };

  const loadMySessionsForChatTab = async () => {
    if (!activeAppUserId) return;
    const today = getTodayLocalDateKey();
    const tomorrow = getTomorrowLocalDateKey();
    // Laad mijn sessies + hun conversations in één keer
    const [{ data: sessions }, { data: convs }] = await Promise.all([
      supabase.from('sessions').select('id, spot_name, session_day, start_time, end_time, source_session_id').eq('user_id', activeAppUserId).in('session_day', [today, tomorrow]),
      supabase.from('conversations').select('id, group_key, spot_name, session_day').eq('type', 'group').in('session_day', [today, tomorrow]),
    ]);
    for (const session of (sessions ?? [])) {
      const sourceId = (session as any).source_session_id ?? session.id;
      const expectedGk = `spot:${normalizeSpotName(session.spot_name ?? '')}:source:${sourceId}`;
      // Match op group_key zodat elke sessie-groep zijn eigen conversation krijgt
      const conv = (convs ?? []).find(c => c.group_key === expectedGk) ??
        // Fallback: eerste conversation voor dit spot+day als group_key nog niet bestaat
        (convs ?? []).find(c =>
          c.spot_name?.toLowerCase() === session.spot_name?.toLowerCase() &&
          String(c.session_day) === String(session.session_day)
        );
      if (conv) {
        const gk: string = conv.group_key ?? conv.id;
        sessionConvIdsRef.current.add(conv.id);
        myConvIdsRef.current.add(conv.id);
        setChatSessionMessages(prev => prev[gk]?.conversationId ? prev : {
          ...prev,
          [gk]: { conversationId: conv.id, messages: [], loaded: false, spotName: session.spot_name ?? undefined, sessionDay: String(session.session_day), sessionStart: session.start_time ?? undefined, sessionEnd: session.end_time ?? undefined }
        });
      } else {
        setChatSessionMessages(prev => prev[expectedGk] ? prev : {
          ...prev,
          [expectedGk]: { conversationId: null, messages: [], loaded: false, spotName: session.spot_name ?? undefined, sessionDay: String(session.session_day), sessionStart: session.start_time ?? undefined, sessionEnd: session.end_time ?? undefined }
        });
      }
    }
  };

  const loadSessionChatForTab = async (groupKey: string, spotName: string, sessionDay: string) => {
    // Initialiseer entry direct zodat realtime berichten niet worden gedropped tijdens laden
    setChatSessionMessages((prev) => prev[groupKey] ? prev : { ...prev, [groupKey]: { conversationId: null, messages: [], loaded: false, spotName, sessionDay } });
    // Gebruik al opgeslagen conversationId (bijv. vanuit realtime fallback) om spot_name mismatch te vermijden
    let convId: string | null = chatSessionMessagesRef.current[groupKey]?.conversationId ?? null;
    if (!convId) {
      const convResponse = await supabase.from('conversations').select('id').eq('type', 'group').eq('group_key', groupKey).limit(1);
      convId = convResponse.data?.[0]?.id ?? null;
    }
    if (!convId) {
      const { data: created, error } = await supabase.from('conversations').insert({ type: 'group', spot_name: spotName, session_day: sessionDay, group_key: groupKey }).select('id').single();
      if (error) console.error('GROUP_CONV_CREATE_ERROR', error);
      convId = created?.id ?? null;
    }
    if (!convId) {
      setChatSessionMessages((prev) => ({ ...prev, [groupKey]: { ...prev[groupKey], conversationId: null, messages: [], loaded: true } }));
      return;
    }
    myConvIdsRef.current.add(convId);
    sessionConvIdsRef.current.add(convId); // markeer als sessie convId
    const msgResponse = await supabase.from('messages').select('id, user_id, text, created_at, media_url, media_type').eq('conversation_id', convId).order('created_at', { ascending: true });
    const rows = msgResponse.data ?? [];
    const userIds = [...new Set(rows.map((m) => m.user_id).filter(Boolean))];
    const profilesResponse = userIds.length ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds) : { data: [] };
    const pmap = new Map((profilesResponse.data ?? []).map((p) => [p.id, p]));
    const enriched = rows.map((m) => ({
      id: m.id, text: m.text, createdAt: m.created_at, userId: m.user_id,
      display_name: pmap.get(m.user_id)?.display_name ?? 'Unknown',
      avatar_url: pmap.get(m.user_id)?.avatar_url ?? null,
      media_url: m.media_url ?? null, media_type: m.media_type ?? null,
    }));
    setChatSessionMessages((prev) => ({ ...prev, [groupKey]: { ...prev[groupKey], conversationId: convId, messages: enriched, loaded: true } }));
  };
  loadSessionChatForTabRef.current = loadSessionChatForTab;

  const sendSessionMessageInChatTab = async (groupKey: string, spotName: string, sessionDay: string, mediaUrl: string | null = null) => {
    const text = sessionChatInput.trim();
    const senderId = activeProfile?.id ?? activeAppUserId ?? null;
    if (!text && !mediaUrl || !groupKey || !senderId) return;
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
    const { data: inserted, error } = await supabase.from('messages').insert({ user_id: senderId, text: text || null, spot_name: spotName, session_day: sessionDay, conversation_id: convId, created_at: new Date().toISOString(), media_url: mediaUrl ?? null, media_type: mediaUrl ? 'image' : null }).select('id').single();
    if (error) { console.error('CHAT_TAB_SESSION_SEND_ERROR', error); return; }
    setSessionChatInput('');
    setTimeout(() => chatSessionScrollRef.current?.scrollToEnd({ animated: true }), 50);
    const newMsg = { id: inserted?.id ?? `${convId}-${Date.now()}`, text: text || null, createdAt: new Date().toISOString(), userId: senderId, display_name: activeProfile?.display_name ?? 'You', avatar_url: activeProfile?.avatar_url ?? null, media_url: mediaUrl ?? null, media_type: mediaUrl ? 'image' : null };
    setChatSessionMessages((prev) => ({ ...prev, [groupKey]: { ...prev[groupKey], conversationId: convId, messages: [...(prev[groupKey]?.messages ?? []), newMsg], loaded: true } }));
    supabase.rpc('create_chat_notification', {
      actor_profile_id: senderId,
      spot_name_param: spotName,
      session_day_param: sessionDay,
      message_preview_param: text,
    }).then(({ data: recipients, error: rpcError }) => {
      if (rpcError) console.error('SESSION_CHAT_PUSH_ERROR', rpcError);
      const ids = (recipients ?? []).map((r: { recipient_profile_id: string }) => r.recipient_profile_id).filter(Boolean);
      const actorName = activeProfile?.display_name?.trim() || 'Someone';
      if (ids.length) sendPushToRecipients(ids, `${actorName} in group chat`, text, { type: 'chat_message', subType: 'group', spotName, groupKey, sessionDay });
    });
  };

  // DM group_key = 'dm_SMALLERID_LARGERID' (geen participant kolommen nodig)
  const getDmGroupKey = (idA: string, idB: string) => {
    const sorted = [idA, idB].sort();
    return `dm_${sorted[0]}_${sorted[1]}`;
  };

  const loadDmConversations = async () => {
    if (!activeAppUserId) return;
    // Zoek alle DM conversations via participant kolommen (werkt ook zonder group_key)
    const { data: convs, error: convErr } = await supabase.from('conversations')
      .select('id, participant_a_id, participant_b_id, created_at')
      .eq('type', 'dm')
      .or(`participant_a_id.eq.${activeAppUserId},participant_b_id.eq.${activeAppUserId}`);
    if (convErr) { console.error('DM_LOAD_ERROR', convErr); setDmConversations([]); return; }
    if (!convs?.length) { setDmConversations([]); return; }

    // Haal otherUserId direct uit participant kolommen
    const withOtherId = convs.map((c) => {
      const otherId = c.participant_a_id === activeAppUserId ? c.participant_b_id : c.participant_a_id;
      return { ...c, otherUserId: otherId };
    }).filter((c) => c.otherUserId);

    const otherUserIds = [...new Set(withOtherId.map((c) => c.otherUserId).filter(Boolean))];
    const convIds = convs.map((c) => c.id);
    const [profilesResp, lastMsgsResp] = await Promise.all([
      otherUserIds.length ? supabase.from('profiles').select('id, display_name, avatar_url, skill_level').in('id', otherUserIds) : Promise.resolve({ data: [] as any[] }),
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
      return { id: c.id, otherUserId: c.otherUserId!, otherName: p?.display_name ?? 'Unknown', otherAvatar: p?.avatar_url ?? null, otherSkillLevel: p?.skill_level ?? null, lastMessage: lm?.text ?? null, lastMessageAt: lm?.created_at ?? null };
    }).sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
    // Voeg DM convIds direct toe aan myConvIdsRef zodat realtime werkt zonder chat openen
    for (const c of result) myConvIdsRef.current.add(c.id);
    setDmConversations(result);
  };
  loadDmConversationsRef.current = loadDmConversations;
  fetchSharedDataRef.current = () => fetchSharedData({ skipLoadingState: true });

  const loadDmMessages = async (conversationId: string) => {
    const { data: msgs } = await supabase.from('messages').select('id, user_id, text, created_at, media_url, media_type').eq('conversation_id', conversationId).order('created_at', { ascending: true });
    const rows = msgs ?? [];
    const userIds = [...new Set(rows.map((m) => m.user_id).filter(Boolean))];
    const { data: profiles } = userIds.length ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds) : { data: [] };
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const enriched = rows.map((m) => ({ id: m.id, text: m.text, createdAt: m.created_at, userId: m.user_id, display_name: pmap.get(m.user_id)?.display_name ?? 'Unknown', avatar_url: pmap.get(m.user_id)?.avatar_url ?? null, media_url: m.media_url ?? null, media_type: m.media_type ?? null }));
    setDmMessages((prev) => ({ ...prev, [conversationId]: enriched }));
  };
  loadDmMessagesRef.current = loadDmMessages;

  const sendDmMessage = async (conversationId: string, mediaUrl: string | null = null) => {
    const text = dmInput.trim();
    const senderId = activeProfile?.id ?? activeAppUserId ?? null;
    if (!text && !mediaUrl || !conversationId || !senderId) return;
    const { data: dmInserted, error } = await supabase.from('messages').insert({ user_id: senderId, text: text || null, conversation_id: conversationId, spot_name: null, session_day: null, created_at: new Date().toISOString(), media_url: mediaUrl ?? null, media_type: mediaUrl ? 'image' : null }).select('id').single();
    if (error) { console.error('DM_SEND_ERROR', error); setSessionActionError(`DM send failed: ${error.message}`); return; }
    setDmInput('');
    setTimeout(() => chatDmScrollRef.current?.scrollToEnd({ animated: true }), 50);
    const newMsg = { id: dmInserted?.id ?? `dm-${Date.now()}`, text: text || null, createdAt: new Date().toISOString(), userId: senderId, display_name: activeProfile?.display_name ?? 'You', avatar_url: activeProfile?.avatar_url ?? null, media_url: mediaUrl ?? null, media_type: mediaUrl ? 'image' : null };
    setDmMessages((prev) => ({ ...prev, [conversationId]: [...(prev[conversationId] ?? []), newMsg] }));
    setDmConversations((prev) => prev.map((c) => c.id === conversationId ? { ...c, lastMessage: text, lastMessageAt: new Date().toISOString() } : c));
    // Push notificatie naar de andere deelnemer — haal otherUserId op uit DB (betrouwbaarder dan state)
    void (async () => {
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select('participant_a_id, participant_b_id')
        .eq('id', conversationId)
        .single();
      if (convError) return;
      const otherUserId = convData?.participant_a_id === senderId
        ? convData?.participant_b_id
        : convData?.participant_a_id ?? null;
      if (!otherUserId) return;
      const { data: recipPref } = await supabase.from('profiles').select('dm_push_enabled').eq('id', otherUserId).single();
      if (recipPref?.dm_push_enabled === false) return;
      const actorName = activeProfile?.display_name?.trim() || 'Someone';
      await sendPushToRecipients([otherUserId], `${actorName}`, text, { type: 'dm', conversationId });
    })();
  };

  const sendBroadcastDm = async () => {
    const text = broadcastMessage.trim();
    const senderId = activeProfile?.id ?? activeAppUserId ?? null;
    if (!text || !senderId || broadcastSelectedIds.length === 0) return;
    setBroadcastSending(true);
    for (const userId of broadcastSelectedIds) {
      const convId = await openDmWithUser(userId);
      if (!convId) continue;
      const { error: msgError } = await supabase.from('messages').insert({ user_id: senderId, text, conversation_id: convId, spot_name: null, session_day: null, created_at: new Date().toISOString() });
      if (msgError) { console.error('BROADCAST_MSG_INSERT_ERROR', msgError); continue; }
      const { data: recipPref } = await supabase.from('profiles').select('dm_push_enabled').eq('id', userId).single();
      if (recipPref?.dm_push_enabled === false) continue;
      const actorName = activeProfile?.display_name?.trim() || 'Someone';
      await sendPushToRecipients([userId], actorName, text, { type: 'dm', conversationId: convId });
    }
    setBroadcastSending(false);
    setBroadcastMessage('');
    setShowBroadcastDm(false);
    void loadDmConversationsRef.current?.();
  };

  const loadMyPersistentGroups = async () => {
    const userId = activeProfile?.id ?? activeAppUserId;
    if (!userId) return;
    const { data: memberships } = await supabase.from('group_members').select('group_id, role, notifications_muted').eq('user_id', userId);
    if (!memberships?.length) { setMyPersistentGroups([]); return; }
    const groupIds = memberships.map((m) => m.group_id);
    const roleMap = new Map(memberships.map((m) => [m.group_id, m.role as 'admin' | 'member']));
    const mutedMap = new Map(memberships.map((m) => [m.group_id, !!(m as any).notifications_muted]));
    const adminGroupIds = [...roleMap.entries()].filter(([, r]) => r === 'admin').map(([id]) => id);

    // Round-trip 2: groups + conversations + requests parallel
    const results = await Promise.allSettled([
      supabase.from('groups').select('id, name, avatar_url').in('id', groupIds),
      supabase.from('conversations').select('id, persistent_group_id').in('persistent_group_id', groupIds),
      adminGroupIds.length
        ? supabase.from('group_join_requests').select('group_id').eq('status', 'pending').in('group_id', adminGroupIds)
        : Promise.resolve({ data: [] as Array<{ group_id: string }> }),
    ]);
    const groups = results[0].status === 'fulfilled' ? (results[0].value as any).data : [];
    const convRows = results[1].status === 'fulfilled' ? (results[1].value as any).data : [];
    const reqs = results[2].status === 'fulfilled' ? (results[2].value as any).data : [];

    const convMap = new Map((convRows ?? []).map((c: any) => [c.persistent_group_id, c.id]));
    const convIds = (convRows ?? []).map((c: any) => c.id as string);

    // Round-trip 3: last message per conversation
    const lastMsgMap = new Map<string, { text: string | null; at: string }>();
    if (convIds.length) {
      const { data: allMsgs } = await supabase.from('messages').select('text, created_at, conversation_id').in('conversation_id', convIds).order('created_at', { ascending: false }).limit(convIds.length + 20);
      const seen = new Set<string>();
      for (const m of (allMsgs ?? [])) {
        if (!seen.has(m.conversation_id)) { seen.add(m.conversation_id); lastMsgMap.set(m.conversation_id, { text: m.text, at: m.created_at }); }
      }
    }

    const pendingMap = new Map<string, number>();
    for (const r of (reqs ?? [])) pendingMap.set((r as any).group_id, (pendingMap.get((r as any).group_id) ?? 0) + 1);

    // Haal alle leden op voor alle groepen — werkt nu via is_group_member() policy
    const membersByGroup = new Map<string, string[]>();
    if (groupIds.length) {
      const { data: allMembers } = await supabase.from('group_members').select('group_id, user_id').in('group_id', groupIds);
      for (const m of (allMembers ?? [])) {
        const list = membersByGroup.get(m.group_id) ?? [];
        if (!list.includes(m.user_id)) list.push(m.user_id);
        membersByGroup.set(m.group_id, list);
      }
    }

    setMyPersistentGroups((groups ?? []).map((g) => {
      const convId = convMap.get(g.id) ?? null;
      const last = convId ? lastMsgMap.get(convId) : null;
      return { id: g.id, name: g.name, role: roleMap.get(g.id) ?? 'member', conversationId: convId, lastMessage: last?.text ?? null, lastMessageAt: last?.at ?? null, pendingRequests: pendingMap.get(g.id) ?? 0, avatar_url: (g as any).avatar_url ?? null, memberIds: membersByGroup.get(g.id) ?? [], muted: mutedMap.get(g.id) ?? false };
    }).sort((a, b) => (b.lastMessageAt ?? b.id) > (a.lastMessageAt ?? a.id) ? 1 : -1));
  };

  loadMyPersistentGroupsRef.current = loadMyPersistentGroups;

  const loadPersistentGroupMessages = async (groupId: string, convId: string) => {
    const { data: msgs } = await supabase.from('messages').select('id, user_id, text, created_at, media_url, media_type').eq('conversation_id', convId).order('created_at', { ascending: true });
    const rows = msgs ?? [];
    const userIds = [...new Set(rows.map((m) => m.user_id).filter(Boolean))];
    const { data: profiles } = userIds.length ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds) : { data: [] };
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const enriched = rows.map((m) => ({ id: m.id, text: m.text, createdAt: m.created_at, userId: m.user_id, display_name: pmap.get(m.user_id)?.display_name ?? 'Unknown', avatar_url: pmap.get(m.user_id)?.avatar_url ?? null, media_url: m.media_url ?? null, media_type: m.media_type ?? null }));
    setPersistentGroupMessages((prev) => ({ ...prev, [groupId]: { messages: enriched, loaded: true } }));
  };

  const sendPersistentGroupMessage = async (groupId: string, convId: string, mediaUrl: string | null = null) => {
    const text = persistentGroupInput.trim();
    const senderId = activeProfile?.id ?? activeAppUserId ?? null;
    if (!text && !mediaUrl || !senderId) return;
    const { data: inserted, error } = await supabase.from('messages').insert({ user_id: senderId, text: text || null, conversation_id: convId, spot_name: null, session_day: null, created_at: new Date().toISOString(), media_url: mediaUrl ?? null, media_type: mediaUrl ? 'image' : null }).select('id').single();
    if (error) { console.error('GROUP_SEND_ERROR', error); return; }
    setPersistentGroupInput('');
    setTimeout(() => chatGroupScrollRef.current?.scrollToEnd({ animated: true }), 50);
    const newMsg = { id: inserted?.id ?? `grp-${Date.now()}`, text: text || null, createdAt: new Date().toISOString(), userId: senderId, display_name: activeProfile?.display_name ?? 'You', avatar_url: activeProfile?.avatar_url ?? null, media_url: mediaUrl ?? null, media_type: mediaUrl ? 'image' : null };
    setPersistentGroupMessages((prev) => ({ ...prev, [groupId]: { messages: [...(prev[groupId]?.messages ?? []), newMsg], loaded: true } }));
    setMyPersistentGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, lastMessage: text || null, lastMessageAt: new Date().toISOString() } : g));
    // Push naar alle andere groepsleden
    const grp = myPersistentGroups.find((g) => g.id === groupId);
    const grpName = grp?.name ?? 'Group';
    const actorName = activeProfile?.display_name ?? 'Someone';
    // Haal gemute leden op en filter ze eruit
    const { data: mutedRows } = await supabase.from('group_members').select('user_id').eq('group_id', groupId).eq('notifications_muted', true);
    const mutedIds = new Set((mutedRows ?? []).map((r) => r.user_id));
    const recipientIds = (grp?.memberIds ?? []).filter((id) => id !== senderId && !mutedIds.has(id));
    if (recipientIds.length) void sendPushToRecipients(recipientIds, `${actorName} in ${grpName}`, text || '📷 Photo', { type: 'dm' });
  };

  const createPersistentGroup = async () => {
    if (isCreatingGroup) return;
    const name = createGroupName.trim();
    const userId = activeProfile?.id ?? activeAppUserId;
    if (!name || !userId) return;
    setIsCreatingGroup(true);
    const memberIds = createGroupSelectedIds.length > 0 ? createGroupSelectedIds : [];
    const { data, error } = await supabase.rpc('create_group_with_conversation', { group_name: name, initial_member_ids: memberIds });
    if (!error && data) {
      const created0 = Array.isArray(data) ? data[0] : data;
      const gid = created0?.out_group_id ?? created0?.group_id;
      if (gid && createGroupAvatarUri) {
        const res = await fetch(createGroupAvatarUri);
        const ab = await res.arrayBuffer();
        const { data: upData } = await supabase.storage.from('avatars').upload(`group-${gid}/avatar.jpg`, ab, { upsert: true, contentType: 'image/jpeg' });
        if (upData) {
          const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(`group-${gid}/avatar.jpg`);
          if (urlData?.publicUrl) await supabase.from('groups').update({ avatar_url: `${urlData.publicUrl}?t=${Date.now()}` }).eq('id', gid);
        }
      }
    }
    if (error) {
      console.error('CREATE_GROUP_ERROR', JSON.stringify(error));
      Alert.alert('Error', error.message ?? 'Could not create group');
      setIsCreatingGroup(false);
      return;
    }
    setShowCreateGroup(false);
    const created = Array.isArray(data) ? data[0] : data;
    const newGroupId = created?.out_group_id ?? created?.group_id ?? null;
    const groupName = name;
    setCreateGroupName('');
    setCreateGroupSelectedIds([]);
    setCreateGroupAvatarUri(null);
    await loadMyPersistentGroups();
    if (newGroupId) {
      const myId = activeProfile?.id ?? activeAppUserId ?? '';
      setMyPersistentGroups((prev) => prev.some((g) => g.id === newGroupId) ? prev : [{ id: newGroupId, name: groupName, role: 'admin', conversationId: created?.out_conversation_id ?? null, lastMessage: null, lastMessageAt: null, pendingRequests: 0, avatar_url: null, memberIds: [myId, ...memberIds], muted: false }, ...prev]);
      if (memberIds.length > 0) {
        const actorName = activeProfile?.display_name ?? 'Someone';
        void sendPushToRecipients(memberIds, `${actorName} added you to a group`, `You've been added to "${groupName}"`, { type: 'dm' });
      }
      setChatSubTab('group');
      setExpandedPersistentGroupId(newGroupId);
    }
    setIsCreatingGroup(false);
  };

  const nominateForGroup = async (groupId: string, nomineeId: string) => {
    const introducedBy = activeProfile?.id ?? activeAppUserId;
    if (!introducedBy) return;
    const { error } = await supabase.from('group_join_requests').insert({ group_id: groupId, nominee_id: nomineeId, introduced_by: introducedBy, status: 'pending' });
    if (error) console.error('NOMINATE_ERROR', error);
    setShowNominateModal(null);
    setNominateSearchQuery('');
    setNominateSelectedUserId(null);
    setNominateSearchResults([]);
  };

  const resolveJoinRequest = async (requestId: string, accept: boolean) => {
    if (accept) {
      const { error } = await supabase.rpc('accept_group_join_request', { request_id: requestId });
      if (error) { console.error('ACCEPT_JOIN_ERROR', error); return; }
    } else {
      await supabase.from('group_join_requests').update({ status: 'denied' }).eq('id', requestId);
    }
    await loadMyPersistentGroups();
  };

  const openDmWithUser = async (otherUserId: string) => {
    if (!activeAppUserId || !otherUserId) {
      return null;
    }

    // Primair: RPC (SECURITY DEFINER, gebruikt auth.uid() intern, bypast RLS)
    const { data: rpcConvId, error: rpcError } = await supabase.rpc('get_or_create_conversation', {
      p_type: 'dm',
      p_other_user_id: otherUserId,
    });
    if (!rpcError && rpcConvId) {
      myConvIdsRef.current.add(rpcConvId);
      return rpcConvId as string;
    }

    // Fallback: directe participant kolommen query
    const { data: existing, error: selectError } = await supabase.from('conversations')
      .select('id, participant_a_id, participant_b_id')
      .eq('type', 'dm')
      .or(`participant_a_id.eq.${activeAppUserId},participant_b_id.eq.${activeAppUserId}`);
    const found = existing?.find(c =>
      (c.participant_a_id === activeAppUserId && c.participant_b_id === otherUserId) ||
      (c.participant_a_id === otherUserId && c.participant_b_id === activeAppUserId)
    );
    if (found) { myConvIdsRef.current.add(found.id); return found.id; }
    const { data: created, error: insertError } = await supabase.from('conversations').insert({
      type: 'dm', participant_a_id: activeAppUserId, participant_b_id: otherUserId,
    }).select('id').maybeSingle();
    if (insertError) console.error('DM_CREATE_ERROR', insertError?.message);
    if (created?.id) myConvIdsRef.current.add(created.id);
    return created?.id ?? null;
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
    const seenSpotNames = new Set<string>();
    const discoverSpots = spotDefinitions
      .filter((s) => {
        if (!Number.isFinite(s.latitude) || !Number.isFinite(s.longitude)) return false;
        if (seenSpotNames.has(s.spot)) return false;
        seenSpotNames.add(s.spot);
        return true;
      })
      .map((s) => {
        const allSpotSessions = daySessionsBySpot[s.spot] ?? [];
        const spotSessions = allSpotSessions.filter((ss) => getCleanSessionStatus(ss) !== 'finished');
        const liveCount = new Set(spotSessions.filter((ss) => getCleanSessionStatus(ss) === 'live').map((ss) => ss.userId).filter(Boolean)).size;
        const goingCount = new Set(spotSessions.filter((ss) => getCleanSessionStatus(ss) === 'going').map((ss) => ss.userId).filter(Boolean)).size;
        const totalCount = new Set(allSpotSessions.map((ss) => ss.userId).filter(Boolean)).size;
        return {
          name: s.spot,
          latitude: s.latitude,
          longitude: s.longitude,
          isAdded: favoriteSpots.includes(s.spot),
          coordinateStatus: s.coordinateStatus,
          liveCount,
          goingCount,
          totalCount,
        };
      });

    const seenNames = new Set(discoverSpots.map((s) => s.name));
    for (const ps of pendingSpots) {
      if (!seenNames.has(ps.name)) {
        seenNames.add(ps.name);
        discoverSpots.push({
          name: ps.name,
          latitude: ps.latitude,
          longitude: ps.longitude,
          isAdded: false,
          coordinateStatus: 'review' as const,
          liveCount: 0,
          goingCount: 0,
          totalCount: 0,
        });
      }
    }

    const discoverQuery = (homeSpotSearchQuery ?? '').trim().toLowerCase();
    const discoverSuggestions = discoverQuery.length >= 1
      ? spotDefinitions
          .filter((s) => s.spot.toLowerCase().includes(discoverQuery))
          .slice(0, 6)
      : [];

    const discoverFlyTarget = discoverSuggestions.length > 0 && discoverSuggestions[0]
      ? { latitude: discoverSuggestions[0].latitude, longitude: discoverSuggestions[0].longitude }
      : null;

    const nearbyExistingSpot = currentCoordinates
      ? spotDefinitions.find((s) => {
          if (!Number.isFinite(s.latitude) || !Number.isFinite(s.longitude)) return false;
          const R = 6371000;
          const dLat = (s.latitude - currentCoordinates.latitude) * Math.PI / 180;
          const dLon = (s.longitude - currentCoordinates.longitude) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(currentCoordinates.latitude * Math.PI / 180) * Math.cos(s.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
          return R * 2 * Math.asin(Math.sqrt(a)) < 500;
        }) ?? null
      : null;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
        <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
        {renderNativeTopBar()}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text style={{ color: theme.text, fontSize: 26, fontWeight: '900' }}>Discover</Text>
          <Pressable
            onPress={() => { setShowDiscoverSpotsPage(false); setHomeSpotSearchQuery(''); }}
            style={{ backgroundColor: theme.cardStrong, borderRadius: 999, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 6 }}
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
                <View key={s.spot} style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', flex: 1 }}>{s.spot}</Text>
                  <Pressable
                    onPress={() => {
                      Keyboard.dismiss();
                      setDiscoverMapCenter({ latitude: s.latitude, longitude: s.longitude });
                      setHomeSpotSearchQuery('');
                    }}
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}
                  >
                    <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Show on map</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Keyboard.dismiss();
                      openedFromDiscoverRef.current = true;
                      setShowDiscoverSpotsPage(false);
                      setHomeSpotSearchQuery('');
                      requestAnimationFrame(() => setSelectedSpot(s.spot as any));
                    }}
                    style={{ backgroundColor: theme.primary, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 }}
                  >
                    <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Open →</Text>
                  </Pressable>
                </View>
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
            flyToTarget={discoverMapCenter ?? discoverFlyTarget}
            pendingMarker={discoverMapCenter?.pendingName ? { latitude: discoverMapCenter.latitude, longitude: discoverMapCenter.longitude, name: discoverMapCenter.pendingName } : null}
            spots={discoverSpots}
            userLocation={currentCoordinates}
            onOpenSpot={(spotName) => {
              if (!spotName) return;
              openedFromDiscoverRef.current = true;
              setShowDiscoverSpotsPage(false);
              setShowYourSpotsPage(false);
              setShowChat(false);
              setShowBuddies(false);
              setShowProfile(false);
              setHomeSpotSearchQuery('');
              setSelectedSpot(spotName as any);
            }}
            onAddSpot={(spotName) => addSelectedSpot(spotName)}
            onMapClick={(latitude, longitude) => setCoordinateReviewPoint({ latitude, longitude })}
          />
          {discoverMapCenter?.pendingName ? (
            <>
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ alignItems: 'center' }}>
                  <View style={{ backgroundColor: '#F5A623', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 2, borderColor: '#fff', marginBottom: 4 }}>
                    <Text style={{ color: '#07111F', fontSize: 13, fontWeight: '900' }}>📍 {discoverMapCenter.pendingName}</Text>
                  </View>
                  <View style={{ width: 0, height: 0, borderLeftWidth: 12, borderRightWidth: 12, borderTopWidth: 18, borderStyle: 'solid', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#F5A623' }} />
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F5A623', marginTop: 1 }} />
                </View>
              </View>
            </>
          ) : null}
        </View>

        {/* Spot toevoegen knop */}
        {currentCoordinates && !showAddSpot && (
          <Pressable
            onPress={() => { setAddSpotName(''); setAddSpotSuccess(false); setShowAddSpot(true); }}
            style={{ position: 'absolute', bottom: isWebPlatform ? 20 : 100, left: 16, backgroundColor: '#07111F', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}
          >
            <Ionicons name="add-circle-outline" size={16} color="#ffffff" />
            <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>Suggest spot</Text>
          </Pressable>
        )}

        {/* Add spot modal */}
        {showAddSpot && currentCoordinates && (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'position' : undefined}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
          >
            <View style={{ backgroundColor: '#0d1b2a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
              {addSpotSuccess ? (
                <View style={{ alignItems: 'center', paddingVertical: 20, gap: 8 }}>
                  <Text style={{ fontSize: 32 }}>🤙</Text>
                  <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '800' }}>Thanks for your suggestion!</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center' }}>We'll review it and add it to the app.</Text>
                  <Pressable onPress={() => setShowAddSpot(false)} style={{ marginTop: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 8 }}>
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>Close</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text style={{ color: '#ffffff', fontSize: 17, fontWeight: '900', marginBottom: 4 }}>Suggest a spot</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 16 }}>
                    You must be physically at the spot — your current GPS location will be saved. Only suggest a spot when you're standing there.
                  </Text>
                  <TextInput
                    value={addSpotName}
                    onChangeText={setAddSpotName}
                    placeholder="Spot name (e.g. Tarifa Beach)"
                    placeholderTextColor={theme.textMuted}
                    autoFocus
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: '#ffffff', borderRadius: 12, padding: 12, fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', marginBottom: 12 }}
                  />
                  {nearbyExistingSpot ? (
                    <Text style={{ color: '#FF6B6B', fontSize: 12, marginBottom: 12 }}>
                      "{nearbyExistingSpot.spot}" is already within 500m of your location. Move to a new spot to suggest one.
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      disabled={!addSpotName.trim() || addSpotSubmitting || !!nearbyExistingSpot}
                      onPress={async () => {
                        if (!addSpotName.trim() || !activeAppUserId || !currentCoordinates) return;
                        setAddSpotSubmitting(true);
                        let country: string | null = null;
                        try {
                          const geo = await Location.reverseGeocodeAsync(currentCoordinates);
                          country = geo[0]?.country ?? null;
                        } catch {}
                        await supabase.from('pending_spots').insert({
                          name: addSpotName.trim(),
                          latitude: currentCoordinates.latitude,
                          longitude: currentCoordinates.longitude,
                          submitted_by: activeAppUserId,
                          country,
                        });
                        void sendPushToRecipients(
                          ['1a6cf03f-48ea-4907-b5ee-6594a44465a6'],
                          '🌍 New spot suggestion',
                          `${activeProfile?.display_name} suggested: ${addSpotName.trim()} (${country ?? 'unknown country'})`,
                          { type: 'admin' }
                        );
                        setAddSpotSubmitting(false);
                        setAddSpotSuccess(true);
                      }}
                      style={{ flex: 1, backgroundColor: addSpotName.trim() && !addSpotSubmitting ? '#00C896' : 'rgba(255,255,255,0.06)', borderRadius: 999, paddingVertical: 12, alignItems: 'center', opacity: addSpotSubmitting ? 0.6 : 1 }}
                    >
                      <Text style={{ color: addSpotName.trim() ? '#061421' : theme.textMuted, fontSize: 14, fontWeight: '900' }}>
                        {addSpotSubmitting ? 'Submitting...' : 'Submit'}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => setShowAddSpot(false)} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 999, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                      <Text style={{ color: theme.textMuted, fontSize: 14 }}>Cancel</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        )}

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
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, paddingHorizontal: 20, paddingTop: isWebPlatform ? 20 : 10 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 28 }}>
          <Pressable onPress={() => setShowYourSpotsPage(false)} style={{ marginBottom: 10, marginTop: 6 }}>
            <Text style={{ color: theme.textSoft, fontSize: 15, letterSpacing: 0.2 }}>← Back home</Text>
          </Pressable>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.025)', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: theme.text, fontSize: 26, fontWeight: '700' }}>My spots (max 5)</Text>
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

                          {(activeDay === 'today' && ((!hasActiveCheckedInSession && isHomeSpotWithinCheckInRadius) || isCheckedInAtThisSpot)) ? (
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                              {!hasActiveCheckedInSession && isHomeSpotWithinCheckInRadius ? (
                                <Pressable
                                  onPress={() => {
                                    void handleQuickCheckIn(spot);
                                  }}
                                  style={{
                                    backgroundColor: '#123868',
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    borderRadius: 999,
                                    borderColor: theme.primary,
                                  }}
                                >
                                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>
                                    Check in
                                  </Text>
                                </Pressable>
                              ) : null}

                              {isCheckedInAtThisSpot ? (
                                <Pressable
                                  onPress={() => void handleQuickCheckOut()}
                                  style={{ backgroundColor: '#8b1f38', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}
                                >
                                  <Text style={{ color: '#ffd7de', fontSize: 12, fontWeight: '900' }}>Check out</Text>
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

          {/* Help improve our spots */}
          <View style={{ marginTop: 28, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', gap: 12 }}>
            <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 }}>Help improve our spots</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14 }}>📍</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '700', marginBottom: 2 }}>Wrong launch location?</Text>
                <Text style={{ color: 'rgba(255,255,255,0.30)', fontSize: 11, lineHeight: 16 }}>Check in at a spot, then tap "Wrong location?" to submit your GPS coordinates. We'll review and update it.</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14 }}>🌍</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '700', marginBottom: 2 }}>Missing a spot?</Text>
                <Text style={{ color: 'rgba(255,255,255,0.30)', fontSize: 11, lineHeight: 16 }}>Go to Discover, physically travel to the spot, and tap "Suggest spot". Your GPS location is used — so you need to be there. We'll add it after review.</Text>
              </View>
            </View>
          </View>

        </ScrollView>
      </SafeAreaView>
    );
  }

  if (showChat) {
    const spotUnreadTotal = Object.values(spotsWithUnread).reduce((a, b) => a + b, 0);
    const chatTabs = [
      { key: 'spot' as const, label: 'Spot', badge: spotUnreadTotal },
      { key: 'session' as const, label: 'Session', badge: unreadSessionTotal },
      { key: 'dm' as const, label: 'Direct', badge: unreadDmTotal },
      { key: 'group' as const, label: 'Groups', badge: unreadPersistentGroupTotal },
    ];

    const chatNameColors = ['#5EF0D0', '#4DB8FF', '#FFB347', '#B8A0FF', '#7EE8A2', '#FF8C8C'];
    const chatColorForUser = (uid: string) => {
      let h = 0;
      for (let i = 0; i < uid.length; i++) h = uid.charCodeAt(i) + ((h << 5) - h);
      return chatNameColors[Math.abs(h) % chatNameColors.length];
    };

    const renderChatMessages = (messages: any[], isOwn: (userId: string) => boolean, showSenderName = true) =>
      messages.map((msg, index) => {
        const own = isOwn(msg.userId ?? msg.user_id);
        const time = msg.createdAt ? formatChatTimestamp(msg.createdAt) : '';
        const msgUserId = msg.userId ?? msg.user_id;
        const prev = index > 0 ? messages[index - 1] : null;
        const next = index < messages.length - 1 ? messages[index + 1] : null;
        const sameAsPrev = prev && (prev.userId ?? prev.user_id) === msgUserId;
        const sameAsNext = next && (next.userId ?? next.user_id) === msgUserId;
        const isFirst = !sameAsPrev;
        const isLast = !sameAsNext;
        const nameColor = chatColorForUser(msgUserId ?? '');

        // Bubble radius: staartje op het laatste bericht
        const br = 18;
        const tail = 4;
        const bubbleRadius = {
          borderTopLeftRadius: own ? br : isFirst ? br : 6,
          borderTopRightRadius: own ? (isFirst ? br : 6) : br,
          borderBottomLeftRadius: own ? br : isLast ? tail : 6,
          borderBottomRightRadius: own ? (isLast ? tail : 6) : br,
        };

        return (
          <View key={msg.id} style={{ flexDirection: own ? 'row-reverse' : 'row', alignItems: 'flex-end', marginBottom: isLast ? 6 : 2, gap: 8, paddingHorizontal: 8 }}>
            {/* Avatar: links, alleen op laatste bericht van reeks */}
            {!own ? (
              isLast ? (
                <Pressable onPress={() => msgUserId && setViewingOtherUserId(msgUserId)}>
                  <Avatar uri={msg.avatar_url} size={30} name={msg.display_name} />
                </Pressable>
              ) : (
                <View style={{ width: 30 }} />
              )
            ) : null}

            <View style={{ maxWidth: '78%', backgroundColor: msg.media_url && !msg.text ? 'transparent' : own ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.07)', ...bubbleRadius, paddingHorizontal: msg.media_url && !msg.text ? 0 : 12, paddingVertical: msg.media_url && !msg.text ? 0 : 7, overflow: 'hidden' }}>
              {!own && isFirst && showSenderName ? (
                <Text style={{ color: nameColor, fontSize: 12, fontWeight: '800', marginBottom: 2, paddingHorizontal: msg.media_url ? 12 : 0, paddingTop: msg.media_url ? 7 : 0 }}>{msg.display_name}</Text>
              ) : null}
              {msg.media_url && msg.media_type === 'image' ? (
                <Image source={{ uri: msg.media_url }} style={{ width: 220, height: 220, borderRadius: 14 }} resizeMode="cover" />
              ) : null}
              {msg.text ? <Text style={{ color: '#ffffff', fontSize: 15, lineHeight: 21, paddingHorizontal: msg.media_url ? 12 : 0, paddingBottom: msg.media_url ? 4 : 0 }}>{msg.text}</Text> : null}
              {time ? <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'right', marginTop: 2, paddingHorizontal: msg.media_url ? 12 : 0, paddingBottom: msg.media_url ? 4 : 0 }}>{time}</Text> : null}
            </View>
          </View>
        );
      });

    // Bepaal welk gesprek open is
    const openSpotConv = expandedChatSpot ? chatSpotMessages[expandedChatSpot] : null;
    const openSessionConv = expandedChatSession ? chatSessionMessages[expandedChatSession] : null;
    const openDmConv = expandedDmId ? dmConversations.find((d) => d.id === expandedDmId) : null;
    const isAnyConvOpen = !!(expandedChatSpot || expandedChatSession || expandedDmId || expandedPersistentGroupId);

    const openMessages: any[] = expandedChatSpot
      ? (openSpotConv?.messages ?? [])
      : expandedChatSession
      ? (openSessionConv?.messages ?? [])
      : expandedDmId
      ? (dmMessages[expandedDmId] ?? [])
      : expandedPersistentGroupId
      ? (persistentGroupMessages[expandedPersistentGroupId]?.messages ?? [])
      : [];

    const openConvName = expandedChatSpot
      ? spotNameFromChatKey(expandedChatSpot)
      : expandedChatSession
      ? (chatSessionMessages[expandedChatSession]?.spotName ?? 'Session chat')
      : expandedPersistentGroupId
      ? (myPersistentGroups.find((g) => g.id === expandedPersistentGroupId)?.name ?? 'Group')
      : openDmConv?.otherName ?? 'DM';

    const openConvSub = expandedChatSession
      ? (() => {
          const d = chatSessionMessages[expandedChatSession];
          if (!d) return '';
          const parts: string[] = [];
          if (d.sessionDay) {
            try { parts.push(new Date(d.sessionDay).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })); } catch { parts.push(d.sessionDay); }
          }
          if (d.sessionStart && d.sessionEnd) parts.push(`${d.sessionStart.slice(0,5)} – ${d.sessionEnd.slice(0,5)}`);
          else if (d.sessionStart) parts.push(d.sessionStart.slice(0,5));
          return parts.join(' · ');
        })()
      : expandedChatSpot ? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

    const openScrollRef = expandedChatSpot ? chatSpotScrollRef : expandedChatSession ? chatSessionScrollRef : expandedPersistentGroupId ? chatGroupScrollRef : chatDmScrollRef;

    const openInput = expandedChatSpot ? spotChatInputInChat : expandedChatSession ? sessionChatInput : expandedPersistentGroupId ? persistentGroupInput : dmInput;
    const setOpenInput = expandedChatSpot
      ? setSpotChatInputInChat
      : expandedChatSession
      ? setSessionChatInput
      : expandedPersistentGroupId
      ? setPersistentGroupInput
      : setDmInput;

    const handleOpenSend = async () => {
      const senderId = activeProfile?.id ?? activeAppUserId ?? null;
      if (!senderId) return;
      let mediaUrl: string | null = null;
      if (pendingMediaUri) {
        setIsUploadingMedia(true);
        mediaUrl = await uploadChatMedia(pendingMediaUri, senderId);
        setIsUploadingMedia(false);
        setPendingMediaUri(null);
      }
      if (!openInput.trim() && !mediaUrl) return;
      if (expandedChatSpot) void sendSpotMessageInChatTab(expandedChatSpot, mediaUrl);
      else if (expandedChatSession) {
        const d = chatSessionMessages[expandedChatSession];
        const spotName = d?.spotName ?? openConvName;
        const sessionDay = d?.sessionDay ?? getTodayLocalDateKey();
        void sendSessionMessageInChatTab(expandedChatSession, spotName, sessionDay, mediaUrl);
      }
      else if (expandedPersistentGroupId) {
        let grp = myPersistentGroups.find((g) => g.id === expandedPersistentGroupId);
        if (grp && !grp.conversationId) {
          const { data: conv } = await supabase.from('conversations').select('id').in('persistent_group_id', [expandedPersistentGroupId]).limit(1).single();
          if (conv?.id) {
            setMyPersistentGroups((prev) => prev.map((g) => g.id === expandedPersistentGroupId ? { ...g, conversationId: conv.id } : g));
            grp = { ...grp, conversationId: conv.id };
          }
        }
        if (grp?.conversationId) void sendPersistentGroupMessage(expandedPersistentGroupId, grp.conversationId, mediaUrl);
      }
      else if (expandedDmId) void sendDmMessage(expandedDmId, mediaUrl);
    };

    const handleOpenBack = () => {
      setExpandedChatSpot(null);
      setExpandedChatSession(null);
      setExpandedDmId(null);
      setExpandedPersistentGroupId(null);
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
              {expandedPersistentGroupId && (() => {
                const grpAvatar = myPersistentGroups.find((g) => g.id === expandedPersistentGroupId);
                return (
                  <Pressable onPress={() => grpAvatar?.role === 'admin' ? void pickAndUploadGroupAvatar(expandedPersistentGroupId) : void openGroupMembersPopup(expandedPersistentGroupId)}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {grpAvatar?.avatar_url
                      ? <Image source={{ uri: grpAvatar.avatar_url }} style={{ width: 36, height: 36 }} />
                      : <Ionicons name="people-outline" size={18} color="rgba(255,255,255,0.6)" />}
                  </Pressable>
                );
              })()}
              <View style={{ flex: 1 }}>
                {expandedPersistentGroupId && (() => {
                  const grpHdr = myPersistentGroups.find((g) => g.id === expandedPersistentGroupId);
                  if (grpHdr?.role === 'admin' && editingGroupName !== null) return (
                    <TextInput value={editingGroupName} onChangeText={setEditingGroupName} autoFocus onBlur={async () => {
                      const trimmed = editingGroupName.trim();
                      if (trimmed && trimmed !== openConvName && expandedPersistentGroupId) {
                        await supabase.from('groups').update({ name: trimmed }).eq('id', expandedPersistentGroupId);
                        setMyPersistentGroups((prev) => prev.map((g) => g.id === expandedPersistentGroupId ? { ...g, name: trimmed } : g));
                      }
                      setEditingGroupName(null);
                    }} style={({ flex: 1, color: theme.text, fontSize: 16, fontWeight: '800', padding: 0, outlineStyle: 'none' } as any)} />
                  );
                  return (
                    <Pressable onPress={() => expandedPersistentGroupId && void openGroupMembersPopup(expandedPersistentGroupId)} onLongPress={() => grpHdr?.role === 'admin' ? setEditingGroupName(openConvName) : null}>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>
                        {openConvName}{grpHdr?.role === 'admin' ? <Text> <Ionicons name="pencil-outline" size={13} color={theme.textMuted} /></Text> : null}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 1 }}>Tap to see members</Text>
                    </Pressable>
                  );
                })()}
                {!expandedPersistentGroupId && <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{openConvName}</Text>}
                {openConvSub ? <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 1 }}>{openConvSub}</Text> : null}
              </View>
              {expandedPersistentGroupId && (() => {
                const grp = myPersistentGroups.find((g) => g.id === expandedPersistentGroupId);
                if (!grp) return null;
                return (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    {grp.role === 'admin' && grp.pendingRequests > 0 && (
                      <Pressable onPress={() => setShowNominateModal({ groupId: grp.id, groupName: grp.name })} style={{ backgroundColor: '#FFB347', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 }}>
                        <Text style={{ color: '#000', fontSize: 12, fontWeight: '900' }}>{grp.pendingRequests} req</Text>
                      </Pressable>
                    )}
                    {grp.role === 'admin' && (
                      <Pressable onPress={() => void pickAndUploadGroupAvatar(grp.id)} style={{ padding: 4 }} hitSlop={8}>
                        <Ionicons name="camera-outline" size={20} color={theme.textMuted} />
                      </Pressable>
                    )}
                    <Pressable onPress={() => { setAddBuddySelectedIds([]); setShowNominateModal({ groupId: grp.id, groupName: grp.name }); }} style={{ padding: 4 }} hitSlop={8}>
                      <Ionicons name="person-add-outline" size={20} color={theme.textMuted} />
                    </Pressable>
                    <Pressable onPress={async () => {
                      const newMuted = !grp.muted;
                      await supabase.from('group_members').update({ notifications_muted: newMuted }).eq('group_id', grp.id).eq('user_id', activeProfile?.id ?? activeAppUserId ?? '');
                      setMyPersistentGroups((prev) => prev.map((g) => g.id === grp.id ? { ...g, muted: newMuted } : g));
                    }} style={{ padding: 4 }} hitSlop={8}>
                      <Ionicons name={grp.muted ? 'notifications-off-outline' : 'notifications-outline'} size={20} color={grp.muted ? theme.primary : theme.textMuted} />
                    </Pressable>
                    {grp.role === 'admin' ? (
                      <Pressable onPress={() => Alert.alert('Delete group', `Delete "${grp.name}"? This cannot be undone.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: async () => {
                          await supabase.from('groups').delete().eq('id', grp.id);
                          setMyPersistentGroups((prev) => prev.filter((g) => g.id !== grp.id));
                          setOpenChatState(null);
                          setChatSubTab('group');
                        }},
                      ])} style={{ padding: 4 }} hitSlop={8}>
                        <Ionicons name="trash-outline" size={20} color="#8b1f38" />
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => Alert.alert('Leave group', `Leave "${grp.name}"?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Leave', style: 'destructive', onPress: async () => {
                          await supabase.from('group_members').delete().eq('group_id', grp.id).eq('user_id', activeProfile?.id ?? activeAppUserId ?? '');
                          setMyPersistentGroups((prev) => prev.filter((g) => g.id !== grp.id));
                          setOpenChatState(null);
                          setChatSubTab('group');
                        }},
                      ])} style={{ padding: 4 }} hitSlop={8}>
                        <Ionicons name="exit-outline" size={20} color="#8b1f38" />
                      </Pressable>
                    )}
                  </View>
                );
              })()}
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
                renderChatMessages(openMessages, (uid) => uid === (activeProfile?.id ?? activeAppUserId), !expandedDmId)
              )}
            </ScrollView>

            {/* Invoerbalk */}
            <View style={{ paddingLeft: 12, paddingRight: 16, paddingTop: 10, paddingBottom: 10, backgroundColor: theme.bg, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
              {pendingMediaUri ? (
                <View style={{ marginBottom: 8, marginLeft: 44 }}>
                  <View style={{ position: 'relative', width: 72, height: 72 }}>
                    <Image source={{ uri: pendingMediaUri }} style={{ width: 72, height: 72, borderRadius: 10 }} resizeMode="cover" />
                    <Pressable onPress={() => setPendingMediaUri(null)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="close" size={12} color="#ffffff" />
                    </Pressable>
                  </View>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable onPress={handlePickChatMedia} disabled={isUploadingMedia} style={{ padding: 4 }}>
                  <Ionicons name="add" size={26} color="#ffffff" />
                </Pressable>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingLeft: 14, paddingRight: 5, paddingVertical: 5 }}>
                  <TextInput
                    value={openInput}
                    onChangeText={setOpenInput}
                    onSubmitEditing={() => { void handleOpenSend(); }}
                    onFocus={() => setTimeout(() => openScrollRef.current?.scrollToEnd({ animated: true }), 300)}
                    blurOnSubmit={false}
                    placeholder="Type a message…"
                    placeholderTextColor={theme.textMuted}
                    style={({ flex: 1, color: theme.text, paddingVertical: 7, paddingRight: 6, fontSize: 15, outlineStyle: 'none', boxShadow: 'none' } as any)}
                  />
                  <Pressable
                    onPress={() => { void handleOpenSend(); }}
                    disabled={!openInput.trim() && !pendingMediaUri || isUploadingMedia}
                    style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: (openInput.trim() || pendingMediaUri) && !isUploadingMedia ? theme.primary : 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', opacity: (openInput.trim() || pendingMediaUri) && !isUploadingMedia ? 1 : 0.4 }}
                  >
                    <Ionicons name={isUploadingMedia ? 'hourglass-outline' : 'arrow-up'} size={17} color="#ffffff" />
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        ) : (

        /* ── Lijst-modus (tabs + gesprekken) ── */
        (<ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, paddingTop: isWebPlatform ? 20 : 0 }}>
          {/* Header */}
          {isWebPlatform ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ color: theme.text, fontSize: 26, fontWeight: '700' }}>Messages</Text>
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
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>Notifications are off by default. Choose who can send you alerts per chat type.</Text>
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
                          <Pressable key={opt} onPress={() => setMessagesAlertSettings((prev) => ({ ...prev, [key]: opt }))} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: selected ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: selected ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)' }}>
                            <Text style={{ color: selected ? theme.textSoft : theme.textMuted, fontSize: 11, fontWeight: '700' }}>{opt === 'off' ? 'Off' : opt === 'buddies' ? 'Buddies' : 'Everyone'}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              {/* DMs toggle */}
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Text style={{ fontSize: 16 }}>💬</Text>
                  <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: '700', flex: 1 }}>Direct Chat: Buddies</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(['on', 'off'] as const).map((opt) => {
                    const dmEnabled = activeProfile?.dm_push_enabled !== false;
                    const selected = (opt === 'on') === dmEnabled;
                    return (
                      <Pressable key={opt} onPress={async () => {
                        const newVal = opt === 'on';
                        setProfile((prev) => prev ? { ...prev, dm_push_enabled: newVal } : prev);
                        await supabase.from('profiles').update({ dm_push_enabled: newVal }).eq('id', activeProfile?.id ?? '');
                      }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: selected ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: selected ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)' }}>
                        <Text style={{ color: selected ? theme.textSoft : theme.textMuted, fontSize: 11, fontWeight: '700' }}>{opt === 'on' ? 'On' : 'Off'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Direct Chat: Other Riders */}
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Text style={{ fontSize: 16 }}>💬</Text>
                  <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: '700', flex: 1 }}>Direct Chat: Other Riders</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(['on', 'off'] as const).map((opt) => {
                    const selected = (opt === 'on') === messagesAlertSettings.messageRequests;
                    return (
                      <Pressable key={opt} onPress={() => setMessagesAlertSettings((prev) => ({ ...prev, messageRequests: opt === 'on' }))} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: selected ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: selected ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)' }}>
                        <Text style={{ color: selected ? theme.textSoft : theme.textMuted, fontSize: 11, fontWeight: '700' }}>{opt === 'on' ? 'On' : 'Off'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          )}
          {/* Sub-tabs + Broadcast */}
          <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 999, padding: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 20, alignSelf: 'flex-start' }}>
            {chatTabs.map((tab) => {
              const active = chatSubTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setChatSubTab(tab.key)}
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
            {followingUserIds.length > 0 && (
              <Pressable onPress={() => { setBroadcastSelectedIds(followingUserIds); setShowBroadcastDm(true); }} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="megaphone-outline" size={13} color={theme.textMuted} />
                <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '800' }}>Broadcast</Text>
              </Pressable>
            )}
          </View>
          {/* Spot chats */}
          {chatSubTab === 'spot' && (
            <View style={{ gap: 8 }}>
              {(() => {
                const today = getTodayLocalDateKey();
                const tomorrow = getTomorrowLocalDateKey();
                const rows: Array<{ spotName: string; chatKey: string; chatData: typeof chatSpotMessages[string] | null }> = [];
                for (const spotName of favoriteSpots) {
                  for (const day of [today, tomorrow]) {
                    const cKey = spotChatKey(spotName, day);
                    const data = chatSpotMessages[cKey] ?? null;
                    if (day === today || data) {
                      rows.push({ spotName, chatKey: cKey, chatData: data });
                    }
                  }
                }
                if (rows.length === 0) {
                  return <View style={{ alignItems: 'center', paddingTop: 40, gap: 8 }}>
                    <Text style={{ fontSize: 32 }}>💬</Text>
                    <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>No spots followed yet</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center' }}>Follow spots in My Spots to start chatting</Text>
                  </View>;
                }
                return rows.map(({ spotName, chatKey, chatData }) => {
                const activeKey = chatKey;
                const msgs = chatData?.messages ?? [];
                const lastMsg = msgs[msgs.length - 1];
                const unread = spotsWithUnread[spotName.toLowerCase()] ?? 0;
                const dayLabel = dayFromChatKey(chatKey) === today ? 'Today' : 'Tomorrow';
                return (
                  <Pressable key={chatKey} onPress={() => {
                    setExpandedChatSpot(activeKey);
                    setSpotsWithUnread((p) => { const n = { ...p }; delete n[spotName.toLowerCase()]; return n; });
                    if (!chatData?.loaded) {
                      const day = dayFromChatKey(activeKey);
                      void loadSpotChatForTab(spotName, day);
                    }
                  }} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                    <Ionicons name="location-outline" size={22} color="rgba(255,255,255,0.5)" />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{spotName}</Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>{dayLabel}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        {lastMsg ? <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, flex: 1 }} numberOfLines={1}>{lastMsg.display_name}: {lastMsg.text}</Text> : null}
                        {unread > 0 && <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 8 }}><Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>{unread}</Text></View>}
                      </View>
                    </View>
                  </Pressable>
                );
                }); // einde rows.map
              })()} {/* einde IIFE */}
            </View>
          )}
          {/* Session chats */}
          {chatSubTab === 'session' && (
            <View style={{ gap: 8 }}>
              {(() => {
                const today = getTodayLocalDateKey();
                const tomorrow = getTomorrowLocalDateKey();
                const sessionEntries = Object.entries(chatSessionMessages)
                  .filter(([, d]) => d.spotName && (d.sessionDay === today || d.sessionDay === tomorrow))
                  .filter(([, d]) => d.messages.length > 0 || d.conversationId)
                  .sort(([, a], [, b]) => {
                    // Meest recent (meeste berichten) bovenaan per spot+day
                    if (a.sessionDay !== b.sessionDay) return (a.sessionDay ?? '').localeCompare(b.sessionDay ?? '');
                    return (b.messages.length) - (a.messages.length);
                  });
                if (!sessionEntries.length) return <View style={{ alignItems: 'center', paddingTop: 40, gap: 8 }}>
                    <Text style={{ fontSize: 32 }}>👥</Text>
                    <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>No group chats yet</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center' }}>Join a session to start chatting with your group</Text>
                  </View>;
                return sessionEntries.map(([gk, data]) => {
                  const msgs = data.messages ?? [];
                  const lastMsg = msgs[msgs.length - 1];
                  const sessionUnread = unreadBySession[gk] ?? 0;
                  const dayLabel = data.sessionDay === today ? 'Today' : data.sessionDay === tomorrow ? 'Tomorrow' : (data.sessionDay ?? '');
                  return (
                    <Pressable key={gk} onPress={() => {
                      setExpandedChatSpot(null); setExpandedDmId(null); setExpandedChatSession(gk);
                      setUnreadBySession(p => ({ ...p, [gk]: 0 }));
                      if (!data.loaded || !msgs.length) void loadSessionChatForTab(gk, data.spotName ?? '', data.sessionDay ?? today);
                    }} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                      <Ionicons name="people-outline" size={22} color="rgba(255,255,255,0.5)" />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{data.spotName}</Text>
                          <Text style={{ color: theme.textMuted, fontSize: 12 }}>{dayLabel}{data.sessionStart && data.sessionEnd ? ` · ${data.sessionStart.slice(0,5)}–${data.sessionEnd.slice(0,5)}` : ''}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          {lastMsg ? <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, flex: 1 }} numberOfLines={1}>{lastMsg.display_name}: {lastMsg.text}</Text> : null}
                          {sessionUnread > 0 && <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 8 }}><Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>{sessionUnread}</Text></View>}
                        </View>
                      </View>
                    </Pressable>
                  );
                });
              })()}
            </View>
          )}
          {/* DMs */}
          {chatSubTab === 'dm' && (
            <View style={{ gap: 8 }}>
              {dmConversations.length === 0 && (
                <View style={{ alignItems: 'center', paddingTop: 40, gap: 12 }}>
                  <Text style={{ fontSize: 32 }}>✉️</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center', maxWidth: 280 }}>No direct chats yet.</Text>
                  <Pressable onPress={() => { setShowChat(false); setShowBuddies(true); setBuddiesTab('myBuddies'); }} style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                    <Text style={{ color: theme.textSoft, fontSize: 14, fontWeight: '800' }}>Message a buddy →</Text>
                  </Pressable>
                </View>
              )}
              {dmConversations.length > 0 && (
                <View style={{ marginBottom: 8, paddingHorizontal: 0 }}>
                  <TextInput value={dmSearchQuery} onChangeText={setDmSearchQuery} placeholder="Search" placeholderTextColor={theme.textMuted} style={{ backgroundColor: 'rgba(255,255,255,0.07)', color: theme.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }} />
                </View>
              )}
              {dmConversations.filter(dm => !dmSearchQuery.trim() || dm.otherName?.toLowerCase().includes(dmSearchQuery.toLowerCase())).map((dm) => {
                const dmUnread = unreadByDm[dm.id] ?? 0;
                const lastTs = dm.lastMessageAt ? formatToHourMinute(dm.lastMessageAt) : '';
                return (
                  <Pressable key={dm.id} onPress={() => { setExpandedChatSpot(null); setExpandedChatSession(null); setExpandedDmId(dm.id); setUnreadByDm((p) => ({ ...p, [dm.id]: 0 })); if (!dmMessages[dm.id]) void loadDmMessages(dm.id); }} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                    <Pressable onPress={(e) => { e.stopPropagation(); setViewingOtherUserId(dm.otherUserId); }}>
                      <Avatar uri={dm.otherAvatar} size={50} skillLevel={dm.otherSkillLevel} name={dm.otherName} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{dm.otherName}</Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>{lastTs}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        {dm.lastMessage ? <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, flex: 1 }} numberOfLines={1}>{dm.lastMessage}</Text> : null}
                        {dmUnread > 0 && <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 8 }}><Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>{dmUnread}</Text></View>}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
          {chatSubTab === 'group' && (
            <View style={{ gap: 8 }}>
              <Pressable onPress={() => { setCreateGroupName(''); setCreateGroupSelectedIds([]); setShowCreateGroup(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 8, backgroundColor: '#123868', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 }}>
                <Ionicons name="add" size={16} color={theme.text} />
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>New group</Text>
              </Pressable>
              {myPersistentGroups.length === 0 && (
                <View style={{ alignItems: 'center', paddingTop: 30, gap: 8 }}>
                  <Text style={{ fontSize: 32 }}>👥</Text>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>No groups yet</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center' }}>Create a group to chat with your crew</Text>
                </View>
              )}
              {myPersistentGroups.map((grp) => {
                const grpUnread = unreadByPersistentGroup[grp.id] ?? 0;
                return (
                  <Pressable key={grp.id} onPress={() => {
                    setExpandedPersistentGroupId(grp.id);
                    setUnreadByPersistentGroup((p) => ({ ...p, [grp.id]: 0 }));
                    if (!persistentGroupMessages[grp.id]?.loaded && grp.conversationId) void loadPersistentGroupMessages(grp.id, grp.conversationId);
                  }} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                    <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="people-outline" size={22} color="rgba(255,255,255,0.6)" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{grp.name}</Text>
                        {grp.pendingRequests > 0 && grp.role === 'admin' && (
                          <View style={{ backgroundColor: '#FFB347', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                            <Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>{grp.pendingRequests} req</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        {grp.lastMessage ? <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, flex: 1 }} numberOfLines={1}>{grp.lastMessage}</Text> : <Text style={{ color: theme.textMuted, fontSize: 13 }}>No messages yet</Text>}
                        {grpUnread > 0 && <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 8 }}><Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>{grpUnread}</Text></View>}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>)
        )}
        </KeyboardAvoidingView>
      {renderOtherUserProfileModal()}
      {groupMembersPopup !== null && (
        <Pressable onPress={() => setGroupMembersPopup(null)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 400 }}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 64, left: 16, right: 16, backgroundColor: 'rgba(8,24,39,0.97)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', padding: 16, zIndex: 401 }}>
            <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 12 }}>MEMBERS ({groupMembersPopup.length})</Text>
            {groupMembersPopup.map((m) => {
              const grpForPopup = expandedPersistentGroupId ? myPersistentGroups.find((g) => g.id === expandedPersistentGroupId) : null;
              const iAmAdmin = grpForPopup?.role === 'admin';
              const isMe = m.id === (activeProfile?.id ?? activeAppUserId);
              return (
                <Pressable key={m.id} onPress={() => {
                  if (iAmAdmin && !isMe && m.role !== 'admin') {
                    Alert.alert(m.display_name, 'What do you want to do?', [
                      { text: 'View profile', onPress: () => { setGroupMembersPopup(null); setViewingOtherUserId(m.id); } },
                      { text: 'Make admin', onPress: () => Alert.alert('Transfer admin', `Make ${m.display_name} admin? You'll become a regular member.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Confirm', style: 'destructive', onPress: async () => {
                          if (!expandedPersistentGroupId) return;
                          await supabase.from('group_members').update({ role: 'member' }).eq('group_id', expandedPersistentGroupId).eq('user_id', activeProfile?.id ?? activeAppUserId ?? '');
                          await supabase.from('group_members').update({ role: 'admin' }).eq('group_id', expandedPersistentGroupId).eq('user_id', m.id);
                          await loadMyPersistentGroups();
                          setGroupMembersPopup(null);
                        }},
                      ])},
                      { text: 'Remove from group', style: 'destructive', onPress: async () => {
                        if (!expandedPersistentGroupId) return;
                        await supabase.from('group_members').delete().eq('group_id', expandedPersistentGroupId).eq('user_id', m.id);
                        await loadMyPersistentGroups();
                        setGroupMembersPopup((prev) => prev?.filter((x) => x.id !== m.id) ?? null);
                      }},
                      { text: 'Cancel', style: 'cancel' },
                    ]);
                  } else {
                    setGroupMembersPopup(null); setViewingOtherUserId(m.id);
                  }
                }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <Avatar uri={m.avatar_url} size={36} name={m.display_name} />
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700', flex: 1 }}>{m.display_name}</Text>
                  {m.role === 'admin' && <Text style={{ color: '#FFB347', fontSize: 11, fontWeight: '800' }}>admin</Text>}
                  {iAmAdmin && !isMe && m.role !== 'admin' && <Ionicons name="ellipsis-horizontal" size={16} color={theme.textMuted} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      )}
      {showCreateGroup && (() => {
        const allUsers = (Array.isArray(buddyUsers) ? buddyUsers : []);
        return (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.bg, zIndex: 300, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', gap: 10 }}>
              <Pressable onPress={() => setShowCreateGroup(false)} hitSlop={10} style={{ padding: 4 }}>
                <Ionicons name="chevron-back" size={22} color={theme.text} />
              </Pressable>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', flex: 1 }}>New group</Text>
              <Pressable onPress={() => void createPersistentGroup()} disabled={!createGroupName.trim() || isCreatingGroup} style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, backgroundColor: '#123868', opacity: createGroupName.trim() && !isCreatingGroup ? 1 : 0.4 }}>
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>{isCreatingGroup ? '…' : 'Create'}</Text>
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Pressable onPress={async () => { const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1,1], quality: 0.8 }); if (!r.canceled && r.assets[0]) setCreateGroupAvatarUri(r.assets[0].uri); }} style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {createGroupAvatarUri ? <Image source={{ uri: createGroupAvatarUri }} style={{ width: 60, height: 60, borderRadius: 30 }} /> : <Ionicons name="camera-outline" size={22} color={theme.textMuted} />}
              </Pressable>
              <TextInput value={createGroupName} onChangeText={setCreateGroupName} placeholder="Group name" placeholderTextColor={theme.textMuted} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', color: theme.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }} />
            </View>
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>ADD MEMBERS (optional)</Text>
              {allUsers.map((u) => {
                const selected = createGroupSelectedIds.includes(u.id);
                return (
                  <Pressable key={u.id} onPress={() => setCreateGroupSelectedIds((prev) => selected ? prev.filter((id) => id !== u.id) : [...prev, u.id])} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                    <Avatar uri={u.avatar_url ?? null} size={44} skillLevel={u.skill_level} name={u.display_name} />
                    <Text style={{ flex: 1, color: theme.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{u.display_name}</Text>
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? theme.primary : 'rgba(255,255,255,0.2)', backgroundColor: selected ? theme.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {selected && <Ionicons name="checkmark" size={13} color={theme.bg} />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        );
      })()}
      {showNominateModal && (() => {
        const { groupId, groupName } = showNominateModal;
        const grp = myPersistentGroups.find((g) => g.id === groupId);
        const isAdmin = grp?.role === 'admin';
        const existingMemberIds = new Set(grp?.memberIds ?? []);
        const closeModal = () => { setShowNominateModal(null); setNominateSearchQuery(''); setNominateSelectedUserId(null); setNominateSearchResults([]); setAddBuddySelectedIds([]); };
        const followingSet = new Set(followingUserIds);
        const buddyList = (Array.isArray(buddyUsers) ? buddyUsers : []).filter((u) => followingSet.has(u.id) && !existingMemberIds.has(u.id));
        return (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.bg, zIndex: 300, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', gap: 10 }}>
              <Pressable onPress={closeModal} hitSlop={10} style={{ padding: 4 }}>
                <Ionicons name="chevron-back" size={22} color={theme.text} />
              </Pressable>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', flex: 1 }}>
                {isAdmin ? `Add to ${groupName}` : `Suggest buddies for ${groupName}`}
              </Text>
              {addBuddySelectedIds.length > 0 && (
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>{addBuddySelectedIds.length} selected</Text>
              )}
            </View>

            {/* Admin: zoekbalk + pending requests */}
            {isAdmin && (
              <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                <TextInput value={nominateSearchQuery} onChangeText={async (q) => {
                  setNominateSearchQuery(q);
                  if (q.trim().length < 2) { setNominateSearchResults([]); return; }
                  const { data } = await supabase.from('profiles').select('id, display_name, avatar_url').ilike('display_name', `%${q.trim()}%`).limit(20);
                  setNominateSearchResults((data ?? []).filter((u) => !existingMemberIds.has(u.id)));
                }} placeholder="Search by name…" placeholderTextColor={theme.textMuted} style={{ backgroundColor: 'rgba(255,255,255,0.07)', color: theme.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }} />
              </View>
            )}

            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              {/* Admin zoekresultaten */}
              {isAdmin && nominateSearchResults.map((u) => {
                const sel = addBuddySelectedIds.includes(u.id);
                return (
                  <Pressable key={u.id} onPress={() => setAddBuddySelectedIds((prev) => sel ? prev.filter((id) => id !== u.id) : [...prev, u.id])} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                    <Avatar uri={u.avatar_url} size={44} name={u.display_name} />
                    <Text style={{ flex: 1, color: theme.text, fontSize: 15, fontWeight: '700' }}>{u.display_name}</Text>
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: sel ? theme.primary : 'rgba(255,255,255,0.2)', backgroundColor: sel ? theme.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {sel && <Ionicons name="checkmark" size={13} color={theme.bg} />}
                    </View>
                  </Pressable>
                );
              })}

              {/* Buddies lijst (voor iedereen, ook admin) */}
              {nominateSearchQuery.trim().length === 0 && buddyList.length > 0 && (
                <View>
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>YOUR BUDDIES</Text>
                  {buddyList.map((u) => {
                    const sel = addBuddySelectedIds.includes(u.id);
                    return (
                      <Pressable key={u.id} onPress={() => setAddBuddySelectedIds((prev) => sel ? prev.filter((id) => id !== u.id) : [...prev, u.id])} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                        <Avatar uri={u.avatar_url ?? null} size={44} skillLevel={u.skill_level} name={u.display_name} />
                        <Text style={{ flex: 1, color: theme.text, fontSize: 15, fontWeight: '700' }}>{u.display_name}</Text>
                        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: sel ? theme.primary : 'rgba(255,255,255,0.2)', backgroundColor: sel ? theme.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {sel && <Ionicons name="checkmark" size={13} color={theme.bg} />}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {nominateSearchQuery.trim().length === 0 && buddyList.length === 0 && (
                <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40 }}>All your buddies are already in this group</Text>
              )}

              {/* Admin: pending requests */}
              {isAdmin && grp.pendingRequests > 0 && nominateSearchQuery.trim().length === 0 && (() => {
                const [pendingReqs, setPendingReqs] = React.useState<Array<{ id: string; nominee: { id: string; display_name: string; avatar_url: string | null }; introduced_by: { display_name: string } }>>([]);
                React.useEffect(() => {
                  supabase.from('group_join_requests').select('id, nominee_id, introduced_by, profiles!group_join_requests_nominee_id_fkey(id, display_name, avatar_url), introducedByProfile:profiles!group_join_requests_introduced_by_fkey(display_name)').eq('group_id', groupId).eq('status', 'pending').then(({ data }) => {
                    setPendingReqs((data ?? []).map((r: any) => ({ id: r.id, nominee: r.profiles ?? { id: r.nominee_id, display_name: 'Unknown', avatar_url: null }, introduced_by: r.introducedByProfile ?? { display_name: 'Someone' } })));
                  });
                }, []);
                if (!pendingReqs.length) return null;
                return (
                  <View>
                    <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>PENDING REQUESTS</Text>
                    {pendingReqs.map((req) => (
                      <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                        <Avatar uri={req.nominee.avatar_url} size={44} name={req.nominee.display_name} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{req.nominee.display_name}</Text>
                          <Text style={{ color: theme.textMuted, fontSize: 12 }}>Suggested by {req.introduced_by.display_name}</Text>
                        </View>
                        <Pressable onPress={() => void resolveJoinRequest(req.id, true)} style={{ backgroundColor: '#123868', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6 }}>
                          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>Accept</Text>
                        </Pressable>
                        <Pressable onPress={() => void resolveJoinRequest(req.id, false)} style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
                          <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '700' }}>Deny</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                );
              })()}
            </ScrollView>

            {addBuddySelectedIds.length > 0 && (
              <View style={{ padding: 16 }}>
                <Pressable onPress={async () => {
                  const actorName = activeProfile?.display_name ?? 'Someone';
                  if (isAdmin) {
                    for (const uid of addBuddySelectedIds) {
                      await supabase.from('group_members').insert({ group_id: groupId, user_id: uid, role: 'member' });
                    }
                    void sendPushToRecipients(addBuddySelectedIds, `${actorName} added you to a group`, `You've been added to "${groupName}"`, { type: 'dm' });
                  } else {
                    for (const uid of addBuddySelectedIds) {
                      await supabase.from('group_join_requests').insert({ group_id: groupId, nominee_id: uid, introduced_by: activeProfile?.id ?? activeAppUserId ?? '', status: 'pending' });
                    }
                    Alert.alert('Sent!', `${addBuddySelectedIds.length} suggestion${addBuddySelectedIds.length > 1 ? 's' : ''} sent to the admin.`);
                  }
                  await loadMyPersistentGroups();
                  closeModal();
                }} style={{ backgroundColor: '#123868', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '900' }}>
                    {isAdmin ? `Add ${addBuddySelectedIds.length} to group` : `Suggest ${addBuddySelectedIds.length} to admin`}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })()}
      {showBroadcastDm && (() => {
        const followingSet = new Set(followingUserIds);
        const buddyList = (Array.isArray(buddyUsers) ? buddyUsers : []).filter((u) => followingSet.has(u.id));
        const canSend = !broadcastSending && broadcastSelectedIds.length > 0 && !!broadcastMessage.trim();
        return (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.bg, zIndex: 300, flex: 1 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', gap: 10 }}>
              <Pressable onPress={() => { setShowBroadcastDm(false); setBroadcastMessage(''); }} hitSlop={10} style={{ padding: 4 }}>
                <Ionicons name="chevron-back" size={22} color={theme.text} />
              </Pressable>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="megaphone-outline" size={16} color={theme.text} />
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>Broadcast</Text>
              </View>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>{broadcastSelectedIds.length} {broadcastSelectedIds.length === 1 ? 'buddy' : 'buddies'}</Text>
            </View>
            {/* Input + Send */}
            <View style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 10, paddingBottom: 10, backgroundColor: theme.bg, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingLeft: 14, paddingRight: 5, paddingVertical: 5 }}>
                <TextInput
                  value={broadcastMessage}
                  onChangeText={setBroadcastMessage}
                  placeholder="Type a message…"
                  placeholderTextColor={theme.textMuted}
                  multiline
                  style={({ flex: 1, color: theme.text, paddingVertical: 7, paddingRight: 6, fontSize: 15, outlineStyle: 'none', boxShadow: 'none' } as any)}
                />
                <Pressable onPress={() => void sendBroadcastDm()} disabled={!canSend} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: canSend ? theme.primary : 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', opacity: canSend ? 1 : 0.4 }}>
                  <Ionicons name="arrow-up" size={17} color="#ffffff" />
                </Pressable>
              </View>
              {broadcastSelectedIds.length > 0 ? (
                <Pressable onPress={() => setBroadcastSelectedIds([])} style={{ alignSelf: 'flex-start', marginTop: 8, backgroundColor: '#123868', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderColor: theme.primary }}>
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Deselect all</Text>
                </Pressable>
              ) : null}
            </View>
            {/* Buddy list */}
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              {buddyList.map((u) => {
                const selected = broadcastSelectedIds.includes(u.id);
                return (
                  <Pressable key={u.id} onPress={() => setBroadcastSelectedIds((prev) => selected ? prev.filter((id) => id !== u.id) : [...prev, u.id])} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                    <Avatar uri={u.avatar_url ?? null} size={50} skillLevel={u.skill_level} name={u.display_name} />
                    <Text style={{ flex: 1, color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{u.display_name}</Text>
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? theme.primary : 'rgba(255,255,255,0.2)', backgroundColor: selected ? theme.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {selected && <Ionicons name="checkmark" size={13} color={theme.bg} />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        );
      })()}
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
              (<View style={{ flex: 1 }}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', gap: 10 }}>
                  <Pressable onPress={handleOpenBack} hitSlop={10} style={{ padding: 4 }}>
                    <Ionicons name="chevron-back" size={22} color={theme.text} />
                  </Pressable>
                  {expandedPersistentGroupId && (() => {
                    const grpAvatar = myPersistentGroups.find((g) => g.id === expandedPersistentGroupId);
                    return (
                      <Pressable onPress={() => grpAvatar?.role === 'admin' ? void pickAndUploadGroupAvatar(expandedPersistentGroupId) : void openGroupMembersPopup(expandedPersistentGroupId)}
                        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {grpAvatar?.avatar_url
                          ? <Image source={{ uri: grpAvatar.avatar_url }} style={{ width: 36, height: 36 }} />
                          : <Ionicons name="people-outline" size={18} color="rgba(255,255,255,0.6)" />}
                      </Pressable>
                    );
                  })()}
                  <View style={{ flex: 1 }}>
                    {expandedPersistentGroupId && myPersistentGroups.find((g) => g.id === expandedPersistentGroupId)?.role === 'admin' ? (
                      editingGroupName !== null ? (
                        <TextInput value={editingGroupName} onChangeText={setEditingGroupName} autoFocus onBlur={async () => {
                          const trimmed = editingGroupName.trim();
                          if (trimmed && trimmed !== openConvName && expandedPersistentGroupId) {
                            await supabase.from('groups').update({ name: trimmed }).eq('id', expandedPersistentGroupId);
                            setMyPersistentGroups((prev) => prev.map((g) => g.id === expandedPersistentGroupId ? { ...g, name: trimmed } : g));
                          }
                          setEditingGroupName(null);
                        }} style={{ flex: 1, color: theme.text, fontSize: 16, fontWeight: '800', padding: 0 }} />
                      ) : (
                        <Pressable onPress={() => setEditingGroupName(openConvName)}>
                          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{openConvName} <Ionicons name="pencil-outline" size={13} color={theme.textMuted} /></Text>
                        </Pressable>
                      )
                    ) : (
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{openConvName}</Text>
                    )}
                    {openConvSub ? <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 1 }}>{openConvSub}</Text> : null}
                  </View>
                  {expandedPersistentGroupId && (() => {
                    const grp = myPersistentGroups.find((g) => g.id === expandedPersistentGroupId);
                    if (!grp) return null;
                    return (
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        {grp.role === 'admin' && grp.pendingRequests > 0 && (
                          <Pressable onPress={() => setShowNominateModal({ groupId: grp.id, groupName: grp.name })} style={{ backgroundColor: '#FFB347', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 }}>
                            <Text style={{ color: '#000', fontSize: 12, fontWeight: '900' }}>{grp.pendingRequests} req</Text>
                          </Pressable>
                        )}
                        {grp.role === 'admin' && (
                          <Pressable onPress={() => void pickAndUploadGroupAvatar(grp.id)} style={{ padding: 4 }} hitSlop={8}>
                            <Ionicons name="camera-outline" size={20} color={theme.textMuted} />
                          </Pressable>
                        )}
                        <Pressable onPress={() => setShowNominateModal({ groupId: grp.id, groupName: grp.name })} style={{ padding: 4 }} hitSlop={8}>
                          <Ionicons name="person-add-outline" size={20} color={theme.textMuted} />
                        </Pressable>
                      </View>
                    );
                  })()}
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
                    : renderChatMessages(openMessages, (uid) => uid === (activeProfile?.id ?? activeAppUserId), !expandedDmId)
                  }
                </ScrollView>
                {/* Invoerbalk */}
                <View style={{ paddingLeft: 12, paddingRight: 16, paddingTop: 8, paddingBottom: 12, backgroundColor: theme.bg, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                  {pendingMediaUri ? (
                    <View style={{ marginBottom: 8, marginLeft: 44 }}>
                      <View style={{ position: 'relative', width: 72, height: 72 }}>
                        <Image source={{ uri: pendingMediaUri }} style={{ width: 72, height: 72, borderRadius: 10 }} resizeMode="cover" />
                        <Pressable onPress={() => setPendingMediaUri(null)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="close" size={12} color="#ffffff" />
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pressable onPress={handlePickChatMedia} disabled={isUploadingMedia} style={{ padding: 4 }}>
                      <Ionicons name="add" size={26} color="#ffffff" />
                    </Pressable>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingLeft: 14, paddingRight: 5, paddingVertical: 5 }}>
                      <TextInput
                        value={openInput}
                        onChangeText={setOpenInput}
                        onSubmitEditing={() => { void handleOpenSend(); }}
                        onFocus={() => setTimeout(() => openScrollRef.current?.scrollToEnd({ animated: true }), 300)}
                        blurOnSubmit={false}
                        placeholder="Type a message…"
                        placeholderTextColor={theme.textMuted}
                        style={{ flex: 1, color: theme.text, paddingVertical: 7, paddingRight: 6, fontSize: 15 }}
                      />
                      <Pressable onPress={() => { void handleOpenSend(); }} disabled={!openInput.trim() && !pendingMediaUri || isUploadingMedia} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: (openInput.trim() || pendingMediaUri) && !isUploadingMedia ? theme.primary : 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', opacity: (openInput.trim() || pendingMediaUri) && !isUploadingMedia ? 1 : 0.4 }}>
                        <Ionicons name={isUploadingMedia ? 'hourglass-outline' : 'arrow-up'} size={17} color="#ffffff" />
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>)
            ) : (
              /* Lijst-modus */
              (<ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 100 }}>
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
                      <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>Notifications are off by default. Choose who can send you alerts per chat type.</Text>
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
                            return <Pressable key={opt} onPress={() => setMessagesAlertSettings((prev) => ({ ...prev, [key]: opt }))} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: selected ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: selected ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)' }}><Text style={{ color: selected ? theme.textSoft : theme.textMuted, fontSize: 11, fontWeight: '700' }}>{opt === 'off' ? 'Off' : opt === 'buddies' ? 'Buddies' : 'Everyone'}</Text></Pressable>;
                          })}
                        </View>
                      </View>
                    ))}
                    {/* DMs toggle */}
                    <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <Text style={{ fontSize: 16 }}>💬</Text>
                        <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: '700', flex: 1 }}>Direct Chat: Buddies</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {(['on', 'off'] as const).map((opt) => {
                          const dmEnabled = activeProfile?.dm_push_enabled !== false;
                          const selected = (opt === 'on') === dmEnabled;
                          return (
                            <Pressable key={opt} onPress={async () => {
                              const newVal = opt === 'on';
                              setProfile((prev) => prev ? { ...prev, dm_push_enabled: newVal } : prev);
                              await supabase.from('profiles').update({ dm_push_enabled: newVal }).eq('id', activeProfile?.id ?? '');
                            }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: selected ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: selected ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)' }}>
                              <Text style={{ color: selected ? theme.textSoft : theme.textMuted, fontSize: 11, fontWeight: '700' }}>{opt === 'on' ? 'On' : 'Off'}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                    <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <Text style={{ fontSize: 16 }}>💬</Text>
                        <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: '700', flex: 1 }}>Direct Chat: Other Riders</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {(['on', 'off'] as const).map((opt) => {
                          const selected = (opt === 'on') === messagesAlertSettings.messageRequests;
                          return (
                            <Pressable key={opt} onPress={() => setMessagesAlertSettings((prev) => ({ ...prev, messageRequests: opt === 'on' }))} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: selected ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: selected ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)' }}>
                              <Text style={{ color: selected ? theme.textSoft : theme.textMuted, fontSize: 11, fontWeight: '700' }}>{opt === 'on' ? 'On' : 'Off'}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                )}
                <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 999, padding: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 16, alignSelf: 'flex-start' }}>
                  {chatTabs.map((tab) => { const active = chatSubTab === tab.key; return <Pressable key={tab.key} onPress={() => { setChatSubTab(tab.key); }} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: active ? '#202833' : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 5 }}><Text style={{ color: active ? '#ffffff' : theme.textMuted, fontSize: 13, fontWeight: '800' }}>{tab.label}</Text>{tab.badge > 0 && <View style={{ minWidth: 16, height: 16, borderRadius: 8, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}><Text style={{ color: '#000', fontSize: 9, fontWeight: '900' }}>{tab.badge}</Text></View>}</Pressable>; })}
                  {followingUserIds.length > 0 && (
                    <Pressable onPress={() => { setBroadcastSelectedIds(followingUserIds); setShowBroadcastDm(true); }} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="megaphone-outline" size={13} color={theme.textMuted} />
                      <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '800' }}>Broadcast</Text>
                    </Pressable>
                  )}
                </View>
                {chatSubTab === 'spot' && <View style={{ gap: 8 }}>
                  {favoriteSpots.length === 0 && <Text style={{ color: theme.textMuted, fontSize: 14 }}>You're not following any spots yet.</Text>}
                  {(() => {
                    const todayN = getTodayLocalDateKey();
                    const tomorrowN = getTomorrowLocalDateKey();
                    const nativeRows: Array<{ spotName: string; chatKey: string; chatData: typeof chatSpotMessages[string] | null }> = [];
                    for (const spotName of favoriteSpots) {
                      for (const day of [todayN, tomorrowN]) {
                        const cKey = spotChatKey(spotName, day);
                        const data = chatSpotMessages[cKey] ?? null;
                        if (day === todayN || data) nativeRows.push({ spotName, chatKey: cKey, chatData: data });
                      }
                    }
                    return nativeRows.map(({ spotName, chatKey, chatData }) => {
                    const activeNativeKey = chatKey;
                    const msgs = chatData?.messages ?? [];
                    const lastMsg = msgs[msgs.length - 1];
                    const spotUnreadCount = spotsWithUnread[spotName.toLowerCase()] ?? 0;
                    const hasUnread = spotUnreadCount > 0;
                    const nativeDayLabel = dayFromChatKey(chatKey) === todayN ? 'Today' : 'Tomorrow';
                    return <Pressable key={chatKey} onPress={() => { setExpandedChatSession(null); setExpandedDmId(null); setExpandedChatSpot(activeNativeKey); setSpotsWithUnread(p => { const n = { ...p }; delete n[spotName.toLowerCase()]; return n; }); if (!chatSpotMessages[activeNativeKey]?.loaded) void loadSpotChatForTab(spotName, dayFromChatKey(activeNativeKey)); }} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                      <Ionicons name="location-outline" size={22} color="rgba(255,255,255,0.5)" />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{spotName}</Text>
                          <Text style={{ color: theme.textMuted, fontSize: 12 }}>{nativeDayLabel}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          {lastMsg ? <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, flex: 1 }} numberOfLines={1}>{lastMsg.display_name}: {lastMsg.text}</Text> : null}
                          {hasUnread && <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 8 }}><Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>{spotUnreadCount}</Text></View>}
                        </View>
                      </View>
                    </Pressable>;
                    }); // einde nativeRows.map
                  })()}
                </View>}
                {chatSubTab === 'session' && <View style={{ gap: 8 }}>
                  {(() => {
                    const today = getTodayLocalDateKey();
                    const tomorrow = getTomorrowLocalDateKey();
                    const sessionEntries = Object.entries(chatSessionMessages)
                      .filter(([, d]) => d.spotName && (d.sessionDay === today || d.sessionDay === tomorrow))
                      .filter(([, d]) => d.messages.length > 0 || d.conversationId)
                      .sort(([, a], [, b]) => {
                        if (a.sessionDay !== b.sessionDay) return (a.sessionDay ?? '').localeCompare(b.sessionDay ?? '');
                        return (b.messages.length) - (a.messages.length);
                      });
                    if (!sessionEntries.length) return <View style={{ alignItems: 'center', paddingTop: 40, gap: 8 }}>
                        <Text style={{ fontSize: 32 }}>👥</Text>
                        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>No group chats yet</Text>
                        <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center' }}>Join a session to start chatting with your group</Text>
                      </View>;
                    return sessionEntries.map(([gk, data]) => {
                      const msgs = data.messages ?? [];
                      const lastMsg = msgs[msgs.length - 1];
                      const sessionUnread = unreadBySession[gk] ?? 0;
                      const dayLabel = data.sessionDay === today ? 'Today' : data.sessionDay === tomorrow ? 'Tomorrow' : (data.sessionDay ?? '');
                      return (
                        <Pressable key={gk} onPress={() => {
                          setExpandedChatSpot(null); setExpandedDmId(null); setExpandedChatSession(gk);
                          setUnreadBySession(p => ({ ...p, [gk]: 0 }));
                          if (!data.loaded || !msgs.length) void loadSessionChatForTab(gk, data.spotName ?? '', data.sessionDay ?? today);
                        }} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                          <Ionicons name="people-outline" size={22} color="rgba(255,255,255,0.5)" />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{data.spotName}</Text>
                              <Text style={{ color: theme.textMuted, fontSize: 12 }}>{dayLabel}{data.sessionStart && data.sessionEnd ? ` · ${data.sessionStart.slice(0,5)}–${data.sessionEnd.slice(0,5)}` : ''}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              {lastMsg ? <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, flex: 1 }} numberOfLines={1}>{lastMsg.display_name}: {lastMsg.text}</Text> : null}
                              {sessionUnread > 0 && <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 8 }}><Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>{sessionUnread}</Text></View>}
                            </View>
                          </View>
                        </Pressable>
                      );
                    });
                  })()}
                </View>}
                {chatSubTab === 'dm' && <View style={{ gap: 8 }}>
                  {dmConversations.length === 0 && <View style={{ alignItems: 'center', paddingTop: 40, gap: 12 }}><Text style={{ fontSize: 32 }}>✉️</Text><Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center' }}>No direct chats yet.</Text><Pressable onPress={() => { setShowChat(false); setShowBuddies(true); setBuddiesTab('myBuddies'); }} style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}><Text style={{ color: '#4DB8FF', fontSize: 14, fontWeight: '800' }}>Message a buddy →</Text></Pressable></View>}
                  {dmConversations.length > 0 && (
                    <View style={{ marginBottom: 8 }}>
                      <TextInput value={dmSearchQuery} onChangeText={setDmSearchQuery} placeholder="Search" placeholderTextColor={theme.textMuted} style={{ backgroundColor: 'rgba(255,255,255,0.07)', color: theme.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }} />
                    </View>
                  )}
                  {dmConversations.filter(dm => !dmSearchQuery.trim() || dm.otherName?.toLowerCase().includes(dmSearchQuery.toLowerCase())).map((dm) => {
                    const dmUnread = unreadByDm[dm.id] ?? 0;
                    const lastTs = dm.lastMessageAt ? formatToHourMinute(dm.lastMessageAt) : '';
                    return <Pressable key={dm.id} onPress={() => { setExpandedDmId(dm.id); setUnreadByDm(p => ({ ...p, [dm.id]: 0 })); if (!dmMessages[dm.id]) void loadDmMessages(dm.id); }} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                      <Pressable onPress={(e) => { e.stopPropagation(); setViewingOtherUserId(dm.otherUserId); }}>
                        <Avatar uri={dm.otherAvatar} size={50} skillLevel={dm.otherSkillLevel} name={dm.otherName} />
                      </Pressable>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{dm.otherName}</Text>
                          <Text style={{ color: theme.textMuted, fontSize: 12 }}>{lastTs}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          {dm.lastMessage ? <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, flex: 1 }} numberOfLines={1}>{dm.lastMessage}</Text> : null}
                          {dmUnread > 0 && <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 8 }}><Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>{dmUnread}</Text></View>}
                        </View>
                      </View>
                    </Pressable>;
                  })}
                </View>}
                {chatSubTab === 'group' && <View style={{ gap: 8 }}>
                  <Pressable onPress={() => { setCreateGroupName(''); setCreateGroupSelectedIds([]); setShowCreateGroup(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
                    <Ionicons name="add" size={18} color={theme.text} />
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>New group</Text>
                  </Pressable>
                  {myPersistentGroups.length === 0 && <View style={{ alignItems: 'center', paddingTop: 30, gap: 8 }}><Text style={{ fontSize: 32 }}>👥</Text><Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>No groups yet</Text><Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center' }}>Create a group to chat with your crew</Text></View>}
                  {myPersistentGroups.map((grp) => {
                    const grpUnread = unreadByPersistentGroup[grp.id] ?? 0;
                    return <Pressable key={grp.id} onPress={() => {
                      setExpandedPersistentGroupId(grp.id);
                      setUnreadByPersistentGroup((p) => ({ ...p, [grp.id]: 0 }));
                      if (!persistentGroupMessages[grp.id]?.loaded && grp.conversationId) void loadPersistentGroupMessages(grp.id, grp.conversationId);
                    }} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {grp.avatar_url ? <Image source={{ uri: grp.avatar_url }} style={{ width: 46, height: 46 }} /> : <Ionicons name="people-outline" size={22} color="rgba(255,255,255,0.6)" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{grp.name}</Text>
                          {grp.pendingRequests > 0 && grp.role === 'admin' && <View style={{ backgroundColor: '#FFB347', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}><Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>{grp.pendingRequests} req</Text></View>}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          {grp.lastMessage ? <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, flex: 1 }} numberOfLines={1}>{grp.lastMessage}</Text> : <Text style={{ color: theme.textMuted, fontSize: 13 }}>No messages yet</Text>}
                          {grpUnread > 0 && <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 8 }}><Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>{grpUnread}</Text></View>}
                        </View>
                      </View>
                    </Pressable>;
                  })}
                </View>}
              </ScrollView>)
            )}
          </KeyboardAvoidingView>
          {/* Bottom nav alleen in lijst-modus */}
          {!isAnyConvOpen && renderNativeBottomNav()}
          {renderOtherUserProfileModal()}
          {groupMembersPopup !== null && (
            <Pressable onPress={() => setGroupMembersPopup(null)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 400 }}>
              <Pressable onPress={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 64, left: 16, right: 16, backgroundColor: 'rgba(8,24,39,0.97)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', padding: 16, zIndex: 401 }}>
                <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 12 }}>MEMBERS ({groupMembersPopup.length})</Text>
                {groupMembersPopup.map((m) => {
                  const grpForPopup = expandedPersistentGroupId ? myPersistentGroups.find((g) => g.id === expandedPersistentGroupId) : null;
                  const iAmAdmin = grpForPopup?.role === 'admin';
                  const isMe = m.id === (activeProfile?.id ?? activeAppUserId);
                  return (
                    <Pressable key={m.id} onPress={() => {
                      if (iAmAdmin && !isMe && m.role !== 'admin') {
                        Alert.alert(m.display_name, 'What do you want to do?', [
                          { text: 'View profile', onPress: () => { setGroupMembersPopup(null); setViewingOtherUserId(m.id); } },
                          { text: 'Make admin', onPress: () => Alert.alert('Transfer admin', `Make ${m.display_name} admin? You'll become a regular member.`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Confirm', style: 'destructive', onPress: async () => {
                              if (!expandedPersistentGroupId) return;
                              const { error } = await supabase.rpc('transfer_group_admin', { p_group_id: expandedPersistentGroupId, p_new_admin_id: m.id });
                              if (error) { Alert.alert('Error', error.message); return; }
                              await loadMyPersistentGroups();
                              setGroupMembersPopup(null);
                            }},
                          ])},
                          { text: 'Remove from group', style: 'destructive', onPress: async () => {
                            if (!expandedPersistentGroupId) return;
                            await supabase.from('group_members').delete().eq('group_id', expandedPersistentGroupId).eq('user_id', m.id);
                            await loadMyPersistentGroups();
                            setGroupMembersPopup((prev) => prev?.filter((x) => x.id !== m.id) ?? null);
                          }},
                          { text: 'Cancel', style: 'cancel' },
                        ]);
                      } else {
                        setGroupMembersPopup(null); setViewingOtherUserId(m.id);
                      }
                    }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <Avatar uri={m.avatar_url} size={36} name={m.display_name} />
                      <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700', flex: 1 }}>{m.display_name}</Text>
                      {m.role === 'admin' && <Text style={{ color: '#FFB347', fontSize: 11, fontWeight: '800' }}>admin</Text>}
                      {iAmAdmin && !isMe && m.role !== 'admin' && <Ionicons name="ellipsis-horizontal" size={16} color={theme.textMuted} />}
                    </Pressable>
                  );
                })}
              </Pressable>
            </Pressable>
          )}
          {showCreateGroup && (() => {
            const allUsers = (Array.isArray(buddyUsers) ? buddyUsers : []);
            return (
              <View style={{ position: 'absolute', top: 88, left: 0, right: 0, bottom: 0, backgroundColor: theme.bg, zIndex: 300, flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', gap: 10 }}>
                  <Pressable onPress={() => setShowCreateGroup(false)} hitSlop={10} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={theme.text} /></Pressable>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', flex: 1 }}>New group</Text>
                  <Pressable onPress={() => void createPersistentGroup()} disabled={!createGroupName.trim()} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: createGroupName.trim() ? theme.primary : 'rgba(255,255,255,0.08)' }}>
                    <Text style={{ color: createGroupName.trim() ? '#000' : theme.textMuted, fontSize: 13, fontWeight: '900' }}>Create</Text>
                  </Pressable>
                </View>
                <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }}>
                  <TextInput value={createGroupName} onChangeText={setCreateGroupName} placeholder="Group name" placeholderTextColor={theme.textMuted} style={{ backgroundColor: 'rgba(255,255,255,0.07)', color: theme.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }} />
                </View>
                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>ADD MEMBERS (optional)</Text>
                  {allUsers.map((u) => {
                    const selected = createGroupSelectedIds.includes(u.id);
                    return (
                      <Pressable key={u.id} onPress={() => setCreateGroupSelectedIds((prev) => selected ? prev.filter((id) => id !== u.id) : [...prev, u.id])} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                        <Avatar uri={u.avatar_url ?? null} size={44} skillLevel={u.skill_level} name={u.display_name} />
                        <Text style={{ flex: 1, color: theme.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{u.display_name}</Text>
                        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? theme.primary : 'rgba(255,255,255,0.2)', backgroundColor: selected ? theme.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {selected && <Ionicons name="checkmark" size={13} color={theme.bg} />}
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })()}
          {showNominateModal && (() => {
            const { groupId, groupName } = showNominateModal;
            const grp = myPersistentGroups.find((g) => g.id === groupId);
            const isAdmin = grp?.role === 'admin';
            return (
              <View style={{ position: 'absolute', top: 88, left: 0, right: 0, bottom: 0, backgroundColor: theme.bg, zIndex: 300, flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', gap: 10 }}>
                  <Pressable onPress={() => { setShowNominateModal(null); setNominateSearchQuery(''); setNominateSelectedUserId(null); setNominateSearchResults([]); }} hitSlop={10} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={theme.text} /></Pressable>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', flex: 1 }}>{isAdmin ? `Add to ${groupName}` : `Suggest for ${groupName}`}</Text>
                </View>
                {isAdmin ? (
                  <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                    {(() => {
                      const [pendingReqs, setPendingReqsN] = React.useState<Array<{ id: string; nominee: { id: string; display_name: string; avatar_url: string | null }; introduced_by: { display_name: string } }>>([]);
                      React.useEffect(() => {
                        supabase.from('group_join_requests').select('id, nominee_id, introduced_by, profiles!group_join_requests_nominee_id_fkey(id, display_name, avatar_url), introducedByProfile:profiles!group_join_requests_introduced_by_fkey(display_name)').eq('group_id', groupId).eq('status', 'pending').then(({ data }) => {
                          setPendingReqsN((data ?? []).map((r: any) => ({ id: r.id, nominee: r.profiles ?? { id: r.nominee_id, display_name: 'Unknown', avatar_url: null }, introduced_by: r.introducedByProfile ?? { display_name: 'Someone' } })));
                        });
                      }, []);
                      if (!pendingReqs.length) return <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40 }}>No pending requests</Text>;
                      return pendingReqs.map((req) => (
                        <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                          <Avatar uri={req.nominee.avatar_url} size={44} name={req.nominee.display_name} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{req.nominee.display_name}</Text>
                            <Text style={{ color: theme.textMuted, fontSize: 12 }}>Suggested by {req.introduced_by.display_name}</Text>
                          </View>
                          <Pressable onPress={() => void resolveJoinRequest(req.id, true)} style={{ backgroundColor: theme.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6 }}><Text style={{ color: '#000', fontSize: 13, fontWeight: '900' }}>Accept</Text></Pressable>
                          <Pressable onPress={() => void resolveJoinRequest(req.id, false)} style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}><Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '700' }}>Deny</Text></Pressable>
                        </View>
                      ));
                    })()}
                  </ScrollView>
                ) : (
                  <View style={{ flex: 1 }}>
                    <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                      <TextInput value={nominateSearchQuery} onChangeText={async (q) => {
                        setNominateSearchQuery(q);
                        if (q.trim().length < 2) { setNominateSearchResults([]); return; }
                        const { data } = await supabase.from('profiles').select('id, display_name, avatar_url').ilike('display_name', `%${q.trim()}%`).limit(20);
                        setNominateSearchResults(data ?? []);
                      }} placeholder="Search by name" placeholderTextColor={theme.textMuted} style={{ backgroundColor: 'rgba(255,255,255,0.07)', color: theme.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }} />
                    </View>
                    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                      {nominateSearchResults.map((u) => {
                        const selected = nominateSelectedUserId === u.id;
                        return (
                          <Pressable key={u.id} onPress={() => setNominateSelectedUserId(selected ? null : u.id)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                            <Avatar uri={u.avatar_url} size={44} name={u.display_name} />
                            <Text style={{ flex: 1, color: theme.text, fontSize: 15, fontWeight: '700' }}>{u.display_name}</Text>
                            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? theme.primary : 'rgba(255,255,255,0.2)', backgroundColor: selected ? theme.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                              {selected && <Ionicons name="checkmark" size={13} color={theme.bg} />}
                            </View>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    {nominateSelectedUserId && (
                      <View style={{ padding: 16 }}>
                        <Pressable onPress={() => void nominateForGroup(groupId, nominateSelectedUserId)} style={{ backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
                          <Text style={{ color: '#000', fontSize: 15, fontWeight: '900' }}>Suggest to admin</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })()}
          {showBroadcastDm && (() => {
            const followingSet = new Set(followingUserIds);
            const buddyList = (Array.isArray(buddyUsers) ? buddyUsers : []).filter((u) => followingSet.has(u.id));
            const canSend = !broadcastSending && broadcastSelectedIds.length > 0 && !!broadcastMessage.trim();
            return (
              <View style={{ position: 'absolute', top: 88, left: 0, right: 0, bottom: 0, backgroundColor: theme.bg, zIndex: 300, flex: 1 }}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', gap: 10 }}>
                  <Pressable onPress={() => { setShowBroadcastDm(false); setBroadcastMessage(''); }} hitSlop={10} style={{ padding: 4 }}>
                    <Ionicons name="chevron-back" size={22} color={theme.text} />
                  </Pressable>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="megaphone-outline" size={16} color={theme.text} />
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>Broadcast</Text>
                  </View>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>{broadcastSelectedIds.length} {broadcastSelectedIds.length === 1 ? 'buddy' : 'buddies'}</Text>
                </View>
                {/* Input + Send */}
                <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, backgroundColor: theme.bg, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingLeft: 14, paddingRight: 5, paddingVertical: 5 }}>
                    <TextInput
                      value={broadcastMessage}
                      onChangeText={setBroadcastMessage}
                      placeholder="Type a message…"
                      placeholderTextColor={theme.textMuted}
                      multiline
                      style={{ flex: 1, color: theme.text, paddingVertical: 7, paddingRight: 6, fontSize: 15 }}
                    />
                    <Pressable onPress={() => void sendBroadcastDm()} disabled={!canSend} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: canSend ? theme.primary : 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', opacity: canSend ? 1 : 0.4 }}>
                      <Ionicons name="arrow-up" size={17} color="#ffffff" />
                    </Pressable>
                  </View>
                  {broadcastSelectedIds.length > 0 ? (
                    <Pressable onPress={() => setBroadcastSelectedIds([])} style={{ alignSelf: 'flex-start', marginTop: 8, backgroundColor: '#123868', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderColor: theme.primary }}>
                      <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Deselect all</Text>
                    </Pressable>
                  ) : null}
                </View>
                {/* Buddy list */}
                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                  {buddyList.map((u) => {
                    const selected = broadcastSelectedIds.includes(u.id);
                    return (
                      <Pressable key={u.id} onPress={() => setBroadcastSelectedIds((prev) => selected ? prev.filter((id) => id !== u.id) : [...prev, u.id])} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                        <Avatar uri={u.avatar_url ?? null} size={50} skillLevel={u.skill_level} name={u.display_name} />
                        <Text style={{ flex: 1, color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{u.display_name}</Text>
                        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? theme.primary : 'rgba(255,255,255,0.2)', backgroundColor: selected ? theme.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {selected && <Ionicons name="checkmark" size={13} color={theme.bg} />}
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })()}
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
    const getBuddySession = (userId: string) => {
      for (const [spotName, sessions] of Object.entries(daySessionsBySpot)) {
        for (const s of sessions) {
          if (s.userId !== userId) continue;
          const st = getCleanSessionStatus(s);
          if (st === 'live' || st === 'going' || st === 'maybe') {
            return { type: st, spot: spotName, start: s.start, end: s.end };
          }
        }
      }
      return null;
    };

    const statusRank = (type: string | undefined) => type === 'live' ? 0 : type === 'going' ? 1 : type === 'maybe' ? 2 : 3;

    const filteredBuddies = (normalizedBuddySearch
      ? followedUsers.filter((u) => normalizeSearch(u.display_name).includes(normalizedBuddySearch))
      : followedUsers
    ).slice().sort((a, b) => statusRank(getBuddySession(a.id)?.type) - statusRank(getBuddySession(b.id)?.type));

    const UserRow = ({ avatar, name, sub, right, onAvatarPress, skillLevel }: { avatar: string | null; name: string; sub?: string; right: React.ReactNode; onAvatarPress?: () => void; skillLevel?: number | null }) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 12 }}>
        {onAvatarPress ? <Pressable onPress={onAvatarPress}><Avatar uri={avatar} size={42} skillLevel={skillLevel} name={name} /></Pressable> : <Avatar uri={avatar} size={42} skillLevel={skillLevel} name={name} />}
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
                <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', padding: 14, marginBottom: 16 }}>
                  <Text style={{ color: '#4DB8FF', fontSize: 12, fontWeight: '900', marginBottom: 8, letterSpacing: 0.4 }}>
                    Wants to buddy up · {incomingFollowRequests.length}
                  </Text>
                  {incomingFollowRequests.map((req) => (
                    <UserRow
                      key={`mybuddies-req-${req.id}`}
                      avatar={req.requester?.avatar_url ?? null}
                      name={req.requester?.display_name ?? 'Someone'}
                      sub="accept or decline"
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
                  {filteredBuddies.map((u) => {
                    const bs = getBuddySession(u.id);
                    const spotShort = bs ? (bs.spot.length > 18 ? bs.spot.slice(0, 17) + '…' : bs.spot) : null;
                    const bsSub = bs
                      ? bs.type === 'live'
                        ? `⚡ Live · ${spotShort}`
                        : bs.type === 'going'
                        ? `● Going · ${spotShort} · ${bs.start}–${bs.end}`
                        : `○ Maybe · ${spotShort} · ${bs.start}–${bs.end}`
                      : undefined;
                    return (
                    <UserRow
                      key={`buddy-list-${u.id}`}
                      avatar={u.avatar_url}
                      name={u.display_name}
                      sub={bsSub}
                      skillLevel={u.skill_level}
                      onAvatarPress={() => { setViewingOtherProfile({ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url ?? null }); setViewingOtherUserId(u.id); }}
                      right={
                        <Pressable
                          onPress={async () => {
                            const convId = await openDmWithUser(u.id);
                            if (!convId) return;
                            void loadDmMessages(convId);
                            void loadDmConversations();
                            setShowBuddies(false);
                            setChatSubTab('dm');
                            setExpandedDmId(convId);
                            setShowChat(true);
                          }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, opacity: buddyActionUserId === u.id ? 0.4 : 1, paddingVertical: 6, paddingHorizontal: 4 }}
                        >
                          <Ionicons name="chatbubble" size={13} color="#ffffff" />
                          <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>Chat</Text>
                        </Pressable>
                      }
                    />
                  );})}
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
                <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', padding: 14, marginBottom: 16 }}>
                  <Text style={{ color: '#4DB8FF', fontSize: 12, fontWeight: '900', marginBottom: 8, letterSpacing: 0.4 }}>
                    Wants to buddy up · {incomingFollowRequests.length}
                  </Text>
                  {incomingFollowRequests.map((req) => (
                    <UserRow
                      key={`req-${req.id}`}
                      avatar={req.requester?.avatar_url ?? null}
                      name={req.requester?.display_name ?? 'Someone'}
                      sub="accept or decline"
                      onAvatarPress={() => { if (!req.requester?.id) return; setViewingOtherProfile({ id: req.requester.id, display_name: req.requester.display_name ?? 'Someone', avatar_url: req.requester.avatar_url ?? null }); setViewingOtherUserId(req.requester.id); }}
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
                        onAvatarPress={() => { setViewingOtherProfile({ id: u.id, display_name: u.display_name, avatar_url: u.avatar_url ?? null }); setViewingOtherUserId(u.id); }}
                        right={
                          <Pressable
                            onPress={() => !isPending && !inFlight && void handleFollowUser(u.id)}
                            disabled={isPending || inFlight}
                            style={{
                              backgroundColor: isPending ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.10)',
                              borderRadius: 999,
                              paddingHorizontal: 14,
                              paddingVertical: 7,
                              borderWidth: 1,
                              borderColor: isPending ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.18)',
                              opacity: inFlight ? 0.5 : 1,
                            }}
                          >
                            <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '800' }}>
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
      {renderOtherUserProfileModal()}
      </SafeAreaView>
    );
  }

  if (showProfile && showPrivacyPolicy) {
    const privacySections = [
      {
        title: 'What we collect',
        body: '• Account info: email address (via Supabase Auth)\n• Profile info: display name, profile photo, nationality, skill level\n• Session data: check-ins, planned sessions, spot ratings\n• Location: only when you use Check in or Suggest a spot — never stored continuously\n• Messages: direct messages and group chats within the app\n• Push notification token: to send you activity alerts',
      },
      {
        title: 'How we use it',
        body: 'Your data is used solely to operate SpotBuddy:\n• Show who is at a spot and when\n• Enable session planning and buddy connections\n• Send push notifications for buddy activity\n• Display your profile to other riders\n\nWe do not sell your data. We do not use it for advertising.',
      },
      {
        title: 'Who can see your data',
        body: '• Other SpotBuddy users can see your display name, profile photo, nationality, skill level, and sessions.\n• Direct messages are only visible to you and the recipient.\n• Your email address is never shown to other users.',
      },
      {
        title: 'Data storage',
        body: 'Your data is stored on Supabase (supabase.com), hosted in the EU. Supabase is GDPR-compliant. Wind data is fetched from Open-Meteo (open-meteo.com) and not stored per user.',
      },
      {
        title: 'Your rights (GDPR)',
        body: 'You have the right to:\n• Access your personal data\n• Correct inaccurate data (via your profile)\n• Delete your account and all associated data (via Profile → Delete account)\n• Object to processing\n• Lodge a complaint with the Dutch DPA (Autoriteit Persoonsgegevens)\n\nTo exercise any right, contact us at ' + CONTACT_EMAIL,
      },
      {
        title: 'Data retention',
        body: 'Your data is kept for as long as your account is active. When you delete your account, all personal data is permanently removed from our systems within 30 days.',
      },
      {
        title: 'Contact',
        body: 'SpotBuddy is operated by an individual developer based in the Netherlands.\n\nEmail: ' + CONTACT_EMAIL + '\n\nLast updated: May 2026',
      },
    ];

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
          <Pressable onPress={() => setShowPrivacyPolicy(false)} hitSlop={12} style={{ marginRight: 12 }}>
            <Ionicons name="arrow-back" size={22} color={theme.text} />
          </Pressable>
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800', flex: 1 }}>Privacy Policy</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }} showsVerticalScrollIndicator={false}>
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900', marginBottom: 4 }}>Privacy Policy</Text>
          <Text style={{ color: theme.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 8 }}>SpotBuddy respects your privacy. Here is what data we collect and how we use it.</Text>
          {privacySections.map((section) => (
            <View key={section.title} style={{ backgroundColor: theme.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800', marginBottom: 8 }}>{section.title}</Text>
              <Text style={{ color: theme.textMuted, fontSize: 14, lineHeight: 22 }}>{section.body}</Text>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (showProfile && showGuide) {
    const guidesections = [
      {
        title: 'Home screen',
        body: 'Shows your spots and what\'s happening today.\n\n• Nearest spot — your closest kite spot with live wind and rider count. A Check in button appears when you\'re within 500m.\n• My Spots — your saved spots with wind, rider count, and quick check-in.\n• Planned session — if you have a session today it shows here.\n\nSwitch between Today and Tomorrow at the top.',
      },
      {
        title: 'Spot page',
        body: '• Check in — marks you as live. Needs to be within 500m of the spot.\n• Plan a session — set a time window so others can see you\'re going.\n• Timeline — shows all sessions for the day. Tap a bar to see details or join.\n• Join — you can join a session if you\'re a buddy of someone in the group.\n• Rate the spot — share wind speed, direction, water conditions, and crowd level.\n• Check out — marks your session as finished.',
      },
      {
        title: 'Discover',
        body: 'The map shows all spots as coloured dots — brighter means more activity.\n\n• Search a spot name. Use Show on map to fly to it, or Open → for the spot page.\n• Suggest a spot — stand at a new spot, tap Suggest a spot, enter a name and submit. It\'s reviewed before going live.',
      },
      {
        title: 'Buddies',
        body: 'Follow someone to send a buddy request. Once they follow back you\'re buddies.\n\nBuddy benefits: see each other\'s sessions and join each other\'s groups.\n\nTap any avatar on a session or spot page to view a profile, send a direct message, or send a buddy request.',
      },
      {
        title: 'Chat',
        body: '• Direct messages — tap a buddy\'s avatar anywhere to open a chat.\n• Group chat — when multiple riders are in the same session, a Group Chat button appears.\n• Broadcast — send a message to all your buddies at once from the chat screen.',
      },
      {
        title: 'Notifications',
        body: 'You get notified when:\n• A buddy checks in at one of your spots\n• Someone joins your session\n• A buddy request or acceptance\n• A direct message\n• A broadcast from a buddy\n\nToggle DM notifications in your profile settings.',
      },
      {
        title: 'Profile',
        body: '• Display name — visible to all riders.\n• Profile photo — tap to change.\n• Nationality — shown as a flag on your avatar.\n• Skill level — 1 (beginner) to 5 (pro), shown as dots on your avatar.\n• DM notifications — toggle push notifications for direct messages.',
      },
      {
        title: 'Tips',
        body: '• Add regular spots to My Spots from the spot page.\n• Wind data is live from Open-Meteo and updates automatically.\n• Session bar colours: green = live, blue = going, grey = maybe.\n• If you arrive earlier than planned, just check in — the bar adjusts.',
      },
    ];

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
          <Pressable onPress={() => setShowGuide(false)} hitSlop={12} style={{ marginRight: 12 }}>
            <Ionicons name="arrow-back" size={22} color={theme.text} />
          </Pressable>
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800', flex: 1 }}>How it works</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }} showsVerticalScrollIndicator={false}>
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900', marginBottom: 4 }}>SpotBuddy Guide</Text>
          <Text style={{ color: theme.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 8 }}>SpotBuddy helps kitesurfers find out who's at the water, plan sessions, and connect with their kite crew.</Text>
          {guidesections.map((section) => (
            <View key={section.title} style={{ backgroundColor: theme.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800', marginBottom: 8 }}>{section.title}</Text>
              <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 20 }}>{section.body}</Text>
            </View>
          ))}
          <View style={{ height: 20 }} />
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
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, paddingTop: isWebPlatform ? 20 : 0 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingVertical: 14, paddingHorizontal: 20 }}>
          <Pressable
            onPress={goBack}
            style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Back home</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48, alignItems: isWebPlatform ? 'center' : undefined }}>
        <View style={{ width: '100%', maxWidth: isWebPlatform ? 480 : undefined }}>

        {/* Avatar + naam */}
        <View style={{ alignItems: 'center', marginVertical: 20 }}>
          <Avatar uri={profile.avatar_url} size={90} nationality={profile.nationality} />
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900', marginTop: 14, textAlign: 'center' }}>
            {profile.display_name}
          </Text>

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
              borderColor: showNationalityPicker ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.10)',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '700' }}>Nationality</Text>
            {(() => { const c = getCountry(profile.nationality); return c ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Flag code={c.code} size={14} /><Text style={{ color: theme.text, fontSize: 14 }}>{c.name}</Text></View>
            ) : <Text style={{ color: theme.text, fontSize: 14 }}>Not set</Text>; })()}
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
                        backgroundColor: isSelected ? 'rgba(255,255,255,0.10)' : 'transparent',
                        borderBottomWidth: 1,
                        borderBottomColor: 'rgba(255,255,255,0.05)',
                        gap: 12,
                      }}
                    >
                      <Flag code={country.code} size={20} />
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
            <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 10 }}>Rate your skills</Text>
            {([
              { level: 1, name: 'Beginner', sub: 'I still need instruction and support.' },
              { level: 2, name: 'Novice', sub: "I can do the basics, but I'm still inconsistent." },
              { level: 3, name: 'Intermediate', sub: 'I ride independently in normal conditions.' },
              { level: 4, name: 'Advanced', sub: 'I have strong control in challenging conditions.' },
              { level: 5, name: 'Expert / Pro', sub: 'I have elite skill, precision, and consistency.' },
            ] as const).map(({ level, name, sub }) => {
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
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 7,
                    paddingHorizontal: 10,
                    borderRadius: 9,
                    marginBottom: 4,
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.09)' : 'transparent',
                    borderWidth: 1,
                    borderColor: isSelected ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
                  }}
                >
                  <View style={{ width: 15, height: 15, borderRadius: 8, borderWidth: 2, borderColor: isSelected ? theme.text : 'rgba(255,255,255,0.25)', backgroundColor: isSelected ? theme.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {isSelected ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.bg }} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: isSelected ? theme.text : theme.textSoft, fontSize: 13, fontWeight: '800' }}>{name} <Text style={{ color: '#FFD166', fontWeight: '400' }}>{'★'.repeat(level)}</Text></Text>
                    <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 1 }}>{sub}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {profileEditError ? <Text style={{ color: '#ff7e7e', fontSize: 12, textAlign: 'center' }}>{profileEditError}</Text> : null}

          {isAccountSwitcherVisible ? (
            <View style={{ marginTop: 24, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 14 }}>
              <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 10 }}>
                Pending spot suggestions {pendingSpots.length > 0 ? `(${pendingSpots.length})` : ''}
              </Text>
              {!pendingSpotsLoaded ? (
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>Loading…</Text>
              ) : pendingSpots.length === 0 ? (
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>No pending suggestions.</Text>
              ) : pendingSpots.map((ps) => (
                <View key={ps.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800', marginBottom: 2 }}>{ps.name}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 2 }}>By: <Text style={{ color: '#4DB8FF' }}>{ps.submitterName}</Text></Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>{ps.latitude.toFixed(6)}, {ps.longitude.toFixed(6)}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <Pressable
                      onPress={() => {
                        setDiscoverMapCenter({ latitude: ps.latitude, longitude: ps.longitude, pendingName: ps.name });
                        setShowProfile(false);
                        setShowDiscoverSpotsPage(true);
                      }}
                      style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}
                    >
                      <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>View on map</Text>
                    </Pressable>
                    <Pressable
                      onPress={async () => {
                        await supabase.from('spots').insert({ name: ps.name, latitude: ps.latitude, longitude: ps.longitude, coordinate_status: 'verified' });
                        await supabase.from('pending_spots').delete().eq('id', ps.id);
                        setPendingSpots((prev) => prev.filter((s) => s.id !== ps.id));
                      }}
                      style={{ backgroundColor: '#00C896', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 }}
                    >
                      <Text style={{ color: '#061421', fontSize: 13, fontWeight: '800' }}>Approve</Text>
                    </Pressable>
                    <Pressable
                      onPress={async () => {
                        await supabase.from('pending_spots').delete().eq('id', ps.id);
                        setPendingSpots((prev) => prev.filter((s) => s.id !== ps.id));
                      }}
                      style={{ backgroundColor: '#8b1f38', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 }}
                    >
                      <Text style={{ color: '#ffd7de', fontSize: 13, fontWeight: '800' }}>Reject</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {isAccountSwitcherVisible ? (
            <View style={{ marginTop: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 14 }}>
              <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 10 }}>
                Coordinate suggestions {coordSuggestions.length > 0 ? `(${coordSuggestions.length})` : ''}
              </Text>
              {!coordSuggestionsLoaded ? (
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>Loading…</Text>
              ) : coordSuggestions.length === 0 ? (
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>No coordinate suggestions.</Text>
              ) : coordSuggestions.map((cs) => (
                <View key={cs.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800', marginBottom: 2 }}>{cs.spotName}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 2 }}>By: <Text style={{ color: '#4DB8FF' }}>{cs.submitterName}</Text></Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 2 }}>Current: {cs.currentLat?.toFixed(5)}, {cs.currentLng?.toFixed(5)}</Text>
                  <Text style={{ color: '#4DB8FF', fontSize: 12, marginBottom: 10 }}>Suggested: {cs.suggestedLat?.toFixed(5)}, {cs.suggestedLng?.toFixed(5)}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <Pressable
                      onPress={async () => {
                        await supabase.from('spots').update({ latitude: cs.suggestedLat, longitude: cs.suggestedLng }).eq('name', cs.spotName);
                        await supabase.from('spot_coordinate_suggestions').delete().eq('id', cs.id);
                        setCoordSuggestions((prev) => prev.filter((s) => s.id !== cs.id));
                      }}
                      style={{ backgroundColor: '#00C896', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 }}
                    >
                      <Text style={{ color: '#061421', fontSize: 13, fontWeight: '800' }}>Approve</Text>
                    </Pressable>
                    <Pressable
                      onPress={async () => {
                        await supabase.from('spot_coordinate_suggestions').delete().eq('id', cs.id);
                        setCoordSuggestions((prev) => prev.filter((s) => s.id !== cs.id));
                      }}
                      style={{ backgroundColor: '#8b1f38', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 }}
                    >
                      <Text style={{ color: '#ffd7de', fontSize: 13, fontWeight: '800' }}>Reject</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <Pressable
            onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=SpotBuddy feedback`)}
            style={{ marginTop: 2, borderRadius: 14, padding: 14, alignItems: 'center' }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: '600' }}>Contact · {CONTACT_EMAIL}</Text>
          </Pressable>

          <Pressable
            onPress={() => setShowGuide(true)}
            style={{ borderRadius: 14, padding: 14, alignItems: 'center' }}
          >
            <Text style={{ color: theme.textMuted, fontSize: 14, fontWeight: '600' }}>How it works</Text>
          </Pressable>

          <Pressable
            onPress={() => setShowPrivacyPolicy(true)}
            style={{ borderRadius: 14, padding: 14, alignItems: 'center' }}
          >
            <Text style={{ color: theme.textMuted, fontSize: 14, fontWeight: '600' }}>Privacy Policy</Text>
          </Pressable>

          <Pressable
            onPress={() => { resetFlow(); void supabase.auth.signOut(); }}
            style={{ borderRadius: 14, padding: 14, alignItems: 'center' }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, fontWeight: '600' }}>Log out</Text>
          </Pressable>

          <Pressable
            onPress={() => setShowDeleteConfirm(true)}
            style={{ borderRadius: 14, padding: 14, alignItems: 'center' }}
          >
            <Text style={{ color: '#FF4444', fontSize: 13, fontWeight: '600' }}>Delete account</Text>
          </Pressable>

          {showDeleteConfirm && (
            <View style={{ backgroundColor: '#1a0a0a', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#FF4444', marginTop: 8, gap: 12 }}>
              <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '800', textAlign: 'center' }}>Delete your account?</Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 20, textAlign: 'center' }}>
                This permanently deletes your profile, sessions, ratings, messages, and buddy connections. This cannot be undone.
              </Text>
              <Pressable
                onPress={() => void handleDeleteAccount()}
                disabled={isDeletingAccount}
                style={{ backgroundColor: '#FF4444', borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}
              >
                <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '900' }}>
                  {isDeletingAccount ? 'Deleting...' : 'Yes, delete everything'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowDeleteConfirm(false)}
                style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
            </View>
          )}
        </View>

        </View>
        </ScrollView>
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
        supabase.rpc('create_chat_notification', {
          actor_profile_id: groupSenderId,
          spot_name_param: selectedSpot,
          session_day_param: selectedDayKey,
          message_preview_param: messageText,
        }).then(({ data: recipients, error: rpcError }) => {
          if (rpcError) console.error('GROUP_CHAT_PUSH_ERROR', rpcError);
          const ids = (recipients ?? []).map((r: { recipient_profile_id: string }) => r.recipient_profile_id).filter(Boolean);
          const actorName = activeProfile?.display_name?.trim() || 'Someone';
          if (ids.length) sendPushToRecipients(ids, `${actorName} in group chat`, messageText, { type: 'chat_message', subType: 'group', spotName: selectedSpot, groupKey: activeGroupChatKey, sessionDay: selectedDayKey });
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
          const ids = (recipients ?? []).map((r: { recipient_profile_id: string }) => r.recipient_profile_id).filter(Boolean);
          if (ids.length) sendPushToRecipients(ids, `New message at ${selectedSpot}`, messageText, { type: 'chat_message', spotName: selectedSpot });
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

        setSessionActionError('');
        setSelectedTimelineSessionId(null);
        await fetchSharedData({ skipLoadingState: true });
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
        if (resultReason === 'WRITE_FAILED' || resultReason === 'UNKNOWN_ERROR') {
          setSaveError({
            message: persistenceError?.message,
            details: persistenceError?.details,
            hint: persistenceError?.hint,
            code: persistenceError?.code,
            response: { ...result, reason: mappedReason },
          });
        } else {
          setSaveError(null);
        }
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
          if (ids.length) sendPushToRecipients(ids, `${actorName} planned a session`, `${actorName} is going to ${selectedSpot}`, { type: 'session_planned', spotName: selectedSpot, actorName, activeDay });
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Pressable onPress={() => setSelectedSpot(null)}>
            <Text style={{ color: theme.textSoft, fontSize: 15, letterSpacing: 0.2 }}>← Back to spots</Text>
          </Pressable>
          {isWebPlatform ? (
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
                <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: theme.bg, fontSize: 10, fontWeight: '900' }}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
        </View>

        {isWebPlatform && isNotificationInboxExpanded ? (
          <View style={{ backgroundColor: theme.bgElevated ?? '#0f2035', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 14, marginBottom: 14, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 }}>Activity</Text>
              <Pressable onPress={() => setIsNotificationInboxExpanded(false)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="close" size={16} color={theme.textMuted} />
              </Pressable>
            </View>
            {notificationRows.length === 0 ? (
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>No recent activity</Text>
            ) : (
              notificationRows.slice(0, 8).map((row) => {
                const summaryText = getNotificationInboxSummary(row);
                if (!summaryText) return null;
                const timeAgo = row.created_at ? (() => {
                  const diff = Date.now() - new Date(row.created_at).getTime();
                  const mins = Math.floor(diff / 60000);
                  if (mins < 60) return `${mins}m ago`;
                  const hrs = Math.floor(mins / 60);
                  if (hrs < 24) return `${hrs}h ago`;
                  return `${Math.floor(hrs / 24)}d ago`;
                })() : '';
                return (
                  <Pressable key={row.id} onPress={() => setIsNotificationInboxExpanded(false)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={row.read ? 'notifications-outline' : 'notifications'} size={16} color={row.read ? theme.textMuted : theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: row.read ? theme.textSoft : theme.text, fontSize: 13, fontWeight: row.read ? '400' : '700' }} numberOfLines={2}>{summaryText}</Text>
                      <Text style={{ color: theme.textMuted, fontSize: 11 }}>{timeAgo}</Text>
                    </View>
                    {!row.read && <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: theme.primary }} />}
                  </Pressable>
                );
              })
            )}
          </View>
        ) : null}

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
              {liveCount > 0 ? (
                <Text style={{ color: '#5EF0D0', fontSize: 13, fontWeight: '800', marginTop: 5 }}>Live now</Text>
              ) : null}
              {activeDay === 'today' && selectedSpot && spotRatingsMap[selectedSpot] ? (() => {
                const r = spotRatingsMap[selectedSpot];
                const crowdLabel = r.crowdRating != null ? (['','Empty','Quiet','Busy','Packed','Hectic'][r.crowdRating] ?? null) : null;
                const condParts: { emoji: string; label: string }[] = [];
                if (r.windKnots != null) condParts.push({ emoji: '💨', label: `${r.windKnots} kn` });
                if (r.windDirection) condParts.push({ emoji: '↗', label: r.windDirection });
                if (r.waterConditions) condParts.push({ emoji: '🌊', label: r.waterConditions });
                if (crowdLabel) condParts.push({ emoji: '👥', label: crowdLabel });
                if (condParts.length === 0 && !r.ratedAt) return null;
                return (
                  <View style={{ marginTop: 8, gap: 3 }}>
                    {r.ratedAt ? (
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '700' }}>Rated at {formatToHourMinute(r.ratedAt)}</Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 0 }}>
                      {condParts.map((part, i) => (
                        <View key={part.label} style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {i > 0 && <View style={{ width: 1, height: 11, backgroundColor: 'rgba(255,255,255,0.18)', marginHorizontal: 8 }} />}
                          <Text style={{ fontSize: 11, color: '#ffffff' }}>{part.emoji}</Text>
                          <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700', marginLeft: 3 }}>{part.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })() : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 8 }}>
              <Pressable
                onPress={() => setIsNotificationPanelExpanded((prev) => !prev)}
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
              {activeDay === 'today' && (() => {
                const wind = windBySpot[selectedSpot];
                if (!wind) return null;
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
                    <Text style={{ color: '#ffffff', fontSize: 26, fontWeight: '900' }}>{wind.speed}</Text>
                    <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '600' }}>kn</Text>
                    {wind.gusts > wind.speed + 3 ? (
                      <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '400' }}>- gusts: {wind.gusts} kn</Text>
                    ) : null}
                    <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>{degreesToCompass(wind.direction)}</Text>
                  </View>
                );
              })()}
            </View>
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
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>Notifications are off by default. Turn them on <Text style={{ color: '#E06060', fontWeight: '700' }}>per spot</Text> below.</Text>
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
                              backgroundColor: selected ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                              borderWidth: 1,
                              borderColor: selected ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)',
                            }}
                          >
                            <Text style={{ color: selected ? theme.textSoft : theme.textMuted, fontSize: 11, fontWeight: '700' }}>
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
              ...(activeDay === 'today' ? [{ icon: '⚡', label: 'LIVE' as const, helper: 'Checked in', value: liveCount, color: '#5EF0D0', sessions: liveSessions, onPress: () => liveCount > 0 ? setSummaryPopup({ label: 'LIVE', color: '#5EF0D0', helper: 'Checked in', sessions: liveSessions }) : undefined }] : []),
              { icon: '👥', label: 'GOING' as const, helper: 'Definitely coming', value: goingCount, color: '#4DB8FF', sessions: goingSessions, onPress: () => goingCount > 0 ? setSummaryPopup({ label: 'GOING', color: '#4DB8FF', helper: 'Definitely coming', sessions: goingSessions }) : undefined },
              { icon: '◌', label: 'MAYBE' as const, helper: 'Might come', value: maybeCount, color: '#5F83A6', sessions: maybeSessions, onPress: () => maybeCount > 0 ? setSummaryPopup({ label: 'MAYBE', color: '#5F83A6', helper: 'Might come', sessions: maybeSessions }) : undefined },
            ]}
          />
        ) : (
          <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12, marginBottom: 14 }}>
            {[
              ...(activeDay === 'today' ? [{ label: 'LIVE', helper: 'Checked in', value: liveCount, color: '#5EF0D0', sessions: liveSessions }] : []),
              { label: 'GOING', helper: 'Definitely coming', value: goingCount, color: '#4DB8FF', sessions: goingSessions },
              { label: 'MAYBE', helper: 'Might come', value: maybeCount, color: '#5F83A6', sessions: maybeSessions },
            ].map((metric) => (
              <Pressable
                key={`mobile-summary-${metric.label}`}
                onPress={() => metric.value > 0 ? setSummaryPopup({ label: metric.label, color: metric.color, helper: metric.helper, sessions: metric.sessions }) : null}
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
              </Pressable>
            ))}
          </View>

          </>
        )}


<View style={{ marginTop: isWebPlatform ? 10 : 6, marginBottom: isWebPlatform ? 18 : 14, gap: 10 }}>

          {/* Check in + Plan session + Spot Chat — altijd zichtbaar */}
          {sessionActionError ? <Text style={{ color: '#ff7e7e', fontSize: 13, marginBottom: 6 }}>{sessionActionError}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {checkInCtaVisible ? (
              <Pressable
                onPress={() => void handleUpdateSessionStatus('Is er al')}
                style={[{ borderRadius: 999, backgroundColor: '#123868', alignItems: 'center', justifyContent: 'center', borderColor: theme.primary }, planSessionBtnSize ?? { paddingVertical: 7, paddingHorizontal: 16 }]}
              >
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>Check in</Text>
              </Pressable>
            ) : null}
            {topCtaMode === 'plan' && !showForm ? (
              <>
                <Pressable
                  onLayout={(e) => setPlanSessionBtnSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
                  onPress={() => { if (!hasOwnSessionOnSelectedSpotDay) openEmptyPlanningForm(); }}
                  style={{ borderRadius: 999, backgroundColor: '#ffffff', paddingVertical: 7, paddingHorizontal: 16, alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center' }}
                >
                  <Ionicons name="add-circle" size={16} color="#071421" />
                  <Text style={{ color: '#071421', fontSize: 12, fontWeight: '800' }}>Plan a session</Text>
                </Pressable>
                <Pressable
                  onPress={() => { if (selectedSpot) { setActiveChatSpot(selectedSpot); setActiveChatDayKey(selectedDayKey); setShowChat(true); setChatSubTab('spot'); setSelectedSpot(null); } }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 4 }}
                >
                  <Ionicons name="chatbubble" size={13} color="#ffffff" />
                  <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>Spot Chat</Text>
                </Pressable>
              </>
            ) : null}
          </View>

          {/* Edit mode: checked in or session planned */}
          {topCtaMode === 'edit' ? (
            <View style={{ gap: 10 }}>
              {canCheckOut ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: '#5EF0D0' }} />
                    <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: '600' }}>Live</Text>
                    {activeCheckedInSession?.checkedInAt ? (
                      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '400' }}>
                        since {formatToHourMinute(activeCheckedInSession.checkedInAt)}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => void handleUpdateSessionStatus('Uitchecken')}
                    style={{ backgroundColor: '#8b1f38', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}
                  >
                    <Text style={{ color: '#ffd7de', fontSize: 12, fontWeight: '900' }}>Check out</Text>
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
                      backgroundColor: 'rgba(255,255,255,0.045)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.06)',
                      borderRadius: 999,
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      opacity: joinedSession && canCancelJoinedSession ? 1 : 0.35,
                    }}
                  >
                    <Text style={{ color: '#ff6b6b', fontSize: 12, fontWeight: '400' }}>× Cancel</Text>
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
                <Pressable
                  onPress={() => { if (selectedSpot) { setActiveChatSpot(selectedSpot); setActiveChatDayKey(selectedDayKey); setShowChat(true); setChatSubTab('spot'); setSelectedSpot(null); } }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 4 }}
                >
                  <Ionicons name="chatbubble" size={13} color="#ffffff" />
                  <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>Spot Chat</Text>
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
                          backgroundColor: 'transparent',
                          borderWidth: 0,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: '#ff6b6b', fontSize: 13, fontWeight: '700' }}>Cancel</Text>
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
          {showForm ? (
            <View
              style={{
                marginTop: 8,
                maxWidth: 640,
                alignSelf: 'flex-start',
                backgroundColor: 'rgba(8,24,39,0.52)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.06)',
                borderRadius: 18,
                padding: 14,
                gap: 12,
              }}
            >
              {isWebPlatform ? (
                /* Web: grid pickers */
                (<>
                  <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 }}>Start time</Text>
                  <View style={{ flexDirection: 'row', gap: 8, width: 420, maxWidth: '100%' }}>
                    <Pressable onPress={() => { setActivePicker((prev) => (prev === 'startHour' ? null : 'startHour')); setFormError(''); }} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 14, borderWidth: 1, borderColor: activePicker === 'startHour' ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 9 }}>
                      <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 }}>Hour</Text>
                      <Text style={{ color: startHour === null ? theme.textMuted : theme.text, fontSize: 20, fontWeight: '700' }}>{startHour === null ? '--' : formatTimePart(startHour)}</Text>
                    </Pressable>
                    <Pressable onPress={() => { setActivePicker((prev) => (prev === 'startMinute' ? null : 'startMinute')); setFormError(''); }} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 14, borderWidth: 1, borderColor: activePicker === 'startMinute' ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 9 }}>
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
                    <Pressable onPress={() => { setActivePicker((prev) => (prev === 'endHour' ? null : 'endHour')); setFormError(''); }} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 14, borderWidth: 1, borderColor: activePicker === 'endHour' ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 9 }}>
                      <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 }}>Hour</Text>
                      <Text style={{ color: endHour === null ? theme.textMuted : theme.text, fontSize: 20, fontWeight: '700' }}>{endHour === null ? '--' : formatTimePart(endHour)}</Text>
                    </Pressable>
                    <Pressable onPress={() => { setActivePicker((prev) => (prev === 'endMinute' ? null : 'endMinute')); setFormError(''); }} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 14, borderWidth: 1, borderColor: activePicker === 'endMinute' ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 9 }}>
                      <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 }}>Minute</Text>
                      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>{formatTimePart(endMinute)}</Text>
                    </Pressable>
                  </View>
                  {activePicker === 'endHour' && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                      {(Array.isArray(hours) ? hours : []).filter((h) => h >= 7 && h <= 22).map((h) => (
                        <Pressable key={`eh-${h}`} onPress={() => setEndHour(h)} style={{ backgroundColor: endHour === h ? theme.primary : theme.bgElevated, borderColor: theme.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, marginRight: 6, marginBottom: 6 }}>
                          <Text style={{ color: theme.text }}>{formatTimePart(h)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {activePicker === 'endMinute' && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                      {(endHour === 22 ? [0] : minuteOptions).map((m) => (
                        <Pressable key={`em-${m}`} onPress={() => setEndMinute(m)} style={{ backgroundColor: endMinute === m ? theme.primary : theme.bgElevated, borderColor: theme.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, marginRight: 6, marginBottom: 6 }}>
                          <Text style={{ color: theme.text }}>{formatTimePart(m)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </>)
              ) : (
                <View>
                  {/* Single unified wheel container */}
                  <View style={{ height: WHEEL_ITEM_H * 3, position: 'relative', overflow: 'hidden', borderRadius: 14 }}>
                    {/* One selection highlight across all columns */}
                    <View pointerEvents="none" style={{ position: 'absolute', top: WHEEL_ITEM_H, left: 0, right: 0, height: WHEEL_ITEM_H, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.13)', zIndex: 1 }} />
                    {/* Top fade with Van/Tot labels */}
                    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: WHEEL_ITEM_H, backgroundColor: WHEEL_BG, opacity: 0.75, zIndex: 2 }} />
                    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: WHEEL_ITEM_H, zIndex: 3, flexDirection: 'row', alignItems: 'center', paddingTop: 8 }}>
                      <View style={{ flex: 2, alignItems: 'center' }}><Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>Van</Text></View>
                      <View style={{ width: 30 }} />
                      <View style={{ flex: 2, alignItems: 'center' }}><Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>Tot</Text></View>
                    </View>
                    {/* Bottom fade */}
                    <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: WHEEL_ITEM_H, backgroundColor: WHEEL_BG, opacity: 0.75, zIndex: 2 }} />

                    {/* All columns in one row */}
                    <View style={{ flexDirection: 'row', height: '100%', alignItems: 'center' }}>
                      <WheelColumn values={startHourOptions} selected={startHour} onSelect={(h) => { setStartHour(h); if (planningNowReference.isToday) { const earliest = minuteOptions.find((m) => (h * 60) + m >= planningNowReference.earliestStartMinutes); if (earliest !== undefined && startMinute < earliest) setStartMinute(earliest); } }} formatVal={formatTimePart} />
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 24, fontWeight: '300', paddingBottom: 4 }}>:</Text>
                      <WheelColumn values={minuteOptions} selected={startMinute} onSelect={setStartMinute} formatVal={formatTimePart} />
                      <Text style={{ color: 'rgba(255,255,255,0.2)', fontSize: 18, fontWeight: '300', paddingHorizontal: 6, paddingBottom: 2 }}>–</Text>
                      <WheelColumn values={(Array.isArray(hours) ? hours : []).filter((h) => h >= 7 && h <= 22)} selected={endHour} onSelect={(h) => { setEndHour(h); if (h === 22) setEndMinute(0); }} formatVal={formatTimePart} />
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 24, fontWeight: '300', paddingBottom: 4 }}>:</Text>
                      <WheelColumn values={endHour === 22 ? [0] : minuteOptions} selected={endMinute} onSelect={(m) => setEndMinute(endHour === 22 ? 0 : m)} formatVal={formatTimePart} />
                    </View>
                  </View>
                </View>
              )}
              <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 }}>
                Intent
              </Text>
              <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 999, padding: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', alignSelf: 'flex-start' }}>
                {sessionIntentOptions.map((option) => {
                  const isActive = intent === option.value;
                  return (
                    <Pressable
                      key={`intent-${option.value}`}
                      onPress={() => setIntent(option.value)}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 20,
                        borderRadius: 999,
                        backgroundColor: isActive ? '#202833' : 'transparent',
                      }}
                    >
                      <Text style={{ color: isActive ? '#ffffff' : theme.textMuted, fontSize: 13, fontWeight: '800' }}>{option.label}</Text>
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
            <View style={{ height: 16, position: 'relative', overflow: 'hidden', marginHorizontal: isWebPlatform ? 126 : 0 }}>
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
            currentProfileId={activeProfile?.id ?? activeAppUserId}
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
              // Voeg de sessie ook toe aan chatSessionMessages als die er nog niet in zit
              setChatSessionMessages((prev) => prev[groupKey] ? prev : {
                ...prev,
                [groupKey]: { conversationId: null, messages: [], loaded: false, spotName: selectedSpot, sessionDay: selectedDayKey }
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
          <View style={{ borderRadius: 22, padding: 14, marginBottom: isWebPlatform ? 14 : 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.055)' }}>
            {/* Header — zelfde stijl als spot chat */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', marginBottom: 12, gap: 10 }}>
              <Ionicons name="people" size={18} color={theme.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>
                  {activeGroupChatContext?.title ?? 'Group Chat'}
                </Text>
                {activeGroupChatContext?.subtitle ? (
                  <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 1 }}>
                    {activeGroupChatContext.subtitle}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Berichten — zelfde rendering als spot chat */}
            <ScrollView
              ref={groupChatScrollRef}
              style={{ maxHeight: 260 }}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => groupChatScrollRef.current?.scrollToEnd({ animated: false })}
            >
              {groupMessages.length === 0
                ? <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center', marginVertical: 20 }}>No messages yet. Say something!</Text>
                : groupMessages.map((msg) => {
                    const own = msg.userId === (activeProfile?.id ?? activeAppUserId);
                    const time = msg.createdAt ? formatToHourMinute(msg.createdAt) : '';
                    return (
                      <View key={msg.id} style={{ flexDirection: own ? 'row-reverse' : 'row', alignItems: 'flex-end', marginBottom: 8, gap: 6 }}>
                        {!own && (
                          <Pressable onPress={() => msg.userId && setViewingOtherUserId(msg.userId)}>
                            <Avatar uri={msg.avatar_url} size={28} name={msg.display_name} />
                          </Pressable>
                        )}
                        <View style={{ maxWidth: '75%', backgroundColor: own ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.045)', borderRadius: 14, borderBottomLeftRadius: own ? 14 : 4, borderBottomRightRadius: own ? 4 : 14, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: own ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.065)' }}>
                          {!own && <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: '800', marginBottom: 2 }}>{msg.display_name}</Text>}
                          <Text style={{ color: theme.text, fontSize: 14 }}>{msg.text}</Text>
                          {time ? <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2, textAlign: own ? 'right' : 'left' }}>{time}</Text> : null}
                        </View>
                      </View>
                    );
                  })
              }
            </ScrollView>

            {/* Input bar — zelfde stijl als spot chat */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingLeft: 14, paddingRight: 5, paddingVertical: 5, marginTop: 10 }}>
              <TextInput
                value={groupMessageInput}
                onChangeText={setGroupMessageInput}
                onFocus={() => spotDetailScrollRef.current?.scrollToEnd({ animated: true })}
                onSubmitEditing={() => void sendGroupChatMessage()}
                blurOnSubmit={false}
                placeholder="Type a message…"
                placeholderTextColor={theme.textMuted}
                style={({ flex: 1, color: theme.text, paddingVertical: 7, paddingRight: 6, fontSize: 15, outlineStyle: 'none', boxShadow: 'none' } as any)}
              />
              <Pressable
                data-group-chat-send="true"
                onPress={() => void sendGroupChatMessage()}
                disabled={!groupMessageInput.trim()}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: groupMessageInput.trim() ? theme.primary : 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', opacity: groupMessageInput.trim() ? 1 : 0.4 }}
              >
                <Ionicons name="arrow-up" size={17} color="#ffffff" />
              </Pressable>
            </View>
          </View>
        ) : null}



        {/* How to contribute */}
        <View style={{ marginTop: 32, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', gap: 12 }}>
          <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 }}>Help improve this spot</Text>
          <Pressable onPress={() => setShowReportCoords(true)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14 }}>📍</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '700', marginBottom: 2 }}>Wrong launch location?</Text>
              <Text style={{ color: 'rgba(255,255,255,0.30)', fontSize: 11, lineHeight: 16 }}>Tap here to submit your GPS coordinates. We'll review and update it.</Text>
            </View>
          </Pressable>
        </View>

        </ScrollView>
        {renderNativeBottomNav()}
        {renderOtherUserProfileModal()}
        {/* Summary popup — wie is er ingecheckt / going / maybe */}
        {summaryPopup ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 400, backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <Pressable style={{ flex: 1 }} onPress={() => setSummaryPopup(null)} />
            <View style={{ backgroundColor: theme.bgElevated ?? '#0f2035', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, maxHeight: '70%' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }}>
                <Text style={{ color: summaryPopup.color, fontSize: 13, fontWeight: '900', flex: 1 }}>{summaryPopup.label} · {summaryPopup.helper}</Text>
                <Pressable onPress={() => setSummaryPopup(null)} hitSlop={10} style={{ padding: 4 }}>
                  <Ionicons name="close" size={20} color={theme.textMuted} />
                </Pressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                {Array.from(new Map(summaryPopup.sessions.map((s) => [s.userId, s])).values()).map((session, i) => {
                  const isMe = session.resolvedActorProfileId === activeProfile?.id || session.userId === activeProfile?.id;
                  let timeLabel: string | null = null;
                  if (summaryPopup.label === 'LIVE' && session.checkedInAt) {
                    timeLabel = `Checked in at ${formatToHourMinute(session.checkedInAt)}`;
                  } else if (session.start) {
                    timeLabel = `${session.start} – ${session.end}`;
                  }
                  return (
                    <View key={session.userId ?? i} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                      <Pressable onPress={() => { if (!isMe && session.userId) { setSummaryPopup(null); setViewingOtherUserId(session.userId); } }}>
                        <Avatar uri={session.userAvatarUrl} size={44} nationality={session.userNationality} skillLevel={session.userSkillLevel} name={session.userName} />
                      </Pressable>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: isMe ? theme.primary : theme.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>
                          {isMe ? 'You' : (session.userName || 'Rider')}
                        </Text>
                        {timeLabel ? <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '500', marginTop: 2 }}>{timeLabel}</Text> : null}
                      </View>
                      {!isMe && session.userId ? (
                        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                          {followingUserIds.includes(session.userId) ? (
                            <Ionicons name="people" size={18} color={theme.textMuted} />
                          ) : outgoingFollowStatusesByUserId[session.userId] === 'pending' ? (
                            <Ionicons name="time-outline" size={18} color={theme.textMuted} />
                          ) : (
                            <Pressable
                              hitSlop={8}
                              onPress={async () => { await handleFollowUser(session.userId!); }}
                            >
                              <Ionicons name="person-add-outline" size={18} color="#4DB8FF" />
                            </Pressable>
                          )}
                          <Pressable
                            hitSlop={8}
                            onPress={async () => {
                              const convId = await openDmWithUser(session.userId!);
                              if (!convId) return;
                              void loadDmMessages(convId);
                              void loadDmConversationsRef.current?.();
                              setSummaryPopup(null);
                              setChatSubTab('dm');
                              setExpandedDmId(convId);
                              setShowChat(true);
                            }}
                          >
                            <Ionicons name="chatbubble-outline" size={18} color={theme.textMuted} />
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        ) : null}
        {/* Wrong launch location bottom sheet */}
        {showReportCoords && selectedSpot ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 400, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
            <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setShowReportCoords(false)} />
            <View style={{ backgroundColor: theme.bgElevated ?? '#0f2035', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 36 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', marginBottom: 18 }}>
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: '900', flex: 1 }}>Wrong launch location?</Text>
                <Pressable onPress={() => setShowReportCoords(false)} hitSlop={10} style={{ padding: 4 }}>
                  <Ionicons name="close" size={20} color={theme.textMuted} />
                </Pressable>
              </View>
              <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 20, marginBottom: 18 }}>
                Move to the exact launch spot, then tap Submit — we'll use your GPS to pin the location. Thanks for helping keep SpotBuddy accurate for everyone!
              </Text>
              {currentCoordinates ? (
                <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginBottom: 18 }}>
                  Your GPS: {currentCoordinates.latitude.toFixed(5)}, {currentCoordinates.longitude.toFixed(5)}
                </Text>
              ) : (
                <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginBottom: 18 }}>
                  No GPS available — we'll follow up after your report.
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={async () => {
                    if (!activeAppUserId) return;
                    const spotDef = verifiedSpotDefinitions.find(s => normalizeSpotName(s.spot) === normalizeSpotName(selectedSpot));
                    await supabase.from('spot_coordinate_suggestions').insert({
                      spot_name: selectedSpot,
                      submitted_by: activeAppUserId,
                      current_latitude: spotDef?.latitude ?? null,
                      current_longitude: spotDef?.longitude ?? null,
                      suggested_latitude: currentCoordinates?.latitude ?? null,
                      suggested_longitude: currentCoordinates?.longitude ?? null,
                    });
                    void sendPushToRecipients(
                      ['1a6cf03f-48ea-4907-b5ee-6594a44465a6'],
                      '📍 Spot correction',
                      `${activeProfile?.display_name} reported wrong coordinates for ${selectedSpot}`,
                      { type: 'admin' }
                    );
                    setShowReportCoords(false);
                    alert('Thank you! We\'ll review your suggestion.');
                  }}
                  style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}
                >
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>Submit</Text>
                </Pressable>
                <Pressable onPress={() => setShowReportCoords(false)} style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center' }}>
                  <Text style={{ color: '#ff6b6b', fontSize: 12, fontWeight: '400' }}>× Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
        {/* Conditions rating overlay — getoond na check-in */}
        {showConditionsRating ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 400, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: theme.bgElevated ?? '#0f2035', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 36 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', marginBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 17, fontWeight: '900' }}>Rate The Spot</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '500', marginTop: 3 }}>Your best read counts — no instruments needed.</Text>
                </View>
                <Pressable onPress={skipConditionsRating} hitSlop={10} style={{ padding: 4 }}>
                  <Ionicons name="close" size={20} color={theme.textMuted} />
                </Pressable>
              </View>

              {/* Wind knots — prominent, left-aligned */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: '900', marginBottom: 8 }}>💨 Wind</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Pressable onPress={() => setConditionsWindKnots(Math.max(0, (conditionsWindKnots ?? 16) - 1))} style={{ width: 40, height: 40, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>−</Text>
                  </Pressable>
                  <Text style={{ color: conditionsWindKnots != null ? theme.text : 'rgba(255,255,255,0.3)', fontSize: 28, fontWeight: '900', minWidth: 72, textAlign: 'center' }}>{conditionsWindKnots != null ? `${conditionsWindKnots} kn` : '-- kn'}</Text>
                  <Pressable onPress={() => setConditionsWindKnots(Math.min(40, (conditionsWindKnots ?? 14) + 1))} style={{ width: 40, height: 40, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>+</Text>
                  </Pressable>
                </View>
              </View>

              {/* Direction · Water · Crowd — label links, opties horizontaal rechts */}
              <View style={{ gap: 10, marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '900', width: 82 }}>↗ Direction</Text>
                  <View style={{ flex: 1, flexDirection: 'row', gap: 5 }}>
                    {(['onshore','side-on','side-shore','offshore'] as const).map((d) => {
                      const dirLabel: Record<string, string> = { onshore: 'Onshore', 'side-on': 'Side-on', 'side-shore': 'Side-shore', offshore: 'Offshore' };
                      return (
                        <Pressable key={d} onPress={() => setConditionsWindDir(d)} style={{ flex: 1, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: conditionsWindDir === d ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.08)', backgroundColor: conditionsWindDir === d ? '#202833' : 'transparent', alignItems: 'center' }}>
                          <Text style={{ color: conditionsWindDir === d ? '#ffffff' : theme.textMuted, fontSize: 11, fontWeight: '600' }}>{dirLabel[d]}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '900', width: 82 }}>🌊 Water</Text>
                  <View style={{ flex: 1, flexDirection: 'row', gap: 5 }}>
                    {(['flat','chop','waves'] as const).map((w) => (
                      <Pressable key={w} onPress={() => setConditionsWater(w)} style={{ flex: 1, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: conditionsWater === w ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.08)', backgroundColor: conditionsWater === w ? '#202833' : 'transparent', alignItems: 'center' }}>
                        <Text style={{ color: conditionsWater === w ? '#ffffff' : theme.textMuted, fontSize: 11, fontWeight: '600' }}>{w.charAt(0).toUpperCase() + w.slice(1)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '900', width: 82 }}>👥 Crowd</Text>
                  <View style={{ flex: 1, flexDirection: 'row', gap: 5 }}>
                    {([['1','Empty'],['2','Quiet'],['3','Busy'],['4','Packed'],['5','Hectic']] as const).map(([v, label]) => (
                      <Pressable key={v} onPress={() => setConditionsCrowd(Number(v))} style={{ flex: 1, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: conditionsCrowd === Number(v) ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.08)', backgroundColor: conditionsCrowd === Number(v) ? '#202833' : 'transparent', alignItems: 'center' }}>
                        <Text style={{ color: conditionsCrowd === Number(v) ? '#ffffff' : theme.textMuted, fontSize: 11, fontWeight: '600' }}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={() => void saveConditionsRating()} style={{ flex: 1, backgroundColor: '#123868', borderRadius: 999, paddingVertical: 12, alignItems: 'center', borderColor: theme.primary }}>
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Submit</Text>
                </Pressable>
                <Pressable onPress={skipConditionsRating} style={{ flex: 1, paddingVertical: 12, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center' }}>
                  <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '700' }}>Skip</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    );
  }
  const visibleSpots = homeSpotCards.map(({ spot, distanceMeters }) => ({ name: spot, distanceMeters }));
  
  
  
  
  
  
  
  const homeHorizontalPadding = isWebPlatform ? 20 : 14;
  const homeTopPadding = isWebPlatform ? 18 : 8;
  const homeLogoBoxSize = isWebPlatform ? 120 : 72;
  const homeLogoImageSize = isWebPlatform ? 210 : 126;
  const homeWordmarkWidth = isWebPlatform ? 680 : 480;
  const homeWordmarkHeight = isWebPlatform ? 160 : 120;
  const homeWordmarkMarginLeft = isWebPlatform ? -215 : -130;
  const homeActionButtonWidth = isWebPlatform ? 170 : '48%';
  const homeSpotCardPadding = isWebPlatform ? 22 : 16;
  const homeSpotCardRadius = isWebPlatform ? 24 : 18;
  const homeForecastBarWidth = isWebPlatform ? 18 : 10;
  const homeForecastHeight = isWebPlatform ? 96 : 72;
  const homeBottomPadding = isWebPlatform ? 32 : 118;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      {!isWebPlatform ? (
        <View style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} pointerEvents="none">
          <Image source={require('./assets/logo.png')} style={{ width: 1, height: 1 }} />
          <Image source={require('./assets/wordmark.png')} style={{ width: 1, height: 1 }} />
        </View>
      ) : null}
      <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
      <View style={{ flex: 1, backgroundColor: theme.bg }} onTouchStart={handleNativeSwipeStart} onTouchEnd={handleNativeSwipeEnd}>
        {renderNativeTopBar()}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: homeHorizontalPadding, paddingTop: 0, paddingBottom: homeBottomPadding }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshingWind}
              onRefresh={() => void refreshWindForFollowedSpots(true)}
              tintColor="rgba(255,255,255,0.4)"
            />
          }
        >

        {/* Verborgen boven de viewport — zichtbaar bij pull-down */}
        <View style={{ height: 36, justifyContent: 'center', alignItems: 'center', marginTop: isWebPlatform ? homeTopPadding : -36 }}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
            {windLastFetched
              ? `Wind updated ${Math.floor((Date.now() - windLastFetched.getTime()) / 60000) === 0 ? 'just now' : `${Math.floor((Date.now() - windLastFetched.getTime()) / 60000)} min ago`}`
              : 'Pull to load wind'}
          </Text>
        </View>

        <View style={{ marginBottom: 0, paddingTop: isWebPlatform ? 0 : 18 }}>
          <View style={{ display: isWebPlatform ? 'flex' : 'none', flexDirection: 'row', alignItems: 'center', marginBottom: -20, paddingTop: 8 }}>
            <View style={{ width: homeLogoBoxSize, height: homeLogoBoxSize, overflow: 'hidden', marginRight: -12, marginLeft: -4, justifyContent: 'center', alignItems: 'center' }}>
              <Image source={require('./assets/logo.png')} style={{ width: homeLogoImageSize, height: homeLogoImageSize, marginLeft: 8 }} resizeMode="contain" />
            </View>
            <Image source={require('./assets/wordmark.png')} style={{ width: homeWordmarkWidth, height: homeWordmarkHeight, marginLeft: homeWordmarkMarginLeft }} resizeMode="contain" />
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
                {(() => {
                  const isLive = !!activeCheckedInSession;
                  const session = activeCheckedInSession ?? plannedSession;
                  return (
                    <>
                      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        {isLive ? 'Live' : plannedSessionIntentLabel}
                      </Text>
                      <Text style={{ color: theme.text, fontSize: 24, fontWeight: '800', marginTop: 4 }}>
                        {session?.spot}
                      </Text>
                      {isLive && activeCheckedInSession?.checkedInAt ? (
                        <Text style={{ color: theme.textSoft, fontSize: 14, fontWeight: '500', marginTop: 2 }}>
                          Since {formatToHourMinute(activeCheckedInSession.checkedInAt)}
                        </Text>
                      ) : plannedSessionTimeLabel ? (
                        <Text style={{ color: theme.textSoft, fontSize: 14, fontWeight: '500', marginTop: 2 }}>
                          {plannedSessionTimeLabel}
                        </Text>
                      ) : null}
                    </>
                  );
                })()}
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
            onPress={() => { setShowChat(true); setChatSubTab('spot'); }}
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
            {chatUnreadCount > 0 ? (
              <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: theme.bg, fontSize: 10, fontWeight: '900' }}>{chatUnreadCount > 99 ? '99+' : chatUnreadCount}</Text>
              </View>
            ) : null}
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
                <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: theme.bg, fontSize: 10, fontWeight: '900' }}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        {isNotificationInboxExpanded ? (
          <View style={{ backgroundColor: theme.bgElevated ?? '#0f2035', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 14, marginBottom: 14, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 }}>Activity</Text>
              <Pressable onPress={() => setIsNotificationInboxExpanded(false)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="close" size={16} color={theme.textMuted} />
              </Pressable>
            </View>
            {notificationRows.length === 0 ? (
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>No recent activity</Text>
            ) : (
              notificationRows.slice(0, 8).map((row) => {
                const summaryText = getNotificationInboxSummary(row);
                if (!summaryText) return null;
                const timeAgo = row.created_at ? (() => {
                  const diff = Date.now() - new Date(row.created_at).getTime();
                  const mins = Math.floor(diff / 60000);
                  if (mins < 60) return `${mins}m ago`;
                  const hrs = Math.floor(mins / 60);
                  if (hrs < 24) return `${hrs}h ago`;
                  return `${Math.floor(hrs / 24)}d ago`;
                })() : '';
                return (
                  <Pressable key={row.id} onPress={() => setIsNotificationInboxExpanded(false)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={row.read ? 'notifications-outline' : 'notifications'} size={16} color={row.read ? theme.textMuted : theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: row.read ? theme.textSoft : theme.text, fontSize: 13, fontWeight: row.read ? '400' : '700' }} numberOfLines={2}>{summaryText}</Text>
                      <Text style={{ color: theme.textMuted, fontSize: 11 }}>{timeAgo}</Text>
                    </View>
                    {!row.read && <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: theme.primary }} />}
                  </Pressable>
                );
              })
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
              const liveCount = nearestStatus.activeCount;
              // Bereken dezelfde totalHourCount als de heatmap bars voor het huidige uur
              const nowH = new Date().getHours();
              const nowSessions = nearestSessions.filter((s) => {
                const sh = Number(String(s.start || '0:00').split(':')[0]);
                const eh = Number(String(s.end || '0:00').split(':')[0]);
                return sh <= nowH && eh > nowH;
              });
              const nowLive = nowSessions.filter(s => getCleanSessionStatus(s) === 'live').length;
              const nowGoing = nowSessions.filter(s => getCleanSessionStatus(s) === 'going').length;
              const nowMaybe = nowSessions.filter(s => getCleanSessionStatus(s) === 'maybe').length;
              const nowTotal = nowLive * 1.6 + nowGoing * 1.25 + nowMaybe * 0.85;
              const HEATMAP_COLORS_HOME = ['#0D2C54','#1E63C6','#35B8E0','#2ECC71','#A8E063','#7B61FF','#E83E8C'];
              const nearestHeatColor = nowTotal <= 0 ? theme.primary
                : nowTotal <= 2 ? HEATMAP_COLORS_HOME[0]
                : nowTotal <= 5 ? HEATMAP_COLORS_HOME[1]
                : nowTotal <= 10 ? HEATMAP_COLORS_HOME[2]
                : nowTotal <= 18 ? HEATMAP_COLORS_HOME[3]
                : nowTotal <= 28 ? HEATMAP_COLORS_HOME[4]
                : nowTotal <= 40 ? HEATMAP_COLORS_HOME[5]
                : HEATMAP_COLORS_HOME[6];
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingVertical: 6 }}>
                  {nearestSpotCanCheckIn ? (
                    <Pressable
                      onPress={() => void handleQuickCheckIn(nearestSpotResult!.spot)}
                      style={{ backgroundColor: '#123868', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 }}
                    >
                      <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>Check in</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => setSelectedSpot(nearestSpotResult.spot)}>
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                      Nearest spot · <Text style={{ color: nearestHeatColor, fontWeight: '800' }}>{nearestSpotResult.spot}</Text> · {nearestSpotDistanceLabel}
                      {liveCount > 0 ? (
                        <Text> · <Text style={{ color: nearestHeatColor, fontWeight: '800' }}>● {liveCount} live</Text></Text>
                      ) : nearestStatus.plannedCount > 0 ? (
                        <Text style={{ color: theme.textMuted }}> · {nearestStatus.plannedCount} going</Text>
                      ) : null}
                    </Text>
                  </Pressable>
                </View>
              );
            })()
          ) : (
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>Nearest spot · No nearby spot</Text>
          )}
        </View>

        {/* Check out strip */}
        {isHomeCheckoutButtonVisible ? (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            <Pressable
              onPress={() => void handleQuickCheckOut()}
              style={{ backgroundColor: '#8b1f38', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}
            >
              <Text style={{ color: '#ffd7de', fontSize: 12, fontWeight: '900' }}>Check out · {activeCheckedInSession?.spot}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Top spots — echte data */}
        {topSpotsData.length > 0 ? (() => {
          const mockSpots = topSpotsData.map(s => ({ name: s.name, fullName: s.shortName, count: s.count, dist: s.dist }));
          const max = Math.max(...mockSpots.map(s => s.count), 1);
          const total = mockSpots.reduce((a, s) => a + s.count, 0);
          const BAR_W = isWebPlatform ? 14 : 10;
          const BAR_MAX_H = 52;
          const HEATMAP = ['#0D2C54','#1E63C6','#35B8E0','#2ECC71','#A8E063','#7B61FF','#E83E8C'];
          const barColor = (count: number) => {
            if (count <= 0) return 'rgba(255,255,255,0.08)';
            if (count <= 2) return HEATMAP[0];
            if (count <= 5) return HEATMAP[1];
            if (count <= 10) return HEATMAP[2];
            if (count <= 18) return HEATMAP[3];
            if (count <= 28) return HEATMAP[4];
            if (count <= 40) return HEATMAP[5];
            return HEATMAP[6];
          };
          return (
            <View style={{ marginBottom: 18 }}>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>{activeDay === 'today' ? "Today's top spots" : "Tomorrow's top spots"}</Text>
              <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '900', marginBottom: 14 }}>{total} {total === 1 ? 'rider' : 'riders'}</Text>

              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
                {mockSpots.map((spot) => {
                  const barH = Math.max(6, Math.round((spot.count / max) * BAR_MAX_H));
                  const color = barColor(spot.count);
                  return (
                    <Pressable key={spot.name} onPress={() => setSelectedSpot(spot.fullName as any)} style={{ alignItems: 'center', gap: 6 }}>
                      <View style={{ alignItems: 'center', justifyContent: 'flex-end', height: BAR_MAX_H }}>
                        <View style={{ width: BAR_W, height: barH, borderRadius: 4, backgroundColor: color }} />
                      </View>
                      <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '800', textAlign: 'center' }}>{spot.name}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>{spot.count} riders</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })() : null}


        {visibleSpots.length === 0 ? (
          <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 20, alignItems: 'flex-start', gap: 12 }}>
            <View>
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900' }}>Add your favourite spots</Text>
              <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>Follow spots to see who's riding and plan sessions together.</Text>
            </View>
            <Pressable
              onPress={() => setShowYourSpotsPage(true)}
              style={{ backgroundColor: '#ffffff', borderRadius: 999, paddingVertical: 9, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Ionicons name="location" size={15} color="#071421" />
              <Text style={{ color: '#071421', fontSize: 13, fontWeight: '800' }}>Set up your spots</Text>
            </Pressable>
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

          const HEATMAP_COLORS = ['#0D2C54','#1E63C6','#35B8E0','#2ECC71','#A8E063','#7B61FF','#E83E8C'];
          const getHeatColor = (count: number): string | null => {
            if (count <= 0) return null;
            if (count <= 2) return HEATMAP_COLORS[0];
            if (count <= 5) return HEATMAP_COLORS[1];
            if (count <= 10) return HEATMAP_COLORS[2];
            if (count <= 18) return HEATMAP_COLORS[3];
            if (count <= 28) return HEATMAP_COLORS[4];
            if (count <= 40) return HEATMAP_COLORS[5];
            return HEATMAP_COLORS[6];
          };

          const nowHour = new Date().getHours();
          const hourCounts = Array.from({ length: 16 }).map((_, hourIndex) => {
            const hour = 7 + hourIndex;
            // Verleden (>2u geleden): gebruik alle sessies incl. verlopen voor historische activiteit
            const isOldHistory = hour < nowHour - 2;
            const sourceSessions = isOldHistory ? daySpotSessions : cleanDaySpotSessions;
            const sessionsInHour = sourceSessions.filter((sessionItem) => {
              const [startHourRaw, startMinuteRaw] = String(sessionItem.start || '0:00').split(':');
              const [endHourRaw, endMinuteRaw] = String(sessionItem.end || '0:00').split(':');
              const startMinutes = (Number(startHourRaw) * 60) + Number(startMinuteRaw || 0);
              const endMinutes = (Number(endHourRaw) * 60) + Number(endMinuteRaw || 0);
              return startMinutes < (hour * 60 + 60) && endMinutes > hour * 60;
            });
            const liveHourCount = sessionsInHour.filter(s => getCleanSessionStatus(s) === 'live').length;
            const goingHourCount = sessionsInHour.filter(s => getCleanSessionStatus(s) === 'going').length;
            const maybeHourCount = isOldHistory
              ? sessionsInHour.length - liveHourCount - goingHourCount
              : sessionsInHour.filter(s => getCleanSessionStatus(s) === 'maybe').length;
            const totalHourCount = (liveHourCount * 1.6) + (goingHourCount * 1.25) + (maybeHourCount * 0.85);
            return { hour, liveHourCount, goingHourCount, maybeHourCount, totalHourCount };
          });

          const maxHourCount = Math.max(...hourCounts.map(h => h.totalHourCount), 1);
          const BAR_MAX_H = 82;

          const forecastHours = hourCounts.map(({ hour, liveHourCount, goingHourCount, maybeHourCount, totalHourCount }) => {
            const color = getHeatColor(totalHourCount);
            const height = totalHourCount > 0 ? Math.max(6, Math.round((totalHourCount / maxHourCount) * BAR_MAX_H)) : 0;
            return { hour, liveHourCount, goingHourCount, maybeHourCount, totalHourCount, color, height };
          });

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
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900', letterSpacing: 0.2, flex: 1 }}>
                      {spot.name}
                    </Text>
                    {activeDay === 'today' && (() => {
                      const wind = windBySpot[spot.name];
                      if (!wind) return null;
                      return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>
                            {wind.speed} kn {degreesToCompass(wind.direction)}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>

                  <Text style={{ color: 'rgba(255,255,255,0.52)', marginTop: 5, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>
                    {spot.distanceMeters === null ? 'DISTANCE UNKNOWN' : `${formatDistance(spot.distanceMeters)} AWAY`}
                  </Text>
                  {activeDay === 'today' && spotRatingsMap[spot.name] ? (() => {
                    const r = spotRatingsMap[spot.name];
                    const crowdLabel = r.crowdRating != null ? (['','Empty','Quiet','Busy','Packed','Hectic'][r.crowdRating] ?? null) : null;
                    const ratingParts: { emoji: string; label: string }[] = [];
                    if (r.ratedAt) ratingParts.push({ emoji: '', label: `Rated at ${formatToHourMinute(r.ratedAt)}` });
                    if (r.windKnots != null) ratingParts.push({ emoji: '💨', label: `${r.windKnots} kn` });
                    if (r.windDirection) ratingParts.push({ emoji: '↗', label: r.windDirection });
                    if (r.waterConditions) ratingParts.push({ emoji: '🌊', label: r.waterConditions });
                    if (crowdLabel) ratingParts.push({ emoji: '👥', label: crowdLabel });
                    if (ratingParts.length === 0) return null;
                    return (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 0, marginTop: 7 }}>
                        {ratingParts.map((part, i) => (
                          <View key={part.label} style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {i > 0 && <View style={{ width: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 6 }} />}
                            {part.emoji ? <Text style={{ fontSize: 10, color: '#ffffff' }}>{part.emoji}</Text> : null}
                            <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: '700', marginLeft: part.emoji ? 3 : 0 }}>{part.label}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  })() : null}
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
                    {totalActiveRiders > 0 ? `${totalActiveRiders} ${totalActiveRiders === 1 ? 'rider' : 'riders'} planned` : 'No sessions planned'}
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
                  {forecastHours.map((fh) => {
                    const riderCount = fh.liveHourCount + fh.goingHourCount;
                    const showCount = fh.height >= Math.round(BAR_MAX_H * 0.3) && riderCount > 0;
                    return (
                      <View key={`forecast-bar-${spot.name}-${fh.hour}`} style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                        {showCount ? (
                          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8, fontWeight: '700', marginBottom: 2, lineHeight: 9 }}>{riderCount}</Text>
                        ) : null}
                        <View
                          style={{
                            width: homeForecastBarWidth,
                            height: fh.height > 0 ? (isWebPlatform ? fh.height : Math.min(fh.height, 60)) : 0,
                            borderRadius: 6,
                            backgroundColor: fh.height > 0 && fh.hour < new Date().getHours() - 2 ? 'rgba(255,255,255,0.18)' : (fh.color ?? 'transparent'),
                          }}
                        />
                      </View>
                    );
                  })}

                  {activeDay === 'today' ? (
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
                  ) : null}
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

        {/* Contact footer — web only */}
        {isWebPlatform ? (
          <Pressable
            onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=SpotBuddy feedback`)}
            style={{ paddingVertical: 20, alignItems: 'center' }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>Contact · {CONTACT_EMAIL}</Text>
          </Pressable>
        ) : null}

        </ScrollView>
      </View>
      {renderNativeBottomNav()}

      {renderOtherUserProfileModal()}

      {/* Follow spot prompt */}
      {followPromptSpot && (
        <Pressable
          onPress={() => setFollowPromptSpot(null)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 200, justifyContent: 'flex-end' }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#0d1b2a', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="location" size={20} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>Follow {followPromptSpot}?</Text>
                <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 2 }}>
                  {favoriteSpots.length >= effectiveSpotsLimit
                    ? `You're following ${effectiveSpotsLimit} spots. Remove one first in the Spots tab.`
                    : 'Get session alerts and spot chat for this spot.'}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {favoriteSpots.length < effectiveSpotsLimit ? (
                <Pressable
                  onPress={() => {
                    addSelectedSpot(followPromptSpot as any);
                    setFollowPromptSpot(null);
                  }}
                  style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}
                >
                  <Text style={{ color: theme.textSoft, fontSize: 15, fontWeight: '800' }}>Yes, follow</Text>
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
    </SafeAreaView>
  );
});
