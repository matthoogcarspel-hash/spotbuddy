import { useEffect, useMemo, useState } from 'react';

import { Session as AuthSession } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Image, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';

import { uploadAvatar } from './src/lib/avatar';
import { spots } from './src/data/spots';
import { Profile, supabase } from './src/lib/supabase';
import AuthScreen from './src/screens/AuthScreen';
import NameSetupScreen from './src/screens/NameSetupScreen';

const fallbackSpots = spots;
type SpotName = string;
type SpotDefinition = {
  spot: SpotName;
  latitude: number;
  longitude: number;
};
type SessionStatus = 'Is er al' | 'Gaat' | 'Uitchecken';
type SpotSession = {
  id: string;
  spot: SpotName;
  start: string;
  end: string;
  status: SessionStatus;
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
  userName: string;
  userAvatarUrl: string | null;
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
type SpotNotificationPreferences = {
  session_planning_notification_mode: SpotNotificationMode;
  checkin_notification_mode: SpotNotificationMode;
  chat_notification_mode: SpotNotificationMode;
};
type SpotNotificationMode = 'off' | 'following' | 'everyone';
type FollowStatus = 'pending' | 'accepted' | 'rejected';
type BuddyUser = Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;
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
type TimelineState = 'live' | 'planned' | 'completed';

const hours = Array.from({ length: 24 }, (_, index) => index);
const minuteOptions = [0, 15, 30, 45];
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
const resolveNotificationMode = (mode: SpotNotificationMode | null | undefined): SpotNotificationMode =>
  mode === 'off' || mode === 'following' || mode === 'everyone' ? mode : 'off';
const notificationModeOptions: { label: string; value: SpotNotificationMode }[] = [
  { label: 'Uit', value: 'off' },
  { label: 'Volgt', value: 'following' },
  { label: 'Iedereen', value: 'everyone' },
];
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const formatLocalHourMinute = (dateValue: Date) => `${formatTimePart(dateValue.getHours())}:${formatTimePart(dateValue.getMinutes())}`;
const getNowLocalHourMinute = () => formatLocalHourMinute(new Date());
const getLocalDateKey = (dateValue: Date) => `${dateValue.getFullYear()}-${formatTimePart(dateValue.getMonth() + 1)}-${formatTimePart(dateValue.getDate())}`;
const getCurrentLocalDateKey = () => getLocalDateKey(new Date());
const getQuickCheckInWindowError = (currentMinutes: number) => {
  if (currentMinutes < timelineStartMinutes) {
    return 'Je kunt pas vanaf 08:00 inchecken';
  }

  if (currentMinutes >= timelineEndMinutes) {
    return 'Inchecken kan alleen tot 21:00';
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

  return dateValue.toLocaleTimeString('nl-NL', {
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
const parseHourMinuteParts = (hourMinute: string) => {
  const [hourPart, minutePart] = hourMinute.split(':');
  const parsedHour = Number.parseInt(hourPart ?? '', 10);
  const parsedMinute = Number.parseInt(minutePart ?? '', 10);

  return {
    hour: Number.isNaN(parsedHour) ? null : parsedHour,
    minute: Number.isNaN(parsedMinute) ? 0 : parsedMinute,
  };
};
const isLiveSession = (sessionItem: SpotSession) => sessionItem.checkedInAt !== null && sessionItem.checkedOutAt === null;
const isPlannedSession = (sessionItem: SpotSession) =>
  hasPlannedTimeWindow(sessionItem)
  && sessionItem.checkedInAt === null
  && sessionItem.checkedOutAt === null;
const getTimelineState = (sessionItem: SpotSession): TimelineState => {
  if (sessionItem.checkedInAt !== null && sessionItem.checkedOutAt === null) {
    return 'live';
  }

  if (sessionItem.checkedOutAt !== null) {
    return 'completed';
  }

  return 'planned';
};
const getTimelineBarLabel = (state: TimelineState) =>
  state === 'live' ? 'Live' : state === 'planned' ? 'Gaat' : 'Klaar';
const getTimelineStatusOrder = (state: TimelineState) =>
  state === 'live' ? 0 : state === 'planned' ? 1 : 2;
const timelineJoinButtonWidthPercent = 11;
const timelineJoinButtonGapPercent = 1.2;
const getLiveSessions = (sessions: SpotSession[]) => sessions.filter((sessionItem) => isLiveSession(sessionItem));
const getMostRecentSessionByCreatedAt = (sessions: SpotSession[]) =>
  [...sessions].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  })[0] ?? null;
const getCurrentUserLiveSession = (sessions: SpotSession[], userId: string | null | undefined) => {
  if (!userId) {
    return null;
  }

  const userSessions = sessions.filter((sessionItem) => sessionItem.userId === userId);
  const liveUserSessions = getLiveSessions(userSessions);
  return getMostRecentSessionByCreatedAt(liveUserSessions);
};

const createSpotRecord = <T,>(spotNames: SpotName[], makeValue: () => T): Record<SpotName, T> =>
  spotNames.reduce((result, spot) => {
    result[spot] = makeValue();
    return result;
  }, {} as Record<SpotName, T>);
const normalizeSpotName = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const isSessionCreatedToday = (sessionItem: SpotSession) => isCreatedToday(sessionItem.createdAt);
const isGoingLaterSession = (sessionItem: SpotSession, nowMinutes: number) =>
  sessionItem.status === 'Gaat' && nowMinutes < toMinutes(sessionItem.start);
const isProbablyThereSession = (sessionItem: SpotSession, nowMinutes: number) =>
  sessionItem.status === 'Gaat' && nowMinutes >= toMinutes(sessionItem.start) && nowMinutes < toMinutes(sessionItem.end);
const isCheckedInSession = (sessionItem: SpotSession, nowMinutes: number) =>
  sessionItem.status === 'Is er al' && nowMinutes < toMinutes(sessionItem.end);
const getSessionDisplayState = (sessionItem: SpotSession, nowMinutes: number): 'Gaat nog' | 'Waarschijnlijk er' | 'Ingecheckt' | null => {
  if (isGoingLaterSession(sessionItem, nowMinutes)) {
    return 'Gaat nog';
  }
  if (isProbablyThereSession(sessionItem, nowMinutes)) {
    return 'Waarschijnlijk er';
  }
  if (isCheckedInSession(sessionItem, nowMinutes)) {
    return 'Ingecheckt';
  }
  return null;
};
const timelineStartMinutes = 8 * 60;
const timelineEndMinutes = 21 * 60;
const timelineTotalMinutes = timelineEndMinutes - timelineStartMinutes;
const timelineLabels = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '21:00'];

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
const toRadians = (value: number) => value * (Math.PI / 180);
const getDistanceMeters = (start: SpotCoordinates, end: SpotCoordinates) => {
  const earthRadiusMeters = 6371_000;
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const startLatitudeRadians = toRadians(start.latitude);
  const endLatitudeRadians = toRadians(end.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2)
    + Math.cos(startLatitudeRadians) * Math.cos(endLatitudeRadians) * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);

  const angularDistance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return earthRadiusMeters * angularDistance;
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
  let nearestSpot: SpotName | null = null;
  let nearestDistanceMeters = Number.POSITIVE_INFINITY;

  for (const spot of spotDefinitions) {
    const distanceMeters = getDistanceMeters(currentCoordinates, {
      latitude: spot.latitude,
      longitude: spot.longitude,
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
  isSelected: boolean;
  showJoinButton: boolean;
  onPress: () => void;
  onJoin: () => void;
};

function SessionBar({ leftPercent, widthPercent, state, isSelected, showJoinButton, onPress, onJoin }: SessionBarProps) {
  const stateStyle: Record<TimelineState, { bar: string; text: string; border: string; borderStyle?: 'solid' | 'dashed'; opacity?: number }> = {
    planned: { bar: '#204f86', text: '#d7ecff', border: '#63a7ff', borderStyle: 'dashed' },
    live: { bar: '#1c8c73', text: '#ecfff7', border: '#35d3ac' },
    completed: { bar: '#5d6674', text: '#e2e8f1', border: '#8f98a8', opacity: 0.65 },
  };
  const timelineLabel = getTimelineBarLabel(state);
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
          borderWidth: 1,
          borderColor: stateStyle[state].border,
          borderStyle: stateStyle[state].borderStyle ?? 'solid',
          opacity: stateStyle[state].opacity ?? 1,
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
  isSelected: boolean;
  onSelect: (sessionId: string) => void;
  onJoin: (sessionItem: SpotSession) => void;
};

function SessionRow({ timelineSession, currentUserId, isSelected, onSelect, onJoin }: SessionRowProps) {
  const { item, state, isBuddy } = timelineSession;
  const hasPlannedWindow = hasPlannedTimeWindow(item);
  const checkedInMinutes = getLocalMinutesFromIso(item.checkedInAt);
  const sessionStartMinutes = hasPlannedWindow ? toMinutes(item.start) : (checkedInMinutes ?? timelineStartMinutes);
  const sessionEndMinutes = hasPlannedWindow
    ? toMinutes(item.end)
    : Math.min((checkedInMinutes ?? timelineStartMinutes) + 45, timelineEndMinutes);
  const clampedStartMinutes = clamp(sessionStartMinutes, timelineStartMinutes, timelineEndMinutes);
  const clampedEndMinutes = clamp(Math.max(sessionEndMinutes, clampedStartMinutes + 20), timelineStartMinutes, timelineEndMinutes);
  const leftPercent = clamp(((clampedStartMinutes - timelineStartMinutes) / timelineTotalMinutes) * 100, 0, 100);
  const widthPercent = clamp(((clampedEndMinutes - clampedStartMinutes) / timelineTotalMinutes) * 100, 6, 100 - leftPercent);
  const canShowJoin = Boolean(
    isSelected
    && currentUserId
    && item.userId !== currentUserId
    && state !== 'completed'
    && hasPlannedWindow,
  );

  return (
    <Pressable onPress={() => onSelect(item.id)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      <Text numberOfLines={1} style={{ width: 90, color: isBuddy ? theme.text : theme.textSoft, fontSize: 13, marginRight: 8, fontWeight: isBuddy ? '700' : '500' }}>
        {item.userName}
      </Text>
      <SessionBar
        leftPercent={leftPercent}
        widthPercent={widthPercent}
        state={state}
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
  timelineFilter: TimelineFilter;
  onSelectSession: (sessionId: string) => void;
  onJoinSession: (sessionItem: SpotSession) => void;
  onClearSelection: () => void;
};

function SessionTimeline({
  timelineSessions,
  selectedTimelineSessionId,
  currentUserId,
  currentLocalMinutes,
  timelineFilter,
  onSelectSession,
  onJoinSession,
  onClearSelection,
}: SessionTimelineProps) {
  const totalRange = timelineEndMinutes - timelineStartMinutes;
  const isCurrentTimeMarkerVisible = currentLocalMinutes >= timelineStartMinutes && currentLocalMinutes <= timelineEndMinutes;
  const currentPercent = ((currentLocalMinutes - timelineStartMinutes) / totalRange) * 100;

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

        {timelineSessions.length > 0 ? (
          timelineSessions.map((timelineSession) => (
            <SessionRow
              key={timelineSession.item.id}
              timelineSession={timelineSession}
              currentUserId={currentUserId}
              isSelected={selectedTimelineSessionId === timelineSession.item.id}
              onSelect={onSelectSession}
              onJoin={onJoinSession}
            />
          ))
        ) : (
          <Text style={{ color: theme.textSoft, fontSize: 14 }}>
            {timelineFilter === 'buddies' ? 'Nog geen buddy-sessies op de tijdlijn' : 'Nog geen sessies op de tijdlijn'}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
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
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const planningHelperText = 'Je bent pas live op de spot na inchecken.';
  const [sessionActionError, setSessionActionError] = useState('');
  const [homeQuickCheckInError, setHomeQuickCheckInError] = useState('');
  const [quickCheckInSpotInFlight, setQuickCheckInSpotInFlight] = useState<SpotName | null>(null);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  const [isResolvingNearestSpot, setIsResolvingNearestSpot] = useState(false);
  const [nearestSpotResult, setNearestSpotResult] = useState<NearestSpotResult | null>(null);
  const [currentCoordinates, setCurrentCoordinates] = useState<SpotCoordinates | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [spotNotificationPreferences, setSpotNotificationPreferences] = useState<SpotNotificationPreferences>(defaultSpotNotificationPreferences);
  const [loadingSpotNotificationPreferences, setLoadingSpotNotificationPreferences] = useState(false);
  const [savingNotificationPreferenceKey, setSavingNotificationPreferenceKey] = useState<'sessionPlanning' | 'checkin' | 'chat' | null>(null);
  const [notificationPreferencesError, setNotificationPreferencesError] = useState('');
  const [isNotificationPanelExpanded, setIsNotificationPanelExpanded] = useState(false);
  const [currentLocalMinutes, setCurrentLocalMinutes] = useState(() => getCurrentLocalMinutes());
  const [currentLocalDateKey, setCurrentLocalDateKey] = useState(() => getCurrentLocalDateKey());
  const [homeQuickCheckOutInFlight, setHomeQuickCheckOutInFlight] = useState(false);
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
  const [selectedTimelineSessionId, setSelectedTimelineSessionId] = useState<string | null>(null);

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
    if (!session?.user.id) {
      setBuddyUsers([]);
      setOutgoingFollowStatusesByUserId({});
      setFollowingUserIds([]);
      setIncomingFollowRequests([]);
      setFollowerUsers([]);
      return;
    }

    setLoadingBuddies(true);
    setBuddiesError('');
    console.log('BUDDIES_CURRENT_USER_ID', { userId: session.user.id });

    const [usersResponse, followsResponse, incomingRequestsResponse, incomingAcceptedResponse] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .neq('id', session.user.id)
        .order('display_name', { ascending: true }),
      supabase
        .from('user_follows')
        .select('id, follower_id, following_id, status, created_at, responded_at')
        .eq('follower_id', session.user.id),
      supabase
        .from('user_follows')
        .select('id, follower_id, following_id, status, created_at, responded_at')
        .eq('following_id', session.user.id)
        .eq('status', 'pending'),
      supabase
        .from('user_follows')
        .select('id, follower_id, following_id, status, created_at, responded_at')
        .eq('following_id', session.user.id)
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
      setBuddiesError('Kon gebruikers niet laden');
    } else {
      const loadedUsers = (usersResponse.data ?? []) as BuddyUser[];
      console.log('BUDDIES_PROFILES_QUERY_RESULT', loadedUsers);
      console.log('BUDDIES_FILTERED_USERS_SHOWN', {
        currentUserId: session.user.id,
        userIds: loadedUsers.map((userItem) => userItem.id),
      });
      setBuddyUsers(loadedUsers);
    }

    if (followsResponse.error) {
      console.error('BUDDIES_FOLLOWING_LOAD_ERROR', followsResponse.error);
      setBuddiesError('Kon buddies niet laden');
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
      setBuddiesError('Kon volgverzoeken niet laden');
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
          setBuddiesError('Kon aanvragers niet laden');
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
    if (!session?.user.id || userIdToFollow === session.user.id) {
      return;
    }

    const payload = {
      follower_id: session.user.id,
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
      setBuddiesError('Volgen mislukt');
      return;
    }

    console.log('BUDDIES_FOLLOW_SUCCESS', payload);
    setBuddyActionUserId(null);
    await fetchBuddiesData();
  };

  const handleUnfollowUser = async (userIdToUnfollow: string) => {
    if (!session?.user.id || userIdToUnfollow === session.user.id) {
      return;
    }

    const payload = {
      follower_id: session.user.id,
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
      .eq('follower_id', session.user.id)
      .eq('following_id', userIdToUnfollow);

    if (error) {
      console.error('BUDDIES_UNFOLLOW_ERROR', error);
      setFollowingUserIds((previous) => (previous.includes(userIdToUnfollow) ? previous : [...previous, userIdToUnfollow]));
      setOutgoingFollowStatusesByUserId((previous) => ({ ...previous, [userIdToUnfollow]: 'accepted' }));
      setBuddyActionUserId(null);
      setBuddiesError('Ontvolgen mislukt');
      return;
    }

    console.log('BUDDIES_UNFOLLOW_SUCCESS', payload);
    setBuddyActionUserId(null);
    await fetchBuddiesData();
  };

  const handleAcceptFollowRequest = async (requestItem: FollowRequestItem) => {
    if (!session?.user.id) {
      return;
    }

    const payload = {
      id: requestItem.id,
      follower_id: requestItem.follower_id,
      following_id: session.user.id,
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
      setBuddiesError('Accepteren mislukt');
      setFollowRequestActionId(null);
      return;
    }

    console.log('BUDDIES_ACCEPT_SUCCESS', payload);
    setFollowRequestActionId(null);
    await fetchBuddiesData();
  };

  const handleRejectFollowRequest = async (requestItem: FollowRequestItem) => {
    if (!session?.user.id) {
      return;
    }

    const payload = {
      id: requestItem.id,
      follower_id: requestItem.follower_id,
      following_id: session.user.id,
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
      setBuddiesError('Afwijzen mislukt');
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
      console.error('Profiel ophalen mislukt:', error);
    } else {
      setProfile(data ?? null);
    }

    if (showLoader) {
      setLoadingProfile(false);
    }

    return data ?? null;
  };

  const mapSessionStatus = (status: string): SessionStatus => {
    if (status === 'Ik ben geweest') {
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

  const fetchSpotDefinitions = async () => {
    const { data, error } = await supabase
      .from('spots')
      .select('*');

    if (error) {
      console.error('Spots ophalen mislukt, fallback naar lokale spots:', error);
      return;
    }

    const mappedSpots = (data ?? [])
      .map((row) => {
        const spotName = (row.spot_name ?? row.name ?? row.spot ?? '').toString().trim();
        const latitudeValue = Number(row.latitude ?? row.lat ?? null);
        const longitudeValue = Number(row.longitude ?? row.lng ?? row.lon ?? null);
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
      console.warn('Spots tabel leeg of onleesbaar, fallback naar lokale spots');
      return;
    }

    console.log('SPOTS_SOURCE_LOADED', { source: 'supabase_spots', count: mappedSpots.length });
    setSpotDefinitions(mappedSpots);
  };

  const fetchSharedData = async () => {
    setLoadingData(true);

    const [sessionsResponse, messagesResponse] = await Promise.all([
      supabase
        .from('sessions')
        .select('id, spot_name, user_id, user_name, user_avatar_url, start_time, end_time, status, created_at, checked_in_at, checked_out_at')
        .in('spot_name', [...spotNames])
        .order('created_at', { ascending: true }),
      supabase
        .from('messages')
        .select('id, spot_name, user_id, user_name, user_avatar_url, text, created_at')
        .in('spot_name', [...spotNames])
        .order('created_at', { ascending: true }),
    ]);

    if (sessionsResponse.error) {
      console.error('Sessies ophalen mislukt:', sessionsResponse.error);
    } else {
      const nextSessionsBySpot = createSpotRecord<SpotSession[]>(spotNames, () => []);

      for (const row of sessionsResponse.data) {
        const spot = row.spot_name as SpotName;
        if (!spotNames.includes(spot)) {
          continue;
        }

        nextSessionsBySpot[spot].push({
          id: row.id,
          spot,
          start: row.start_time.slice(0, 5),
          end: row.end_time.slice(0, 5),
          status: mapSessionStatus(row.status),
          createdAt: row.created_at,
          checkedInAt: row.checked_in_at,
          checkedOutAt: row.checked_out_at,
          userId: row.user_id,
          userName: row.user_name,
          userAvatarUrl: row.user_avatar_url,
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
          checkedInAt: item.checkedInAt,
          checkedOutAt: item.checkedOutAt,
        })),
        live: loadedSessions.filter((item) => isLiveSession(item)).map((item) => ({
          id: item.id,
          spot: item.spot,
          start: item.start,
          end: item.end,
          checkedInAt: item.checkedInAt,
          checkedOutAt: item.checkedOutAt,
        })),
      });

      setSessionsBySpot(nextSessionsBySpot);
    }

    if (messagesResponse.error) {
      console.error('Berichten ophalen mislukt:', messagesResponse.error);
    } else {
      const nextMessagesBySpot = createSpotRecord<ChatMessage[]>(spotNames, () => []);

      for (const row of messagesResponse.data) {
        const spot = row.spot_name as SpotName;
        if (!spotNames.includes(spot)) {
          continue;
        }

        nextMessagesBySpot[spot].push({
          id: row.id,
          text: row.text,
          userId: row.user_id,
          userName: row.user_name,
          userAvatarUrl: row.user_avatar_url,
          createdAt: row.created_at,
        });
      }

      setMessagesBySpot(nextMessagesBySpot);
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
      setSession(nextSession);
      setLoadingSession(false);

      if (nextSession) {
        void fetchSpotDefinitions();
        void fetchProfile(nextSession.user.id);
        void fetchSharedData();
      } else {
        setProfile(null);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCurrentUserId(nextSession?.user.id ?? null);

      if (!nextSession) {
        setProfile(null);
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

  useEffect(() => {
    if (showProfile && profile) {
      setProfileNameInput(profile.display_name);
    }
  }, [showProfile, profile]);

  useEffect(() => {
    if (!showBuddies || !session?.user.id) {
      return;
    }

    void fetchBuddiesData();
  }, [showBuddies, session?.user.id]);

  useEffect(() => {
    if (!session?.user.id) {
      setFollowingUserIds([]);
      return;
    }

    void (async () => {
      const { data, error } = await supabase
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', session.user.id)
        .eq('status', 'accepted');

      if (error) {
        console.error('TIMELINE_FOLLOWING_USERS_LOAD_ERROR', error);
        return;
      }

      setFollowingUserIds((data ?? []).map((item) => item.following_id));
    })();
  }, [session?.user.id]);

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
    if (!session?.user.id) {
      return;
    }

    void registerForPushNotifications(session.user.id).catch((error: unknown) => {
      console.error('Push registration failed:', error);
    });
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user.id || spotNames.length === 0) {
      return;
    }

    void fetchSharedData();
  }, [session?.user.id, spotNames]);

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
      if (!selectedSpot || !session?.user.id) {
        setSpotNotificationPreferences(defaultSpotNotificationPreferences);
        setNotificationPreferencesError('');
        setLoadingSpotNotificationPreferences(false);
        return;
      }

      setLoadingSpotNotificationPreferences(true);
      setNotificationPreferencesError('');
      console.log('NOTIFICATION_PREFS_LOAD_START', { userId: session.user.id, spotName: selectedSpot });

      const { data, error } = await supabase
        .from('spot_notification_preferences')
        .select(`
          session_planning_notification_mode,
          checkin_notification_mode,
          chat_notification_mode
        `)
        .eq('user_id', session.user.id)
        .eq('spot_name', selectedSpot)
        .maybeSingle();

      if (isCancelled) {
        return;
      }

      if (error) {
        console.error('Notificatievoorkeuren ophalen mislukt:', error);
        setSpotNotificationPreferences(defaultSpotNotificationPreferences);
        setNotificationPreferencesError('Kon meldingsvoorkeuren niet laden.');
        setLoadingSpotNotificationPreferences(false);
        return;
      }

      console.log('NOTIFICATION_PREFS_LOAD_SUCCESS', {
        userId: session.user.id,
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
        userId: session.user.id,
        spotName: selectedSpot,
        loadedPreferences,
      });
      setLoadingSpotNotificationPreferences(false);
    };

    void loadSpotNotificationPreferences();

    return () => {
      isCancelled = true;
    };
  }, [selectedSpot, session?.user.id]);

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

  useEffect(() => {
    let isCancelled = false;

    const resolveNearestSpot = async () => {
      setIsResolvingNearestSpot(true);

      try {
        const permissionResponse = await Location.requestForegroundPermissionsAsync();
        if (isCancelled) {
          return;
        }

        setLocationPermissionStatus(permissionResponse.status);
        if (permissionResponse.status !== 'granted') {
          setCurrentCoordinates(null);
          setNearestSpotResult(null);
          setIsResolvingNearestSpot(false);
          return;
        }

        const currentPosition = await Location.getCurrentPositionAsync({});
        if (isCancelled) {
          return;
        }

        const coordinates = {
          latitude: currentPosition.coords.latitude,
          longitude: currentPosition.coords.longitude,
        };

        setCurrentCoordinates(coordinates);
        const nearest = getNearestSpot(coordinates, spotDefinitions);
        setNearestSpotResult(nearest);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setCurrentCoordinates(null);
        setNearestSpotResult(null);
        console.error('Locatie ophalen mislukt:', error);
      } finally {
        if (!isCancelled) {
          setIsResolvingNearestSpot(false);
        }
      }
    };

    void resolveNearestSpot();

    return () => {
      isCancelled = true;
    };
  }, [session?.user.id, spotDefinitions]);

  useEffect(() => {
    console.log('HOME_NEAREST_SPOT_NAME', {
      nearestSpotName: nearestSpotResult?.spot ?? null,
      distanceMeters: nearestSpotResult?.distanceMeters ?? null,
    });
  }, [nearestSpotResult]);

  const sessions = selectedSpot ? sessionsBySpot[selectedSpot] : [];
  const messages = selectedSpot ? messagesBySpot[selectedSpot] : [];
  const areAnySpotNotificationsEnabled =
    spotNotificationPreferences.session_planning_notification_mode !== 'off'
    || spotNotificationPreferences.checkin_notification_mode !== 'off'
    || spotNotificationPreferences.chat_notification_mode !== 'off';
  const todaysSessionsBySpot = useMemo(() => {
    const next = createSpotRecord<SpotSession[]>(spotNames, () => []);
    for (const spot of spotNames) {
      next[spot] = sessionsBySpot[spot].filter((item) => isSessionCreatedToday(item));
    }
    return next;
  }, [sessionsBySpot, spotNames]);
  const allUserSessions = useMemo(() => {
    if (!session?.user.id) {
      return [];
    }

    return Object.values(sessionsBySpot)
      .flat()
      .filter((sessionItem) => sessionItem.userId === session.user.id);
  }, [session?.user.id, sessionsBySpot]);
  const activeCheckedInSession = useMemo(() => {
    const allSessions = Object.values(sessionsBySpot).flat();
    return getCurrentUserLiveSession(allSessions, session?.user.id);
  }, [session?.user.id, sessionsBySpot]);
  const blockingSession = useMemo(() => {
    if (allUserSessions.length === 0) {
      return null;
    }

    return (
      [...allUserSessions]
        .filter((sessionItem) => (sessionItem.status === 'Gaat' || sessionItem.status === 'Is er al'))
        .filter((sessionItem) => !sessionItem.checkedOutAt)
        .sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        })[0] ?? null
    );
  }, [allUserSessions]);
  const canPlanSession = !blockingSession;
  const isCheckedIn = Boolean(activeCheckedInSession);
  const hasPlannedSession = Boolean(
    blockingSession
      && blockingSession.status === 'Gaat'
      && !blockingSession.checkedInAt
      && !blockingSession.checkedOutAt,
  );
  const canCheckIn = !isCheckedIn && !hasPlannedSession;
  const canCheckOut = Boolean(activeCheckedInSession);
  const currentUserEditableSession = useMemo(() => {
    if (!session?.user.id || !selectedSpot) {
      return null;
    }

    return (
      [...sessions]
        .filter((sessionItem) => sessionItem.userId === session.user.id)
        .filter((sessionItem) => sessionItem.checkedOutAt === null)
        .filter((sessionItem) => hasPlannedTimeWindow(sessionItem))
        .filter((sessionItem) => !isDirectCheckIn(sessionItem))
        .sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        })[0] ?? null
    );
  }, [selectedSpot, session?.user.id, sessions]);
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
  const nearestSpotWithinRange = nearestSpotResult ? nearestSpotResult.distanceMeters <= CHECK_IN_RADIUS_METERS : false;
  const nearestSpotDistanceLabel = nearestSpotResult ? formatDistance(nearestSpotResult.distanceMeters) : null;
  useEffect(() => {
    if (!homeQuickCheckInError) {
      return;
    }

    if (!activeCheckedInSession || !quickCheckInWindowError || nearestSpotWithinRange) {
      setHomeQuickCheckInError('');
    }
  }, [activeCheckedInSession, homeQuickCheckInError, nearestSpotWithinRange, quickCheckInWindowError]);

  const homeSpotCards = useMemo<SpotDistanceInfo[]>(() => {
    const spotsWithDistance = spotDefinitions.map((spot) => ({
      spot: spot.spot,
      distanceMeters: currentCoordinates
        ? getDistanceMeters(currentCoordinates, {
          latitude: spot.latitude,
          longitude: spot.longitude,
        })
        : null,
    }));

    if (!currentCoordinates) {
      return spotsWithDistance;
    }

    return [...spotsWithDistance].sort((a, b) => {
      if (a.distanceMeters === null || b.distanceMeters === null) {
        return 0;
      }

      return a.distanceMeters - b.distanceMeters;
    });
  }, [currentCoordinates, spotDefinitions]);
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
    console.log('HOME_LIVE_SESSIONS_SOURCE', {
      totalSessions: homeLiveSessions.length,
      liveSessions: getLiveSessions(homeLiveSessions).map((sessionItem) => ({
        id: sessionItem.id,
        spot: sessionItem.spot,
        userId: sessionItem.userId,
        checkedInAt: sessionItem.checkedInAt,
        checkedOutAt: sessionItem.checkedOutAt,
      })),
    });
  }, [sessionsBySpot]);
  useEffect(() => {
    console.log('HOME_LIVE_COUNT_BY_SPOT', homeLiveCountBySpot);
  }, [homeLiveCountBySpot]);
  useEffect(() => {
    console.log('HOME_CURRENT_USER_LIVE_SESSION', {
      userId: session?.user.id ?? null,
      liveSessionId: activeCheckedInSession?.id ?? null,
      spot: activeCheckedInSession?.spot ?? null,
      checkedInAt: activeCheckedInSession?.checkedInAt ?? null,
      checkedOutAt: activeCheckedInSession?.checkedOutAt ?? null,
    });
  }, [activeCheckedInSession, session?.user.id]);
  useEffect(() => {
    console.log('ACTIVE_SESSION_LOAD', {
      activeCheckedInSessionId: activeCheckedInSession?.id ?? null,
      activeSpot: activeCheckedInSession?.spot ?? null,
      blockingSessionId: blockingSession?.id ?? null,
      blockingStatus: blockingSession?.status ?? null,
    });
  }, [activeCheckedInSession, blockingSession]);
  const newestFirstMessages = useMemo(
    () =>
      messages
        .filter((message) => isCreatedOnLocalDate(message.createdAt, currentLocalDateKey))
        .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      }),
    [currentLocalDateKey, messages],
  );

  const timelineSessions = useMemo(() => {
    const dedupedSessions = Array.from(new Map(sessions.map((item) => [item.id, item])).values());

    return dedupedSessions
      .filter((item) => isSessionCreatedToday(item))
      .filter((item) => {
        if (timelineFilter === 'buddies') {
          return followingUserIds.includes(item.userId);
        }
        return true;
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
  }, [followingUserIds, sessions, timelineFilter]);
  const openEmptyPlanningForm = () => {
    setEditingSessionId(null);
    setStartHour(null);
    setStartMinute(0);
    setEndHour(null);
    setEndMinute(0);
    setShowForm(true);
    setActivePicker(null);
    setFormError('');
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
        checkedInAt: item.checkedInAt,
      })),
      liveSessions: sessions.filter((item) => isLiveSession(item)).map((item) => ({
        id: item.id,
        start: item.start,
        end: item.end,
        checkedInAt: item.checkedInAt,
      })),
      timelineSessions: timelineSessions.map(({ item, state }) => ({
        id: item.id,
        status: item.status,
        timelineState: state,
        start: item.start,
        end: item.end,
        checkedInAt: item.checkedInAt,
      })),
    });
  }, [selectedSpot, sessions, timelineSessions]);
  const liveCheckedInSessions = useMemo(
    () =>
      getLiveSessions(sessions)
        .sort((a, b) => {
          const aTime = a.checkedInAt ? new Date(a.checkedInAt).getTime() : 0;
          const bTime = b.checkedInAt ? new Date(b.checkedInAt).getTime() : 0;
          return bTime - aTime;
        }),
    [sessions],
  );
  const liveKiterCountLabel = `${liveCheckedInSessions.length} ${liveCheckedInSessions.length === 1 ? 'kiter' : 'kiters'} nu op de spot`;
  const getSessionPersistenceErrorMessage = (error: {
    code?: string;
    message?: string;
    details?: string;
  } | null | undefined, fallbackMessage: string) => {
    if (!error) {
      return fallbackMessage;
    }

    if (error.code === '23505') {
      return 'Je hebt al een sessie op dit tijdstip';
    }

    if (error.code === '23P01') {
      return 'Je hebt al een overlappende sessie op deze spot';
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
    user_name: string;
    user_avatar_url: string | null;
    start_time: string;
    end_time: string;
    status: 'Gaat';
    checked_in_at: null;
    checked_out_at: null;
  }) => supabase
    .from('sessions')
    .insert(payload)
    .select('id, spot_name, start_time, end_time, checked_in_at, checked_out_at, status, user_id')
    .single();

  const saveSpotNotificationPreferences = async (nextPreferences: SpotNotificationPreferences, preferenceKey: 'sessionPlanning' | 'checkin' | 'chat') => {
    if (!selectedSpot || !session?.user.id) {
      return false;
    }

    console.log('NOTIFICATION_MODE_SAVE_START', {
      userId: session.user.id,
      spotName: selectedSpot,
      preferenceKey,
      nextPreferences,
    });
    setSavingNotificationPreferenceKey(preferenceKey);
    setNotificationPreferencesError('');
    const savePayload = {
      user_id: session.user.id,
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
      userId: session.user.id,
      spotName: selectedSpot,
      preferenceKey,
      error: error ?? null,
    });

    setSavingNotificationPreferenceKey(null);

    if (error) {
      console.error('Notificatievoorkeur opslaan mislukt:', error);
      setNotificationPreferencesError('Opslaan van meldingsvoorkeuren is mislukt.');
      return false;
    }

    console.log('NOTIFICATION_MODE_SAVE_SUCCESS', {
      userId: session.user.id,
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
  }): Promise<{ ok: true } | { ok: false; reason: string; error?: unknown }> => {
    const { data } = await supabase.auth.getUser();
    const authUserId = data.user?.id;
    if (!authUserId || !session?.user.id || !profile) {
      return { ok: false, reason: 'missing_auth_or_profile' };
    }

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
    const deleteGhostSessionsForUser = async (userId: string) => {
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

    const latestOpenSession = latestOpenSessionResponse.data;
    if (latestOpenSession?.status === 'Is er al') {
      if (normalizeSpotName(latestOpenSession.spot_name) === normalizeSpotName(canonicalSpot)) {
        return { ok: false, reason: 'already_checked_in_same_spot' };
      }

      return { ok: false, reason: `already_checked_in_other_spot:${latestOpenSession.spot_name}` };
    }

    if (latestOpenSession?.status === 'Gaat') {
      if (normalizeSpotName(latestOpenSession.spot_name) !== normalizeSpotName(canonicalSpot)) {
        return { ok: false, reason: 'planned_session_other_spot' };
      }

      const updatePayload = {
        status: 'Is er al',
        checked_in_at: nowIso,
        checked_out_at: null,
      } as const;
      console.log('SPOT_PAGE_CHECKIN_PAYLOAD', { mode: 'update', sessionId: latestOpenSession.id, payload: updatePayload, source });
      if (source === 'home_quick') {
        console.log('HOME_QUICK_CHECKIN_PAYLOAD_USED', { mode: 'update', sessionId: latestOpenSession.id, payload: updatePayload, spot: canonicalSpot });
      }
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
      return { ok: true };
    }

    await deleteGhostSessionsForUser(authUserId);

    const insertPayload = {
      spot_name: canonicalSpot,
      user_id: session.user.id,
      user_name: profile.display_name,
      user_avatar_url: profile.avatar_url,
      start_time: getNowLocalHourMinute(),
      end_time: getQuickCheckInEndTime(),
      status: 'Is er al',
      checked_in_at: nowIso,
      checked_out_at: null,
    };
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
    return { ok: true };
  };
  const mapCheckInFailureToMessage = (reason: string) => {
    if (reason === 'already_checked_in_same_spot') {
      return 'Je bent al ingecheckt';
    }
    if (reason.startsWith('already_checked_in_other_spot:')) {
      const spotName = reason.split(':')[1] ?? '';
      return `Je bent al ingecheckt bij ${spotName}`;
    }
    if (reason === 'planned_session_other_spot' || reason === 'unique_constraint_live_session') {
      return 'Rond eerst je huidige sessie af';
    }
    return 'Inchecken is mislukt. Probeer opnieuw.';
  };
  const handleCheckInWithSharedFlow = async ({
    spot,
    source,
  }: {
    spot: SpotName;
    source: 'spot_page' | 'home_quick';
  }): Promise<string | null> => {
    console.log('CHECKIN_SHARED_FLOW_SPOT_USED', { source, spot });
    const checkInResult = await runCheckInFlowForSpot({ spot, source });
    if (!checkInResult.ok) {
      const failureResult = checkInResult as { ok: false; reason: string; error?: unknown };
      const failureReason = failureResult.reason;
      const failureError = failureResult.error ?? null;
      console.log('CHECKIN_SHARED_FLOW_ERROR_RESULT', { source, spot, reason: failureReason, error: failureError });
      return mapCheckInFailureToMessage(failureReason);
    }

    console.log('CHECKIN_SHARED_FLOW_SUCCESS_RESULT', { source, spot });
    return null;
  };

  const handleUpdateSessionStatus = async (status: SessionStatus) => {
    setSessionActionError('');
    const actionLabel = status === 'Is er al' ? 'SPOT_PAGE_CHECKIN' : 'SPOT_PAGE_CHECKOUT';
    console.log(`${actionLabel}_BUTTON_PRESSED`, { selectedSpot, status });

    const { data } = await supabase.auth.getUser();
    const authUserId = data.user?.id;
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
        setSessionActionError('Je bent te ver van de spot (>1km)');
        return;
      }
      const errorMessage = await handleCheckInWithSharedFlow({ spot: selectedSpot, source: 'spot_page' });
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
      setSessionActionError('Uitchecken is mislukt. Probeer opnieuw.');
      return;
    }

    const checkedInSession = latestOpenSessionResponse.data?.status === 'Is er al' ? latestOpenSessionResponse.data : null;
    if (!checkedInSession) {
      setSessionActionError('Check eerst in');
      return;
    }

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
      setSessionActionError('Uitchecken is mislukt. Probeer opnieuw.');
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
    setEditingSessionId(null);
    setFormError('');
  };

  const handleQuickCheckIn = async (spot: SpotName) => {
    console.log('HOME_QUICK_CHECKIN_PRESSED', { spot, activeCheckedInSessionId: activeCheckedInSession?.id ?? null });
    setHomeQuickCheckInError('');

    if (quickCheckInWindowError) {
      setHomeQuickCheckInError(quickCheckInWindowError);
      console.log('HOME_QUICK_CHECKIN_RESULT', { ok: false, reason: 'outside_window', quickCheckInWindowError });
      return;
    }

    if (!session?.user.id || !profile) {
      return;
    }
    const isPressedSpotWithinRange = Boolean(
      nearestSpotResult
      && normalizeSpotName(nearestSpotResult.spot) === normalizeSpotName(spot)
      && nearestSpotResult.distanceMeters <= CHECK_IN_RADIUS_METERS,
    );
    if (!isPressedSpotWithinRange) {
      setHomeQuickCheckInError('Je bent te ver van de spot (>1km)');
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
    const checkInErrorMessage = await handleCheckInWithSharedFlow({ spot, source: 'home_quick' });
    setQuickCheckInSpotInFlight(null);

    if (checkInErrorMessage) {
      setHomeQuickCheckInError(checkInErrorMessage);
      console.log('HOME_QUICK_CHECKIN_ERROR_RESULT', { spot, error: checkInErrorMessage });
      console.log('HOME_QUICK_CHECKIN_RESULT', { ok: false, spot, reason: checkInErrorMessage });
      return;
    }

    setHomeQuickCheckInError('');
    console.log('HOME_QUICK_CHECKIN_SUCCESS_RESULT', { spot });
    console.log('HOME_QUICK_CHECKIN_RESULT', { ok: true, spot });
  };

  const handleQuickCheckOut = async () => {
    console.log('HOME_QUICK_CHECKOUT_PRESSED', { activeCheckedInSessionId: activeCheckedInSession?.id ?? null });
    setHomeQuickCheckInError('');

    if (!session?.user.id) {
      return;
    }

    if (!activeCheckedInSession) {
      setHomeQuickCheckInError('Check eerst in');
      console.log('HOME_QUICK_CHECKOUT_RESULT', { ok: false, reason: 'no_live_session' });
      return;
    }

    setHomeQuickCheckOutInFlight(true);
    const result = await supabase
      .from('sessions')
      .update({
        status: 'Uitchecken',
        checked_out_at: new Date().toISOString(),
      })
      .eq('id', activeCheckedInSession.id)
      .eq('user_id', session.user.id);

    setHomeQuickCheckOutInFlight(false);

    if (result.error) {
      console.log('HOME_QUICK_CHECKOUT_FAILURE', { error: result.error, activeCheckedInSessionId: activeCheckedInSession.id });
      setHomeQuickCheckInError('Uitchecken is mislukt. Probeer opnieuw.');
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
        <Text style={{ color: theme.text }}>Laden...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <AuthScreen onSignupSuccess={() => {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          void fetchProfile(data.session.user.id);
          void fetchSharedData();
        }
      });
    }} />;
  }

  if (!profile) {
    return <NameSetupScreen userId={session.user.id} onSaved={setProfile} />;
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

            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', marginTop: 16 }}>Volgverzoeken</Text>
            {incomingFollowRequests.length === 0 ? (
              <Text style={{ color: theme.textSoft, marginTop: 8 }}>Geen open volgverzoeken</Text>
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
                        {requestItem.requester?.display_name ?? 'Onbekende gebruiker'}
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
                          <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '700' }}>Accepteren</Text>
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
                          <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '700' }}>Afwijzen</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', marginTop: 16 }}>Ik volg</Text>
            {followedUsers.length === 0 ? (
              <Text style={{ color: theme.textSoft, marginTop: 8 }}>Je volgt nog niemand</Text>
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

            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', marginTop: 16 }}>Volgers</Text>
            {followerUsers.length === 0 ? (
              <Text style={{ color: theme.textSoft, marginTop: 8 }}>Je hebt nog geen volgers</Text>
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

            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', marginTop: 18 }}>Alle gebruikers</Text>
            <TextInput
              value={searchUsersInput}
              onChangeText={setSearchUsersInput}
              placeholder="Zoek gebruikers"
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
            {loadingBuddies ? <Text style={{ color: theme.textSoft, marginTop: 8 }}>Laden...</Text> : null}
            {buddiesError ? <Text style={{ color: '#ff7e7e', marginTop: 8 }}>{buddiesError}</Text> : null}
            <View style={{ marginTop: 10 }}>
              {filteredBuddyUsers.map((userItem) => {
                const followStatus = outgoingFollowStatusesByUserId[userItem.id];
                const isFollowed = followStatus === 'accepted';
                const isPending = followStatus === 'pending';
                const isActionInFlight = buddyActionUserId === userItem.id;
                const actionLabel = isPending ? 'Aangevraagd' : isFollowed ? 'Ontvolgen' : 'Volgverzoek sturen';

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
              <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Terug</Text>
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
        setProfileEditError("Geef toegang tot je foto's om een profielfoto te kiezen");
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
        setProfileEditError('Naam is verplicht');
        return;
      }

      if (trimmedName.length < 2) {
        setProfileEditError('Naam moet minimaal 2 tekens zijn');
        return;
      }

      if (trimmedName.length > 20) {
        setProfileEditError('Naam mag maximaal 20 tekens zijn');
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
        setProfileEditError('Deze naam is al bezet');
        return;
      }

      let avatarUrl = profile.avatar_url;
      if (profileAvatarInputUri) {
        const { error: uploadError, publicUrl } = await uploadAvatar(session.user.id, profileAvatarInputUri);
        if (uploadError) {
          setIsSavingProfile(false);
          setProfileEditError('Foto uploaden mislukt');
          return;
        }
        if (!publicUrl) {
          setIsSavingProfile(false);
          setProfileEditError('Avatar URL ontbreekt');
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
          setProfileEditError('Deze naam is al bezet');
          return;
        }
        if (updateError.code === '42501') {
          setProfileEditError('Je profiel mag niet worden bijgewerkt');
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
              <Text style={{ color: theme.textSoft, marginTop: 4 }}>Ingelogd</Text>
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
            <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Foto wijzigen</Text>
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
              {isSavingProfile ? 'Opslaan...' : 'Opslaan'}
            </Text>
          </Pressable>

          <Pressable onPress={() => {
            setShowProfile(false);
            setShowBuddies(true);
          }} style={{ marginTop: 10, backgroundColor: theme.bgElevated, borderRadius: 10, padding: 12 }}>
            <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Buddies</Text>
          </Pressable>

          <Pressable onPress={() => {
            resetFlow();
            void supabase.auth.signOut();
          }} style={{ marginTop: 16, backgroundColor: theme.bgElevated, borderRadius: 10, padding: 12 }}>
            <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Uitloggen</Text>
          </Pressable>

          <Pressable onPress={() => {
            setShowProfile(false);
            setProfileAvatarInputUri(null);
            setProfileEditError('');
          }} style={{ marginTop: 10, backgroundColor: theme.bgElevated, borderRadius: 10, padding: 12 }}>
            <Text style={{ color: theme.text, textAlign: 'center', fontWeight: '600' }}>Terug</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (selectedSpot) {
    const handleJoinTimelineSession = async (sessionToJoin: SpotSession) => {
      if (!session?.user.id || !profile) {
        const errorMessage = 'Sessie kon niet worden opgeslagen';
        setSessionActionError(errorMessage);
        console.log('SPOT_PAGE_JOIN_ABORTED_MISSING_AUTH_OR_PROFILE', {
          selectedSourceSession: sessionToJoin,
          currentUserId: session?.user.id ?? null,
          spot_name: sessionToJoin.spot,
          start_time: sessionToJoin.start,
          end_time: sessionToJoin.end,
          hasProfile: Boolean(profile),
          reason: errorMessage,
        });
        return;
      }

      const exactSpotName = sessionToJoin.spot;
      const exactStartTime = sessionToJoin.start;
      const exactEndTime = sessionToJoin.end;
      const sessionsForCurrentUserDuplicateCheck = sessions.filter((existingSession) => existingSession.userId === session.user.id);
      const exactDuplicateMatches = sessionsForCurrentUserDuplicateCheck.filter((existingSession) => (
        existingSession.spot === exactSpotName
        && existingSession.start === exactStartTime
        && existingSession.end === exactEndTime
      ));
      console.log('SPOT_PAGE_JOIN_EXACT_DUPLICATE_CHECK', {
        selectedSourceSession: sessionToJoin,
        currentUserId: session.user.id,
        clickedSessionOwnerUserId: sessionToJoin.userId,
        spot_name: exactSpotName,
        start_time: exactStartTime,
        end_time: exactEndTime,
        sessionsForCurrentUserDuplicateCheck: sessionsForCurrentUserDuplicateCheck.map((match) => ({
          id: match.id,
          spot: match.spot,
          userId: match.userId,
          start: match.start,
          end: match.end,
          checkedOutAt: match.checkedOutAt,
          status: match.status,
        })),
        exactDuplicateCount: exactDuplicateMatches.length,
        exactDuplicateMatches: exactDuplicateMatches.map((match) => ({
          id: match.id,
          spot: match.spot,
          userId: match.userId,
          start: match.start,
          end: match.end,
          checkedOutAt: match.checkedOutAt,
          status: match.status,
        })),
      });
      if (exactDuplicateMatches.length > 0) {
        const errorReason = 'Je hebt al een sessie op dit tijdstip';
        setSessionActionError(errorReason);
        console.log('SPOT_PAGE_JOIN_BLOCKED_EXACT_DUPLICATE', {
          selectedSourceSession: sessionToJoin,
          currentUserId: session.user.id,
          clickedSessionOwnerUserId: sessionToJoin.userId,
          spot_name: exactSpotName,
          start_time: exactStartTime,
          end_time: exactEndTime,
          exactDuplicateCount: exactDuplicateMatches.length,
          exactErrorReasonShownToUI: errorReason,
        });
        return;
      }

      const joinPayload = {
        spot_name: exactSpotName,
        user_id: session.user.id,
        user_name: profile.display_name,
        user_avatar_url: profile.avatar_url,
        start_time: exactStartTime,
        end_time: exactEndTime,
        status: 'Gaat' as const,
        checked_in_at: null,
        checked_out_at: null,
      };
      console.log('SPOT_PAGE_JOIN_INSERT_ATTEMPT', {
        selectedSourceSession: sessionToJoin,
        currentUserId: session.user.id,
        clickedSessionOwnerUserId: sessionToJoin.userId,
        spot_name: exactSpotName,
        start_time: exactStartTime,
        end_time: exactEndTime,
        joinPayload,
      });
      const joinResult = await createPlannedSession(joinPayload);
      if (joinResult.error) {
        const errorMessage = getSessionPersistenceErrorMessage(joinResult.error, 'Sessie kon niet worden opgeslagen');
        setSessionActionError(errorMessage);
        console.log('SPOT_PAGE_JOIN_ERROR', {
          selectedSourceSession: sessionToJoin,
          currentUserId: session.user.id,
          clickedSessionOwnerUserId: sessionToJoin.userId,
          spot_name: exactSpotName,
          start_time: exactStartTime,
          end_time: exactEndTime,
          sessionsForCurrentUserDuplicateCheck,
          exactDuplicateCount: exactDuplicateMatches.length,
          exactDuplicateMatches,
          supabaseError: joinResult.error,
          joinPayload,
          exactErrorReasonShownToUI: errorMessage,
        });
        return;
      }

      console.log('SPOT_PAGE_JOIN_SUCCESS', { joinPayload, insertedSession: joinResult.data });
      await fetchSharedData();
      setSelectedTimelineSessionId(null);
      setSessionActionError('');
    };
    const handleSave = async () => {
      console.log('SPOT_PAGE_PLANNING_SAVE_PRESSED');
      console.log('SPOT_PAGE_PLANNING_SELECTED_SPOT', { selectedSpot });
      console.log('SPOT_PAGE_PLANNING_TIME_PAYLOAD', {
        startHour,
        startMinute,
        endHour,
        endMinute,
      });

      if (startHour === null) {
        setFormError('Kies eerst een starttijd.');
        return;
      }

      if (endHour === null) {
        setFormError('Kies eerst een eindtijd.');
        return;
      }

      const startTotalMinutes = startHour * 60 + startMinute;
      const endTotalMinutes = endHour * 60 + endMinute;
      if (startTotalMinutes < timelineStartMinutes) {
        setFormError('Je kunt pas vanaf 08:00 plannen');
        return;
      }

      if (endTotalMinutes > timelineEndMinutes) {
        setFormError('Je kunt niet later dan 21:00 plannen');
        return;
      }

      if (endTotalMinutes <= startTotalMinutes) {
        setFormError('Eindtijd moet later zijn dan starttijd');
        return;
      }

      if (!editingSessionId && startTotalMinutes < currentLocalMinutes) {
        setFormError('Starttijd kan niet eerder zijn dan nu.');
        return;
      }

      console.log('BLOCKING_SESSION', blockingSession);
      if (!editingSessionId && blockingSession) {
        setFormError('Rond eerst je huidige sessie af');
        return;
      }

      if (!session?.user.id || !profile) {
        setFormError('Sessie plannen is mislukt. Probeer opnieuw.');
        console.log('SPOT_PAGE_PLANNING_SAVE_ERROR', {
          reason: 'missing_auth_or_profile',
          selectedSpot,
          hasSessionUserId: Boolean(session?.user.id),
          hasProfile: Boolean(profile),
        });
        return;
      }

      const payload = {
        spot_name: selectedSpot,
        user_id: session.user.id,
        user_name: profile.display_name,
        user_avatar_url: profile.avatar_url,
        start_time: `${formatTimePart(startHour)}:${formatTimePart(startMinute)}`,
        end_time: `${formatTimePart(endHour)}:${formatTimePart(endMinute)}`,
        status: 'Gaat' as const,
        checked_in_at: null,
        checked_out_at: null,
      };

      console.log('SPOT_PAGE_PLANNING_SAVE_PAYLOAD', payload);
      const result = editingSessionId
        ? await supabase
          .from('sessions')
          .update({
            start_time: payload.start_time,
            end_time: payload.end_time,
          })
          .eq('id', editingSessionId)
          .eq('user_id', session.user.id)
          .select('id, spot_name, start_time, end_time, checked_in_at, checked_out_at, status')
          .single()
        : await createPlannedSession(payload);
      if (result.error) {
        setFormError(getSessionPersistenceErrorMessage(result.error, 'Sessie plannen is mislukt. Probeer opnieuw.'));
        console.log('SPOT_PAGE_PLANNING_SAVE_ERROR', { error: result.error, payload, editingSessionId });
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
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 34 }}>
        <Pressable onPress={() => setSelectedSpot(null)} style={{ marginBottom: 18 }}>
          <Text style={{ color: theme.textSoft, fontSize: 15, letterSpacing: 0.2 }}>← Terug naar spots</Text>
        </Pressable>

        <View style={{ backgroundColor: theme.card, borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: theme.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1.3 }}>SPOT STATUS</Text>
              <Text style={{ color: theme.text, fontSize: 26, fontWeight: '700', marginTop: 6 }}>{selectedSpot}</Text>
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
              <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: '600' }}>Meldingen</Text>
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
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700', marginBottom: 10 }}>Meldingen voor deze spot</Text>

              {[
                {
                  key: 'sessionPlanning' as const,
                  label: 'Sessie gepland',
                  preferenceField: 'session_planning_notification_mode' as const,
                },
                {
                  key: 'checkin' as const,
                  label: 'Check-ins',
                  preferenceField: 'checkin_notification_mode' as const,
                },
                {
                  key: 'chat' as const,
                  label: 'Chatberichten',
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

          <Pressable
            disabled={!canPlanSession}
            onPress={() => {
              if (!canPlanSession) {
                setSessionActionError('Rond eerst je huidige sessie af');
                return;
              }
              openEmptyPlanningForm();
            }}
            style={{ marginTop: 14, ...primaryButtonStyle, opacity: canPlanSession ? 1 : 0.45 }}
          >
            <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>Sessie plannen</Text>
          </Pressable>
          {currentUserEditableSession ? (
            <Pressable
              onPress={() => {
                setEditingSessionId(currentUserEditableSession.id);
                const parsedStart = parseHourMinuteParts(currentUserEditableSession.start);
                const parsedEnd = parseHourMinuteParts(currentUserEditableSession.end);
                setStartHour(parsedStart.hour);
                setStartMinute(parsedStart.minute);
                setEndHour(parsedEnd.hour);
                setEndMinute(parsedEnd.minute);
                setShowForm(true);
                setActivePicker(null);
                setSessionActionError('');
                setFormError('');
              }}
              style={{ marginTop: 8, ...primaryButtonStyle, backgroundColor: '#1e3a8a' }}
            >
              <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>Aanpassen</Text>
            </Pressable>
          ) : null}
          {showForm ? <Text style={{ color: theme.textSoft, marginTop: 6 }}>Formulier open</Text> : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
            <Pressable
              disabled={!canCheckIn || !selectedSpotWithinCheckInRadius}
              onPress={() => {
                void handleUpdateSessionStatus('Is er al');
              }}
              style={{
                ...sessionActionButtonBaseStyle,
                backgroundColor: '#15803d',
                opacity: canCheckIn && selectedSpotWithinCheckInRadius ? 1 : 0.45,
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>Inchecken</Text>
            </Pressable>
            <Pressable
              disabled={!canCheckOut}
              onPress={() => {
                void handleUpdateSessionStatus('Uitchecken');
              }}
              style={{ ...sessionActionButtonBaseStyle, backgroundColor: '#7c2d12', opacity: canCheckOut ? 1 : 0.45 }}
            >
              <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>Uitchecken</Text>
            </Pressable>
          </View>

          {hasPlannedSession ? <Text style={{ color: theme.textSoft, marginTop: 6 }}>Je hebt al een actieve sessie</Text> : null}
          {canCheckIn && !selectedSpotWithinCheckInRadius ? (
            <Text style={{ color: theme.textMuted, marginTop: 6, fontSize: 13 }}>Je bent te ver van de spot (&gt;1km)</Text>
          ) : null}
          {sessionActionError ? <Text style={{ color: '#ff7e7e', fontSize: 14, marginTop: 8 }}>{sessionActionError}</Text> : null}

          {showForm ? (
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: theme.textSoft, fontSize: 14, marginBottom: 6 }}>Starttijd</Text>

              <View style={{ flexDirection: 'row', marginBottom: 6, gap: 8 }}>
                <Pressable onPress={() => { setActivePicker((prev) => (prev === 'startHour' ? null : 'startHour')); setFormError(''); }} style={{ flex: 1, backgroundColor: theme.bgElevated, borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ color: theme.text, fontSize: 15 }}>Uur: {startHour === null ? '--' : formatTimePart(startHour)}</Text>
                </Pressable>
                <Pressable onPress={() => { setActivePicker((prev) => (prev === 'startMinute' ? null : 'startMinute')); setFormError(''); }} style={{ flex: 1, backgroundColor: theme.bgElevated, borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ color: theme.text, fontSize: 15 }}>Minuut: {formatTimePart(startMinute)}</Text>
                </Pressable>
              </View>
              {activePicker === 'startHour' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                  {hours.filter((hour) => hour >= 8 && hour <= 20).map((hour) => (
                    <Pressable key={`start-hour-${hour}`} onPress={() => setStartHour(hour)} style={{ backgroundColor: startHour === hour ? theme.primary : theme.bgElevated, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}>
                      <Text style={{ color: theme.text }}>{formatTimePart(hour)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {activePicker === 'startMinute' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                  {minuteOptions.map((minute) => (
                    <Pressable key={`start-minute-${minute}`} onPress={() => setStartMinute(minute)} style={{ backgroundColor: startMinute === minute ? theme.primary : theme.bgElevated, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}>
                      <Text style={{ color: theme.text }}>{formatTimePart(minute)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <Text style={{ color: theme.textSoft, fontSize: 14, marginBottom: 6 }}>Eindtijd</Text>
              <View style={{ flexDirection: 'row', marginBottom: 6, gap: 8 }}>
                <Pressable onPress={() => { setActivePicker((prev) => (prev === 'endHour' ? null : 'endHour')); setFormError(''); }} style={{ flex: 1, backgroundColor: theme.bgElevated, borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ color: theme.text, fontSize: 15 }}>Uur: {endHour === null ? '--' : formatTimePart(endHour)}</Text>
                </Pressable>
                <Pressable onPress={() => { setActivePicker((prev) => (prev === 'endMinute' ? null : 'endMinute')); setFormError(''); }} style={{ flex: 1, backgroundColor: theme.bgElevated, borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ color: theme.text, fontSize: 15 }}>Minuut: {formatTimePart(endMinute)}</Text>
                </Pressable>
              </View>
              {activePicker === 'endHour' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                  {hours.filter((hour) => hour >= 8 && hour <= 21).map((hour) => (
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

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={handleSave} style={{ ...primaryButtonStyle, flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{editingSessionId ? 'Bijwerken' : 'Opslaan'}</Text>
                </Pressable>
                <Pressable onPress={resetForm} style={{ ...primaryButtonStyle, flex: 1, backgroundColor: theme.bgElevated }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>Annuleren</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: theme.border }}>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 6 }}>Nu op de spot</Text>

          {liveCheckedInSessions.length > 0 ? (
            <>
              <Text style={{ color: theme.textSoft, fontSize: 14, marginBottom: 10 }}>{liveKiterCountLabel}</Text>
              <View>
                {liveCheckedInSessions.map((liveSession) => (
                  <View key={`live-${liveSession.id}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 }} numberOfLines={1}>
                      {liveSession.userName}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                      {`ingecheckt om ${formatToHourMinute(liveSession.checkedInAt)}`}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={{ color: theme.textMuted, fontSize: 14 }}>Nog niemand op de spot</Text>
          )}
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: theme.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Sessies</Text>
            <View style={{ flexDirection: 'row', backgroundColor: theme.bgElevated, borderRadius: 999, borderWidth: 1, borderColor: theme.border, padding: 2 }}>
              {([
                { key: 'everyone' as const, label: 'Iedereen' },
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
            currentUserId={session?.user.id}
            currentLocalMinutes={currentLocalMinutes}
            timelineFilter={timelineFilter}
            onSelectSession={(sessionId) => setSelectedTimelineSessionId(sessionId)}
            onClearSelection={() => setSelectedTimelineSessionId(null)}
            onJoinSession={(sessionItem) => {
              void handleJoinTimelineSession(sessionItem);
            }}
          />
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: theme.border }}>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Chat</Text>

          <TextInput
            value={messageInput}
            onChangeText={setMessageInput}
            placeholder="Typ een bericht"
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.bgElevated, color: theme.text, borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 }}
          />
          <Pressable
            onPress={() => {
              void (async () => {
              const text = messageInput.trim();
              if (!text) {
                return;
              }

              const { error } = await supabase.from('messages').insert({
                spot_name: selectedSpot,
                user_id: session.user.id,
                user_name: profile.display_name,
                user_avatar_url: profile.avatar_url,
                text,
              });

              if (error) {
                console.error('Bericht opslaan mislukt:', error);
                return;
              }

              await fetchSharedData();
              setMessageInput('');
              })();
            }}
            style={{ backgroundColor: theme.primaryPressed, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, alignItems: 'center' }}
          >
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>Verstuur</Text>
          </Pressable>

          {newestFirstMessages.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              {newestFirstMessages.map((message) => (
                <View key={message.id} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
                  <Avatar uri={message.userAvatarUrl} size={24} />
                  <View style={{ marginLeft: 8, flex: 1, backgroundColor: theme.cardStrong, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }}>
                    <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 2 }}>
                      {message.userName} · {formatToHourMinute(message.createdAt)}
                    </Text>
                    <Text style={{ color: theme.text, fontSize: 15 }}>{message.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: theme.textSoft, fontSize: 15, marginTop: 12 }}>Nog geen berichten</Text>
          )}
        </View>


      </ScrollView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, paddingHorizontal: 20, paddingTop: 16 }}>
      <View style={{ marginBottom: 18, borderWidth: 1, borderColor: theme.border, borderRadius: 20, backgroundColor: theme.card, paddingHorizontal: 14, paddingVertical: 20, minHeight: 172, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Image
            source={require('./assets/logo.png')}
            style={{ width: 140, height: 140, marginRight: 18 }}
            resizeMode="contain"
          />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={{ color: theme.text, fontSize: 30, fontWeight: '800' }}>See who’s riding</Text>
            <Text style={{ color: theme.textSoft, fontSize: 16, fontWeight: '600', marginTop: 2 }}>Join the session</Text>
          </View>
        </View>
        <View style={{ marginLeft: 10 }}>
          <Pressable onPress={() => setShowProfile(true)} style={{ backgroundColor: theme.cardStrong, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.border }}>
            <Avatar uri={profile.avatar_url} size={24} />
            <Text style={{ color: theme.text, fontWeight: '600', marginLeft: 8 }}>{profile.display_name}</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowBuddies(true)}
            style={{ marginTop: 8, backgroundColor: theme.bgElevated, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.border }}
          >
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>Buddies</Text>
          </Pressable>
        </View>
      </View>

      <View>
        {homeQuickCheckInError ? <Text style={{ color: '#ff7e7e', marginBottom: 10 }}>{homeQuickCheckInError}</Text> : null}
        <View style={{ backgroundColor: theme.cardStrong, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, borderWidth: 1, borderColor: theme.border }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>Dichtstbijzijnde spot</Text>
          {isResolvingNearestSpot ? (
            <Text style={{ color: theme.textSoft, marginTop: 8 }}>Locatie ophalen...</Text>
          ) : nearestSpotResult && nearestSpotDistanceLabel ? (
            <>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', marginTop: 6 }}>{nearestSpotResult.spot}</Text>
              <Text style={{ color: theme.textSoft, marginTop: 2 }}>Afstand: {nearestSpotDistanceLabel}</Text>
              {activeCheckedInSession ? (
                <>
                  <Pressable
                    disabled={homeQuickCheckOutInFlight}
                    onPress={() => {
                      void handleQuickCheckOut();
                    }}
                    style={{
                      marginTop: 10,
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                      backgroundColor: '#7c2d12',
                      opacity: homeQuickCheckOutInFlight ? 0.45 : 1,
                    }}
                  >
                    <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>
                      {homeQuickCheckOutInFlight ? 'Uitchecken...' : 'Hier uitchecken'}
                    </Text>
                  </Pressable>
                  {activeCheckedInSession.spot !== nearestSpotResult.spot ? (
                    <Text style={{ color: theme.textMuted, marginTop: 8, fontSize: 13 }}>
                      Je bent ingecheckt bij {activeCheckedInSession.spot}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Pressable
                  disabled={!canQuickCheckIn || !nearestSpotWithinRange || quickCheckInSpotInFlight !== null}
                  onPress={() => {
                    void handleQuickCheckIn(nearestSpotResult.spot);
                  }}
                  style={{
                    marginTop: 10,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: '#15803d',
                    opacity: !canQuickCheckIn || !nearestSpotWithinRange || quickCheckInSpotInFlight !== null ? 0.45 : 1,
                  }}
                >
                  <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>
                    {quickCheckInSpotInFlight === nearestSpotResult.spot ? 'Inchecken...' : 'Hier inchecken'}
                  </Text>
                </Pressable>
              )}
              {!nearestSpotWithinRange ? (
                <Text style={{ color: theme.textMuted, marginTop: 8, fontSize: 13 }}>Je bent te ver van de spot (&gt;1km)</Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={{ color: theme.textSoft, marginTop: 8 }}>Geen spot in de buurt</Text>
              {locationPermissionStatus !== 'granted' ? (
                <Text style={{ color: theme.textMuted, marginTop: 6, fontSize: 13 }}>Locatietoegang is nodig om dichtbij te kunnen inchecken.</Text>
              ) : null}
            </>
          )}
        </View>
        {homeSpotCards.map(({ spot, distanceMeters }) => {
          const goingLaterCount = todaysSessionsBySpot[spot]?.filter((sessionItem) => isGoingLaterSession(sessionItem, currentLocalMinutes)).length ?? 0;
          const probablyThereCount = todaysSessionsBySpot[spot]?.filter((sessionItem) => isProbablyThereSession(sessionItem, currentLocalMinutes)).length ?? 0;
          const checkedInCount = homeLiveCountBySpot[spot] ?? 0;

          return (
            <Pressable
              key={spot}
              onPress={() => setSelectedSpot(spot)}
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
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}>{spot}</Text>
              <Text style={{ color: theme.textSoft, marginTop: 4, fontSize: 13 }}>
                Afstand: {distanceMeters === null ? 'Onbekend' : formatDistance(distanceMeters)}
              </Text>
              <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
                <View style={{ flex: 1, backgroundColor: theme.bgElevated, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>Gaat nog</Text>
                  <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700', marginTop: 2 }}>{goingLaterCount}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#0c2130', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 }}>
                  <Text style={{ color: '#83d8b0', fontSize: 12, fontWeight: '600' }}>Waarschijnlijk er</Text>
                  <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700', marginTop: 2 }}>{probablyThereCount}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#10271f', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 }}>
                  <Text style={{ color: '#6ee7b7', fontSize: 12, fontWeight: '600' }}>Ingecheckt</Text>
                  <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700', marginTop: 2 }}>{checkedInCount}</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
