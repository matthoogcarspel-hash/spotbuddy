import { useState } from 'react';

import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, SafeAreaView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { uploadAvatar } from '../lib/avatar';
import { Profile, supabase } from '../lib/supabase';
import { hasBlockedSpotbuddyName, hasRestrictedWord, normalizeEmail } from '../lib/userValidation';

type NameSetupScreenProps = {
  userId: string;
  onSaved: (profile: Profile) => void;
};

function AvatarPreview({ uri }: { uri: string }) {
  return (
    <Image
      source={{ uri }}
      style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#223247' }}
    />
  );
}

export default function NameSetupScreen({ userId, onSaved }: NameSetupScreenProps) {
  const [displayName, setDisplayName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [saveButtonClicked, setSaveButtonClicked] = useState(false);
  const [saveStatusText, setSaveStatusText] = useState('');

  const pickAvatar = async () => {
    setError('');

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
    console.log('SAVE_BUTTON_CLICKED');
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

    if (hasBlockedSpotbuddyName(trimmedName, normalizedEmail)) {
      console.log('SPOTBUDDY_NAME_BLOCKED', trimmedName);
      setError('Username not allowed');
      return;
    }

    if (hasRestrictedWord(trimmedName)) {
      console.log('USERNAME_VALIDATION_FAILED', trimmedName);
      setError('Username contains restricted words');
      return;
    }

    setError('');
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
      const { error: uploadError, publicUrl } = await uploadAvatar(userId, avatarUri);
      if (uploadError) {
        setIsLoading(false);
        setError('Photo upload failed');
        return;
      }

      if (!publicUrl) {
        setIsLoading(false);
        setError('Avatar URL is missing');
        return;
      }

      avatarUrl = publicUrl;
    }

    const createdAt = new Date().toISOString();
    const profilePayload = {
      id: userId,
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0f14', paddingHorizontal: 20, paddingTop: 20 }}>
      <View style={{ marginTop: 40, backgroundColor: '#121821', borderRadius: 12, padding: 16 }}>
        <Text style={{ color: '#ffffff', fontSize: 30, fontWeight: '700', marginBottom: 16 }}>Create your profile</Text>

        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Display name"
          placeholderTextColor="#9db0c7"
          autoCapitalize="none"
          style={{ backgroundColor: '#0b0f14', color: '#ffffff', borderRadius: 10, padding: 12, marginBottom: 12 }}
        />

        <Pressable
          onPress={pickAvatar}
          style={{ backgroundColor: '#0b0f14', borderRadius: 10, padding: 12, marginBottom: 12 }}
        >
          <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>Upload profile photo</Text>
        </Pressable>

        {avatarUri ? (
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <AvatarPreview uri={avatarUri} />
          </View>
        ) : null}

        {error ? <Text style={{ color: '#ff6b6b', marginBottom: 10 }}>{error}</Text> : null}

        <TouchableOpacity
          disabled={isLoading}
          onPress={handleSave}
          activeOpacity={0.7}
          style={{
            backgroundColor: '#0b0f14',
            borderRadius: 10,
            minHeight: 48,
            paddingHorizontal: 12,
            justifyContent: 'center',
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>
            {saveButtonClicked ? 'Clicked' : isLoading ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>

        {saveStatusText ? <Text style={{ color: '#9db0c7', marginTop: 10, textAlign: 'center' }}>{saveStatusText}</Text> : null}
      </View>
    </SafeAreaView>
  );
}
