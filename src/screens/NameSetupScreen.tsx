import { useState } from 'react';
import { Pressable, SafeAreaView, Text, TextInput, View } from 'react-native';

import { supabase } from '../lib/supabase';

type NameSetupScreenProps = {
  userId: string;
  onSaved: (displayName: string) => void;
};

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 20;

export default function NameSetupScreen({ userId, onSaved }: NameSetupScreenProps) {
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const validateDisplayName = (value: string) => {
    const trimmedName = value.trim();

    if (!trimmedName) {
      return 'Naam is verplicht';
    }

    if (trimmedName.length < MIN_NAME_LENGTH) {
      return `Naam moet minimaal ${MIN_NAME_LENGTH} tekens hebben`;
    }

    if (trimmedName.length > MAX_NAME_LENGTH) {
      return `Naam mag maximaal ${MAX_NAME_LENGTH} tekens hebben`;
    }

    return '';
  };

  const handleSave = async () => {
    const trimmedName = displayName.trim();
    const validationError = validateDisplayName(trimmedName);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setIsLoading(true);

    const { error: insertError } = await supabase.from('profiles').insert({
      id: userId,
      display_name: trimmedName,
    });

    setIsLoading(false);

    if (insertError) {
      if (insertError.code === '23505') {
        setError('Deze naam is al bezet');
        return;
      }

      setError(insertError.message);
      return;
    }

    onSaved(trimmedName);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0f14', paddingHorizontal: 20, paddingTop: 20 }}>
      <View style={{ marginTop: 40, backgroundColor: '#121821', borderRadius: 12, padding: 16 }}>
        <Text style={{ color: '#ffffff', fontSize: 30, fontWeight: '700', marginBottom: 16 }}>Kies je naam</Text>

        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Display name"
          placeholderTextColor="#9db0c7"
          autoCapitalize="none"
          style={{ backgroundColor: '#0b0f14', color: '#ffffff', borderRadius: 10, padding: 12, marginBottom: 12 }}
        />

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
            {isLoading ? 'Opslaan...' : 'Opslaan'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
