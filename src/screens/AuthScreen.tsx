import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { normalizeEmail, hasEmoji, hasRestrictedWord } from '../lib/userValidation';
import { uploadAvatar } from '../lib/avatar';
import { COUNTRIES, getCountry } from '../lib/countries';

const BG = '#07111F';
const CARD = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(255,255,255,0.08)';
const MUTED = 'rgba(255,255,255,0.32)';
const INPUT_STYLE = {
  backgroundColor: CARD,
  color: '#ffffff' as const,
  borderRadius: 999,
  paddingVertical: 8,
  paddingHorizontal: 16,
  fontSize: 13,
  borderWidth: 1,
  borderColor: BORDER,
};

const SKILL_LEVELS = [
  { level: 1, name: 'Beginner ★' },
  { level: 2, name: 'Novice ★★' },
  { level: 3, name: 'Intermediate ★★★' },
  { level: 4, name: 'Advanced ★★★★' },
  { level: 5, name: 'Expert / Pro ★★★★★' },
] as const;

const toEnglishAuthError = (message: string) => {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) return 'Incorrect email or password';
  if (lower.includes('password should be at least')) return 'Password must be at least 6 characters';
  if (lower.includes('already registered') || lower.includes('user already registered')) return 'Email already in use';
  return 'Something went wrong. Please try again.';
};

type AuthScreenProps = {
  onSignupSuccess: () => void;
  onPasswordResetRequest: (email: string) => Promise<{ error: string | null }>;
};

type Mode = 'login' | 'signup' | 'reset';

export default function AuthScreen({ onSignupSuccess, onPasswordResetRequest }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [nationality, setNationality] = useState<string | null>(null);
  const [skillLevel, setSkillLevel] = useState<number | null>(null);
  const [showNationalityPicker, setShowNationalityPicker] = useState(false);
  const [nationalitySearch, setNationalitySearch] = useState('');

  const normalizedEmail = normalizeEmail(email);
  const reset = () => { setError(''); setSuccessMessage(''); };

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  };

  const handleLogin = async () => {
    if (!normalizedEmail || !password) { setError('Enter your email and password'); return; }
    setLoading(true); reset();
    const { error: e } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    setLoading(false);
    if (e) setError(toEnglishAuthError(e.message));
  };

  const handleSignup = async () => {
    const trimmedName = displayName.trim();
    if (!normalizedEmail || !password) { setError('Enter your email and password'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (!trimmedName) { setError('Display name is required'); return; }
    if (hasEmoji(trimmedName)) { setError('Emojis are not allowed in your name'); return; }
    if (hasRestrictedWord(trimmedName)) { setError('Username contains restricted words'); return; }

    setLoading(true); reset();

    const normalizedUsername = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedUsername.includes('spotbuddy')) {
      const { data: sbExists } = await supabase.from('profiles').select('id').ilike('display_name', '%spotbuddy%').limit(1).maybeSingle();
      if (sbExists) { setLoading(false); setError('Username not allowed'); return; }
    }

    const { data: existing } = await supabase.from('profiles').select('id').eq('display_name', trimmedName).limit(1);
    if (existing && existing.length > 0) { setLoading(false); setError('This name is already taken'); return; }

    const { data: authData, error: signUpError } = await supabase.auth.signUp({ email: normalizedEmail, password });
    if (signUpError || !authData.user) { setLoading(false); setError(toEnglishAuthError(signUpError?.message ?? '')); return; }

    const userId = authData.user.id;
    let avatarUrl: string | null = null;
    if (avatarUri) {
      const { error: uploadError, publicUrl } = await uploadAvatar(userId, avatarUri);
      if (!uploadError && publicUrl) avatarUrl = publicUrl;
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId, owner_uid: userId, display_name: trimmedName,
      avatar_url: avatarUrl, nationality: nationality ?? null, skill_level: skillLevel ?? null,
      created_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    setLoading(false);
    if (profileError) { setError('Account created, but profile save failed. Please try again.'); return; }
    onSignupSuccess();
  };

  const handleReset = async () => {
    if (!normalizedEmail) { setError('Enter your email address'); return; }
    setLoading(true); reset();
    const { error: resetError } = await onPasswordResetRequest(normalizedEmail);
    setLoading(false);
    if (resetError) { setError(resetError); return; }
    setSuccessMessage('Reset link sent. Check your email.');
  };

  const selectedCountry = getCountry(nationality);
  const filteredCountries = nationalitySearch.trim()
    ? COUNTRIES.filter(c => c.name.toLowerCase().includes(nationalitySearch.trim().toLowerCase()))
    : COUNTRIES;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">

        {/* Wordmark */}
        <View style={{ alignItems: 'center', marginTop: mode === 'signup' ? 28 : 48, marginBottom: mode === 'signup' ? 16 : 28 }}>
          <Image source={require('../../assets/wordmark.png')} resizeMode="contain" style={{ width: '100%', height: mode === 'signup' ? 100 : 320 }} />
        </View>

        {/* LOGIN */}
        {mode === 'login' && (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Text style={{ color: '#ffffff', fontSize: 32, fontWeight: '900', textAlign: 'center', marginBottom: 16 }}>Welcome!</Text>

            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor={MUTED} style={[INPUT_STYLE, { width: 280 }]} />
            <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" placeholderTextColor={MUTED} style={[INPUT_STYLE, { width: 280 }]} />

            <Pressable onPress={() => { setMode('reset'); reset(); }} style={{ paddingVertical: 2 }}>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>Forgot password?</Text>
            </Pressable>

            {error ? <Text style={{ color: '#ff7e7e', fontSize: 13, textAlign: 'center' }}>{error}</Text> : null}

            <TouchableOpacity disabled={loading} onPress={handleLogin} activeOpacity={0.85}
              style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, paddingVertical: 9, paddingHorizontal: 40, alignItems: 'center', opacity: loading ? 0.6 : 1 }}>
              <Text style={{ color: BG, fontSize: 13, fontWeight: '900' }}>{loading ? 'Logging in...' : 'Log in'}</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: 280, marginVertical: 4 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' }} />
              <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>or</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' }} />
            </View>

            <Text style={{ color: MUTED, fontSize: 13 }}>New to the community?</Text>
            <Pressable onPress={() => { setMode('signup'); reset(); }}
              style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 999, paddingVertical: 9, paddingHorizontal: 32 }}>
              <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '800' }}>Join for free →</Text>
            </Pressable>
          </View>
        )}

        {/* RESET */}
        {mode === 'reset' && (
          <View style={{ gap: 10 }}>
            <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '800', marginBottom: 4 }}>Reset password</Text>
            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor={MUTED} style={INPUT_STYLE} />
            {error ? <Text style={{ color: '#ff7e7e', fontSize: 13 }}>{error}</Text> : null}
            {successMessage ? <Text style={{ color: '#5EF0D0', fontSize: 13 }}>{successMessage}</Text> : null}
            <TouchableOpacity disabled={loading} onPress={handleReset} activeOpacity={0.85}
              style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, paddingVertical: 13, alignItems: 'center', marginTop: 4, opacity: loading ? 0.6 : 1 }}>
              <Text style={{ color: BG, fontSize: 15, fontWeight: '900' }}>{loading ? 'Sending...' : 'Send reset link'}</Text>
            </TouchableOpacity>
            <Pressable onPress={() => { setMode('login'); reset(); }} style={{ paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>← Back to login</Text>
            </Pressable>
          </View>
        )}

        {/* SIGNUP */}
        {mode === 'signup' && (
          <View style={{ gap: 10 }}>
            <View style={{ marginBottom: 8 }}>
              <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '900' }}>Stoked you're joining 🤙</Text>
              <Text style={{ color: MUTED, fontSize: 14, marginTop: 4, lineHeight: 20 }}>Welcome to the SpotBuddy community. We hope it gets you on the water more often.</Text>
            </View>

            {/* Avatar */}
            <Pressable onPress={pickAvatar} style={{ alignItems: 'center', marginBottom: 4 }}>
              {avatarUri ? (
                <View style={{ width: 80, height: 80, borderRadius: 40, overflow: 'hidden' }}>
                  <Image source={{ uri: avatarUri }} style={{ width: '100%', height: '100%' }} />
                </View>
              ) : (
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 30 }}>📷</Text>
                </View>
              )}
              <Text style={{ color: MUTED, fontSize: 12, marginTop: 6 }}>Add photo (optional)</Text>
            </Pressable>

            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor={MUTED} style={INPUT_STYLE} />
            <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Password (min. 6 characters)" placeholderTextColor={MUTED} style={INPUT_STYLE} />
            <TextInput value={displayName} onChangeText={setDisplayName} autoCapitalize="none" placeholder="Display name" placeholderTextColor={MUTED} style={INPUT_STYLE} />

            {/* Nationality */}
            <Pressable onPress={() => { setShowNationalityPicker(v => !v); setNationalitySearch(''); }}
              style={{ ...INPUT_STYLE, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: MUTED, fontSize: 13, fontWeight: '700' }}>Nationality</Text>
              <Text style={{ color: '#ffffff', fontSize: 14 }}>{selectedCountry ? `${selectedCountry.flag}  ${selectedCountry.name}` : 'Not set'}</Text>
            </Pressable>

            {showNationalityPicker ? (
              <View style={{ backgroundColor: 'rgba(8,24,39,0.97)', borderRadius: 14, borderWidth: 1, borderColor: BORDER, maxHeight: 240, overflow: 'hidden' }}>
                <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                  <TextInput value={nationalitySearch} onChangeText={setNationalitySearch} placeholder="Search country…" placeholderTextColor={MUTED} autoFocus
                    style={{ backgroundColor: CARD, color: '#ffffff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderWidth: 1, borderColor: BORDER }} />
                </View>
                <ScrollView keyboardShouldPersistTaps="handled">
                  {filteredCountries.map(c => (
                    <Pressable key={c.code} onPress={() => { setNationality(c.code); setShowNationalityPicker(false); setNationalitySearch(''); }}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)', gap: 12, backgroundColor: nationality === c.code ? 'rgba(255,255,255,0.07)' : 'transparent' }}>
                      <Text style={{ fontSize: 20 }}>{c.flag}</Text>
                      <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: nationality === c.code ? '800' : '500' }}>{c.name}</Text>
                      {nationality === c.code ? <Text style={{ color: '#ffffff', marginLeft: 'auto' }}>✓</Text> : null}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Skill level */}
            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ color: MUTED, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Skill level (optional)</Text>
              <View style={{ gap: 4 }}>
                {SKILL_LEVELS.map(({ level, name }) => {
                  const isActive = skillLevel === level;
                  return (
                    <Pressable key={level} onPress={() => setSkillLevel(isActive ? null : level)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 9, backgroundColor: isActive ? 'rgba(255,255,255,0.09)' : 'transparent', borderWidth: 1, borderColor: isActive ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.04)' }}>
                      <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: isActive ? '#ffffff' : 'rgba(255,255,255,0.25)', backgroundColor: isActive ? '#ffffff' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        {isActive ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: BG }} /> : null}
                      </View>
                      <Text style={{ color: isActive ? '#ffffff' : 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: isActive ? '800' : '500' }}>{name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {error ? <Text style={{ color: '#ff7e7e', fontSize: 13 }}>{error}</Text> : null}

            <TouchableOpacity disabled={loading} onPress={handleSignup} activeOpacity={0.85}
              style={{ backgroundColor: '#ffffff', borderRadius: 999, paddingVertical: 14, alignItems: 'center', opacity: loading ? 0.6 : 1, marginTop: 4 }}>
              <Text style={{ color: BG, fontSize: 15, fontWeight: '900' }}>{loading ? 'Creating account...' : 'Create free account'}</Text>
            </TouchableOpacity>

            <Pressable onPress={() => { setMode('login'); reset(); }} style={{ paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>← Back to login</Text>
            </Pressable>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
