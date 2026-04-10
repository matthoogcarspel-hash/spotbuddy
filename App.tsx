import { useEffect, useMemo, useState } from 'react';

import { Session } from '@supabase/supabase-js';
import { SafeAreaView, Text } from 'react-native';

import { supabase } from './src/lib/supabase';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const userEmail = session?.user.email ?? '';
  const profileName = useMemo(() => {
    if (!userEmail) {
      return 'Kiter';
    }

    return userEmail.split('@')[0] || 'Kiter';
  }, [userEmail]);

  if (loadingSession) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0f14', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#ffffff' }}>Laden...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <HomeScreen
      spots={['Workum', 'Scheveningen', 'Brouwersdam']}
      sessionsBySpot={{ Workum: [], Scheveningen: [], Brouwersdam: [] }}
      onSelectSpot={() => undefined}
      profile={{
        id: session.user.id,
        name: profileName,
        avatar_url: null,
        created_at: new Date().toISOString(),
      }}
      onLogout={() => {
        void supabase.auth.signOut();
      }}
    />
  );
}
