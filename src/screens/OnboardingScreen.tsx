import { useState } from 'react';
import * as Buzz from 'expo-notifications';
import { Image, Platform, Pressable, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { spots } from '../data/spots';
import type { SpotName } from '../data/spots';
import type { Profile } from '../lib/supabase';

const BG = '#071421';
const CARD = 'rgba(255,255,255,0.05)';
const BORDER = 'rgba(255,255,255,0.08)';
const MUTED = 'rgba(255,255,255,0.35)';
const ACCENT = '#00C896';

type Props = {
  profile: Profile;
  onComplete: (selectedSpots: SpotName[]) => void;
};

const getDeviceRegion = (): string | null => {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const parts = locale.split('-');
    return parts.length >= 2 ? parts[parts.length - 1].toUpperCase() : null;
  } catch {
    return null;
  }
};

const STEP_COUNT = 3;

export default function OnboardingScreen({ profile, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<Set<SpotName>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const deviceRegion = getDeviceRegion();
  const localSpots = spots.filter((s) => s.country === deviceRegion);
  const hasLocalSpots = localSpots.length > 0;
  const visibleSpots = showAll || !hasLocalSpots ? spots : localSpots;

  const toggleSpot = (spotName: SpotName) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(spotName)) next.delete(spotName);
      else next.add(spotName);
      return next;
    });
  };

  const handleNotifications = async () => {
    if (Platform.OS !== 'web') {
      await Buzz.requestPermissionsAsync();
    }
    setStep(2);
  };

  const handleComplete = () => {
    onComplete([...selected] as SpotName[]);
  };

  const ProgressDots = () => (
    <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 28 }}>
      {Array.from({ length: STEP_COUNT }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i === step ? 20 : 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: i === step ? ACCENT : 'rgba(255,255,255,0.18)',
          }}
        />
      ))}
    </View>
  );

  // Step 0 — Pick spots
  if (step === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginTop: 28, marginBottom: 20 }}>
            <Image source={require('../../assets/wordmark.png')} resizeMode="contain" style={{ width: '80%', height: 90 }} />
          </View>

          <ProgressDots />

          <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '900', marginBottom: 6 }}>Your spots</Text>
          <Text style={{ color: MUTED, fontSize: 14, marginBottom: 20, lineHeight: 20 }}>
            Pick the spots you ride. They'll show up on your home screen.
          </Text>

          <View style={{ gap: 8, marginBottom: 16 }}>
            {visibleSpots.map((s) => {
              const isSelected = selected.has(s.spot);
              return (
                <Pressable
                  key={s.spot}
                  onPress={() => toggleSpot(s.spot)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: isSelected ? 'rgba(0,200,150,0.1)' : CARD,
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: isSelected ? ACCENT : BORDER,
                    gap: 12,
                  }}
                >
                  <View style={{
                    width: 22, height: 22, borderRadius: 11,
                    borderWidth: 2,
                    borderColor: isSelected ? ACCENT : 'rgba(255,255,255,0.25)',
                    backgroundColor: isSelected ? ACCENT : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected ? <Text style={{ color: BG, fontSize: 12, fontWeight: '900' }}>✓</Text> : null}
                  </View>
                  <Text style={{ color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: isSelected ? '800' : '500', flex: 1 }}>
                    {s.spot}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {hasLocalSpots && (
            <Pressable onPress={() => setShowAll((v) => !v)} style={{ alignItems: 'center', paddingVertical: 10, marginBottom: 8 }}>
              <Text style={{ color: MUTED, fontSize: 13, fontWeight: '600' }}>
                {showAll ? 'Show local spots only' : `Show all ${spots.length} spots worldwide`}
              </Text>
            </Pressable>
          )}

          <TouchableOpacity
            onPress={() => setStep(1)}
            disabled={selected.size === 0}
            activeOpacity={0.85}
            style={{
              backgroundColor: selected.size > 0 ? '#ffffff' : 'rgba(255,255,255,0.12)',
              borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8,
            }}
          >
            <Text style={{ color: selected.size > 0 ? BG : MUTED, fontSize: 16, fontWeight: '900' }}>
              {selected.size > 0 ? `Continue with ${selected.size} spot${selected.size > 1 ? 's' : ''} →` : 'Select at least one spot'}
            </Text>
          </TouchableOpacity>

          <Pressable onPress={() => setStep(1)} style={{ alignItems: 'center', paddingVertical: 14 }}>
            <Text style={{ color: MUTED, fontSize: 13 }}>Skip for now</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Step 1 — Notifications
  if (step === 1) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
        <View style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'center', alignItems: 'center' }}>
          <ProgressDots />

          <Text style={{ fontSize: 56, marginBottom: 20 }}>🔔</Text>
          <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 12 }}>
            Stay in the loop
          </Text>
          <Text style={{ color: MUTED, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 40 }}>
            Get notified when riders check in, sessions are planned, or someone wants to kite with you.
          </Text>

          <TouchableOpacity onPress={handleNotifications} activeOpacity={0.85}
            style={{ backgroundColor: '#ffffff', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 32, alignItems: 'center', width: '100%', marginBottom: 14 }}>
            <Text style={{ color: BG, fontSize: 16, fontWeight: '900' }}>Enable notifications</Text>
          </TouchableOpacity>

          <Pressable onPress={() => setStep(2)} style={{ paddingVertical: 12 }}>
            <Text style={{ color: MUTED, fontSize: 14 }}>Maybe later</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Step 2 — Done
  const firstName = profile.display_name?.split(' ')[0] ?? profile.display_name ?? 'rider';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'center', alignItems: 'center' }}>
        <ProgressDots />

        <Text style={{ fontSize: 56, marginBottom: 20 }}>🤙</Text>
        <Text style={{ color: '#ffffff', fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 12 }}>
          You're all set, {firstName}!
        </Text>

        <View style={{ gap: 14, marginBottom: 40, width: '100%' }}>
          {[
            { icon: '📍', text: 'Check in when you arrive at a spot' },
            { icon: '👥', text: 'See who else is riding and plan together' },
            { icon: '💬', text: 'Chat on the spot, in sessions, or direct' },
          ].map(({ icon, text }) => (
            <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ fontSize: 22 }}>{icon}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600', flex: 1 }}>{text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity onPress={handleComplete} activeOpacity={0.85}
          style={{ backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 32, alignItems: 'center', width: '100%' }}>
          <Text style={{ color: BG, fontSize: 16, fontWeight: '900' }}>Let's go →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
