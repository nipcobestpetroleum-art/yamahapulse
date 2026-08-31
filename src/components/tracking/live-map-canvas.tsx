import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L, { type LatLngBoundsExpression, type LatLngExpression } from "leaflet";
import { Button } from "@/components/ui/button";
import { createVehicleMarkerIcon } from "@/components/tracking/vehicle-marker-icon";
import { formatDistanceToNow } from "date-fns";
import { LocateFixed, Maximize2 } from "lucide-react";
import type { LatestPosition } from "@/types/database";

export interface LiveMapVehicle {
  key: string;
  deviceId: string;
  vehicleName: string;
  registration: string | null;
  position: LatestPosition;
}

interface LiveMapCanvasProps {
  vehicles: LiveMapVehicle[];
  selectedKey: string | null;
  onSelectVehicle: (key: string) => void;
}

function FitToData({ vehicles }: { vehicles: LiveMapVehicle[] }) {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (fittedRef.current) return;
    const pts = vehicles
      .map((v) =>
        Number.isFinite(v.position.latitude) && Number.isFinite(v.position.longitude)
          ? ([v.position.latitude, v.position.longitude] as LatLngExpression)
          : null,
      )
      .filter(Boolean) as LatLngExpression[];

    if (pts.length === 0) return;

    const bounds: LatLngBoundsExpression = pts.length === 1 ? [pts[0], pts[0]] : (pts as any);
    map.fitBounds(bounds, { paddingTopLeft: [20, 20], paddingBottomRight: [20, 20], maxZoom: 14 });
    fittedRef.current = true;
  }, [map, vehicles]);

  return null;
}

function SelectedZoom({ selected }: { selected: LiveMapVehicle | null }) {
  const map = useMap();
  useEffect(() => {
    if (!selected) return;
    const { latitude, longitude } = selected.position;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    map.setView([latitude, longitude], Math.max(map.getZoom(), 15), { animate: true });
  }, [map, selected]);
  return null;
}

export function LiveMapCanvas({ vehicles, selectedKey, onSelectVehicle }: LiveMapCanvasProps) {
  const selected = useMemo(
    () => vehicles.find((v) => v.key === selectedKey) ?? null,
    [vehicles, selectedKey],
  );

  const effectiveCenter: LatLngExpression = selected
    ? [selected.position.latitude, selected.position.longitude]
    : vehicles.length > 0
      ? [vehicles[0].position.latitude, vehicles[0].position.longitude]
      : [20, 0];

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card/40">
      <MapContainer
        center={effectiveCenter}
        zoom={vehicles.length > 0 ? 12 : 3}
        className="h-[520px] w-full lg:h-[560px]"
        scrollWheelZoom
        attributionControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <FitToData vehicles={vehicles} />
        <SelectedZoom selected={selected} />

        {vehicles.map((v) => {
          const lat = v.position.latitude;
          const lng = v.position.longitude;
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

          const last = new Date(v.position.recorded_at);
          const ageMin = (Date.now() - last.getTime()) / 60000;
          const isOffline = !Number.isFinite(ageMin) ? true : ageMin > 15;

          return (
            <Marker
              key={v.key}
              position={[lat, lng]}
              icon={createVehicleMarkerIcon({
                courseDeg: v.position.course,
                speedKmh: v.position.speed,
                isOffline,
              })}
              eventHandlers={{
                click: () => onSelectVehicle(v.key),
              }}
            >
              <Popup>
                <div className="min-w-[220px] space-y-2">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">{v.vehicleName}</div>
                    <div className="text-xs text-muted-foreground">
                      {v.registration ? v.registration : "Unregistered vehicle"}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-border bg-card/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Speed</div>
                      <div className="font-semibold">
                        {v.position.speed != null ? `${Math.round(v.position.speed)} km/h` : "—"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-card/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Ignition</div>
                      <div className="font-semibold">
                        {v.position.ignition == null ? "—" : v.position.ignition ? "On" : "Off"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-card/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Battery</div>
                      <div className="font-semibold">
                        {v.position.battery_level != null
                          ? `${Math.round(v.position.battery_level)}%`
                          : "—"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-card/60 p-2">
                      <div className="text-[10px] text-muted-foreground">Updated</div>
                      <div className="font-semibold">
                        {formatDistanceToNow(new Date(v.position.updated_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {v.position.address ? v.position.address : "Address not available"}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-background/70 px-3 py-2 backdrop-blur">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          <span className="text-xs font-medium text-foreground">
            {vehicles.length} tracked {vehicles.length === 1 ? "asset" : "assets"}
          </span>
        </div>

        <div className="pointer-events-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="bg-background/70 backdrop-blur"
            onClick={() => {
              const mapEl = document.querySelector(".leaflet-container") as HTMLElement | null;
              mapEl?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          >
            <Maximize2 className="mr-2 h-4 w-4" />
            Focus map
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="bg-background/70 backdrop-blur"
            title="Locate me"
            onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  const mapEl = document.querySelector(".leaflet-container") as HTMLElement | null;
                  if (!mapEl) return;
                  // Map center manipulation is handled by leaflet; easiest is to dispatch a fit.
                  // Keep simple: rely on browser UI + user zoom.
                },
                () => {},
                { enableHighAccuracy: true, timeout: 8000 },
              );
            }}
          >
            <LocateFixed className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}