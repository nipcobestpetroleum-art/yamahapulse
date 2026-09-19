import { useMemo } from "react";
import { PlatformMap } from "@/components/maps/platform-map";
import type { RouteWaypoint } from "@/types/database";
import type { MapMarkerSpec, MapPolylineSpec } from "@/components/mapstudio/types";

interface Props { waypoints: RouteWaypoint[]; onChange: (waypoints: RouteWaypoint[]) => void; }
const DEFAULT_CENTER: [number, number] = [6.5244, 3.3792];

export function RouteMapPicker({ waypoints, onChange }: Props) {
  const center = waypoints[0] ? { lat: waypoints[0].lat, lng: waypoints[0].lon, zoom: 12 } : { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1], zoom: 12 };
  const markers = useMemo<MapMarkerSpec[]>(() => waypoints.map((waypoint, index) => ({ id: `route-waypoint:${index}`, lat: waypoint.lat, lng: waypoint.lon, title: index === 0 ? "Start" : index === waypoints.length - 1 ? "End" : `Waypoint ${index + 1}`, color: index === 0 ? "#10B981" : index === waypoints.length - 1 ? "#EF4444" : "#3B82F6", scale: 8 })), [waypoints]);
  const polylines = useMemo<MapPolylineSpec[]>(() => waypoints.length > 1 ? [{ id: "route:preview", points: waypoints.map((point) => [point.lat, point.lon]), color: "#3B82F6", weight: 4 }] : [], [waypoints]);
  return <div className="space-y-2"><div className="overflow-hidden rounded-lg border border-border"><PlatformMap markers={markers} polylines={polylines} heightClass="h-[300px] w-full" viewRequest={{ ...center, nonce: waypoints.length }} onMapClick={(lat, lng) => onChange([...waypoints, { lat, lon: lng }])} /></div><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Click the map to add waypoints in order (first = start, last = end). {waypoints.length} point{waypoints.length === 1 ? "" : "s"} added.</span><div className="flex shrink-0 gap-3"><button type="button" onClick={() => onChange(waypoints.slice(0, -1))} disabled={waypoints.length === 0} className="font-medium text-foreground underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-40">Undo last</button><button type="button" onClick={() => onChange([])} disabled={waypoints.length === 0} className="font-medium text-destructive underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-40">Clear</button></div></div></div>;
}
