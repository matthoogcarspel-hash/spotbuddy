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
type SessionStatus = 'Is er al' | 'Gaat' | 'Ik ben geweest';
type SpotSession = {
  id: string;
  start: string;
  end: string;
  status: SessionStatus;
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
};
type PickerKey = 'startHour' | 'startMinute' | 'endHour' | 'endMinute' | null;

const hours = Array.from({ length: 24 }, (_, index) => index);
const minuteOptions = [0, 15, 30, 45];
const statusOrder: SessionStatus[] = ['Gaat', 'Is er al', 'Ik ben geweest'];
const activeStatuses: Array<'Gaat' | 'Is er al'> = ['Gaat', 'Is er al'];
const formatTimePart = (value: number) => String(value).padStart(2, '0');

const createSpotRecord = <T,>(makeValue: () => T): Record<SpotName, T> =>
  V1_SPOTS.reduce((result, spot) => {
    result[spot] = makeValue();
    return result;
  }, {} as Record<SpotName, T>);

function Avatar({ uri, size = 28 }: { uri: string | null; size?: number }) {
  if (!uri) {
    return (
      <View
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#223247' }}
      />
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#223247' }}
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

  const [showForm, setShowForm] = useState(false);
  const [activePicker, setActivePicker] = useState<PickerKey>(null);
  const [startHour, setStartHour] = useState<number | null>(null);
  const [startMinute, setStartMinute] = useState(0);
  const [endHour, setEndHour] = useState<number | null>(null);
  const [endMinute, setEndMinute] = useState(0);
  const [formError, setFormError] = useState('');
  const [messageInput, setMessageInput] = useState('');

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
    if (status === 'Is er al' || status === 'Ik ben geweest') {
      return status;
    }
    return 'Gaat';
  };

  const fetchSharedData = async () => {
    setLoadingData(true);

    const [sessionsResponse, messagesResponse] = await Promise.all([
      supabase
        .from('sessions')
        .select('id, spot_name, user_id, user_name, user_avatar_url, start_time, end_time, status, created_at')
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
        });
      }

      setMessagesBySpot(nextMessagesBySpot);
    }

    setLoadingData(false);
  };

  useEffect(() => {
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

  const sessions = selectedSpot ? sessionsBySpot[selectedSpot] : [];
  const messages = selectedSpot ? messagesBySpot[selectedSpot] : [];

  const sessionsByStatus = useMemo(
    () => ({
      'Is er al': sessions.filter((item) => item.status === 'Is er al'),
      Gaat: sessions.filter((item) => item.status === 'Gaat'),
      'Ik ben geweest': sessions.filter((item) => item.status === 'Ik ben geweest'),
    }),
    [sessions],
  );

  const handleUpdateSessionStatus = async (sessionId: string, status: SessionStatus) => {
    const { error } = await supabase
      .from('sessions')
      .update({ status })
      .eq('id', sessionId);

    if (error) {
      console.error('Status bijwerken mislukt:', error);
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
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0f14', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#ffffff' }}>Laden...</Text>
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
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0f14', paddingHorizontal: 20, paddingTop: 20 }}>
        <View style={{ backgroundColor: '#121821', borderRadius: 12, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Avatar uri={profileAvatarInputUri ?? profile.avatar_url} size={42} />
            <View style={{ marginLeft: 10 }}>
              <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '700' }}>{profileNameInput || profile.display_name}</Text>
              <Text style={{ color: '#9db0c7', marginTop: 4 }}>Ingelogd</Text>
            </View>
          </View>

          <View style={{ marginTop: 16 }}>
            <TextInput
              value={profileNameInput}
              onChangeText={setProfileNameInput}
              placeholder="Display name"
              placeholderTextColor="#9db0c7"
              autoCapitalize="none"
              style={{ backgroundColor: '#0b0f14', color: '#ffffff', borderRadius: 10, padding: 12, marginBottom: 10 }}
            />

            {profileEditError ? <Text style={{ color: '#ff6b6b', marginBottom: 10 }}>{profileEditError}</Text> : null}
          </View>

          <Pressable
            onPress={() => {
              void handlePickProfileAvatar();
            }}
            style={{ marginTop: 10, backgroundColor: '#0b0f14', borderRadius: 10, padding: 12 }}
          >
            <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>Foto wijzigen</Text>
          </Pressable>

          <Pressable
            disabled={isSavingProfile}
            onPress={() => {
              void handleSaveProfile();
            }}
            style={{
              marginTop: 10,
              backgroundColor: '#0b0f14',
              borderRadius: 10,
              padding: 12,
              opacity: isSavingProfile ? 0.6 : 1,
            }}
          >
            <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>
              {isSavingProfile ? 'Opslaan...' : 'Opslaan'}
            </Text>
          </Pressable>

          <Pressable onPress={() => {
            resetFlow();
            void supabase.auth.signOut();
          }} style={{ marginTop: 16, backgroundColor: '#0b0f14', borderRadius: 10, padding: 12 }}>
            <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>Uitloggen</Text>
          </Pressable>

          <Pressable onPress={() => {
            setShowProfile(false);
            setProfileAvatarInputUri(null);
            setProfileEditError('');
          }} style={{ marginTop: 10, backgroundColor: '#0b0f14', borderRadius: 10, padding: 12 }}>
            <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>Terug</Text>
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
      const now = new Date();
      const nowTotalMinutes = now.getHours() * 60 + now.getMinutes();

      if (startTotalMinutes < nowTotalMinutes) {
        setFormError('Starttijd kan niet eerder zijn dan nu.');
        return;
      }

      if (endTotalMinutes <= startTotalMinutes) {
        setFormError('Eindtijd moet later zijn dan starttijd.');
        return;
      }

      const { error } = await supabase.from('sessions').insert({
        spot_name: selectedSpot,
        user_id: session.user.id,
        user_name: profile.display_name,
        user_avatar_url: profile.avatar_url,
        start_time: `${formatTimePart(startHour)}:${formatTimePart(startMinute)}`,
        end_time: `${formatTimePart(endHour)}:${formatTimePart(endMinute)}`,
        status: 'Gaat',
      });

      if (error) {
        setFormError(error.message);
        return;
      }

      await fetchSharedData();
      resetForm();
    };

    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#0b0f14' }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 30 }}>
        <Pressable onPress={() => setSelectedSpot(null)} style={{ marginBottom: 18 }}>
          <Text style={{ color: '#9db0c7', fontSize: 15 }}>← Terug</Text>
        </Pressable>

        <View style={{ backgroundColor: '#121821', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '700' }}>{selectedSpot}</Text>

          <Pressable
            onPress={() => {
              setShowForm(true);
              setActivePicker(null);
              setFormError('');
            }}
            style={{ marginTop: 14, backgroundColor: '#1f8fff', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 }}
          >
            <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>Sessie plannen</Text>
          </Pressable>

          {sessions.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Pressable onPress={() => {
                const latestOwnSession = [...sessions]
                  .reverse()
                  .find((sessionItem) => sessionItem.userId === session.user.id);

                if (!latestOwnSession) {
                  return;
                }

                void handleUpdateSessionStatus(latestOwnSession.id, 'Is er al');
              }} style={{ marginTop: 10, marginRight: 8, backgroundColor: '#0b0f14', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
                <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Ik ben er</Text>
              </Pressable>
              <Pressable onPress={() => {
                const latestOwnSession = [...sessions]
                  .reverse()
                  .find((sessionItem) => sessionItem.userId === session.user.id);

                if (!latestOwnSession) {
                  return;
                }

                void handleUpdateSessionStatus(latestOwnSession.id, 'Ik ben geweest');
              }} style={{ marginTop: 10, backgroundColor: '#0b0f14', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
                <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Ik ben geweest</Text>
              </Pressable>
            </View>
          ) : null}

          {showForm ? (
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: '#9db0c7', fontSize: 14, marginBottom: 6 }}>Starttijd</Text>

              <Pressable onPress={() => { setActivePicker((prev) => (prev === 'startHour' ? null : 'startHour')); setFormError(''); }} style={{ backgroundColor: '#0b0f14', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 }}>
                <Text style={{ color: '#ffffff', fontSize: 15 }}>Uur: {startHour === null ? '--' : formatTimePart(startHour)}</Text>
              </Pressable>
              {activePicker === 'startHour' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                  {hours.map((hour) => (
                    <Pressable key={`start-hour-${hour}`} onPress={() => setStartHour(hour)} style={{ backgroundColor: startHour === hour ? '#9db0c7' : '#0b0f14', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}>
                      <Text style={{ color: startHour === hour ? '#0b0f14' : '#ffffff' }}>{formatTimePart(hour)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <Pressable onPress={() => { setActivePicker((prev) => (prev === 'startMinute' ? null : 'startMinute')); setFormError(''); }} style={{ backgroundColor: '#0b0f14', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 }}>
                <Text style={{ color: '#ffffff', fontSize: 15 }}>Minuut: {formatTimePart(startMinute)}</Text>
              </Pressable>
              {activePicker === 'startMinute' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                  {minuteOptions.map((minute) => (
                    <Pressable key={`start-minute-${minute}`} onPress={() => setStartMinute(minute)} style={{ backgroundColor: startMinute === minute ? '#9db0c7' : '#0b0f14', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}>
                      <Text style={{ color: startMinute === minute ? '#0b0f14' : '#ffffff' }}>{formatTimePart(minute)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <Text style={{ color: '#9db0c7', fontSize: 14, marginBottom: 6 }}>Eindtijd</Text>
              <Pressable onPress={() => { setActivePicker((prev) => (prev === 'endHour' ? null : 'endHour')); setFormError(''); }} style={{ backgroundColor: '#0b0f14', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 }}>
                <Text style={{ color: '#ffffff', fontSize: 15 }}>Uur: {endHour === null ? '--' : formatTimePart(endHour)}</Text>
              </Pressable>
              {activePicker === 'endHour' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                  {hours.map((hour) => (
                    <Pressable key={`end-hour-${hour}`} onPress={() => setEndHour(hour)} style={{ backgroundColor: endHour === hour ? '#9db0c7' : '#0b0f14', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}>
                      <Text style={{ color: endHour === hour ? '#0b0f14' : '#ffffff' }}>{formatTimePart(hour)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <Pressable onPress={() => { setActivePicker((prev) => (prev === 'endMinute' ? null : 'endMinute')); setFormError(''); }} style={{ backgroundColor: '#0b0f14', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 }}>
                <Text style={{ color: '#ffffff', fontSize: 15 }}>Minuut: {formatTimePart(endMinute)}</Text>
              </Pressable>
              {activePicker === 'endMinute' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                  {minuteOptions.map((minute) => (
                    <Pressable key={`end-minute-${minute}`} onPress={() => setEndMinute(minute)} style={{ backgroundColor: endMinute === minute ? '#9db0c7' : '#0b0f14', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}>
                      <Text style={{ color: endMinute === minute ? '#0b0f14' : '#ffffff' }}>{formatTimePart(minute)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {formError ? <Text style={{ color: '#ff6b6b', fontSize: 14, marginBottom: 10 }}>{formError}</Text> : null}

              <Pressable onPress={handleSave} style={{ backgroundColor: '#0b0f14', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
                <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Opslaan</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={{ backgroundColor: '#121821', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Sessies</Text>
          {sessions.length > 0 ? (
            statusOrder.map((status) => {
              const sessionsForStatus = sessionsByStatus[status];
              return (
                <View key={status} style={{ marginBottom: 10 }}>
                  <Text style={{ color: '#9db0c7', fontSize: 14, marginBottom: 6, fontWeight: '600' }}>{status}</Text>
                  {sessionsForStatus.length > 0 ? (
                    sessionsForStatus.map((item, index) => {
                      return (
                        <View key={`${item.start}-${item.end}-${index}`} style={{ marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                            <Avatar uri={item.userAvatarUrl} size={24} />
                            <Text style={{ color: '#ffffff', fontSize: 15, marginLeft: 8 }}>
                              {item.userName}: {item.start} - {item.end}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                            {statusOrder.map((nextStatus) => (
                              <Pressable
                                key={`${item.start}-${item.end}-${index}-${nextStatus}`}
                                onPress={() => {
                                  void handleUpdateSessionStatus(item.id, nextStatus);
                                }}
                                style={{
                                  backgroundColor: item.status === nextStatus ? '#9db0c7' : '#0b0f14',
                                  borderRadius: 8,
                                  paddingVertical: 6,
                                  paddingHorizontal: 8,
                                  marginRight: 6,
                                  marginBottom: 6,
                                }}
                              >
                                <Text style={{ color: item.status === nextStatus ? '#0b0f14' : '#ffffff', fontSize: 12 }}>{nextStatus}</Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={{ color: '#9db0c7', fontSize: 14, marginBottom: 4 }}>Nog niemand</Text>
                  )}
                </View>
              );
            })
          ) : (
            <View>
              <Text style={{ color: '#9db0c7', fontSize: 15 }}>Nog niemand ingepland</Text>
              <Text style={{ color: '#9db0c7', fontSize: 15, marginTop: 4 }}>{profile.display_name} kunt de eerste zijn</Text>
            </View>
          )}
        </View>

        <View style={{ backgroundColor: '#121821', borderRadius: 12, padding: 16 }}>
          <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Chat</Text>

          {messages.length > 0 ? (
            <View style={{ marginBottom: 10 }}>
              {messages.map((message) => (
                <View key={message.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Avatar uri={message.userAvatarUrl} size={24} />
                  <Text style={{ color: '#ffffff', fontSize: 15, marginLeft: 8 }}>
                    {message.userName}: {message.text}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: '#9db0c7', fontSize: 15, marginBottom: 10 }}>Nog geen berichten</Text>
          )}

          <TextInput
            value={messageInput}
            onChangeText={setMessageInput}
            placeholder="Typ een bericht"
            placeholderTextColor="#9db0c7"
            style={{ backgroundColor: '#0b0f14', color: '#ffffff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 }}
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
            style={{ backgroundColor: '#0b0f14', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}
          >
            <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Verstuur</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0f14', paddingHorizontal: 20, paddingTop: 20 }}>
      <View style={{ marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Image
            source={require('./assets/logo.png')}
            style={{ width: 84, height: 84, marginRight: 12 }}
            resizeMode="contain"
          />
          <View>
            <Text style={{ color: '#ffffff', fontSize: 34, fontWeight: '700' }}>SpotBuddy</Text>
            <Text style={{ color: '#9db0c7', fontSize: 16, marginTop: 6 }}>Spot, tijd en gaaaan!</Text>
          </View>
        </View>
        <Pressable onPress={() => setShowProfile(true)} style={{ backgroundColor: '#121821', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' }}>
          <Avatar uri={profile.avatar_url} size={24} />
          <Text style={{ color: '#ffffff', fontWeight: '600', marginLeft: 8 }}>{profile.display_name}</Text>
        </Pressable>
      </View>

      <View>
        {V1_SPOTS.map((spot) => {
          const todayCount = sessionsBySpot[spot]?.filter((sessionItem) => activeStatuses.includes(sessionItem.status)).length ?? 0;
          const liveCount = sessionsBySpot[spot]?.filter((sessionItem) => sessionItem.status === 'Is er al').length ?? 0;
          const kiterText = todayCount === 1 ? '1 kiter vandaag' : `${todayCount} kiters vandaag`;

          return (
            <Pressable
              key={spot}
              onPress={() => setSelectedSpot(spot)}
              style={{
                backgroundColor: '#121821',
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>{spot}</Text>
              <Text style={{ color: '#9db0c7', fontSize: 14, marginTop: 4 }}>{kiterText}</Text>
              <Text style={{ color: '#9db0c7', fontSize: 14, marginTop: 2 }}>Live: {liveCount}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
