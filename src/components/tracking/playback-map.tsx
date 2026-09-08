import { useEffect, useRef } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import L, { type LatLngExpression } from "leaflet";
import type { Position } from "@/types/database";

interface Props {
  positions: Position[];
  activeIndex: number;
}

const carIcon = L.divIcon({
  className: "playback-marker",
  html: `<div style="width:28px;height:28px;border-radius:9999px;background:#3B82F6;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(0,0,0,.45);border:2px solid white;"></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function FitToRoute({ positions }: { positions: Position[] }) {
  const map = useMap();
  const fittedRef = useRef<string | null>(null);

  useEffect(() => {
    const key = positions.map((p) => p.id).join(",");
    if (positions.length === 0 || fittedRef.current === key) return;
    const pts = positions.map((p) => [p.latitude, p.longitude] as LatLngExpression);
    if (pts.length === 1) {
      map.setView(pts[0], 14);
    } else {
      map.fitBounds(pts as any, { padding: [30, 30], maxZoom: 15 });
    }
    fittedRef.current = key;
  }, [map, positions]);

  return null;
}

function FollowActive({ position }: { position: Position | null }) {
  const map = useMap();
  useEffect(() => {
    if (!position) return;
    map.panTo([position.latitude, position.longitude], { animate: true });
  }, [map, position]);
  return null;
}

export function PlaybackMap({ positions, activeIndex }: Props) {
  const trail = positions.map((p) => [p.latitude, p.longitude] as LatLngExpression);
  const active = positions[activeIndex] ?? null;
  const center: LatLngExpression = active
    ? [active.latitude, active.longitude]
    : positions[0]
      ? [positions[0].latitude, positions[0].longitude]
      : [20, 0];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/40">
      <MapContainer center={center} zoom={13} className="h-[480px] w-full lg:h-[520px]" scrollWheelZoom>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <FitToRoute positions={positions} />
        <FollowActive position={active} />
        {trail.length > 1 && <Polyline positions={trail} pathOptions={{ color: "#3B82F6", weight: 4 }} />}
        {active && <Marker position={[active.latitude, active.longitude]} icon={carIcon} />}
      </MapContainer>
    </div>
  );
}
