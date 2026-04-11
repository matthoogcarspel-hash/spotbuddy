import { useEffect, useMemo, useState } from 'react';

import { Session as AuthSession } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';

import { uploadAvatar } from './src/lib/avatar';
import { Profile, supabase } from './src/lib/supabase';
import AuthScreen from './src/screens/AuthScreen';
import NameSetupScreen from './src/screens/NameSetupScreen';

const V1_SPOTS = [
  'Scheveningen KZVS',
  'Scheveningen Jump Team',
  'Noordwijk KSN',
  'Rockanje 1e Slag',
  'Rockanje 2e Slag',
  'Maasvlakte 2 Slufter',
] as const;

type SpotName = (typeof V1_SPOTS)[number];
type SessionStatus = 'Is er al' | 'Gaat' | 'Uitchecken';
type SpotSession = {
  id: string;
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

const createSpotRecord = <T,>(makeValue: () => T): Record<SpotName, T> =>
  V1_SPOTS.reduce((result, spot) => {
    result[spot] = makeValue();
    return result;
  }, {} as Record<SpotName, T>);
const isSessionCreatedToday = (sessionItem: SpotSession) => isCreatedToday(sessionItem.createdAt);
const isGoingLaterSession = (sessionItem: SpotSession, nowMinutes: number) =>
  sessionItem.status === 'Gaat' && nowMinutes < toMinutes(sessionItem.start);
const isProbablyThereSession = (sessionItem: SpotSession, nowMinutes: number) =>
  sessionItem.status === 'Gaat' && nowMinutes >= toMinutes(sessionItem.start) && nowMinutes < toMinutes(sessionItem.end);
const isCheckedInSession = (sessionItem: SpotSession, nowMinutes: number) =>
  sessionItem.status === 'Is er al' && nowMinutes < toMinutes(sessionItem.end);

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
  const [selectedSpot, setSelectedSpot] = useState<SpotName | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profileAvatarInputUri, setProfileAvatarInputUri] = useState<string | null>(null);
  const [profileEditError, setProfileEditError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [sessionsBySpot, setSessionsBySpot] = useState<Record<SpotName, SpotSession[]>>(createSpotRecord(() => []));
  const [messagesBySpot, setMessagesBySpot] = useState<Record<SpotName, ChatMessage[]>>(createSpotRecord(() => []));
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
  const [messageInput, setMessageInput] = useState('');
  const [clockTick, setClockTick] = useState(() => Date.now());

  const resetFlow = () => {
    setSelectedSpot(null);
    setShowProfile(false);
    setProfileNameInput('');
    setProfileAvatarInputUri(null);
    setProfileEditError('');
    setIsSavingProfile(false);
    setSessionsBySpot(createSpotRecord(() => []));
    setMessagesBySpot(createSpotRecord(() => []));
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

    if (status === 'Is er al' || status === 'Uitchecken') {
      return status;
    }
    return 'Gaat';
  };

  const fetchSharedData = async () => {
    setLoadingData(true);

    const [sessionsResponse, messagesResponse] = await Promise.all([
      supabase
        .from('sessions')
        .select('id, spot_name, user_id, user_name, user_avatar_url, start_time, end_time, status, created_at, checked_in_at, checked_out_at')
        .in('spot_name', [...V1_SPOTS])
        .order('created_at', { ascending: true }),
      supabase
        .from('messages')
        .select('id, spot_name, user_id, user_name, user_avatar_url, text, created_at')
        .in('spot_name', [...V1_SPOTS])
        .order('created_at', { ascending: true }),
    ]);

    if (sessionsResponse.error) {
      console.error('Sessies ophalen mislukt:', sessionsResponse.error);
    } else {
      const nextSessionsBySpot = createSpotRecord<SpotSession[]>(() => []);

      for (const row of sessionsResponse.data) {
        const spot = row.spot_name as SpotName;
        if (!V1_SPOTS.includes(spot)) {
          continue;
        }

        nextSessionsBySpot[spot].push({
          id: row.id,
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
      const nextMessagesBySpot = createSpotRecord<ChatMessage[]>(() => []);

      for (const row of messagesResponse.data) {
        const spot = row.spot_name as SpotName;
        if (!V1_SPOTS.includes(spot)) {
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
    void supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });

    supabase.auth.getSession().then(({ data }) => {
      const nextSession = data.session;
      setSession(nextSession);
      setLoadingSession(false);

      if (nextSession) {
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
    console.log('SHOW_FORM', showForm);
  }, [showForm]);

  useEffect(() => {
    const interval = setInterval(() => {
      setClockTick(Date.now());
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const sessions = selectedSpot ? sessionsBySpot[selectedSpot] : [];
  const messages = selectedSpot ? messagesBySpot[selectedSpot] : [];
  const currentLocalMinutes = useMemo(() => {
    void clockTick;
    return getCurrentLocalMinutes();
  }, [clockTick]);
  const todaysSessionsBySpot = useMemo(() => {
    const next = createSpotRecord<SpotSession[]>(() => []);
    for (const spot of V1_SPOTS) {
      next[spot] = sessionsBySpot[spot].filter((item) => isSessionCreatedToday(item));
    }
    return next;
  }, [sessionsBySpot]);
  const todayUserSessions = useMemo(() => {
    if (!session?.user.id) {
      return [];
    }

    return Object.values(todaysSessionsBySpot)
      .flat()
      .filter((sessionItem) => sessionItem.userId === session.user.id);
  }, [session?.user.id, todaysSessionsBySpot]);
  const latestOwnSession = useMemo(() => {
    if (todayUserSessions.length === 0) {
      return null;
    }

    return [...todayUserSessions].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    })[0] ?? null;
  }, [todayUserSessions]);
  const blockingSession = useMemo(() => {
    if (todayUserSessions.length === 0) {
      return null;
    }

    return (
      [...todayUserSessions]
        .filter((sessionItem) => (sessionItem.status === 'Gaat' || sessionItem.status === 'Is er al'))
        .filter((sessionItem) => currentLocalMinutes < toMinutes(sessionItem.end))
        .sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        })[0] ?? null
    );
  }, [currentLocalMinutes, todayUserSessions]);
  const canPlanSession = !blockingSession;
  const startMinutes = latestOwnSession ? toMinutes(latestOwnSession.start) : 0;
  const endMinutes = latestOwnSession ? toMinutes(latestOwnSession.end) : 0;
  const canCheckIn = Boolean(
    latestOwnSession
    && latestOwnSession.status === 'Gaat'
    && currentLocalMinutes >= startMinutes,
  ) && Boolean(
    latestOwnSession
    && currentLocalMinutes < endMinutes,
  );
  const canCheckOut = Boolean(
    latestOwnSession
    && latestOwnSession.status === 'Is er al'
    && currentLocalMinutes < endMinutes,
  );
  useEffect(() => {
    console.log('LATEST_OWN_SESSION', latestOwnSession);
    console.log('CURRENT_MINUTES', currentLocalMinutes);
    console.log('SESSION_WINDOW', { startMinutes, endMinutes });
    console.log('BLOCKING_SESSION', blockingSession);
    console.log('TODAY_USER_SESSIONS', todayUserSessions);
    console.log('BLOCKING_SESSION_FIXED', blockingSession);
    console.log('CAN_CHECK_IN', canCheckIn);
  }, [blockingSession, canCheckIn, currentLocalMinutes, endMinutes, latestOwnSession, startMinutes, todayUserSessions]);
  const newestFirstMessages = useMemo(
    () =>
      [...messages].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      }),
    [messages],
  );

  const activeSessionsByDisplayState = useMemo(
    () => ({
      'Gaat nog': sessions.filter((item) => isSessionCreatedToday(item) && isGoingLaterSession(item, currentLocalMinutes)),
      'Waarschijnlijk er': sessions.filter((item) => isSessionCreatedToday(item) && isProbablyThereSession(item, currentLocalMinutes)),
      Ingecheckt: sessions.filter((item) => isSessionCreatedToday(item) && isCheckedInSession(item, currentLocalMinutes)),
    }),
    [currentLocalMinutes, sessions],
  );

  const handleUpdateSessionStatus = async (status: SessionStatus) => {
    setSessionActionError('');

    const { data } = await supabase.auth.getUser();
    const authUserId = data.user?.id;

    if (!authUserId) {
      return;
    }

    if (!latestOwnSession) {
      if (status === 'Is er al') {
        setSessionActionError('Plan eerst een sessie');
      } else if (status === 'Uitchecken') {
        setSessionActionError('Check eerst in');
      }
      return;
    }

    if (status === 'Is er al' && latestOwnSession.status !== 'Gaat') {
      setSessionActionError('Plan eerst een sessie');
      return;
    }

    if (status === 'Is er al' && latestOwnSession.status === 'Gaat' && currentLocalMinutes < startMinutes) {
      setSessionActionError(`Je kunt pas inchecken vanaf ${latestOwnSession.start}`);
      return;
    }

    if (status === 'Is er al' && currentLocalMinutes >= endMinutes) {
      setSessionActionError('Deze sessie is verlopen. Plan een nieuwe sessie');
      return;
    }

    if (status === 'Uitchecken' && latestOwnSession.status !== 'Is er al') {
      setSessionActionError('Check eerst in');
      return;
    }

    const nowIso = new Date().toISOString();
    const updates: { status: SessionStatus; checked_in_at?: string; checked_out_at?: string } = { status };

    if (status === 'Is er al') {
      updates.checked_in_at = nowIso;
    }

    if (status === 'Uitchecken') {
      updates.checked_out_at = nowIso;
    }

    const nextStatus = status;
    console.log('SESSION_STATUS_UPDATE', { sessionId: latestOwnSession.id, nextStatus });
    const result = await supabase
      .from('sessions')
      .update(updates)
      .eq('id', latestOwnSession.id)
      .eq('user_id', authUserId);
    console.log('SESSION_STATUS_RESULT', result);
    const { error } = result;

    if (error) {
      console.error('Status bijwerken mislukt:', error);
      setSessionActionError(error.message);
      return;
    }

    await fetchSharedData();
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
      const nowTotalMinutes = getCurrentLocalMinutes();

      console.log('PLAN_VALIDATION_NOW', nowTotalMinutes);
      console.log('PLAN_VALIDATION_SELECTED', { startMinutes: startTotalMinutes, endMinutes: endTotalMinutes });

      if (startTotalMinutes < nowTotalMinutes) {
        setFormError('Starttijd kan niet eerder zijn dan nu.');
        return;
      }

      if (endTotalMinutes <= startTotalMinutes) {
        setFormError('Eindtijd moet later zijn dan starttijd.');
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
    const sessionStatusLabel: Record<SessionStatus, string> = {
      Gaat: 'Gaat',
      'Is er al': 'Inchecken',
      Uitchecken: 'Uitchecken',
    };
    const sectionOrder = ['Gaat nog', 'Waarschijnlijk er', 'Ingecheckt'] as const;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 34 }}>
        <Pressable onPress={() => setSelectedSpot(null)} style={{ marginBottom: 18 }}>
          <Text style={{ color: theme.textSoft, fontSize: 15, letterSpacing: 0.2 }}>← Terug naar spots</Text>
        </Pressable>

        <View style={{ backgroundColor: theme.card, borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: theme.border }}>
          <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1.3 }}>SPOT STATUS</Text>
          <Text style={{ color: theme.text, fontSize: 26, fontWeight: '700', marginTop: 6 }}>{selectedSpot}</Text>

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
          {!canPlanSession ? <Text style={{ color: theme.textSoft, marginTop: 6 }}>Je hebt al een actieve sessie</Text> : null}
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
                  {hours.map((hour) => (
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
                  {hours.map((hour) => (
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
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Sessies</Text>
          {sessions.length > 0 ? (
            sectionOrder.map((sectionLabel) => {
              const sessionsForStatus = activeSessionsByDisplayState[sectionLabel];
              return (
                <View key={sectionLabel} style={{ marginBottom: 10 }}>
                  <Text style={{ color: theme.textSoft, fontSize: 14, marginBottom: 6, fontWeight: '600' }}>{sectionLabel}</Text>
                  {sessionsForStatus.length > 0 ? (
                    sessionsForStatus.map((item, index) => {
                      return (
                        <View key={`${item.start}-${item.end}-${index}`} style={{ marginBottom: 10, backgroundColor: theme.cardStrong, borderRadius: 14, padding: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                            <Avatar uri={item.userAvatarUrl} size={24} />
                            <Text style={{ color: theme.text, fontSize: 15, marginLeft: 8, marginRight: 8 }}>
                              {item.userName}: {item.start} - {item.end}
                            </Text>
                          </View>
                          <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 6 }}>
                            {item.status === 'Gaat'
                              ? `Gepland om ${formatToHourMinute(item.createdAt)}`
                              : item.status === 'Is er al'
                                ? `Ingecheckt om ${formatToHourMinute(item.checkedInAt)}`
                                : `Uitgecheckt om ${formatToHourMinute(item.checkedOutAt)}`}
                          </Text>
                          {item.userId === currentUserId && latestOwnSession?.id === item.id ? (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                              <Pressable
                                disabled={!canCheckIn}
                                onPress={() => {
                                  void handleUpdateSessionStatus('Is er al');
                                }}
                                style={{
                                  backgroundColor: item.status === 'Is er al' ? theme.primary : theme.bgElevated,
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  borderColor: theme.border,
                                  paddingVertical: 6,
                                  paddingHorizontal: 8,
                                  marginRight: 6,
                                  marginBottom: 6,
                                  opacity: canCheckIn ? 1 : 0.5,
                                }}
                              >
                                <Text style={{ color: theme.text, fontSize: 12 }}>{sessionStatusLabel['Is er al']}</Text>
                              </Pressable>
                              <Pressable
                                disabled={!canCheckOut}
                                onPress={() => {
                                  void handleUpdateSessionStatus('Uitchecken');
                                }}
                                style={{
                                  backgroundColor: item.status === 'Uitchecken' ? theme.primary : theme.bgElevated,
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  borderColor: theme.border,
                                  paddingVertical: 6,
                                  paddingHorizontal: 8,
                                  marginRight: 6,
                                  marginBottom: 6,
                                  opacity: canCheckOut ? 1 : 0.5,
                                }}
                              >
                                <Text style={{ color: theme.text, fontSize: 12 }}>{sessionStatusLabel['Uitchecken']}</Text>
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      );
                    })
                  ) : (
                    <Text style={{ color: theme.textSoft, fontSize: 14, marginBottom: 4 }}>Nog niemand</Text>
                  )}
                </View>
              );
            })
          ) : (
            <View>
              <Text style={{ color: theme.textSoft, fontSize: 15 }}>Nog niemand ingepland</Text>
              <Text style={{ color: theme.textSoft, fontSize: 15, marginTop: 4 }}>{profile.display_name} kunt de eerste zijn</Text>
            </View>
          )}
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.border }}>
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
      <View style={{ marginBottom: 18, borderWidth: 1, borderColor: theme.border, borderRadius: 20, backgroundColor: theme.card, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1 }}>
          <Image
            source={require('./assets/logo.png')}
            style={{ width: 82, height: 82, marginRight: 12 }}
            resizeMode="contain"
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1.4 }}>COASTAL WIND TRACKER</Text>
            <Text style={{ color: theme.text, fontSize: 34, fontWeight: '700', marginTop: 2 }}>SpotBuddy</Text>
            <Text style={{ color: theme.textSoft, fontSize: 15, marginTop: 6 }}>Spot slim. Time it hard. Hit the water.</Text>
          </View>
        </View>
        <Pressable onPress={() => setShowProfile(true)} style={{ backgroundColor: theme.cardStrong, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.border, marginLeft: 10 }}>
          <Avatar uri={profile.avatar_url} size={24} />
          <Text style={{ color: theme.text, fontWeight: '600', marginLeft: 8 }}>{profile.display_name}</Text>
        </Pressable>
      </View>

      <View>
        {V1_SPOTS.map((spot) => {
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
              <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
                <View style={{ flex: 1, backgroundColor: theme.bgElevated, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 }}>
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>GAAT NOG</Text>
                  <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700', marginTop: 2 }}>{goingLaterCount}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#0c2130', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 }}>
                  <Text style={{ color: '#83d8b0', fontSize: 12, fontWeight: '600' }}>WAARSCHIJNLIJK ER</Text>
                  <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700', marginTop: 2 }}>{probablyThereCount}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#10271f', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 }}>
                  <Text style={{ color: '#6ee7b7', fontSize: 12, fontWeight: '600' }}>INGECHECKT</Text>
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
