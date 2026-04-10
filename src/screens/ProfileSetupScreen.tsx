import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, SafeAreaView, Text, TextInput, View } from 'react-native';

import { supabase } from '../lib/supabase';

type ProfileSetupScreenProps = {
  userId: string;
  onSaved: () => void;
};

export default function ProfileSetupScreen({ userId, onSaved }: ProfileSetupScreenProps) {
  const [name, setName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError('Geen toegang tot fotobibliotheek.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (result.canceled || !result.assets?.[0]?.uri) {
      return;
    }

    setAvatarUri(result.assets[0].uri);
    setError('');
  };

  const handleSave = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('Naam is verplicht.');
      return;
    }

    setError('');
    setIsLoading(true);

    const { error: upsertError } = await supabase.from('profiles').upsert(
      {
        id: userId,
        name: trimmedName,
        avatar_url: avatarUri,
      },
      { onConflict: 'id' },
    );

    setIsLoading(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    onSaved();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0f14', paddingHorizontal: 20, paddingTop: 20 }}>
      <View style={{ marginTop: 24 }}>
        <Text style={{ color: '#ffffff', fontSize: 30, fontWeight: '700' }}>Profiel instellen</Text>
        <Text style={{ color: '#9db0c7', fontSize: 16, marginTop: 6 }}>Alleen naam is verplicht voor V1.</Text>
      </View>

      <View style={{ marginTop: 24, backgroundColor: '#121821', borderRadius: 12, padding: 16 }}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Naam"
          placeholderTextColor="#9db0c7"
          style={{ backgroundColor: '#0b0f14', color: '#ffffff', borderRadius: 10, padding: 12, marginBottom: 12 }}
        />

        <Pressable onPress={handlePickImage} style={{ backgroundColor: '#0b0f14', borderRadius: 10, padding: 12 }}>
          <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>Kies profielfoto (optioneel)</Text>
        </Pressable>

        {avatarUri ? (
          <Image
            source={{ uri: avatarUri }}
            style={{ width: 84, height: 84, borderRadius: 42, marginTop: 12, alignSelf: 'center' }}
          />
        ) : null}

        {error ? <Text style={{ color: '#ff6b6b', marginTop: 10 }}>{error}</Text> : null}

        <Pressable
          disabled={isLoading}
          onPress={handleSave}
          style={{
            backgroundColor: '#0b0f14',
            borderRadius: 10,
            padding: 12,
            marginTop: 14,
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600' }}>
            {isLoading ? 'Opslaan...' : 'Opslaan'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
