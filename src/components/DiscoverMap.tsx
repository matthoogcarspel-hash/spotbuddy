import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import MapView, { Callout, Marker } from 'react-native-maps';

type SpotMarker = {
  name: string;
  latitude: number;
  longitude: number;
  isAdded: boolean;
  coordinateStatus: 'unverified' | 'review' | 'verified';
  liveCount?: number;
  goingCount?: number;
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

export default function DiscoverMap({ center, flyToTarget, spots, userLocation, onOpenSpot, onMapClick }: Props) {
  const mapRef = useRef<MapView>(null);
  const hasCenteredOnGps = useRef(false);
  const pulseAnim = useRef(new Animated.Value(0)).current;

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
    mapRef.current?.animateToRegion(
      { latitude: flyToTarget.latitude, longitude: flyToTarget.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 },
      600
    );
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
        onPress={(e) => {
          const coordinate = e.nativeEvent.coordinate;
          if (!coordinate) return;
          onMapClick?.(Number(coordinate.latitude.toFixed(6)), Number(coordinate.longitude.toFixed(6)));
        }}
      >
        {validSpots.map((spot) => {
          const isAdded = spot.isAdded;
          const label = spot.name.length > 16 ? spot.name.slice(0, 15) + '…' : spot.name;
          const live = spot.liveCount ?? 0;
          const going = spot.goingCount ?? 0;
          const hasActivity = live > 0 || going > 0;
          const activityColor = live > 0 ? '#5EF0D0' : '#4DB8FF';
          const activityLabel = live > 0 ? `⚡${live}` : `${going}`;
          return (
            <Marker
              key={spot.name}
              coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
            >
              <View style={{ alignItems: 'center' }}>
                <View style={{ position: 'relative' }}>
                  <View style={{
                    backgroundColor: isAdded ? '#007AFF' : '#ffffff',
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderWidth: 1.5,
                    borderColor: isAdded ? 'rgba(255,255,255,0.4)' : '#007AFF',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.25,
                    shadowRadius: 4,
                    elevation: 5,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isAdded ? 'rgba(255,255,255,0.8)' : '#007AFF' }} />
                    <Text style={{ color: isAdded ? '#ffffff' : '#007AFF', fontSize: 11, fontWeight: '800' }}>{label}</Text>
                  </View>
                  {hasActivity ? (
                    <View style={{
                      position: 'absolute', top: -7, right: -7,
                      backgroundColor: activityColor,
                      borderRadius: 999,
                      paddingHorizontal: 5,
                      paddingVertical: 2,
                      minWidth: 18,
                      alignItems: 'center',
                    }}>
                      <Text style={{ color: '#061421', fontSize: 9, fontWeight: '900' }}>{activityLabel}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{
                  width: 0, height: 0,
                  borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 6,
                  borderLeftColor: 'transparent', borderRightColor: 'transparent',
                  borderTopColor: isAdded ? '#007AFF' : '#007AFF',
                  marginTop: -1,
                }} />
              </View>
              <Callout onPress={() => onOpenSpot(spot.name)}>
                <View style={{ padding: 6, minWidth: 140 }}>
                  <Text style={{ fontWeight: '700', fontSize: 13, marginBottom: 6 }}>{spot.name}</Text>
                  <Pressable
                    onPress={() => onOpenSpot(spot.name)}
                    style={{ backgroundColor: '#007AFF', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Open spot</Text>
                  </Pressable>
                </View>
              </Callout>
            </Marker>
          );
        })}

        {userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges
          >
            <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={{
                position: 'absolute',
                width: 24, height: 24, borderRadius: 12,
                backgroundColor: 'rgba(0,122,255,0.45)',
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              }} />
              <View style={{
                width: 15, height: 15, borderRadius: 7.5,
                backgroundColor: '#007AFF',
                borderWidth: 2.5, borderColor: '#ffffff',
                shadowColor: '#007AFF',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.6,
                shadowRadius: 4,
                elevation: 6,
              }} />
            </View>
          </Marker>
        )}
      </MapView>

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
