import { SafeAreaView, View, Text } from 'react-native';

const spots = [
  'Scheveningen KZVS',
  'Scheveningen Jump Team',
  'Noordwijk KSN',
  'Rockanje 1e Slag',
  'Rockanje 2e Slag',
  'Maasvlakte 2 Slufter',
];

export default function App() {
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: '#0B0F14',
        paddingHorizontal: 20,
        paddingTop: 20,
      }}
    >
      <View style={{ marginBottom: 20 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 34, fontWeight: '700' }}>SpotBuddy</Text>
        <Text style={{ color: '#9DB0C7', fontSize: 16, marginTop: 6 }}>
          Wie gaat waar vandaag?
        </Text>
      </View>

      <View>
        {spots.map((spot) => (
          <View
            key={spot}
            style={{
              backgroundColor: '#121821',
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>{spot}</Text>
            <Text style={{ color: '#9DB0C7', fontSize: 14, marginTop: 4 }}>0 kiters vandaag</Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}
