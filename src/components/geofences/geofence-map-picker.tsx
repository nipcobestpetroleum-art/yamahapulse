import { useMemo } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L, { type LatLngExpression } from "leaflet";

interface Props {
  center: [number, number];
  radius: number;
  onChange: (center: [number, number]) => void;
}

const pinIcon = L.divIcon({
  className: "geofence-pin",
  html: `<div style="width:16px;height:16px;border-radius:9999px;background:#3B82F6;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.5);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function ClickHandler({ onChange }: { onChange: (center: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      onChange([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

export function GeofenceMapPicker({ center, radius, onChange }: Props) {
  const position = useMemo<LatLngExpression>(() => center, [center]);

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <MapContainer center={position} zoom={13} className="h-[280px] w-full" scrollWheelZoom>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <ClickHandler onChange={onChange} />
        <Marker position={position} icon={pinIcon} />
        <Circle center={position} radius={radius} pathOptions={{ color: "#3B82F6", fillOpacity: 0.15 }} />
      </MapContainer>
    </div>
  );
}
