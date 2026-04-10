import { useState } from 'react';
import { Image, Pressable, SafeAreaView, Text, View } from 'react-native';

import { Profile } from '../lib/supabase';

type HomeScreenProps = {
  spots: string[];
  sessionsBySpot: Record<string, { start: string; end: string; status: 'Is er al' | 'Gaat' | 'Ik ben geweest' }[]>;
  onSelectSpot: (spot: string) => void;
  profile: Profile;
  onLogout: () => void;
};

const activeStatuses: Array<'Gaat' | 'Is er al'> = ['Gaat', 'Is er al'];

export default function HomeScreen({ spots, sessionsBySpot, onSelectSpot, profile, onLogout }: HomeScreenProps) {
  const [showProfile, setShowProfile] = useState(false);

  const getKiterText = (count: number) => (count === 1 ? '1 kiter vandaag' : `${count} kiters vandaag`);

  if (showProfile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0f14', paddingHorizontal: 20, paddingTop: 20 }}>
        <Pressable onPress={() => setShowProfile(false)} style={{ marginBottom: 16 }}>
          <Text style={{ color: '#9db0c7' }}>← Terug</Text>
        </Pressable>
        <View style={{ backgroundColor: '#121821', borderRadius: 12, padding: 16 }}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 12 }} />
          ) : null}
          <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '700' }}>{profile.name}</Text>
          <Text style={{ color: '#9db0c7', marginTop: 4 }}>Ingelogd</Text>

          <Pressable onPress={onLogout} style={{ marginTop: 16, backgroundColor: '#0b0f14', borderRadius: 10, padding: 12 }}>
            <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>Uitloggen</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0f14', paddingHorizontal: 20, paddingTop: 20 }}>
      <View style={{ marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ color: '#ffffff', fontSize: 34, fontWeight: '700' }}>SpotBuddy</Text>
          <Text style={{ color: '#9db0c7', fontSize: 16, marginTop: 6 }}>Spot, tijd en gaaaan!</Text>
        </View>
        <Pressable onPress={() => setShowProfile(true)} style={{ backgroundColor: '#121821', borderRadius: 10, padding: 10 }}>
          <Text style={{ color: '#ffffff', fontWeight: '600' }}>{profile.name}</Text>
        </Pressable>
      </View>

      <View>
        {spots.map((spot) => {
          const todayCount = sessionsBySpot[spot]?.filter((session) => activeStatuses.includes(session.status)).length ?? 0;
          const liveCount = sessionsBySpot[spot]?.filter((session) => session.status === 'Is er al').length ?? 0;

          return (
            <Pressable
              key={spot}
              onPress={() => onSelectSpot(spot)}
              style={{
                backgroundColor: '#121821',
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>{spot}</Text>
              <Text style={{ color: '#9db0c7', fontSize: 14, marginTop: 4 }}>{getKiterText(todayCount)}</Text>
              <Text style={{ color: '#9db0c7', fontSize: 14, marginTop: 2 }}>Live: {liveCount}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
