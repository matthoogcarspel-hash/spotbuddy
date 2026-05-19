import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { uploadAvatar } from '../lib/avatar';
import { Profile, supabase } from '../lib/supabase';
import { hasBlockedSpotbuddyName, hasEmoji, hasRestrictedWord, normalizeEmail } from '../lib/userValidation';
import { COUNTRIES, getCountry } from '../lib/countries';

const BG = '#071421';
const CARD = 'rgba(255,255,255,0.05)';
const BORDER = 'rgba(255,255,255,0.08)';
const MUTED = 'rgba(255,255,255,0.35)';

const SKILL_LEVELS = [
  { level: 1, name: 'Beginner', sub: 'I still need instruction and support.' },
  { level: 2, name: 'Novice', sub: "I can do the basics, but I'm still inconsistent." },
  { level: 3, name: 'Intermediate', sub: 'I ride independently in normal conditions.' },
  { level: 4, name: 'Advanced', sub: 'I have strong control in challenging conditions.' },
  { level: 5, name: 'Expert / Pro', sub: 'I have elite skill, precision, and consistency.' },
] as const;

type Props = {
  userId: string;
  userEmail: string;
  onSaved: (profile: Profile) => void;
};

export default function NameSetupScreen({ userId, userEmail, onSaved }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [nationality, setNationality] = useState<string | null>(null);
  const [skillLevel, setSkillLevel] = useState<number | null>(null);
  const [showNationalityPicker, setShowNationalityPicker] = useState(false);
  const [nationalitySearch, setNationalitySearch] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const pickAvatar = async () => {
    setError('');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { setError('Allow photo access to choose a profile photo'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  };

  const handleSave = async () => {
    const trimmedName = displayName.trim();
    if (!trimmedName) { setError('Display name is required'); return; }
    if (hasEmoji(trimmedName)) { setError('Emojis are not allowed in your name'); return; }
    if (hasRestrictedWord(trimmedName)) { setError('Username contains restricted words'); return; }

    // SpotBuddy naam: alleen toestaan als er nog geen bestaat
    const normalized = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized.includes('spotbuddy')) {
      const { data: existing } = await supabase.from('profiles').select('id').ilike('display_name', '%spotbuddy%').limit(1).maybeSingle();
      if (existing) { setError('Username not allowed'); return; }
    }

    setError('');
    setIsLoading(true);

    const { data: existingProfile } = await supabase.from('profiles').select('id').eq('display_name', trimmedName).neq('id', userId).maybeSingle();
    if (existingProfile) { setIsLoading(false); setError('This name is already taken'); return; }

    let avatarUrl: string | null = null;
    if (avatarUri) {
      const { error: uploadError, publicUrl } = await uploadAvatar(userId, avatarUri);
      if (!uploadError && publicUrl) avatarUrl = publicUrl;
    }

    const { data: savedProfile, error: upsertError } = await supabase
      .from('profiles')
      .upsert({ id: userId, owner_uid: userId, display_name: trimmedName, avatar_url: avatarUrl, nationality: nationality ?? null, skill_level: skillLevel ?? null, created_at: new Date().toISOString() }, { onConflict: 'id' })
      .select('id, display_name, avatar_url, created_at').single();

    setIsLoading(false);
    if (upsertError) { setError(upsertError.code === '23505' ? 'This name is already taken' : upsertError.message); return; }
    onSaved(savedProfile);
  };

  const selectedCountry = getCountry(nationality);
  const filteredCountries = nationalitySearch.trim()
    ? COUNTRIES.filter(c => c.name.toLowerCase().includes(nationalitySearch.trim().toLowerCase()))
    : COUNTRIES;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">

        {/* Wordmark */}
        <View style={{ alignItems: 'center', marginTop: 32, marginBottom: 24 }}>
          <Image source={require('../../assets/wordmark.png')} resizeMode="contain" style={{ width: '100%', height: 130 }} />
        </View>

        <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '900', marginBottom: 4 }}>Complete your profile</Text>
        <Text style={{ color: MUTED, fontSize: 13, marginBottom: 20 }}>{userEmail}</Text>

        {/* Avatar */}
        <Pressable onPress={pickAvatar} style={{ alignItems: 'center', marginBottom: 20 }}>
          {avatarUri ? (
            <View style={{ width: 96, height: 96, borderRadius: 48, overflow: 'hidden', borderWidth: 3, borderColor: BG }}>
              <Image source={{ uri: avatarUri }} style={{ width: '100%', height: '100%' }} />
            </View>
          ) : (
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 36 }}>📷</Text>
            </View>
          )}
          <Text style={{ color: MUTED, fontSize: 12, marginTop: 8 }}>Tap to add photo</Text>
        </Pressable>

        {/* Display name */}
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Display name"
          placeholderTextColor={MUTED}
          autoCapitalize="none"
          style={{ backgroundColor: CARD, color: '#ffffff', borderRadius: 12, padding: 14, fontSize: 16, borderWidth: 1, borderColor: BORDER, marginBottom: 10 }}
        />

        {/* Nationality */}
        <Pressable
          onPress={() => { setShowNationalityPicker(v => !v); setNationalitySearch(''); }}
          style={{ backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}
        >
          <Text style={{ color: MUTED, fontSize: 13, fontWeight: '700' }}>Nationality</Text>
          <Text style={{ color: '#ffffff', fontSize: 14 }}>{selectedCountry ? `${selectedCountry.flag}  ${selectedCountry.name}` : 'Not set'}</Text>
        </Pressable>

        {showNationalityPicker ? (
          <View style={{ backgroundColor: 'rgba(8,24,39,0.97)', borderRadius: 14, borderWidth: 1, borderColor: BORDER, maxHeight: 260, overflow: 'hidden', marginBottom: 10 }}>
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
        <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 10 }}>
          <Text style={{ color: MUTED, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>Rate your skills</Text>
          {SKILL_LEVELS.map(({ level, name, sub }) => {
            const isSelected = skillLevel === level;
            return (
              <Pressable key={level} onPress={() => setSkillLevel(isSelected ? null : level)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 9, marginBottom: 4, backgroundColor: isSelected ? 'rgba(255,255,255,0.09)' : 'transparent', borderWidth: 1, borderColor: isSelected ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.04)' }}>
                <View style={{ width: 15, height: 15, borderRadius: 8, borderWidth: 2, borderColor: isSelected ? '#ffffff' : 'rgba(255,255,255,0.25)', backgroundColor: isSelected ? '#ffffff' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {isSelected ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: BG }} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '800' }}>
                    {name} <Text style={{ color: '#FFD166', fontWeight: '400' }}>{'★'.repeat(level)}</Text>
                  </Text>
                  <Text style={{ color: MUTED, fontSize: 11, marginTop: 1 }}>{sub}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 10 }}>{error}</Text> : null}

        <TouchableOpacity disabled={isLoading} onPress={handleSave} activeOpacity={0.85}
          style={{ backgroundColor: '#ffffff', borderRadius: 14, paddingVertical: 15, alignItems: 'center', opacity: isLoading ? 0.6 : 1 }}>
          <Text style={{ color: BG, fontSize: 16, fontWeight: '900' }}>{isLoading ? 'Saving...' : 'Save profile'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
