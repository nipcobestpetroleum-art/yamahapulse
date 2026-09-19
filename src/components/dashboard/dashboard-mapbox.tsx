import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PlatformMap } from "@/components/maps/platform-map";
import { getTelemetryStatus, TELEMETRY_STATUS_LABELS } from "@/lib/telemetry-status";
import type { LatestPosition } from "@/types/database";
import type { MapMarkerSpec } from "@/components/mapstudio/types";

interface Asset { deviceId: string; deviceName: string; imei: string; vehicleName: string; position: LatestPosition | null; }
export function DashboardMapbox({ assets }: { assets: Asset[] }) {
  const positioned = assets.filter((asset) => asset.position && Number.isFinite(asset.position.latitude) && Number.isFinite(asset.position.longitude) && !(asset.position.latitude === 0 && asset.position.longitude === 0));
  const markers = useMemo<MapMarkerSpec[]>(() => positioned.map((asset) => { const position = asset.position!; const status = getTelemetryStatus(position); return { id: asset.deviceId, lat: position.latitude, lng: position.longitude, title: asset.vehicleName, color: status === "MOVING" ? "#10b981" : status === "OFFLINE" ? "#94a3b8" : "#f59e0b", snippet: [asset.deviceName, `Status: ${TELEMETRY_STATUS_LABELS[status]}`, `GPS: ${new Date(position.recorded_at).toLocaleString()}`, position.address ?? `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`, `/fleet/live/${asset.deviceId}`] }; }), [positioned]);
  if (positioned.length === 0) return <div className="flex h-[600px] items-center justify-center rounded-xl border border-dashed border-border bg-background/30 text-sm text-muted-foreground">No tracker has reported a mappable location yet.</div>;
  return <div className="relative overflow-hidden rounded-xl border border-border"><PlatformMap markers={markers} heightClass="h-[600px] w-full" /><div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-border bg-background/85 px-3 py-2 text-[11px] text-muted-foreground shadow-lg backdrop-blur">Mapbox shows the latest GPS location reported by each tracker.</div></div>;
}
