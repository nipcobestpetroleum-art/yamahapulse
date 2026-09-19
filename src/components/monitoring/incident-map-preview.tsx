import { PlatformMap } from "@/components/maps/platform-map";
import type { MapMarkerSpec } from "@/components/mapstudio/types";

interface Props { latitude: number; longitude: number; className?: string; }

export function IncidentMapPreview({ latitude, longitude, className }: Props) {
  const markers: MapMarkerSpec[] = [{ id: "incident", lat: latitude, lng: longitude, title: "Incident location", color: "#f43f5e", scale: 9 }];
  return <div className={className ?? "h-40 w-full overflow-hidden rounded-lg border border-border"}><PlatformMap markers={markers} heightClass="h-full w-full" viewRequest={{ lat: latitude, lng: longitude, zoom: 15, nonce: `${latitude}:${longitude}`.length }} /></div>;
}
