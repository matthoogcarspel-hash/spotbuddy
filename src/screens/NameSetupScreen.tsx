import { useState } from 'react';

import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, SafeAreaView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { uploadAvatar } from '../lib/avatar';
import { Profile, supabase } from '../lib/supabase';
import { hasBlockedSpotbuddyName, hasEmoji, hasRestrictedWord, normalizeEmail } from '../lib/userValidation';

type NameSetupScreenProps = {
  userId: string;
  onSaved: (profile: Profile) => void;
};

function AvatarPreview({ uri }: { uri: string }) {
  return (
    <Image
      source={{ uri }}
      style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: '#071421' }}
    />
  );
}

export default function NameSetupScreen({ userId, onSaved }: NameSetupScreenProps) {
  const [displayName, setDisplayName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [saveButtonClicked, setSaveButtonClicked] = useState(false);
  const [saveStatusText, setSaveStatusText] = useState('');

  const pickAvatar = async () => {
    setError('');
    setWarning('');

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError("Allow photo access to choose a profile photo");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    
    setSaveStatusText('Save button works');
    setSaveButtonClicked(true);

    setTimeout(() => {
      setSaveButtonClicked(false);
    }, 1200);

    const trimmedName = displayName.trim();

    if (!trimmedName) {
      setError('Display name is required');
      return;
    }

    const { data: authUserData } = await supabase.auth.getUser();
    const normalizedEmail = normalizeEmail(authUserData.user?.email ?? '');

    if (hasEmoji(trimmedName)) {
      setError('Emojis are not allowed in your name');
      return;
    }

    if (hasBlockedSpotbuddyName(trimmedName, normalizedEmail)) {

      setError('Username not allowed');
      return;
    }

    if (hasRestrictedWord(trimmedName)) {

      setError('Username contains restricted words');
      return;
    }

    setError('');
    setWarning('');
    setIsLoading(true);

    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('display_name', trimmedName)
      .neq('id', userId)
      .maybeSingle();

    if (existingProfileError) {
      setIsLoading(false);
      setError('Something went wrong. Please try again.');
      return;
    }

    if (existingProfile) {
      setIsLoading(false);
      setError('This name is already taken');
      return;
    }

    let avatarUrl: string | null = null;

    if (avatarUri) {
      try {
        const { error: uploadError, publicUrl } = await uploadAvatar(userId, avatarUri);
        if (uploadError || !publicUrl) {
          throw uploadError ?? new Error('Avatar URL is missing');
        }

        avatarUrl = publicUrl;
      } catch (uploadError) {
        
        setWarning('Photo upload failed. Profile will be created without an avatar.');
      }
    }

    const createdAt = new Date().toISOString();

    const profilePayload = {
      id: userId,
      owner_uid: userId,
      display_name: trimmedName,
      avatar_url: avatarUrl,
      created_at: createdAt,
    };


    const { data: savedProfile, error: upsertError } = await supabase
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' })
      .select('id, display_name, avatar_url, created_at')
      .single();

    setIsLoading(false);

    if (upsertError) {
      console.error('Failed to save profile:', upsertError);
      if (upsertError.code === '23505') {
        setError('This name is already taken');
        return;
      }

      setError(upsertError.message);
      return;
    }

    
    onSaved(savedProfile);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#071421', paddingHorizontal: 20, paddingTop: 20 }}>
      <View style={{ marginTop: 40, gap: 12 }}>
        <Text style={{ color: '#ffffff', fontSize: 28, fontWeight: '900', marginBottom: 8 }}>Create your profile</Text>

        {/* Avatar */}
        <Pressable onPress={pickAvatar} style={{ alignItems: 'center', marginBottom: 4 }}>
          {avatarUri ? (
            <AvatarPreview uri={avatarUri} />
          ) : (
            <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 32 }}>📷</Text>
            </View>
          )}
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 8 }}>Tap to add photo</Text>
        </Pressable>

        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Display name"
          placeholderTextColor="rgba(255,255,255,0.3)"
          autoCapitalize="none"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: '#ffffff', borderRadius: 12, padding: 14, fontSize: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
        />

        {error ? <Text style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</Text> : null}
        {warning ? <Text style={{ color: '#f2c66d', fontSize: 12 }}>{warning}</Text> : null}

        <TouchableOpacity
          disabled={isLoading}
          onPress={handleSave}
          activeOpacity={0.85}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 14,
            paddingVertical: 15,
            alignItems: 'center',
            opacity: isLoading ? 0.6 : 1,
            marginTop: 4,
          }}
        >
          <Text style={{ color: '#071421', fontSize: 16, fontWeight: '900' }}>
            {isLoading ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
