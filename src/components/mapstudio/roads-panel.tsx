import { useState } from "react";
import { Loader2, MapPinned, Signpost, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { StudioOverlays, StudioTab, StudioVehicle } from "@/components/mapstudio/types";
import { panelMatching } from "@/lib/mapbox-panel";
type SnappedPoint = { location: { latitude: number; longitude: number }; placeId?: string };


interface RoadsPanelProps {
  vehicles: StudioVehicle[];
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
  setOverlays: (tab: StudioTab, overlays: StudioOverlays) => void;
  fitOverlays: () => void;
  lastMapClick: { lat: number; lng: number } | null;
}

function parseManualPoints(text: string): { latitude: number; longitude: number }[] {
  return text
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [latText, lngText] = line.split(/[,\s]+/);
      const latitude = Number.parseFloat(latText);
      const longitude = Number.parseFloat(lngText);
      return { latitude, longitude };
    })
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180)
    .slice(0, 100);
}

export function RoadsPanel({ vehicles, selectedDeviceId, onSelectDevice, setOverlays, fitOverlays, lastMapClick }: RoadsPanelProps) {
  const [source, setSource] = useState<"vehicle" | "manual">("vehicle");
  const [manualText, setManualText] = useState("-1.2864, 36.8172\n-1.2900, 36.8210\n-1.2950, 36.8260");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapped, setSnapped] = useState<SnappedPoint[] | null>(null);
  const [sourceCount, setSourceCount] = useState(0);
  const [nearestBusy, setNearestBusy] = useState(false);
  const [nearestError, setNearestError] = useState<string | null>(null);
  const [nearest, setNearest] = useState<SnappedPoint[] | null>(null);

  const collectPoints = async (): Promise<{ latitude: number; longitude: number }[]> => {
    if (source === "manual") {
      const points = parseManualPoints(manualText);
      if (points.length < 2) throw new Error("Paste at least two valid lat,lng lines (one per line).");
      return points;
    }
    const deviceId = selectedDeviceId ?? vehicles[0]?.deviceId;
    if (!deviceId) throw new Error("Select a vehicle with GPS history first.");
    const { data, error: queryError } = await supabase
      .from("positions")
      .select("recorded_at,latitude,longitude")
      .eq("device_id", deviceId)
      .gte("recorded_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .order("recorded_at", { ascending: false })
      .limit(100);
    if (queryError) throw new Error(queryError.message);
    const points = (data ?? [])
      .map((row) => ({ latitude: row.latitude, longitude: row.longitude }))
      .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && !(point.latitude === 0 && point.longitude === 0))
      .reverse();
    if (points.length < 2) throw new Error("This vehicle has fewer than 2 recorded points in the last 6 hours.");
    return points;
  };

  const snap = async () => {
    setBusy(true);
    setError(null);
    setNearest(null);
    try {
      const points = await collectPoints();
      const data = await panelMatching(points);
      const snappedPoints: SnappedPoint[] = (data.tracepoints ?? []).filter(Boolean).map((point) => ({ location: { latitude: point!.location[1], longitude: point!.location[0] }, placeId: point!.name }));
      if (snappedPoints.length === 0) throw new Error("Mapbox could not match these points to a road.");
      setSnapped(snappedPoints);
      setSourceCount(points.length);

      const snappedPath = snappedPoints.map((point) => [point.location.latitude, point.location.longitude] as [number, number]);
      const originalPath = points.map((point) => [point.latitude, point.longitude] as [number, number]);
      setOverlays("roads", {
        markers: [
          { id: "roads:start", lat: snappedPath[0][0], lng: snappedPath[0][1], title: "Trail start", color: "#10b981", scale: 7 },
          { id: "roads:end", lat: snappedPath[snappedPath.length - 1][0], lng: snappedPath[snappedPath.length - 1][1], title: "Trail end", color: "#6366f1", scale: 7 },
        ],
        polylines: [
          { id: "roads:original", points: originalPath, color: "#94a3b8", weight: 3, dashed: true },
          { id: "roads:snapped", points: snappedPath, color: "#10b981", weight: 5, opacity: 0.95 },
        ],
      });
      fitOverlays();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Snap-to-roads failed");
    } finally {
      setBusy(false);
    }
  };

  const findNearest = async () => {
    if (!lastMapClick) return;
    setNearestBusy(true);
    setNearestError(null);
    try {
      const delta = 0.0001;
      const data = await panelMatching([
        { latitude: lastMapClick.lat - delta, longitude: lastMapClick.lng - delta },
        { latitude: lastMapClick.lat, longitude: lastMapClick.lng },
        { latitude: lastMapClick.lat + delta, longitude: lastMapClick.lng + delta },
      ]);
      setNearest((data.tracepoints ?? []).filter(Boolean).map((point) => ({ location: { latitude: point!.location[1], longitude: point!.location[0] }, placeId: point!.name })));
    } catch (caught) {
      setNearestError(caught instanceof Error ? caught.message : "Nearest-roads failed");
    } finally {
      setNearestBusy(false);
    }
  };

  const uniqueRoads = snapped ? new Set(snapped.map((point) => point.placeId).filter(Boolean)).size : 0;

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Snap GPS to roads (Roads API)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={source === "vehicle" ? "default" : "outline"} onClick={() => setSource("vehicle")}>
              Vehicle trail
            </Button>
            <Button size="sm" variant={source === "manual" ? "default" : "outline"} onClick={() => setSource("manual")}>
              Manual coordinates
            </Button>
          </div>

          {source === "vehicle" ? (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,320px)_auto] sm:items-center">
              <Input
                readOnly
                value={
                  vehicles.find((vehicle) => vehicle.deviceId === selectedDeviceId)?.vehicleName ??
                  vehicles[0]?.vehicleName ??
                  "No tracked vehicles"
                }
                className="bg-card/60 text-xs"
              />
              <span className="text-xs text-muted-foreground">Uses the last 6 hours of GPS points (max 100).</span>
            </div>
          ) : (
            <Textarea
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
              placeholder={"-1.2864, 36.8172\n-1.2900, 36.8210"}
              className="min-h-[110px] bg-card/60 font-mono text-xs"
            />
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void snap()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Waypoints className="mr-2 h-4 w-4" />}
              Snap to roads
            </Button>
            {vehicles.length > 0 && (
              <select
                className="h-8 rounded-lg border border-border bg-card/60 px-2 text-xs"
                value={selectedDeviceId ?? ""}
                onChange={(event) => onSelectDevice(event.target.value)}
              >
                {vehicles.map((vehicle) => (
                  <option key={vehicle.deviceId} value={vehicle.deviceId}>
                    {vehicle.vehicleName}
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {snapped && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
                  <span className="text-muted-foreground">GPS points</span>
                  <div className="text-base font-bold">{sourceCount}</div>
                </div>
                <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
                  <span className="text-muted-foreground">Road points</span>
                  <div className="text-base font-bold">{snapped.length}</div>
                </div>
                <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
                  <span className="text-muted-foreground">Road links</span>
                  <div className="text-base font-bold">{uniqueRoads}</div>
                </div>
                <div className="flex items-center gap-2 px-2 text-muted-foreground">
                  <span className="inline-block h-1.5 w-5 rounded bg-slate-400" /> raw GPS
                  <span className="ml-2 inline-block h-1.5 w-5 rounded bg-emerald-500" /> snapped
                </div>
              </div>

              <div className="max-h-64 overflow-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs">#</TableHead>
                      <TableHead className="text-xs">Snapped position</TableHead>
                      <TableHead className="text-xs">Place ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapped.slice(0, 40).map((point, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-xs text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {point.location.latitude.toFixed(5)}, {point.location.longitude.toFixed(5)}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate font-mono text-[11px] text-muted-foreground">{point.placeId ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {snapped.length > 40 && (
                <p className="text-[11px] text-muted-foreground">Showing first 40 of {snapped.length} snapped points.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card/40">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Nearest road lookup</CardTitle>
          <Button size="sm" variant="outline" onClick={() => void findNearest()} disabled={!lastMapClick || nearestBusy}>
            {nearestBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Signpost className="mr-2 h-4 w-4" />}
            Find nearest road
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <p className="text-xs text-muted-foreground">
            {lastMapClick ? (
              <>
                Last map click: <span className="font-mono">{lastMapClick.lat.toFixed(5)}, {lastMapClick.lng.toFixed(5)}</span>
              </>
            ) : (
              "Click anywhere on the map, then find the closest drivable road link."
            )}
          </p>
          {nearestError && <p className="text-sm text-destructive">{nearestError}</p>}
          {nearest && nearest.length > 0 && (
            <div className="space-y-1">
              {nearest.slice(0, 5).map((point, index) => (
                <div key={index} className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs">
                  <MapPinned className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="font-mono">
                    {point.location.latitude.toFixed(5)}, {point.location.longitude.toFixed(5)}
                  </span>
                  <span className="ml-auto max-w-[160px] truncate font-mono text-[11px] text-muted-foreground">{point.placeId ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
          {nearest && nearest.length === 0 && <p className="text-xs text-muted-foreground">No nearby road links found for this point.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
