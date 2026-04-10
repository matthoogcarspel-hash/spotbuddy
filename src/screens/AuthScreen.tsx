import { Pressable, SafeAreaView, Text, TextInput, View } from 'react-native';

export default function AuthScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0f14', paddingHorizontal: 20, paddingTop: 20 }}>
      <View style={{ marginTop: 40 }}>
        <Text style={{ color: '#ffffff', fontSize: 34, fontWeight: '700' }}>SpotBuddy</Text>
      </View>

      <View style={{ marginTop: 30, backgroundColor: '#121821', borderRadius: 12, padding: 16 }}>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor="#9db0c7"
          style={{ backgroundColor: '#0b0f14', color: '#ffffff', borderRadius: 10, padding: 12, marginBottom: 10 }}
        />
        <TextInput
          secureTextEntry
          placeholder="Password"
          placeholderTextColor="#9db0c7"
          style={{ backgroundColor: '#0b0f14', color: '#ffffff', borderRadius: 10, padding: 12, marginBottom: 12 }}
        />

        <Pressable style={{ backgroundColor: '#0b0f14', borderRadius: 10, padding: 12, marginBottom: 10 }}>
          <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>Login</Text>
        </Pressable>

        <Pressable style={{ backgroundColor: '#0b0f14', borderRadius: 10, padding: 12 }}>
          <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>Account aanmaken</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
