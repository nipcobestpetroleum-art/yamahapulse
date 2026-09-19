import { useMemo, useState } from "react";
import { PlatformMap } from "@/components/maps/platform-map";
import type { MapMarkerSpec, MapPolylineSpec } from "@/components/mapstudio/types";

interface Props { center: [number, number]; radius: number; onChange: (center: [number, number]) => void; }

function circlePoints([lat, lng]: [number, number], radius: number): [number, number][] {
  const earth = 111_320;
  const latRadius = radius / earth;
  const lngRadius = radius / (earth * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: 65 }, (_, index) => {
    const angle = (index / 64) * Math.PI * 2;
    return [lat + Math.sin(angle) * latRadius, lng + Math.cos(angle) * lngRadius];
  });
}

export function GeofenceMapPicker({ center, radius, onChange }: Props) {
  const [nonce, setNonce] = useState(0);
  const markers = useMemo<MapMarkerSpec[]>(() => [{ id: "geofence:center", lat: center[0], lng: center[1], title: "Geofence center", color: "#3B82F6", scale: 8 }], [center]);
  const polylines = useMemo<MapPolylineSpec[]>(() => [{ id: "geofence:radius", points: circlePoints(center, radius), color: "#3B82F6", weight: 3, opacity: 0.8 }], [center, radius]);
  return <div className="overflow-hidden rounded-lg border border-border"><PlatformMap markers={markers} polylines={polylines} heightClass="h-[280px] w-full" fitNonce={nonce} onMapClick={(lat, lng) => { onChange([lat, lng]); setNonce((value) => value + 1); }} /></div>;
}
