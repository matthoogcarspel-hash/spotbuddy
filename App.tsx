import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, Text } from 'react-native';
import { Session } from '@supabase/supabase-js';

import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import ProfileSetupScreen from './src/screens/ProfileSetupScreen';
import SpotDetailScreen, { Session as SpotSession, SessionStatus } from './src/screens/SpotDetailScreen';
import { Profile, supabase } from './src/lib/supabase';

const spots = [
  'Scheveningen KZVS',
  'Scheveningen Jump Team',
  'Noordwijk KSN',
  'Rockanje 1e Slag',
  'Rockanje 2e Slag',
  'Maasvlakte 2 Slufter',
];

type SpotMessage = {
  text: string;
  userName: string;
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null);
  const [sessionsBySpot, setSessionsBySpot] = useState<Record<string, SpotSession[]>>({});
  const [messagesBySpot, setMessagesBySpot] = useState<Record<string, SpotMessage[]>>({});

  const loadProfile = async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

    if (error) {
      console.warn('Could not fetch profile:', error.message);
      setProfile(null);
      return;
    }

    setProfile(data ?? null);
  };

  useEffect(() => {
    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session ?? null);

      if (data.session?.user.id) {
        await loadProfile(data.session.user.id);
      }

      setIsLoading(false);
    };

    void bootstrap();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession?.user.id) {
        setProfile(null);
        return;
      }

      void loadProfile(nextSession.user.id);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSelectedSpot(null);
    setSessionsBySpot({});
    setMessagesBySpot({});
  };

  const updateSessionStatus = (spot: string, sessionIndex: number, status: SessionStatus) => {
    setSessionsBySpot((prev) => {
      const spotSessions = prev[spot] ?? [];

      if (!spotSessions[sessionIndex]) {
        return prev;
      }

      const nextSessions = [...spotSessions];
      nextSessions[sessionIndex] = { ...nextSessions[sessionIndex], status };

      return { ...prev, [spot]: nextSessions };
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0f14', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#ffffff" />
        <Text style={{ color: '#9db0c7', marginTop: 12 }}>SpotBuddy laden...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <AuthScreen onSignedUp={() => setProfile(null)} />;
  }

  if (!profile) {
    return <ProfileSetupScreen userId={session.user.id} onSaved={() => loadProfile(session.user.id)} />;
  }

  if (selectedSpot) {
    return (
      <SpotDetailScreen
        selectedSpot={selectedSpot}
        userName={profile.name}
        sessions={sessionsBySpot[selectedSpot] ?? []}
        messages={messagesBySpot[selectedSpot] ?? []}
        onBack={() => setSelectedSpot(null)}
        onAddSession={(sessionData) => {
          setSessionsBySpot((prev) => ({
            ...prev,
            [selectedSpot]: [...(prev[selectedSpot] ?? []), sessionData],
          }));
        }}
        onUpdateSessionStatus={(sessionIndex, status) => updateSessionStatus(selectedSpot, sessionIndex, status)}
        onSendMessage={(message) => {
          setMessagesBySpot((prev) => ({
            ...prev,
            [selectedSpot]: [...(prev[selectedSpot] ?? []), message],
          }));
        }}
      />
    );
  }

  return (
    <HomeScreen
      spots={spots}
      sessionsBySpot={sessionsBySpot}
      onSelectSpot={setSelectedSpot}
      profile={profile}
      onLogout={handleLogout}
    />
  );
}
