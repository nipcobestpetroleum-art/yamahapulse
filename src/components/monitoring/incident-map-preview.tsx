import { MapContainer, Marker, TileLayer } from "react-leaflet";
import L, { type LatLngExpression } from "leaflet";

interface Props {
  latitude: number;
  longitude: number;
  className?: string;
}

const crashIcon = L.divIcon({
  className: "incident-pin",
  html: `<div style="width:18px;height:18px;border-radius:9999px;background:#f43f5e;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.5);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export function IncidentMapPreview({ latitude, longitude, className }: Props) {
  const position: LatLngExpression = [latitude, longitude];

  return (
    <div className={className ?? "h-40 w-full overflow-hidden rounded-lg border border-border"}>
      <MapContainer
        center={position}
        zoom={15}
        className="h-full w-full"
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={position} icon={crashIcon} />
      </MapContainer>
    </div>
  );
}
