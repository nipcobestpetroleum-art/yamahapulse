import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Car, Loader2, Route as RouteIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getTelemetryStatus, TELEMETRY_STATUS_LABELS, TELEMETRY_STATUS_STYLES } from "@/lib/telemetry-status";
import type { StudioOverlays, StudioTab, StudioVehicle } from "@/components/mapstudio/types";
import { STATUS_MARKER_COLORS } from "@/components/mapstudio/types";

interface FleetPanelProps {
  vehicles: StudioVehicle[];
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
  setOverlays: (tab: StudioTab, overlays: StudioOverlays) => void;
  requestView: (view: { lat: number; lng: number; zoom?: number }) => void;
  fitOverlays: () => void;
}

export function FleetPanel({ vehicles, selectedDeviceId, onSelectDevice, setOverlays, requestView, fitOverlays }: FleetPanelProps) {
  const [showTrail, setShowTrail] = useState(false);
  const [trailPoints, setTrailPoints] = useState<[number, number][] | null>(null);
  const [trailLoading, setTrailLoading] = useState(false);

  const positioned = useMemo(
    () => vehicles.filter(
      (vehicle) =>
        vehicle.position &&
        Number.isFinite(vehicle.position.latitude) &&
        Number.isFinite(vehicle.position.longitude) &&
        !(vehicle.position.latitude === 0 && vehicle.position.longitude === 0),
    ),
    [vehicles],
  );

  useEffect(() => {
    const markers = positioned.map((vehicle) => {
      const position = vehicle.position!;
      const status = getTelemetryStatus(position);
      return {
        id: `fleet:${vehicle.deviceId}`,
        lat: position.latitude,
        lng: position.longitude,
        title: vehicle.vehicleName,
        icon: "bike" as const,
        color: STATUS_MARKER_COLORS[status],
        snippet: [
          vehicle.registration ?? "Unregistered",
          `${TELEMETRY_STATUS_LABELS[status]}${position.speed != null ? ` · ${Math.round(position.speed)} km/h` : ""}`,
          position.place_name ?? position.address ?? undefined,
          format(new Date(position.recorded_at), "dd MMM yyyy, HH:mm"),
        ].filter(Boolean) as string[],
      };
    });

    const polylines =
      showTrail && trailPoints && trailPoints.length > 1
        ? [{ id: "fleet:trail", points: trailPoints, color: "#6366f1", weight: 4, opacity: 0.85 }]
        : [];

    setOverlays("fleet", { markers, polylines });
  }, [positioned, showTrail, trailPoints, setOverlays]);

  // Load recent GPS history for the selected vehicle when trail mode is on.
  useEffect(() => {
    if (!showTrail || !selectedDeviceId) {
      setTrailPoints(null);
      return;
    }
    let cancelled = false;
    setTrailLoading(true);
    supabase
      .from("positions")
      .select("recorded_at,latitude,longitude")
      .eq("device_id", selectedDeviceId)
      .gte("recorded_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .order("recorded_at", { ascending: true })
      .limit(400)
      .then(({ data, error }) => {
        if (cancelled) return;
        setTrailLoading(false);
        if (error) {
          setTrailPoints(null);
          return;
        }
        const points = (data ?? [])
          .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude) && !(row.latitude === 0 && row.longitude === 0))
          .map((row) => [row.latitude, row.longitude] as [number, number]);
        setTrailPoints(points);
        if (points.length > 1) fitOverlays();
      });
    return () => {
      cancelled = true;
    };
  }, [fitOverlays, showTrail, selectedDeviceId]);

  const stats = useMemo(() => {
    const counts = { moving: 0, idling: 0, stopped: 0, offline: 0, other: 0 };
    for (const vehicle of vehicles) {
      const status = getTelemetryStatus(vehicle.position);
      if (status === "MOVING") counts.moving += 1;
      else if (status === "IDLING") counts.idling += 1;
      else if (status === "STOPPED") counts.stopped += 1;
      else if (status === "OFFLINE") counts.offline += 1;
      else counts.other += 1;
    }
    return counts;
  }, [vehicles]);

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card/60">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Fleet on Mapbox</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTrail((current) => !current)}
              disabled={!selectedDeviceId}
            >
              {trailLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RouteIcon className="mr-2 h-4 w-4" />}
              {showTrail ? "Hide trail" : "Show trail"}
            </Button>
            <Button variant="outline" size="sm" onClick={fitOverlays} disabled={positioned.length === 0}>
              Fit fleet
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(
            [
              ["Moving", stats.moving, "text-emerald-400"],
              ["Idling", stats.idling, "text-sky-400"],
              ["Stopped", stats.stopped, "text-amber-400"],
              ["Offline", stats.offline, "text-slate-400"],
              ["No data", stats.other, "text-rose-300"],
            ] as const
          ).map(([label, count, tone]) => (
            <div key={label} className="rounded-lg border border-border bg-background/40 p-2.5">
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className={cn("text-lg font-bold", tone)}>{count}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border bg-card/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Assets with a fix
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Click to fly the map to a vehicle
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {positioned.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No tracked vehicles have a valid GPS fix yet.
            </div>
          ) : (
            <ScrollArea className="h-[320px] pr-3">
              <div className="space-y-1.5">
                {positioned.map((vehicle) => {
                  const position = vehicle.position!;
                  const status = getTelemetryStatus(position);
                  return (
                    <button
                      key={vehicle.deviceId}
                      type="button"
                      onClick={() => {
                        onSelectDevice(vehicle.deviceId);
                        requestView({ lat: position.latitude, lng: position.longitude, zoom: 15 });
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2 text-left transition-colors hover:border-primary/40",
                        selectedDeviceId === vehicle.deviceId && "border-primary/50 bg-primary/5",
                      )}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Car className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{vehicle.vehicleName}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {vehicle.registration ?? "Unregistered"} · {format(new Date(position.recorded_at), "HH:mm:ss")}
                        </span>
                      </span>
                      <Badge variant="outline" className={cn("shrink-0 text-[11px]", TELEMETRY_STATUS_STYLES[status])}>
                        {TELEMETRY_STATUS_LABELS[status]}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
