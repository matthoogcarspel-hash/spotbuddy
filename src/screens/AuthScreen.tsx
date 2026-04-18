import { useState } from 'react';
import { Pressable, SafeAreaView, Text, TextInput, View } from 'react-native';

import { supabase } from '../lib/supabase';
import { isAdminEmailException, normalizeEmail } from '../lib/userValidation';

type AuthScreenProps = {
  onSignupSuccess: () => void;
  onPasswordResetRequest: (email: string) => Promise<{ error: string | null }>;
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
    return 'Email already in use';
  }

  return 'Something went wrong. Please try again.';
};

export default function AuthScreen({ onSignupSuccess, onPasswordResetRequest }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loadingAction, setLoadingAction] = useState<'login' | 'signup' | 'reset' | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'reset'>('login');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const normalizedEmail = normalizeEmail(email);

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

    const { data: existingUsers, error: existingUsersError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', normalizedEmail)
      .limit(1);

    if (existingUsersError) {
      console.log('EMAIL_DUPLICATE_LOOKUP_FAILED', existingUsersError.message);
    }

    if (!existingUsersError && !isAdminEmailException(normalizedEmail) && (existingUsers?.length ?? 0) > 0) {
      console.log('EMAIL_DUPLICATE_BLOCKED', normalizedEmail);
      setLoadingAction(null);
      setError('Email already in use');
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          email: normalizedEmail,
        },
      },
    });

    setLoadingAction(null);

    if (signUpError) {
      setError(toEnglishAuthError(signUpError.message));
      return;
    }

    onSignupSuccess();
  };

  const handleResetPassword = async () => {
    if (!normalizedEmail) {
      setError('Enter your email address');
      setSuccessMessage('');
      return;
    }

    setLoadingAction('reset');
    setError('');
    setSuccessMessage('');

    const { error: resetError } = await onPasswordResetRequest(normalizedEmail);

    setLoadingAction(null);

    if (resetError) {
      setError(resetError);
      return;
    }

    setSuccessMessage('Reset link sent. Check your email.');
  };

  const openResetMode = () => {
    setAuthMode('reset');
    setPassword('');
    setError('');
    setSuccessMessage('');
  };

  const backToLoginMode = () => {
    setAuthMode('login');
    setError('');
    setSuccessMessage('');
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
        {authMode === 'login' ? (
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor="#9db0c7"
            style={{ backgroundColor: '#0b0f14', color: '#ffffff', borderRadius: 10, padding: 12, marginBottom: 12 }}
          />
        ) : null}

        {authMode === 'login' ? (
          <Pressable onPress={openResetMode} disabled={loadingAction !== null} style={{ marginBottom: 12 }}>
            <Text style={{ color: '#9db0c7' }}>Forgot password?</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={{ color: '#ff6b6b', marginBottom: 10 }}>{error}</Text> : null}
        {successMessage ? <Text style={{ color: '#79d4a0', marginBottom: 10 }}>{successMessage}</Text> : null}

        {authMode === 'login' ? (
          <>
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
          </>
        ) : (
          <>
            <Pressable
              disabled={loadingAction !== null}
              onPress={handleResetPassword}
              style={{ backgroundColor: '#0b0f14', borderRadius: 10, padding: 12, marginBottom: 10, opacity: loadingAction !== null ? 0.6 : 1 }}
            >
              <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>
                {loadingAction === 'reset' ? 'Loading...' : 'Send reset link'}
              </Text>
            </Pressable>
            <Pressable onPress={backToLoginMode} disabled={loadingAction !== null}>
              <Text style={{ color: '#9db0c7', textAlign: 'center' }}>Back to login</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
