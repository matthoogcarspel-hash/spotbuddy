import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function CoordinateLogger({ onMapClick }: { onMapClick?: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      const latitude = Number(event.latlng.lat.toFixed(6));
      const longitude = Number(event.latlng.lng.toFixed(6));
      console.log('DISCOVER_MAP_CLICK_COORDS', { latitude, longitude });
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
};

type Props = {
  center: { latitude: number; longitude: number };
  spots: SpotMarker[];
  userLocation?: { latitude: number; longitude: number } | null;
  onOpenSpot: (spotName: string) => void;
  onAddSpot: (spotName: string) => void;
  onMapClick?: (latitude: number, longitude: number) => void;
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
        const isAdded = spot.isAdded;
        const label = spot.name.length > 16 ? spot.name.slice(0, 15) + '…' : spot.name;
        const bg = isAdded ? '#007AFF' : '#ffffff';
        const color = isAdded ? '#ffffff' : '#007AFF';
        const border = isAdded ? 'rgba(255,255,255,0.4)' : '#007AFF';
        const live = spot.liveCount ?? 0;
        const going = spot.goingCount ?? 0;
        const hasActivity = live > 0 || going > 0;
        const activityBg = live > 0 ? '#5EF0D0' : '#4DB8FF';
        const activityLabel = live > 0 ? `⚡${live}` : `${going}`;

        const pinIcon = new L.DivIcon({
          className: '',
          html: `
            <div style="display:flex;flex-direction:column;align-items:center;position:relative;">
              ${hasActivity ? `<div style="position:absolute;top:-7px;right:-7px;background:${activityBg};border-radius:999px;padding:2px 5px;font-size:9px;font-weight:900;color:#061421;font-family:system-ui,sans-serif;white-space:nowrap;z-index:1;">${activityLabel}</div>` : ''}
              <div style="
                background:${bg};
                border-radius:999px;
                padding:4px 10px;
                border:1.5px solid ${border};
                box-shadow:0 2px 6px rgba(0,0,0,0.22);
                display:flex;align-items:center;gap:5px;
                white-space:nowrap;
              ">
                <div style="width:6px;height:6px;border-radius:50%;background:${color};opacity:0.8;flex-shrink:0;"></div>
                <span style="color:${color};font-size:11px;font-weight:800;font-family:system-ui,sans-serif;">${label}</span>
              </div>
              <div style="
                width:0;height:0;
                border-left:4px solid transparent;
                border-right:4px solid transparent;
                border-top:6px solid #007AFF;
                margin-top:-1px;
              "></div>
            </div>
          `,
          iconSize: [120, 30],
          iconAnchor: [60, 30],
        });

        return (
          <Marker
            key={`discover-web-marker-${spot.name}`}
            position={[spot.latitude, spot.longitude]}
            icon={pinIcon}
          >
            <Popup>
              <div style={{ minWidth: 150 }}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>
                  {spot.name}
                </div>
                <div style={{ fontSize: 11, marginBottom: 10, color: spot.coordinateStatus === 'verified' ? '#18794e' : spot.coordinateStatus === 'review' ? '#a15c00' : '#b42318' }}>
                  {spot.coordinateStatus === 'verified' ? 'Verified launch location' : spot.coordinateStatus === 'review' ? 'Coordinate under review' : 'Unverified coordinate'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => onOpenSpot(spot.name)}
                    style={{ border: '1px solid #d6dbe3', background: '#ffffff', borderRadius: 999, padding: '6px 10px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    disabled={spot.isAdded}
                    onClick={() => onAddSpot(spot.name)}
                    style={{ border: '1px solid #d6dbe3', background: spot.isAdded ? '#eef1f5' : '#ffffff', color: spot.isAdded ? '#8a94a3' : '#111827', borderRadius: 999, padding: '6px 10px', cursor: spot.isAdded ? 'default' : 'pointer', fontWeight: 700, fontSize: 12 }}
                  >
                    {spot.isAdded ? 'Added' : 'Add'}
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
