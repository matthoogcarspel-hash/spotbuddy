import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

type SpotMarker = {
  name: string;
  latitude: number;
  longitude: number;
};

type Props = {
  center: {
    latitude: number;
    longitude: number;
  };
  spots: SpotMarker[];
  onOpenSpot: (spotName: string) => void;
};

export default function DiscoverMap({ center, spots, onOpenSpot }: Props) {
  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={7}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {spots.map((spot) => (
        <Marker
          key={`discover-web-marker-${spot.name}`}
          position={[spot.latitude, spot.longitude]}
        >
          <Popup>
            <button
              type="button"
              onClick={() => onOpenSpot(spot.name)}
              style={{
                border: 0,
                background: 'transparent',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              {spot.name}
            </button>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
