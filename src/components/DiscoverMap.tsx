import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

type SpotMarker = {
  name: string;
  latitude: number;
  longitude: number;
  isAdded: boolean;
  coordinateStatus: 'unverified' | 'review' | 'verified';
  liveCount?: number;
  goingCount?: number;
  totalCount?: number;
};

type Props = {
  center: { latitude: number; longitude: number };
  flyToTarget?: { latitude: number; longitude: number } | null;
  spots: SpotMarker[];
  userLocation?: { latitude: number; longitude: number } | null;
  onOpenSpot: (spotName: string) => void;
  onAddSpot: (spotName: string) => void;
  onMapClick?: (latitude: number, longitude: number) => void;
};

const LAT_CLAMP = 85;
const LNG_CLAMP = 179;
const DEFAULT_DELTA = 0.5;

const HEATMAP = ['#0D2C54','#1E63C6','#35B8E0','#2ECC71','#A8E063','#7B61FF','#E83E8C'];
const getDotColor = (total: number): string => {
  if (total <= 0) return '#ffffff';
  if (total <= 2) return HEATMAP[0];
  if (total <= 5) return HEATMAP[1];
  if (total <= 10) return HEATMAP[2];
  if (total <= 18) return HEATMAP[3];
  if (total <= 28) return HEATMAP[4];
  if (total <= 40) return HEATMAP[5];
  return HEATMAP[6];
};

export default function DiscoverMap({ center, flyToTarget, spots, userLocation, onOpenSpot, onAddSpot, onMapClick }: Props) {
  const mapRef = useRef<MapView>(null);
  const hasCenteredOnGps = useRef(false);
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const [selectedSpot, setSelectedSpot] = useState<SpotMarker | null>(null);

  const isDefaultCenter =
    Math.abs(center.latitude - 52.3676) < 0.001 &&
    Math.abs(center.longitude - 4.9041) < 0.001;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.55, 0.3, 0] });

  useEffect(() => {
    if (hasCenteredOnGps.current || isDefaultCenter) return;
    hasCenteredOnGps.current = true;
    mapRef.current?.animateToRegion(
      { latitude: center.latitude, longitude: center.longitude, latitudeDelta: DEFAULT_DELTA, longitudeDelta: DEFAULT_DELTA },
      800
    );
  }, [center.latitude, center.longitude, isDefaultCenter]);

  useEffect(() => {
    if (!flyToTarget || !Number.isFinite(flyToTarget.latitude) || !Number.isFinite(flyToTarget.longitude)) return;
    const t = setTimeout(() => {
      mapRef.current?.animateToRegion(
        { latitude: flyToTarget.latitude, longitude: flyToTarget.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 },
        600
      );
    }, 350);
    return () => clearTimeout(t);
  }, [flyToTarget?.latitude, flyToTarget?.longitude]);

  const validSpots = spots.filter(
    (s) =>
      Number.isFinite(s.latitude) &&
      Number.isFinite(s.longitude) &&
      Math.abs(s.latitude) <= LAT_CLAMP &&
      Math.abs(s.longitude) <= LNG_CLAMP
  );

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={{
          latitude: Math.max(-LAT_CLAMP, Math.min(LAT_CLAMP, center.latitude)),
          longitude: Math.max(-LNG_CLAMP, Math.min(LNG_CLAMP, center.longitude)),
          latitudeDelta: DEFAULT_DELTA,
          longitudeDelta: DEFAULT_DELTA,
        }}
        onRegionChangeComplete={() => {}}
        onPress={(e) => {
          const coordinate = e.nativeEvent.coordinate;
          if (!coordinate) return;
          setSelectedSpot(null);
          onMapClick?.(Number(coordinate.latitude.toFixed(6)), Number(coordinate.longitude.toFixed(6)));
        }}
      >
        {validSpots.map((spot) => {
          const total = spot.totalCount ?? 0;
          const dotColor = getDotColor(total);
          const isSelected = selectedSpot?.name === spot.name;

          const dotView = (
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <View style={{
                width: 18, height: 18, borderRadius: 9,
                backgroundColor: dotColor,
                borderWidth: 2, borderColor: isSelected ? '#ffffff' : (total <= 0 ? '#888fa0' : 'rgba(255,255,255,0.4)'),
                shadowColor: dotColor, shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8, shadowRadius: 6, elevation: 6,
              }} />
            </View>
          );

          return (
            <Marker
              key={spot.name}
              coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              onPress={Platform.OS !== 'web' ? () => setSelectedSpot(isSelected ? null : spot) : undefined}
            >
              {Platform.OS !== 'web' ? dotView : (
                <>
                  {dotView}
                </>
              )}
            </Marker>
          );
        })}

        {userLocation && (
          <Marker coordinate={userLocation} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges>
            <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={{
                position: 'absolute', width: 24, height: 24, borderRadius: 12,
                backgroundColor: 'rgba(0,122,255,0.45)',
                transform: [{ scale: pulseScale }], opacity: pulseOpacity,
              }} />
              <View style={{
                width: 15, height: 15, borderRadius: 7.5,
                backgroundColor: '#007AFF', borderWidth: 2.5, borderColor: '#ffffff',
                shadowColor: '#007AFF', shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.6, shadowRadius: 4, elevation: 6,
              }} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Spot actie popup */}
      {selectedSpot ? (
        <View style={{
          position: 'absolute', bottom: 100, left: 20, right: 20,
          backgroundColor: '#0d1b2a', borderRadius: 20,
          padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4, shadowRadius: 12, elevation: 10,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: getDotColor(selectedSpot.totalCount ?? 0) }} />
            <Text style={{ color: '#ffffff', fontSize: 17, fontWeight: '900', flex: 1 }} numberOfLines={1}>
              {selectedSpot.name}
            </Text>
            <Pressable onPress={() => setSelectedSpot(null)} hitSlop={10}>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18 }}>×</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => { setSelectedSpot(null); onOpenSpot(selectedSpot.name); }}
              style={{ flex: 1, backgroundColor: '#ffffff', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ color: '#07111F', fontSize: 14, fontWeight: '900' }}>Open →</Text>
            </Pressable>
            {!selectedSpot.isAdded ? (
              <Pressable
                onPress={() => { setSelectedSpot(null); onAddSpot(selectedSpot.name); }}
                style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}
              >
                <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>+ Add</Text>
              </Pressable>
            ) : (
              <View style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>✓ Added</Text>
              </View>
            )}
          </View>
        </View>
      ) : null}

      {!isDefaultCenter ? (
        <Pressable
          onPress={() => mapRef.current?.animateToRegion(
            { latitude: center.latitude, longitude: center.longitude, latitudeDelta: DEFAULT_DELTA, longitudeDelta: DEFAULT_DELTA },
            600
          )}
          style={{
            position: 'absolute', bottom: 20, right: 16,
            backgroundColor: '#07111F', borderRadius: 999,
            width: 44, height: 44,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
          }}
        >
          <Text style={{ fontSize: 20 }}>📍</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
