import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const markerIcon = new L.DivIcon({
  className: '',
  html: `
    <div style="
      width:16px;
      height:16px;
      border-radius:999px;
      background:#009dff;
      border:3px solid white;
      box-shadow:0 2px 8px rgba(0,157,255,0.35);
    "></div>
  `,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});


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
};

type Props = {
  center: {
    latitude: number;
    longitude: number;
  };
  spots: SpotMarker[];
  onOpenSpot: (spotName: string) => void;
  onAddSpot: (spotName: string) => void;
  onMapClick?: (latitude: number, longitude: number) => void;
};

export default function DiscoverMap({
  center,
  spots,
  onOpenSpot,
  onAddSpot,
  onMapClick,
}: Props) {
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
        const pinColor =
          spot.coordinateStatus === 'verified'
            ? '#009dff'
            : spot.coordinateStatus === 'review'
              ? '#ffb020'
              : '#ff5a5a';

        const dynamicIcon = new L.DivIcon({
          className: '',
          html: `
            <div style="
              width:12px;
              height:12px;
              border-radius:999px;
              background:${pinColor};
              border:2px solid white;
              box-shadow:0 2px 8px rgba(0,0,0,0.22);
              opacity:${spot.coordinateStatus === 'unverified' ? '0.72' : '1'};
            "></div>
          `,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        return (
        <Marker
          key={`discover-web-marker-${spot.name}`}
          position={[spot.latitude, spot.longitude]}
          icon={dynamicIcon}
        >
          <Popup>
            <div style={{ minWidth: 150 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>
                {spot.name}
              </div>

              <div
                style={{
                  fontSize: 11,
                  marginBottom: 10,
                  color:
                    spot.coordinateStatus === 'verified'
                      ? '#18794e'
                      : spot.coordinateStatus === 'review'
                        ? '#a15c00'
                        : '#b42318',
                }}
              >
                {spot.coordinateStatus === 'verified'
                  ? 'Verified launch location'
                  : spot.coordinateStatus === 'review'
                    ? 'Coordinate under review'
                    : 'Unverified coordinate'}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => onOpenSpot(spot.name)}
                  style={{
                    border: '1px solid #d6dbe3',
                    background: '#ffffff',
                    borderRadius: 999,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  Open
                </button>

                <button
                  type="button"
                  disabled={spot.isAdded}
                  onClick={() => onAddSpot(spot.name)}
                  style={{
                    border: '1px solid #d6dbe3',
                    background: spot.isAdded ? '#eef1f5' : '#ffffff',
                    color: spot.isAdded ? '#8a94a3' : '#111827',
                    borderRadius: 999,
                    padding: '6px 10px',
                    cursor: spot.isAdded ? 'default' : 'pointer',
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {spot.isAdded ? 'Added' : 'Add'}
                </button>
              </div>
            </div>
          </Popup>
        </Marker>
        );
      })}
    </MapContainer>
  );
}
