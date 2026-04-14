import { useState } from 'react';
import { Pressable, SafeAreaView, Text, TextInput, View } from 'react-native';

import { supabase } from '../lib/supabase';

type AuthScreenProps = {
  onSignupSuccess: () => void;
};

const toEnglishAuthError = (message: string) => {
  const lower = message.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return 'Incorrect email or password';
  }

  if (lower.includes('password should be at least')) {
    return 'Password is too short';
  }

  if (lower.includes('already registered') || lower.includes('user already registered')) {
    return 'This email address is already registered';
  }

  return 'Something went wrong. Please try again.';
};

export default function AuthScreen({ onSignupSuccess }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loadingAction, setLoadingAction] = useState<'login' | 'signup' | null>(null);
  const [error, setError] = useState('');

  const normalizedEmail = email.trim().toLowerCase();

  const validateInputs = () => {
    if (!normalizedEmail || !password) {
      setError('Enter your email and password');
      return false;
    }

    return true;
  };

  const handleLogin = async () => {
    if (!validateInputs()) {
      return;
    }

    setLoadingAction('login');
    setError('');

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    setLoadingAction(null);

    if (signInError) {
      setError(toEnglishAuthError(signInError.message));
    }
  };

  const handleSignup = async () => {
    if (!validateInputs()) {
      return;
    }

    setLoadingAction('signup');
    setError('');

    const { error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
    });

    setLoadingAction(null);

    if (signUpError) {
      setError(toEnglishAuthError(signUpError.message));
      return;
    }

    onSignupSuccess();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0f14', paddingHorizontal: 20, paddingTop: 20 }}>
      <View style={{ marginTop: 40 }}>
        <Text style={{ color: '#ffffff', fontSize: 34, fontWeight: '700' }}>SpotBuddy</Text>
      </View>

      <View style={{ marginTop: 30, backgroundColor: '#121821', borderRadius: 12, padding: 16 }}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor="#9db0c7"
          style={{ backgroundColor: '#0b0f14', color: '#ffffff', borderRadius: 10, padding: 12, marginBottom: 10 }}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor="#9db0c7"
          style={{ backgroundColor: '#0b0f14', color: '#ffffff', borderRadius: 10, padding: 12, marginBottom: 12 }}
        />

        {error ? <Text style={{ color: '#ff6b6b', marginBottom: 10 }}>{error}</Text> : null}

        <Pressable
          disabled={loadingAction !== null}
          onPress={handleLogin}
          style={{
            backgroundColor: '#0b0f14',
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
            opacity: loadingAction !== null ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>
            {loadingAction === 'login' ? 'Loading...' : 'Log in'}
          </Text>
        </Pressable>

        <Pressable
          disabled={loadingAction !== null}
          onPress={handleSignup}
          style={{ backgroundColor: '#0b0f14', borderRadius: 10, padding: 12, opacity: loadingAction !== null ? 0.6 : 1 }}
        >
          <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>
            {loadingAction === 'signup' ? 'Loading...' : 'Create account'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
