import { SafeAreaView, View, Text, Pressable, TextInput } from 'react-native';
import { useState } from 'react';

const spots = [
  'Scheveningen KZVS',
  'Scheveningen Jump Team',
  'Noordwijk KSN',
  'Rockanje 1e Slag',
  'Rockanje 2e Slag',
  'Maasvlakte 2 Slufter',
];

type Session = {
  start: string;
  end: string;
};

export default function App() {
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [sessionsBySpot, setSessionsBySpot] = useState<Record<string, Session>>({});

  const currentSession = selectedSpot ? sessionsBySpot[selectedSpot] : undefined;

  const handleSave = () => {
    if (!selectedSpot) {
      return;
    }

    const start = startTime.trim();
    const end = endTime.trim();

    if (!start || !end) {
      return;
    }

    setSessionsBySpot((prev) => ({
      ...prev,
      [selectedSpot]: { start, end },
    }));
    setShowForm(false);
    setStartTime('');
    setEndTime('');
  };

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: '#0b0f14',
        paddingHorizontal: 20,
        paddingTop: 20,
      }}
    >
      {!selectedSpot ? (
        <View>
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: '#ffffff', fontSize: 34, fontWeight: '700' }}>SpotBuddy</Text>
            <Text style={{ color: '#9db0c7', fontSize: 16, marginTop: 6 }}>
              Wie gaat waar vandaag?
            </Text>
          </View>

          <View>
            {spots.map((spot) => (
              <Pressable
                key={spot}
                onPress={() => {
                  setSelectedSpot(spot);
                  setShowForm(false);
                  setStartTime('');
                  setEndTime('');
                }}
                style={{
                  backgroundColor: '#121821',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>{spot}</Text>
                <Text style={{ color: '#9db0c7', fontSize: 14, marginTop: 4 }}>0 kiters vandaag</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <View>
          <Pressable
            onPress={() => {
              setSelectedSpot(null);
              setShowForm(false);
              setStartTime('');
              setEndTime('');
            }}
            style={{ marginBottom: 18 }}
          >
            <Text style={{ color: '#9db0c7', fontSize: 15 }}>← Terug</Text>
          </Pressable>

          <View
            style={{
              backgroundColor: '#121821',
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '700' }}>{selectedSpot}</Text>

            <Pressable
              onPress={() => setShowForm(true)}
              style={{
                marginTop: 14,
                backgroundColor: '#0b0f14',
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Ik ga vandaag</Text>
            </Pressable>

            {showForm ? (
              <View style={{ marginTop: 14 }}>
                <TextInput
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="Starttijd, bv 13:00"
                  placeholderTextColor="#9db0c7"
                  style={{
                    backgroundColor: '#0b0f14',
                    color: '#ffffff',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginBottom: 10,
                  }}
                />
                <TextInput
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="Eindtijd, bv 16:30"
                  placeholderTextColor="#9db0c7"
                  style={{
                    backgroundColor: '#0b0f14',
                    color: '#ffffff',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginBottom: 10,
                  }}
                />
                <Pressable
                  onPress={handleSave}
                  style={{
                    backgroundColor: '#0b0f14',
                    borderRadius: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                  }}
                >
                  <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Opslaan</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View
            style={{
              backgroundColor: '#121821',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
              Sessies
            </Text>
            {currentSession ? (
              <Text style={{ color: '#ffffff', fontSize: 15 }}>
                Jij: {currentSession.start} - {currentSession.end}
              </Text>
            ) : (
              <View>
                <Text style={{ color: '#9db0c7', fontSize: 15 }}>Nog niemand ingepland</Text>
                <Text style={{ color: '#9db0c7', fontSize: 15, marginTop: 4 }}>
                  Jij kunt de eerste zijn
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
