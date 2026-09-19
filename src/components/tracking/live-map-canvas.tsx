import { useMemo } from "react";
import { LocateFixed, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformMap } from "@/components/maps/platform-map";
import { getTelemetryStatus, TELEMETRY_STATUS_LABELS } from "@/lib/telemetry-status";
import { format } from "date-fns";
import type { LatestPosition } from "@/types/database";
import type { MapMarkerSpec, MapPolylineSpec } from "@/components/mapstudio/types";

export interface LiveMapVehicle { key: string; deviceId: string; vehicleName: string; registration: string | null; position: LatestPosition; trail: [number, number][]; }
interface Props { vehicles: LiveMapVehicle[]; selectedKey: string | null; onSelectVehicle: (key: string) => void; }
const colors: Record<string, string> = { MOVING: "#10b981", IDLING: "#38bdf8", STOPPED: "#f59e0b", OFFLINE: "#94a3b8", NO_DATA: "#f43f5e", UNKNOWN: "#a78bfa" };

export function LiveMapCanvas({ vehicles, selectedKey, onSelectVehicle }: Props) {
  const markers = useMemo<MapMarkerSpec[]>(() => vehicles.filter((vehicle) => Number.isFinite(vehicle.position.latitude) && Number.isFinite(vehicle.position.longitude) && !(vehicle.position.latitude === 0 && vehicle.position.longitude === 0)).map((vehicle) => {
    const status = getTelemetryStatus(vehicle.position);
    return { id: vehicle.key, lat: vehicle.position.latitude, lng: vehicle.position.longitude, title: vehicle.vehicleName, color: colors[status], scale: selectedKey === vehicle.key ? 10 : 8, snippet: [vehicle.registration ?? "Unregistered vehicle", TELEMETRY_STATUS_LABELS[status], vehicle.position.speed != null ? `${Math.round(vehicle.position.speed)} km/h` : "Speed unavailable", vehicle.position.place_name ?? vehicle.position.address ?? "Location unavailable", `GPS ${format(new Date(vehicle.position.recorded_at), "dd MMM yyyy, HH:mm:ss")}`] };
  }), [vehicles, selectedKey]);
  const polylines = useMemo<MapPolylineSpec[]>(() => vehicles.filter((vehicle) => vehicle.trail.length > 1).map((vehicle) => ({ id: `trail:${vehicle.key}`, points: vehicle.trail, color: vehicle.key === selectedKey ? "#34d399" : "#60a5fa", weight: vehicle.key === selectedKey ? 5 : 3, opacity: vehicle.key === selectedKey ? 0.9 : 0.45 })), [vehicles, selectedKey]);
  return <div className="relative overflow-hidden rounded-xl border border-border bg-card/40"><PlatformMap markers={markers} polylines={polylines} selectedMarkerId={selectedKey} onMarkerClick={onSelectVehicle} heightClass="h-[520px] w-full lg:h-[560px]" /><div className="pointer-events-none absolute left-3 top-3 flex gap-2"><div className="pointer-events-auto rounded-lg border border-border bg-background/75 px-3 py-2 text-xs font-medium backdrop-blur">Mapbox · {markers.length} tracked</div><Button variant="outline" size="sm" className="pointer-events-auto bg-background/75 backdrop-blur" onClick={() => document.querySelector(".mapboxgl-map")?.scrollIntoView({ behavior: "smooth", block: "center" })}><Maximize2 className="mr-2 h-4 w-4" />Focus map</Button><Button variant="outline" size="icon" className="pointer-events-auto bg-background/75 backdrop-blur" title="Locate me" onClick={() => navigator.geolocation?.getCurrentPosition(() => undefined)}><LocateFixed className="h-4 w-4" /></Button></div></div>;
}
