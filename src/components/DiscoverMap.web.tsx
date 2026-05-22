import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function CoordinateLogger({ onMapClick }: { onMapClick?: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      const latitude = Number(event.latlng.lat.toFixed(6));
      const longitude = Number(event.latlng.lng.toFixed(6));
      onMapClick?.(latitude, longitude);
    },
  });
  return null;
}

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
  spots: SpotMarker[];
  userLocation?: { latitude: number; longitude: number } | null;
  onOpenSpot: (spotName: string) => void;
  onAddSpot: (spotName: string) => void;
  onMapClick?: (latitude: number, longitude: number) => void;
};

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

const PULSE_STYLE = `
  @keyframes sb-pulse {
    0% { transform: scale(1); opacity: 0.55; }
    100% { transform: scale(2.8); opacity: 0; }
  }
`;

export default function DiscoverMap({ center, spots, userLocation, onOpenSpot, onAddSpot, onMapClick }: Props) {
  const userLocationIcon = new L.DivIcon({
    className: '',
    html: `
      <style>${PULSE_STYLE}</style>
      <div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;position:relative;">
        <div style="position:absolute;width:24px;height:24px;border-radius:50%;background:rgba(0,122,255,0.45);animation:sb-pulse 1.4s ease-out infinite;"></div>
        <div style="width:15px;height:15px;border-radius:50%;background:#007AFF;border:2.5px solid white;box-shadow:0 0 8px rgba(0,122,255,0.6);position:relative;z-index:1;"></div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });

  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={9}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
      zoomControl={false}
    >
      <CoordinateLogger onMapClick={onMapClick} />

      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {spots.map((spot) => {
        const total = spot.totalCount ?? 0;
        const dotColor = getDotColor(total);
        const borderColor = total <= 0 ? '#888fa0' : 'rgba(255,255,255,0.6)';

        const pinIcon = new L.DivIcon({
          className: '',
          html: `
            <div style="
              width:18px;height:18px;border-radius:50%;
              background:${dotColor};
              border:2px solid ${borderColor};
              box-shadow:0 0 8px ${dotColor}99, 0 2px 4px rgba(0,0,0,0.3);
            "></div>
          `,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });

        return (
          <Marker
            key={`discover-web-marker-${spot.name}`}
            position={[spot.latitude, spot.longitude]}
            icon={pinIcon}
          >
            <Popup>
              <div style={{ minWidth: 160, fontFamily: 'system-ui,sans-serif' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, border: `1.5px solid ${borderColor}`, flexShrink: 0 }} />
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#111827' }}>{spot.name}</div>
                </div>
                {total > 0 && (
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
                    {total} rider{total !== 1 ? 's' : ''} today
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => onOpenSpot(spot.name)}
                    style={{ flex: 1, background: '#111827', color: '#ffffff', border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}
                  >
                    Open →
                  </button>
                  <button
                    type="button"
                    disabled={spot.isAdded}
                    onClick={() => !spot.isAdded && onAddSpot(spot.name)}
                    style={{ flex: 1, border: '1px solid #d1d5db', background: spot.isAdded ? '#f3f4f6' : '#ffffff', color: spot.isAdded ? '#9ca3af' : '#111827', borderRadius: 8, padding: '7px 12px', cursor: spot.isAdded ? 'default' : 'pointer', fontWeight: 700, fontSize: 12 }}
                  >
                    {spot.isAdded ? '✓ Added' : '+ Add'}
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {userLocation && (
        <Marker
          position={[userLocation.latitude, userLocation.longitude]}
          icon={userLocationIcon}
        />
      )}
    </MapContainer>
  );
}
