import { PlatformMap } from "@/components/maps/platform-map";
import type { Position } from "@/types/database";
import type { MapMarkerSpec, MapPolylineSpec } from "@/components/mapstudio/types";
import { getTrackerBallColor } from "@/lib/telemetry-status";

type LivePoint = Pick<Position, "latitude" | "longitude" | "recorded_at"> & Partial<Pick<Position, "speed" | "ignition" | "movement" | "course">>;
interface Props { route: Position[]; currentPosition: LivePoint | null; }

function trailBearing(points: [number, number][]) {
  if (points.length < 2) return undefined;
  const [fromLat, fromLng] = points[points.length - 2];
  const [toLat, toLng] = points[points.length - 1];
  const radians = Math.PI / 180;
  const y = Math.sin((toLng - fromLng) * radians) * Math.cos(toLat * radians);
  const x = Math.cos(fromLat * radians) * Math.sin(toLat * radians) - Math.sin(fromLat * radians) * Math.cos(toLat * radians) * Math.cos((toLng - fromLng) * radians);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** Singular-bike view: full-detail basemap, 3D direction trail, and a live bike ball marker. */
export function AssetRouteMapbox({ route, currentPosition }: Props) {
  const points = route.map((point) => [point.latitude, point.longitude] as [number, number]);
  const markers: MapMarkerSpec[] = [];
  if (route[0]) markers.push({ id: "asset-route:start", lat: route[0].latitude, lng: route[0].longitude, title: "Route start", icon: "dot", color: "#60a5fa", scale: 7, snippet: [new Date(route[0].recorded_at).toLocaleString()] });
  if (route.length > 1) { const end = route[route.length - 1]; markers.push({ id: "asset-route:end", lat: end.latitude, lng: end.longitude, title: "Route end", icon: "dot", color: "#fb923c", scale: 7, snippet: [new Date(end.recorded_at).toLocaleString()] }); }
  if (currentPosition) markers.push({ id: "asset-route:current", lat: currentPosition.latitude, lng: currentPosition.longitude, bearing: currentPosition.speed != null && currentPosition.speed >= 5 ? trailBearing(points) : undefined, title: "Latest location", icon: "bike", color: getTrackerBallColor(currentPosition as Position), scale: 12, snippet: [new Date(currentPosition.recorded_at).toLocaleString(), currentPosition.speed != null ? `${Math.round(currentPosition.speed)} km/h` : "Speed unavailable"] });
  const polylines: MapPolylineSpec[] = points.length > 1 ? [{ id: "asset-route:path", points, color: "#34d399", weight: 5, opacity: 0.9, threeD: true }] : [];
  return <PlatformMap markers={markers} polylines={polylines} defaultPitch={50} fitNonce={Math.max(route.length, 1)} heightClass="h-full w-full" />;
}
