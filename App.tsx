import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SpotBuddy</Text>
        <Text style={styles.subtitle}>Wie gaat waar vandaag?</Text>
      </View>

      <View style={styles.list}>
        {spots.map((spot) => (
          <View key={spot} style={styles.card}>
            <Text style={styles.spotName}>{spot}</Text>
            <Text style={styles.spotMeta}>0 kiters vandaag</Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f14',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#9db0c7',
    fontSize: 16,
  },
  list: {
    gap: 10,
  },
  card: {
    backgroundColor: '#121821',
    borderRadius: 12,
    padding: 14,
  },
  spotName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  spotMeta: {
    color: '#9db0c7',
    fontSize: 14,
  },
});
