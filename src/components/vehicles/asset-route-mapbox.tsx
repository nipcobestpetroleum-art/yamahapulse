import { PlatformMap } from "@/components/maps/platform-map";
import type { Position } from "@/types/database";
import type { MapMarkerSpec, MapPolylineSpec } from "@/components/mapstudio/types";

type LocationPoint = Pick<Position, "latitude" | "longitude" | "recorded_at">;
interface Props { route: Position[]; currentPosition: LocationPoint | null; }
export function AssetRouteMapbox({ route, currentPosition }: Props) {
  const points = route.map((point) => [point.latitude, point.longitude] as [number, number]);
  const markers: MapMarkerSpec[] = [];
  if (route[0]) markers.push({ id: "asset-route:start", lat: route[0].latitude, lng: route[0].longitude, title: "Route start", color: "#60a5fa", scale: 7 });
  if (route.length > 1) { const end = route[route.length - 1]; markers.push({ id: "asset-route:end", lat: end.latitude, lng: end.longitude, title: "Route end", color: "#fb923c", scale: 7 }); }
  if (currentPosition) markers.push({ id: "asset-route:current", lat: currentPosition.latitude, lng: currentPosition.longitude, title: "Latest location", color: "#34d399", scale: 10, snippet: [new Date(currentPosition.recorded_at).toLocaleString()] });
  const polylines: MapPolylineSpec[] = points.length > 1 ? [{ id: "asset-route:path", points, color: "#34d399", weight: 5, opacity: 0.9 }] : [];
  const center = currentPosition ?? route[route.length - 1] ?? route[0];
  return <PlatformMap markers={markers} polylines={polylines} heightClass="h-full w-full" viewRequest={center ? { lat: center.latitude, lng: center.longitude, zoom: 14, nonce: route.length } : null} />;
}
