import { useState } from 'react';

import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, SafeAreaView, Text, TextInput, View } from 'react-native';

import { Profile, supabase } from '../lib/supabase';

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

  const pickAvatar = async () => {
    setError('');

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError("Geef toegang tot je foto's om een profielfoto te kiezen");
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
    const trimmedName = displayName.trim();

    if (!trimmedName) {
      setError('Display name is verplicht');
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
      setError('Er ging iets mis. Probeer het opnieuw.');
      return;
    }

    if (existingProfile) {
      setIsLoading(false);
      setError('Deze naam is al bezet');
      return;
    }

    let avatarUrl: string | null = null;

    if (avatarUri) {
      const avatarPath = `${userId}.jpg`;
      const imageResponse = await fetch(avatarUri);
      const imageBlob = await imageResponse.blob();

      const { error: uploadError } = await supabase.storage.from('avatars').upload(avatarPath, imageBlob, {
        upsert: true,
        contentType: 'image/jpeg',
      });

      if (uploadError) {
        console.error('Avatar upload mislukt:', uploadError);
        setIsLoading(false);
        setError(uploadError.message);
        return;
      }

      const { data: avatarPublicUrlData } = supabase.storage.from('avatars').getPublicUrl(avatarPath);
      avatarUrl = avatarPublicUrlData.publicUrl;
    }

    const createdAt = new Date().toISOString();
    const profilePayload = {
      id: userId,
      display_name: trimmedName,
      avatar_url: avatarUrl,
      created_at: createdAt,
    };

    const { error: upsertError } = await supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' });

    setIsLoading(false);

    if (upsertError) {
      console.error('Profiel opslaan mislukt:', upsertError);
      if (upsertError.code === '23505') {
        setError('Deze naam is al bezet');
        return;
      }

      setError(upsertError.message);
      return;
    }

    onSaved(profilePayload);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0f14', paddingHorizontal: 20, paddingTop: 20 }}>
      <View style={{ marginTop: 40, backgroundColor: '#121821', borderRadius: 12, padding: 16 }}>
        <Text style={{ color: '#ffffff', fontSize: 30, fontWeight: '700', marginBottom: 16 }}>Maak je profiel</Text>

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
          <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>Upload profielfoto</Text>
        </Pressable>

        {avatarUri ? (
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <AvatarPreview uri={avatarUri} />
          </View>
        ) : null}

        {error ? <Text style={{ color: '#ff6b6b', marginBottom: 10 }}>{error}</Text> : null}

        <Pressable
          disabled={isLoading}
          onPress={handleSave}
          style={{
            backgroundColor: '#0b0f14',
            borderRadius: 10,
            padding: 12,
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>
            {isLoading ? 'Opslaan...' : 'Profiel opslaan'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
