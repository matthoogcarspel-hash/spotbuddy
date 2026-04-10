import { useEffect, useState } from 'react';

import { Session as AuthSession } from '@supabase/supabase-js';
import { SafeAreaView, Text } from 'react-native';

import { Profile, supabase } from './src/lib/supabase';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import NameSetupScreen from './src/screens/NameSetupScreen';
import SpotDetailScreen, { Session, SessionStatus } from './src/screens/SpotDetailScreen';

const V1_SPOTS = [
  'Scheveningen KZVS',
  'Scheveningen Jump Team',
  'Noordwijk KSN',
  'Rockanje 1e Slag',
  'Rockanje 2e Slag',
  'Maasvlakte 2 Slufter',
] as const;

type SpotName = (typeof V1_SPOTS)[number];
type ChatMessage = { text: string; userName: string };

const createSpotRecord = <T,>(makeValue: () => T): Record<SpotName, T> =>
  V1_SPOTS.reduce((result, spot) => {
    result[spot] = makeValue();
    return result;
  }, {} as Record<SpotName, T>);

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<SpotName | null>(null);
  const [sessionsBySpot, setSessionsBySpot] = useState<Record<SpotName, Session[]>>(createSpotRecord(() => []));
  const [messagesBySpot, setMessagesBySpot] = useState<Record<SpotName, ChatMessage[]>>(createSpotRecord(() => []));

  const resetFlow = () => {
    setSelectedSpot(null);
    setSessionsBySpot(createSpotRecord(() => []));
    setMessagesBySpot(createSpotRecord(() => []));
  };

  const fetchProfile = async (userId: string) => {
    setLoadingProfile(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, created_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      setProfile(null);
    } else {
      setProfile(data ?? null);
    }

    setLoadingProfile(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const nextSession = data.session;
      setSession(nextSession);
      setLoadingSession(false);

      if (nextSession) {
        void fetchProfile(nextSession.user.id);
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
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleUpdateSessionStatus = (spot: SpotName, sessionIndex: number, status: SessionStatus) => {
    setSessionsBySpot((prev) => ({
      ...prev,
      [spot]: prev[spot].map((sessionItem, index) =>
        index === sessionIndex
          ? {
              ...sessionItem,
              status,
            }
          : sessionItem,
      ),
    }));
  };

  if (loadingSession || loadingProfile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0f14', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#ffffff' }}>Laden...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (!profile) {
    return (
      <NameSetupScreen
        userId={session.user.id}
        onSaved={(displayName) => {
          setProfile({
            id: session.user.id,
            display_name: displayName,
            created_at: new Date().toISOString(),
          });
        }}
      />
    );
  }

  if (selectedSpot) {
    return (
      <SpotDetailScreen
        selectedSpot={selectedSpot}
        userName={profile.display_name}
        sessions={sessionsBySpot[selectedSpot]}
        messages={messagesBySpot[selectedSpot]}
        onBack={() => setSelectedSpot(null)}
        onAddSession={(newSession) => {
          setSessionsBySpot((prev) => ({
            ...prev,
            [selectedSpot]: [...prev[selectedSpot], newSession],
          }));
        }}
        onUpdateSessionStatus={(sessionIndex, status) => {
          handleUpdateSessionStatus(selectedSpot, sessionIndex, status);
        }}
        onSendMessage={(newMessage) => {
          setMessagesBySpot((prev) => ({
            ...prev,
            [selectedSpot]: [...prev[selectedSpot], newMessage],
          }));
        }}
      />
    );
  }

  return (
    <HomeScreen
      spots={[...V1_SPOTS]}
      sessionsBySpot={sessionsBySpot}
      onSelectSpot={(spot) => setSelectedSpot(spot as SpotName)}
      profile={profile}
      onLogout={() => {
        resetFlow();
        void supabase.auth.signOut();
      }}
    />
  );
}
