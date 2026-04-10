import { useState } from 'react';
import { Pressable, SafeAreaView, Text, TextInput, View } from 'react-native';

import { supabase } from '../lib/supabase';

type AuthScreenProps = {
  onSignedUp: () => void;
};

export default function AuthScreen({ onSignedUp }: AuthScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAuth = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError('Vul e-mail en wachtwoord in.');
      return;
    }

    setError('');
    setIsLoading(true);

    if (isSignUp) {
      const { error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      setIsLoading(false);

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      onSignedUp();
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    setIsLoading(false);

    if (signInError) {
      setError(signInError.message);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0f14', paddingHorizontal: 20, paddingTop: 20 }}>
      <View style={{ marginTop: 40 }}>
        <Text style={{ color: '#ffffff', fontSize: 34, fontWeight: '700' }}>SpotBuddy</Text>
        <Text style={{ color: '#9db0c7', fontSize: 16, marginTop: 6 }}>Inloggen of account maken</Text>
      </View>

      <View style={{ marginTop: 30, backgroundColor: '#121821', borderRadius: 12, padding: 16 }}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="E-mail"
          placeholderTextColor="#9db0c7"
          style={{ backgroundColor: '#0b0f14', color: '#ffffff', borderRadius: 10, padding: 12, marginBottom: 10 }}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Wachtwoord"
          placeholderTextColor="#9db0c7"
          style={{ backgroundColor: '#0b0f14', color: '#ffffff', borderRadius: 10, padding: 12, marginBottom: 12 }}
        />

        {error ? <Text style={{ color: '#ff6b6b', marginBottom: 10 }}>{error}</Text> : null}

        <Pressable
          disabled={isLoading}
          onPress={handleAuth}
          style={{ backgroundColor: '#0b0f14', borderRadius: 10, padding: 12, opacity: isLoading ? 0.6 : 1 }}
        >
          <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>
            {isLoading ? 'Even wachten...' : isSignUp ? 'Account maken' : 'Inloggen'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setIsSignUp((prev) => !prev);
            setError('');
          }}
          style={{ marginTop: 12 }}
        >
          <Text style={{ color: '#9db0c7', textAlign: 'center' }}>
            {isSignUp ? 'Heb je al een account? Log in' : 'Nog geen account? Maak er een'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
