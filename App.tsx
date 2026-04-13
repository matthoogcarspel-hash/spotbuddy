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
const mapLegacyEnabledToMode = (enabled: boolean | null | undefined): SpotNotificationMode => (enabled ? 'everyone' : 'off');
const toLegacyEnabled = (mode: SpotNotificationMode) => mode !== 'off';
const resolveNotificationMode = (
  mode: SpotNotificationMode | null | undefined,
  legacyEnabled: boolean | null | undefined,
): SpotNotificationMode => {
  if (mode === 'off' || mode === 'following' || mode === 'everyone') {
    return mode;
  }

  return mapLegacyEnabledToMode(legacyEnabled);
};
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
const nearbySpotThresholdMeters = 5000;
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

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [spotDefinitions, setSpotDefinitions] = useState<SpotDefinition[]>(fallbackSpots.map((spot) => ({ ...spot })));
  const [selectedSpot, setSelectedSpot] = useState<SpotName | null>(null);
  const [showProfile, setShowProfile] = useState(false);
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
  const [formError, setFormError] = useState('');
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

  const resetFlow = () => {
    setSelectedSpot(null);
    setShowProfile(false);
    setProfileNameInput('');
    setProfileAvatarInputUri(null);
    setProfileEditError('');
    setIsSavingProfile(false);
    setSessionsBySpot(createSpotRecord(spotNames, () => []));
    setMessagesBySpot(createSpotRecord(spotNames, () => []));
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
          chat_notification_mode,
          session_planning_notifications_enabled,
          checkin_notifications_enabled,
          chat_notifications_enabled
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
        preferences: data,
      });
      setSpotNotificationPreferences({
        session_planning_notification_mode: resolveNotificationMode(
          data?.session_planning_notification_mode,
          data?.session_planning_notifications_enabled,
        ),
        checkin_notification_mode: resolveNotificationMode(
          data?.checkin_notification_mode,
          data?.checkin_notifications_enabled,
        ),
        chat_notification_mode: resolveNotificationMode(
          data?.chat_notification_mode,
          data?.chat_notifications_enabled,
        ),
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
    if (allUserSessions.length === 0) {
      return null;
    }

    return (
      [...allUserSessions]
        .filter((sessionItem) => sessionItem.status === 'Is er al')
        .filter((sessionItem) => !sessionItem.checkedOutAt)
        .sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        })[0] ?? null
    );
  }, [allUserSessions]);
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
  const isCheckedIn = Boolean(activeCheckedInSession && !activeCheckedInSession.checkedOutAt);
  const hasPlannedSession = Boolean(
    blockingSession
      && blockingSession.status === 'Gaat'
      && !blockingSession.checkedInAt
      && !blockingSession.checkedOutAt,
  );
  const canCheckIn = !isCheckedIn && !hasPlannedSession;
  const canCheckOut = Boolean(
    activeCheckedInSession
      && activeCheckedInSession.status === 'Is er al',
  );
  const quickCheckInWindowError = getQuickCheckInWindowError(currentLocalMinutes);
  const canQuickCheckIn = !blockingSession && !quickCheckInWindowError;
  const nearestSpotWithinRange = nearestSpotResult ? nearestSpotResult.distanceMeters <= nearbySpotThresholdMeters : false;
  const nearestSpotDistanceLabel = nearestSpotResult ? formatDistance(nearestSpotResult.distanceMeters) : null;
  useEffect(() => {
    if (!homeQuickCheckInError) {
      return;
    }

    if (!blockingSession || !quickCheckInWindowError || nearestSpotWithinRange) {
      setHomeQuickCheckInError('');
    }
  }, [blockingSession, homeQuickCheckInError, nearestSpotWithinRange, quickCheckInWindowError]);

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

  const timelineSessions = useMemo(() => sessions
    .filter((item) => {
      if (!isSessionCreatedToday(item)) {
        return false;
      }

      if (item.status !== 'Gaat' && item.status !== 'Is er al') {
        return false;
      }

      const directCheckIn = isDirectCheckIn(item);
      const checkInMinutes = getLocalMinutesFromIso(item.checkedInAt);
      if (directCheckIn) {
        if (checkInMinutes === null || checkInMinutes < timelineStartMinutes || checkInMinutes > timelineEndMinutes) {
          return false;
        }

        return true;
      }

      const startMinutes = toMinutes(item.start);
      const endMinutes = toMinutes(item.end);

      if (startMinutes < timelineStartMinutes || endMinutes > timelineEndMinutes) {
        return false;
      }

      if (endMinutes <= startMinutes) {
        return false;
      }

      if (currentLocalMinutes >= endMinutes) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      const aDirectCheckIn = isDirectCheckIn(a);
      const bDirectCheckIn = isDirectCheckIn(b);
      const aMinutes = aDirectCheckIn ? (getLocalMinutesFromIso(a.checkedInAt) ?? toMinutes(a.start)) : toMinutes(a.start);
      const bMinutes = bDirectCheckIn ? (getLocalMinutesFromIso(b.checkedInAt) ?? toMinutes(b.start)) : toMinutes(b.start);
      return aMinutes - bMinutes;
    }), [currentLocalMinutes, sessions]);
  const liveCheckedInSessions = useMemo(
    () =>
      sessions
        .filter((sessionItem) => Boolean(sessionItem.checkedInAt) && !sessionItem.checkedOutAt)
        .sort((a, b) => {
          const aTime = a.checkedInAt ? new Date(a.checkedInAt).getTime() : 0;
          const bTime = b.checkedInAt ? new Date(b.checkedInAt).getTime() : 0;
          return bTime - aTime;
        }),
    [sessions],
  );
  const liveKiterCountLabel = `${liveCheckedInSessions.length} ${liveCheckedInSessions.length === 1 ? 'kiter' : 'kiters'} nu op de spot`;

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

    const { error } = await supabase
      .from('spot_notification_preferences')
      .upsert(
        {
          user_id: session.user.id,
          spot_name: selectedSpot,
          session_planning_notification_mode: nextPreferences.session_planning_notification_mode,
          checkin_notification_mode: nextPreferences.checkin_notification_mode,
          chat_notification_mode: nextPreferences.chat_notification_mode,
          session_planning_notifications_enabled: toLegacyEnabled(nextPreferences.session_planning_notification_mode),
          checkin_notifications_enabled: toLegacyEnabled(nextPreferences.checkin_notification_mode),
          chat_notifications_enabled: toLegacyEnabled(nextPreferences.chat_notification_mode),
        },
        {
          onConflict: 'user_id,spot_name',
        },
      );

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
      if (!selectedSpot || !session?.user.id || !profile) {
        console.warn('SPOT_PAGE_CHECKIN_MISSING_SPOT_NAME', { selectedSpot, hasSession: Boolean(session?.user.id), hasProfile: Boolean(profile) });
        return;
      }
      const canonicalSelectedSpot =
        spotDefinitions.find((spot) => normalizeSpotName(spot.spot) === normalizeSpotName(selectedSpot))?.spot
        ?? selectedSpot;
      if (!canonicalSelectedSpot) {
        console.warn('SPOT_PAGE_CHECKIN_MISSING_SPOT_NAME', { selectedSpot, canonicalSelectedSpot });
        return;
      }

      const latestOpenSessionResponse = await getLatestOpenSession();
      if (latestOpenSessionResponse.error) {
        console.log('SPOT_PAGE_CHECKIN_ERROR', { stage: 'fetch_latest_open_session', error: latestOpenSessionResponse.error });
        setSessionActionError('Inchecken is mislukt. Probeer opnieuw.');
        return;
      }

      const latestOpenSession = latestOpenSessionResponse.data;
      if (latestOpenSession?.status === 'Is er al') {
        if (normalizeSpotName(latestOpenSession.spot_name) === normalizeSpotName(canonicalSelectedSpot)) {
          setSessionActionError('Je bent al ingecheckt');
        } else {
          setSessionActionError(`Je bent al ingecheckt bij ${latestOpenSession.spot_name}`);
        }
        return;
      }

      if (latestOpenSession?.status === 'Gaat') {
        if (normalizeSpotName(latestOpenSession.spot_name) !== normalizeSpotName(canonicalSelectedSpot)) {
          setSessionActionError('Rond eerst je huidige sessie af');
          return;
        }

        const updatePayload = {
          status: 'Is er al',
          checked_in_at: nowIso,
        } as const;
        console.log('SPOT_PAGE_CHECKIN_PAYLOAD', { mode: 'update', sessionId: latestOpenSession.id, payload: updatePayload });
        const checkInResponse = await supabase
          .from('sessions')
          .update(updatePayload)
          .eq('id', latestOpenSession.id)
          .eq('user_id', authUserId);

        if (checkInResponse.error) {
          console.log('SPOT_PAGE_CHECKIN_ERROR', { stage: 'update_existing_session', error: checkInResponse.error });
          setSessionActionError('Inchecken is mislukt. Probeer opnieuw.');
          return;
        }

        console.log('SPOT_PAGE_CHECKIN_SUCCESS', { mode: 'updated_planned_session', sessionId: latestOpenSession.id, selectedSpot: canonicalSelectedSpot });
        await fetchSharedData();
        setSessionActionError('');
        return;
      }

      const insertPayload = {
        spot_name: canonicalSelectedSpot,
        user_id: session.user.id,
        user_name: profile.display_name,
        user_avatar_url: profile.avatar_url,
        start_time: getNowLocalHourMinute(),
        end_time: getQuickCheckInEndTime(),
        status: 'Is er al',
        checked_in_at: nowIso,
      };
      console.log('SPOT_PAGE_CHECKIN_PAYLOAD', { mode: 'insert', payload: insertPayload });
      const insertResult = await supabase.from('sessions').insert(insertPayload);

      if (insertResult.error) {
        console.log('SPOT_PAGE_CHECKIN_ERROR', { stage: 'insert_new_live_session', error: insertResult.error, payload: insertPayload });
        if (isUniqueConstraintError(insertResult.error)) {
          setSessionActionError('Je hebt al een actieve sessie');
          return;
        }
        setSessionActionError('Inchecken is mislukt. Probeer opnieuw.');
        return;
      }

      console.log('SPOT_PAGE_CHECKIN_SUCCESS', { mode: 'inserted_live_session', selectedSpot: canonicalSelectedSpot });
      await fetchSharedData();
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
    setFormError('');
  };

  const handleQuickCheckIn = async (spot: SpotName) => {
    console.log('HOME_QUICK_CHECKIN_PRESSED', { spot });
    setHomeQuickCheckInError('');

    if (blockingSession) {
      setHomeQuickCheckInError('Rond eerst je huidige sessie af');
      return;
    }

    if (quickCheckInWindowError) {
      setHomeQuickCheckInError(quickCheckInWindowError);
      return;
    }

    if (!session?.user.id || !profile) {
      return;
    }
    if (!nearestSpotWithinRange) {
      setHomeQuickCheckInError('Je bent nog niet dicht genoeg bij een spot');
      return;
    }

    setQuickCheckInSpotInFlight(spot);
    const startTime = getNowLocalHourMinute();
    const endTime = getQuickCheckInEndTime();
    const nowIso = new Date().toISOString();
    const payload = {
      spot_name: spot,
      user_id: session.user.id,
      user_name: profile.display_name,
      user_avatar_url: profile.avatar_url,
      start_time: startTime,
      end_time: endTime,
      status: 'Is er al',
      checked_in_at: nowIso,
    };
    const result = await supabase
      .from('sessions')
      .insert(payload)
      .select('id, spot_name, user_id, user_name, user_avatar_url, start_time, end_time, status, created_at, checked_in_at, checked_out_at')
      .single();

    if (result.error) {
      console.log('HOME_QUICK_CHECKIN_FAILURE', { spot, error: result.error });
      if (result.error.code === '23505') {
        setHomeQuickCheckInError('Rond eerst je huidige sessie af');
      } else {
        setHomeQuickCheckInError('Inchecken is mislukt. Probeer opnieuw.');
      }
      setQuickCheckInSpotInFlight(null);
      return;
    }

    console.log('HOME_QUICK_CHECKIN_SUCCESS', { spot, sessionId: result.data.id });
    setSessionsBySpot((previous) => {
      const insertedSpot = result.data.spot_name as SpotName;
      if (!spotNames.includes(insertedSpot)) {
        return previous;
      }

      const next = { ...previous };
      next[insertedSpot] = [
        ...previous[insertedSpot],
        {
          id: result.data.id,
          spot: insertedSpot,
          start: result.data.start_time.slice(0, 5),
          end: result.data.end_time.slice(0, 5),
          status: mapSessionStatus(result.data.status),
          createdAt: result.data.created_at,
          checkedInAt: result.data.checked_in_at,
          checkedOutAt: result.data.checked_out_at,
          userId: result.data.user_id,
          userName: result.data.user_name,
          userAvatarUrl: result.data.user_avatar_url,
        },
      ];
      return next;
    });

    setQuickCheckInSpotInFlight(null);
    setHomeQuickCheckInError('');
    await fetchSharedData();
  };

  const handleQuickCheckOut = async () => {
    console.log('HOME_QUICK_CHECKOUT_PRESSED', { activeCheckedInSessionId: activeCheckedInSession?.id ?? null });
    setHomeQuickCheckInError('');

    if (!session?.user.id) {
      return;
    }

    if (!activeCheckedInSession) {
      setHomeQuickCheckInError('Check eerst in');
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
      return;
    }

    console.log('HOME_QUICK_CHECKOUT_SUCCESS', { activeCheckedInSessionId: activeCheckedInSession.id });
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
    const handleSave = async () => {
      if (startHour === null || endHour === null) {
        setFormError('Kies eerst een start- en eindtijd.');
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

      const startTime = `${formatTimePart(startHour)}:${formatTimePart(startMinute)}`;
      const endTime = `${formatTimePart(endHour)}:${formatTimePart(endMinute)}`;

      console.log('BLOCKING_SESSION', blockingSession);
      if (blockingSession) {
        setFormError('Rond eerst je huidige sessie af');
        return;
      }

      const payload = {
        spot_name: selectedSpot,
        user_id: session.user.id,
        user_name: profile.display_name,
        user_avatar_url: profile.avatar_url,
        start_time: startTime,
        end_time: endTime,
        status: 'Gaat',
      };
      console.log('SESSION_SAVE_PAYLOAD', payload);
      const result = await supabase.from('sessions').insert(payload);
      console.log('SESSION_SAVE_RESULT', result);
      const { error } = result;

      if (error) {
        if (error.code === '23505') {
          setFormError('Rond eerst je huidige sessie af');
          return;
        }
        setFormError(error.message);
        return;
      }

      await fetchSharedData();
      setFormError('');
      setSessionActionError('');
      resetForm();
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
                position: 'absolute',
                top: 58,
                right: 18,
                width: 230,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.bgElevated,
                paddingHorizontal: 12,
                paddingVertical: 10,
                zIndex: 8,
              }}
            >
              <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>Meldingen voor deze spot</Text>

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
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: index === 2 ? 0 : 10 }}
                >
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{notificationType.label}</Text>
                  <View style={{ flexDirection: 'row', borderRadius: 999, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' }}>
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
                            paddingHorizontal: 8,
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
              setShowForm(true);
              setActivePicker(null);
              setFormError('');
              setSessionActionError('');
            }}
            style={{ marginTop: 14, ...primaryButtonStyle, opacity: canPlanSession ? 1 : 0.45 }}
          >
            <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>Sessie plannen</Text>
          </Pressable>
          {showForm ? <Text style={{ color: theme.textSoft, marginTop: 6 }}>Formulier open</Text> : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
            <Pressable
              disabled={!canCheckIn}
              onPress={() => {
                void handleUpdateSessionStatus('Is er al');
              }}
              style={{ ...sessionActionButtonBaseStyle, backgroundColor: '#15803d', opacity: canCheckIn ? 1 : 0.45 }}
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

              {formError ? <Text style={{ color: '#ff7e7e', fontSize: 14, marginBottom: 10 }}>{formError}</Text> : null}

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={handleSave} style={{ ...primaryButtonStyle, flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>Opslaan</Text>
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
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 10 }}>Sessies</Text>
          <View style={{ marginBottom: 10 }}>
            <View style={{ marginLeft: 98, flexDirection: 'row', justifyContent: 'space-between' }}>
              {timelineLabels.map((label) => (
                <Text key={label} style={{ color: theme.textMuted, fontSize: 11 }}>
                  {label}
                </Text>
              ))}
            </View>
          </View>
          {(() => {
            const totalRange = timelineEndMinutes - timelineStartMinutes;
            const isCurrentTimeMarkerVisible = currentLocalMinutes >= timelineStartMinutes && currentLocalMinutes <= timelineEndMinutes;
            const currentPercent = ((currentLocalMinutes - timelineStartMinutes) / totalRange) * 100;

            return (
              <>
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
                    timelineSessions.map((timelineSession) => {
                      const directCheckIn = isDirectCheckIn(timelineSession);
                      const checkedInMinutes = getLocalMinutesFromIso(timelineSession.checkedInAt);
                      const checkedInLocalHourMinute = formatToHourMinute(timelineSession.checkedInAt);
                      const checkInMarkerPercent = checkedInMinutes === null
                        ? null
                        : clamp(((checkedInMinutes - timelineStartMinutes) / timelineTotalMinutes) * 100, 0, 100);

                      const timelineStateStyle: Record<'Gaat nog' | 'Waarschijnlijk er' | 'Ingecheckt', { bar: string; text: string }> = {
                        'Gaat nog': { bar: '#3f5f85', text: '#e8f0ff' },
                        'Waarschijnlijk er': { bar: '#9b6a3c', text: '#fff4e8' },
                        Ingecheckt: { bar: '#27835a', text: '#eafff3' },
                      };

                      if (directCheckIn) {
                        if (checkInMarkerPercent === null || checkedInLocalHourMinute === '--:--') {
                          return null;
                        }

                        return (
                          <View key={timelineSession.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                            <Text numberOfLines={1} style={{ width: 90, color: theme.textSoft, fontSize: 13, marginRight: 8 }}>
                              {timelineSession.userName}
                            </Text>
                            <View style={{ flex: 1, height: 26, borderRadius: 999, backgroundColor: theme.bgElevated, borderWidth: 1, borderColor: theme.border, overflow: 'visible' }}>
                              <View
                                style={{
                                  position: 'absolute',
                                  left: `${checkInMarkerPercent}%`,
                                  top: 4,
                                  bottom: 4,
                                  width: 0,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: theme.live }} />
                              </View>
                              <Text
                                style={{
                                  position: 'absolute',
                                  left: `${clamp(checkInMarkerPercent + 2, 0, 94)}%`,
                                  top: 6,
                                  color: '#b4f7d4',
                                  fontSize: 11,
                                  fontWeight: '700',
                                }}
                              >
                                {checkedInLocalHourMinute}
                              </Text>
                            </View>
                          </View>
                        );
                      }

                      const sessionStartMinutes = toMinutes(timelineSession.start);
                      let sessionEndMinutes = toMinutes(timelineSession.end);
                      if (sessionEndMinutes <= sessionStartMinutes) {
                        sessionEndMinutes += 24 * 60;
                      }
                      const clampedStartMinutes = clamp(sessionStartMinutes, timelineStartMinutes, timelineEndMinutes);
                      const clampedEndMinutes = clamp(sessionEndMinutes, timelineStartMinutes, timelineEndMinutes);
                      const rawLeftPercent = ((clampedStartMinutes - timelineStartMinutes) / timelineTotalMinutes) * 100;
                      const rawWidthPercent = ((clampedEndMinutes - clampedStartMinutes) / timelineTotalMinutes) * 100;
                      const leftPercent = clamp(rawLeftPercent, 0, 100);
                      const maxWidthPercent = Math.max(0, 100 - leftPercent);
                      const widthPercent = clamp(rawWidthPercent, 0, maxWidthPercent);
                      const displayState = getSessionDisplayState(timelineSession, currentLocalMinutes);
                      if (!displayState) {
                        return null;
                      }
                      const showLabelOutside = widthPercent < 18;
                      const labelText = `${timelineSession.start}–${timelineSession.end}`;
                      const labelLeftPercent = clamp(leftPercent + widthPercent, 0, 96);

                      return (
                        <View key={timelineSession.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                          <Text numberOfLines={1} style={{ width: 90, color: theme.textSoft, fontSize: 13, marginRight: 8 }}>
                            {timelineSession.userName}
                          </Text>
                          <View style={{ flex: 1, height: 26, borderRadius: 999, backgroundColor: theme.bgElevated, borderWidth: 1, borderColor: theme.border, overflow: 'visible' }}>
                            <View
                              style={{
                                position: 'absolute',
                                left: `${leftPercent}%`,
                                width: `${widthPercent}%`,
                                top: 2,
                                bottom: 2,
                                borderRadius: 999,
                                backgroundColor: timelineStateStyle[displayState].bar,
                                justifyContent: 'center',
                                alignItems: showLabelOutside ? 'flex-end' : 'center',
                                paddingHorizontal: showLabelOutside ? 8 : 10,
                                overflow: 'visible',
                              }}
                            >
                              {!showLabelOutside ? (
                                <Text style={{ color: timelineStateStyle[displayState].text, fontSize: 11, fontWeight: '600', lineHeight: 14 }}>
                                  {labelText}
                                </Text>
                              ) : null}
                            </View>
                            {showLabelOutside ? (
                              <Text
                                style={{
                                  position: 'absolute',
                                  left: `${labelLeftPercent}%`,
                                  top: -17,
                                  color: theme.textSoft,
                                  fontSize: 11,
                                  fontWeight: '600',
                                }}
                              >
                                {labelText}
                              </Text>
                            ) : null}
                            {timelineSession.status === 'Is er al' && checkInMarkerPercent !== null && checkedInLocalHourMinute !== '--:--' ? (
                              <>
                                <View
                                  style={{
                                    position: 'absolute',
                                    left: `${checkInMarkerPercent}%`,
                                    top: 2,
                                    bottom: 2,
                                    width: 0,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: theme.live, borderWidth: 1, borderColor: '#ddffe8' }} />
                                </View>
                                <Text
                                  style={{
                                    position: 'absolute',
                                    left: `${clamp(checkInMarkerPercent + 1.5, 0, 92)}%`,
                                    top: -16,
                                    color: '#b4f7d4',
                                    fontSize: 10,
                                    fontWeight: '700',
                                  }}
                                >
                                  {`in ${checkedInLocalHourMinute}`}
                                </Text>
                              </>
                            ) : null}
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={{ color: theme.textSoft, fontSize: 14 }}>Nog geen sessies op de tijdlijn</Text>
                  )}
                </View>
              </>
            );
          })()}
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
        <Pressable onPress={() => setShowProfile(true)} style={{ backgroundColor: theme.cardStrong, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.border, marginLeft: 10 }}>
          <Avatar uri={profile.avatar_url} size={24} />
          <Text style={{ color: theme.text, fontWeight: '600', marginLeft: 8 }}>{profile.display_name}</Text>
        </Pressable>
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
                <Text style={{ color: theme.textMuted, marginTop: 8, fontSize: 13 }}>Je bent nog niet dicht genoeg bij een spot</Text>
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
          const checkedInCount = todaysSessionsBySpot[spot]?.filter((sessionItem) => isCheckedInSession(sessionItem, currentLocalMinutes)).length ?? 0;

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
