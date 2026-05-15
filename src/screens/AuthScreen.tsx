import { useState } from 'react';
import { Image, Pressable, SafeAreaView, Text, TextInput, View } from 'react-native';

import { supabase } from '../lib/supabase';
import { isAdminEmailException, normalizeEmail } from '../lib/userValidation';

type AuthScreenProps = {
  onSignupSuccess: () => void;
  onPasswordResetRequest: (email: string) => Promise<{ error: string | null }>;
};

const toEnglishAuthError = (message: string) => {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) return 'Incorrect email or password';
  if (lower.includes('password should be at least')) return 'Password is too short';
  if (lower.includes('already registered') || lower.includes('user already registered')) return 'Email already in use';
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
    if (!normalizedEmail || !password) { setError('Enter your email and password'); return false; }
    return true;
  };

  const handleLogin = async () => {
    if (!validateInputs()) return;
    setLoadingAction('login'); setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    setLoadingAction(null);
    if (signInError) setError(toEnglishAuthError(signInError.message));
  };

  const handleSignup = async () => {
    if (!validateInputs()) return;
    setLoadingAction('signup'); setError('');
    const { data: existingUsers, error: existingUsersError } = await supabase
      .from('profiles').select('id').eq('email', normalizedEmail).limit(1);
    if (!existingUsersError && !isAdminEmailException(normalizedEmail) && (existingUsers?.length ?? 0) > 0) {
      setLoadingAction(null); setError('Email already in use'); return;
    }
    const { error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail, password, options: { data: { email: normalizedEmail } },
    });
    setLoadingAction(null);
    if (signUpError) { setError(toEnglishAuthError(signUpError.message)); return; }
    onSignupSuccess();
  };

  const handleResetPassword = async () => {
    if (!normalizedEmail) { setError('Enter your email address'); setSuccessMessage(''); return; }
    setLoadingAction('reset'); setError(''); setSuccessMessage('');
    const { error: resetError } = await onPasswordResetRequest(normalizedEmail);
    setLoadingAction(null);
    if (resetError) { setError(resetError); return; }
    setSuccessMessage('Reset link sent. Check your email.');
  };

  const openResetMode = () => { setAuthMode('reset'); setPassword(''); setError(''); setSuccessMessage(''); };
  const backToLoginMode = () => { setAuthMode('login'); setError(''); setSuccessMessage(''); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#07111F', paddingHorizontal: 24 }}>

      {/* Wordmark groot */}
      <View style={{ marginTop: 80, alignItems: 'center' }}>
        <Image
          source={require('../../assets/wordmark.png')}
          resizeMode="contain"
          style={{ width: '100%', height: 140 }}
        />
      </View>

      {/* Form */}
      <View style={{ marginTop: 48, gap: 10 }}>

        {/* Invoervelden */}
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor="rgba(255,255,255,0.32)"
          style={{
            backgroundColor: 'rgba(255,255,255,0.06)',
            color: '#ffffff',
            borderRadius: 12,
            padding: 14,
            fontSize: 15,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        />

        {authMode === 'login' ? (
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor="rgba(255,255,255,0.32)"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              color: '#ffffff',
              borderRadius: 12,
              padding: 14,
              fontSize: 15,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          />
        ) : null}

        {authMode === 'login' ? (
          <Pressable onPress={openResetMode} disabled={loadingAction !== null} style={{ paddingVertical: 2 }}>
            <Text style={{ color: 'rgba(255,255,255,0.38)', fontSize: 13 }}>Forgot password?</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={{ color: '#ff7e7e', fontSize: 13 }}>{error}</Text> : null}
        {successMessage ? <Text style={{ color: '#5EF0D0', fontSize: 13 }}>{successMessage}</Text> : null}

        {/* Knoppen */}
        <View style={{ gap: 10, marginTop: 6 }}>
          {authMode === 'login' ? (
            <>
              <Pressable
                disabled={loadingAction !== null}
                onPress={handleLogin}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.92)',
                  borderRadius: 12,
                  paddingVertical: 14,
                  paddingHorizontal: 40,
                  alignItems: 'center',
                  alignSelf: 'center',
                  minWidth: 200,
                  opacity: loadingAction !== null ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#07111F', fontSize: 15, fontWeight: '900' }}>
                  {loadingAction === 'login' ? 'Logging in...' : 'Log in'}
                </Text>
              </Pressable>

              <Pressable
                disabled={loadingAction !== null}
                onPress={handleSignup}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  borderRadius: 12,
                  paddingVertical: 14,
                  paddingHorizontal: 40,
                  alignItems: 'center',
                  alignSelf: 'center',
                  minWidth: 200,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.10)',
                  opacity: loadingAction !== null ? 0.6 : 1,
                }}
              >
                <Text style={{ color: 'rgba(255,255,255,0.80)', fontSize: 15, fontWeight: '700' }}>
                  {loadingAction === 'signup' ? 'Creating account...' : 'Create account'}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                disabled={loadingAction !== null}
                onPress={handleResetPassword}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.92)',
                  borderRadius: 12,
                  paddingVertical: 14,
                  paddingHorizontal: 40,
                  alignItems: 'center',
                  alignSelf: 'center',
                  minWidth: 200,
                  opacity: loadingAction !== null ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#07111F', fontSize: 15, fontWeight: '900' }}>
                  {loadingAction === 'reset' ? 'Sending...' : 'Send reset link'}
                </Text>
              </Pressable>
              <Pressable onPress={backToLoginMode} disabled={loadingAction !== null} style={{ padding: 12, alignItems: 'center' }}>
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>Back to login</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
