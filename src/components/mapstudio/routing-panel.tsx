import { useState } from "react";
import { Car, Eraser, GitBranch, Loader2, Plus, Route as RouteIcon, Timer, Wand2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlaceAutocomplete } from "@/components/mapstudio/place-autocomplete";
import type { StudioOverlays, StudioTab, StudioVehicle } from "@/components/mapstudio/types";
import { formatMapboxDistance, formatMapboxDuration } from "@/lib/mapbox";
import { panelDirections, panelMatrix, panelPlaceDetails, type PanelPrediction } from "@/lib/mapbox-panel";

interface SelectedPoint {
  lat: number;
  lng: number;
  label: string;
}

interface RouteResult {
  distanceMeters?: number;
  durationSeconds: number | null;
  legs: Array<{ distanceMeters?: number; durationSeconds: number | null }>;
  waypointOrder: number[];
  engineLabel: string;
}

interface MatrixPanelElement {
  originIndex?: number;
  destinationIndex?: number;
  duration?: string;
  distanceMeters?: number;
}

interface RoutingPanelProps {
  vehicles: StudioVehicle[];
  selectedDeviceId: string | null;
  setOverlays: (tab: StudioTab, overlays: StudioOverlays) => void;
  fitOverlays: () => void;
}

async function resolvePrediction(prediction: PanelPrediction): Promise<SelectedPoint> {
  const details = await panelPlaceDetails(prediction.placeId);
  if (!details.location) throw new Error("Place has no location");
  return { lat: details.location.latitude, lng: details.location.longitude, label: prediction.primaryText || details.displayName?.text || "Place" };
}

export function RoutingPanel({ vehicles, selectedDeviceId, setOverlays, fitOverlays }: RoutingPanelProps) {
  const [origin, setOrigin] = useState<SelectedPoint | null>(null);
  const [destination, setDestination] = useState<SelectedPoint | null>(null);
  const [stops, setStops] = useState<SelectedPoint[]>([]);
  const [engine, setEngine] = useState<"routes" | "optimization">("routes");
  const [projectNumber, setProjectNumber] = useState(() => localStorage.getItem("yamahapulse.mapbox.optimization") ?? "");
  const [traffic, setTraffic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [optimizedOrder, setOptimizedOrder] = useState<number[] | null>(null);

  const [matrixBusy, setMatrixBusy] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<MatrixPanelElement[] | null>(null);
  const [matrixLabels, setMatrixLabels] = useState<string[]>([]);

  const selectedVehicle = vehicles.find((vehicle) => vehicle.deviceId === selectedDeviceId) ?? null;
  const selectedVehiclePoint: SelectedPoint | null =
    selectedVehicle?.position &&
    Number.isFinite(selectedVehicle.position.latitude) &&
    Number.isFinite(selectedVehicle.position.longitude) &&
    !(selectedVehicle.position.latitude === 0 && selectedVehicle.position.longitude === 0)
      ? { lat: selectedVehicle.position.latitude, lng: selectedVehicle.position.longitude, label: selectedVehicle.vehicleName }
      : null;

  const drawRoute = (from: SelectedPoint, routeStops: SelectedPoint[], to: SelectedPoint, coordinates: [number, number][]) => {
    const decoded = coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
    setOverlays("routing", {
      markers: [
        { id: "route:origin", lat: from.lat, lng: from.lng, title: "Origin", color: "#10b981", scale: 9, snippet: [from.label] },
        ...routeStops.map((stop, index) => ({
          id: `route:stop-${index}`,
          lat: stop.lat,
          lng: stop.lng,
          title: `Stop ${index + 1}`,
          color: "#f59e0b",
          scale: 7,
          snippet: [stop.label],
        })),
        { id: "route:destination", lat: to.lat, lng: to.lng, title: "Destination", color: "#6366f1", scale: 9, snippet: [to.label] },
      ],
      polylines: decoded.length > 1 ? [{ id: "route:path", points: decoded, color: "#6366f1", weight: 5, opacity: 0.9 }] : [],
    });
  };

  const compute = async () => {
    if (!origin || !destination) {
      setError("Set both an origin and a destination first.");
      return;
    }
    setBusy(true);
    setError(null);
    setOptimizedOrder(null);

    try {
      let orderedStops = stops;
      let engineLabel = "Routes API";

      if (engine === "optimization" && stops.length >= 2) {
        engineLabel = "Mapbox Optimization API";
        setError("Mapbox Optimization API submissions require a routing problem and asynchronous job polling. The route is computed with Directions API for now.");
      }

      const data = await panelDirections([
        { latitude: origin.lat, longitude: origin.lng },
        ...orderedStops.map((stop) => ({ latitude: stop.lat, longitude: stop.lng })),
        { latitude: destination.lat, longitude: destination.lng },
      ], traffic);
      const route = data.routes?.[0];
      if (!route) throw new Error("No route found for these points");

      setResult({
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        legs: (route.legs ?? []).map((leg) => ({ distanceMeters: leg.distance, durationSeconds: leg.duration })),
        waypointOrder: [],
        engineLabel,
      });

      drawRoute(origin, orderedStops, destination, route.geometry.coordinates);
      fitOverlays();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Routing failed");
    } finally {
      setBusy(false);
    }
  };

  const runMatrix = async () => {
    if (!destination) {
      setMatrixError("Set a destination first.");
      return;
    }
    const withFix = vehicles
      .filter(
        (vehicle) =>
          vehicle.position &&
          Number.isFinite(vehicle.position.latitude) &&
          Number.isFinite(vehicle.position.longitude) &&
          !(vehicle.position.latitude === 0 && vehicle.position.longitude === 0),
      )
      .slice(0, 8);

    if (withFix.length === 0) {
      setMatrixError("No vehicles currently have a GPS fix.");
      return;
    }

    setMatrixBusy(true);
    setMatrixError(null);
    try {
      const data = await panelMatrix([
        ...withFix.map((vehicle) => ({ latitude: vehicle.position!.latitude, longitude: vehicle.position!.longitude })),
        { latitude: destination.lat, longitude: destination.lng }
      ]);
      const elements = (data.durations ?? []).map((durations, index) => ({
        originIndex: index,
        destinationIndex: 0,
        duration: durations[withFix.length] == null ? undefined : `${durations[withFix.length]}s`,
        distanceMeters: data.distances && data.distances[index] ? data.distances[index]![withFix.length] ?? undefined : undefined,
      }));
      setMatrix(elements);
      setMatrixLabels(withFix.map((vehicle) => vehicle.vehicleName));
    } catch (caught) {
      setMatrixError(caught instanceof Error ? caught.message : "Matrix failed");
    } finally {
      setMatrixBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Plan a route</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Origin</Label>
              <PlaceAutocomplete placeholder="Where does the route start?" onPick={(prediction) => void resolvePrediction(prediction).then(setOrigin).catch((e) => setError(e.message))} />
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs">
                  {origin ? <Badge variant="outline" className="border-emerald-500/25 bg-emerald-500/10 text-emerald-400">{origin.label}</Badge> : <span className="text-muted-foreground">Not set</span>}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!selectedVehiclePoint}
                  onClick={() => selectedVehiclePoint && setOrigin(selectedVehiclePoint)}
                >
                  <Car className="mr-1.5 h-3.5 w-3.5" /> Use selected vehicle
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Destination</Label>
              <PlaceAutocomplete placeholder="Where does it end?" onPick={(prediction) => void resolvePrediction(prediction).then(setDestination).catch((e) => setError(e.message))} />
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs">
                  {destination ? <Badge variant="outline" className="border-indigo-500/25 bg-indigo-500/10 text-indigo-300">{destination.label}</Badge> : <span className="text-muted-foreground">Not set</span>}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!selectedVehiclePoint}
                  onClick={() => selectedVehiclePoint && setDestination(selectedVehiclePoint)}
                >
                  <Car className="mr-1.5 h-3.5 w-3.5" /> Use selected vehicle
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Waypoints ({stops.length})</Label>
            <PlaceAutocomplete
              placeholder="Add a stop along the way…"
              clearOnPick
              onPick={(prediction) => void resolvePrediction(prediction).then((point) => setStops((current) => [...current, point])).catch((e) => setError(e.message))}
            />
            {stops.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {stops.map((stop, index) => (
                  <Badge key={`${stop.label}-${index}`} variant="outline" className="gap-1 border-amber-500/25 bg-amber-500/10 text-amber-400">
                    {index + 1}. {stop.label}
                    <button type="button" onClick={() => setStops((current) => current.filter((_, i) => i !== index))} className="ml-0.5 hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2">
              <Switch id="routing-traffic" checked={traffic} onCheckedChange={setTraffic} />
              <Label htmlFor="routing-traffic" className="text-xs">Traffic-aware</Label>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Optimization engine</Label>
              <Select value={engine} onValueChange={(value) => setEngine(value as "routes" | "optimization")}>
                <SelectTrigger className="h-8 w-[240px] bg-card/60 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="routes">Routes API (up to 25 stops)</SelectItem>
                  <SelectItem value="optimization">Route Optimization API (tours)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {engine === "optimization" && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">GCP project number</Label>
                <Input
                  value={projectNumber}
                  onChange={(event) => setProjectNumber(event.target.value)}
                  placeholder="e.g. 414873"
                  className="h-8 w-[180px] bg-card/60 text-xs"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void compute()} disabled={busy || !origin || !destination}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RouteIcon className="mr-2 h-4 w-4" />}
              {stops.length > 1 ? "Optimize & route" : "Compute route"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setOrigin(null);
                setDestination(null);
                setStops([]);
                setResult(null);
                setOptimizedOrder(null);
                setMatrix(null);
                setError(null);
                setOverlays("routing", { markers: [], polylines: [] });
              }}
            >
              <Eraser className="mr-2 h-4 w-4" /> Clear
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {result && (
            <div className="space-y-3 rounded-xl border border-border bg-background/40 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                  <GitBranch className="mr-1.5 h-3.5 w-3.5" /> {result.engineLabel}
                </Badge>
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <RouteIcon className="h-4 w-4 text-primary" /> {formatMapboxDistance(result.distanceMeters)}
                </div>
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <Timer className="h-4 w-4 text-primary" /> {formatMapboxDuration(result.durationSeconds)}
                </div>
                <span className="text-xs text-muted-foreground">{result.legs.length} leg{result.legs.length === 1 ? "" : "s"}</span>
              </div>

              {optimizedOrder && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Wand2 className="h-3.5 w-3.5 text-primary" />
                  <span className="text-muted-foreground">Optimized order:</span>
                  {optimizedOrder.map((originalIndex, position) => (
                    <Badge key={originalIndex} variant="outline" className="border-amber-500/25 bg-amber-500/10 text-amber-400">
                      #{position + 1} ← stop {originalIndex + 1}
                    </Badge>
                  ))}
                </div>
              )}

              {result.legs.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">Leg</TableHead>
                        <TableHead className="text-xs">Distance</TableHead>
                        <TableHead className="text-xs">Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.legs.map((leg, index) => (
                        <TableRow key={index}>
                          <TableCell className="text-xs">{index === 0 ? "Start" : `Stop ${index}`} → {index === result.legs.length - 1 ? "Destination" : `Stop ${index + 1}`}</TableCell>
                          <TableCell className="text-xs">{formatMapboxDistance(leg.distanceMeters)}</TableCell>
                          <TableCell className="text-xs">{formatMapboxDuration(leg.durationSeconds)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card/40">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Fleet ETA matrix</CardTitle>
          <Button size="sm" variant="outline" onClick={() => void runMatrix()} disabled={matrixBusy || !destination}>
            {matrixBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Compute ETAs → {destination?.label ?? "destination"}
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {matrixError && <p className="text-sm text-destructive">{matrixError}</p>}
          {matrix && matrix.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs">Vehicle</TableHead>
                    <TableHead className="text-xs">Distance</TableHead>
                    <TableHead className="text-xs">Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrix.map((element, index) => (
                    <TableRow key={index}>
                      <TableCell className="text-xs font-medium">{matrixLabels[element.originIndex ?? index] ?? `Origin ${element.originIndex ?? index}`}</TableCell>
                      <TableCell className="text-xs">{formatMapboxDistance(element.distanceMeters)}</TableCell>
                      <TableCell className="text-xs">{formatMapboxDuration(element.duration ? Number.parseFloat(element.duration) : undefined)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Set a destination above, then compute drive distance and duration from every fleet vehicle (Routes API distance matrix).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
