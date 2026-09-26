import { useState } from "react";
import { CircleDot, Database, Loader2, Search, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StudioOverlays, StudioTab, StudioVehicle } from "@/components/mapstudio/types";
import { panelIsochrone, panelSearchForward, panelTilequery } from "@/lib/mapbox-panel";
import type { MapboxFeature, MapboxFeatureCollection } from "@/lib/mapbox";

interface AdvancedPanelProps {
  vehicles: StudioVehicle[];
  selectedDeviceId: string | null;
  lastMapClick: { lat: number; lng: number } | null;
  setOverlays: (tab: StudioTab, overlays: StudioOverlays) => void;
  fitOverlays: () => void;
}

function featurePoint(feature: MapboxFeature): [number, number] | null {
  const point = feature.center ?? (feature.geometry.type === "Point" ? feature.geometry.coordinates as [number, number] : null);
  return point && Number.isFinite(point[0]) && Number.isFinite(point[1]) ? [point[1], point[0]] : null;
}

function geometryLines(feature: MapboxFeature): [number, number][][] {
  const coordinates = feature.geometry.coordinates as unknown;
  if (feature.geometry.type === "Polygon") return (coordinates as [number, number][][]).map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number]));
  if (feature.geometry.type === "MultiPolygon") {
    const polygons = coordinates as Array<Array<Array<[number, number]>>>;
    return polygons.flatMap((polygon) => polygon.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number])));
  }
  return [];
}

function label(feature: MapboxFeature) { return feature.place_name ?? feature.text ?? String(feature.properties?.name ?? feature.properties?.class ?? "Map feature"); }

export function AdvancedPanel({ vehicles, selectedDeviceId, lastMapClick, setOverlays, fitOverlays }: AdvancedPanelProps) {
  const selected = vehicles.find((vehicle) => vehicle.deviceId === selectedDeviceId)?.position;
  const selectedPoint = selected && Number.isFinite(selected.latitude) && Number.isFinite(selected.longitude) ? { lat: selected.latitude, lng: selected.longitude } : null;
  const point = lastMapClick ?? selectedPoint;
  const [contours, setContours] = useState("5,10,20");
  const [query, setQuery] = useState("");
  const [tileset, setTileset] = useState("");
  const [radius, setRadius] = useState("100");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<MapboxFeature[]>([]);

  const runIsochrone = async () => {
    if (!point) return setError("Select a vehicle or click the map first.");
    const values = contours.split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0 && value <= 60);
    if (!values.length) return setError("Enter contour minutes such as 5,10,20.");
    setBusy("isochrone"); setError(null);
    try {
      const data = await panelIsochrone(point, values);
      const lines = data.features.flatMap(geometryLines);
      setOverlays("advanced", { markers: [{ id: "advanced:origin", ...point, title: "Coverage origin", color: "#10b981", scale: 9 }], polylines: lines.map((line, index) => ({ id: `advanced:isochrone-${index}`, points: line, color: ["#10b981", "#f59e0b", "#8b5cf6"][index % 3], weight: 3, opacity: 0.75 })) });
      fitOverlays();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Isochrone request failed"); } finally { setBusy(null); }
  };

  const runSearch = async () => {
    if (query.trim().length < 2) return setError("Enter at least two characters to search.");
    setBusy("search"); setError(null);
    try { const data = await panelSearchForward(query.trim()); setResults(data.features ?? []); } catch (caught) { setError(caught instanceof Error ? caught.message : "Search failed"); } finally { setBusy(null); }
  };

  const runTilequery = async () => {
    if (!point) return setError("Click the map first or select a vehicle.");
    if (!tileset.trim()) return setError("Enter a Mapbox tileset ID.");
    setBusy("tilequery"); setError(null);
    try {
      const data = await panelTilequery({ tileset: tileset.trim(), latitude: point.lat, longitude: point.lng, radius: Math.max(0, Number(radius) || 0) });
      setResults(data.features ?? []);
      const markers = (data.features ?? []).map((feature, index) => { const location = featurePoint(feature); return location ? { id: `advanced:tile-${index}`, lat: location[0], lng: location[1], title: label(feature), color: "#38bdf8", scale: 7, snippet: [JSON.stringify(feature.properties ?? {})] } : null; }).filter((marker): marker is NonNullable<typeof marker> => marker !== null);
      setOverlays("advanced", { markers, polylines: [] });
      fitOverlays();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Tilequery failed"); } finally { setBusy(null); }
  };

  return <div className="grid gap-4 lg:grid-cols-3">
    <Card className="border-border bg-card/60"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><CircleDot className="h-4 w-4 text-primary" />Reachable area</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">Generate drive-time coverage contours from the selected vehicle or last map click.</p><div className="space-y-1"><Label className="text-xs">Minutes</Label><Input value={contours} onChange={(event) => setContours(event.target.value)} placeholder="5,10,20" className="bg-background/50" /></div><Button size="sm" onClick={() => void runIsochrone()} disabled={busy !== null}><Target className="mr-2 h-4 w-4" />{busy === "isochrone" ? "Calculating…" : "Generate isochrone"}</Button></CardContent></Card>
    <Card className="border-border bg-card/60"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Search className="h-4 w-4 text-primary" />Global search</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">Use Mapbox Searchbox forward search for richer place and point-of-interest discovery.</p><div className="flex gap-2"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Business, landmark, address…" className="bg-background/50" onKeyDown={(event) => { if (event.key === "Enter") void runSearch(); }} /><Button size="icon" onClick={() => void runSearch()} disabled={busy !== null}><Search className="h-4 w-4" /></Button></div>{results.length > 0 && <div className="space-y-1">{results.slice(0, 5).map((feature, index) => <button key={`${feature.id}-${index}`} type="button" className="block w-full rounded-lg border border-border/70 px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => { const location = featurePoint(feature); if (location) { setOverlays("advanced", { markers: [{ id: "advanced:search", lat: location[0], lng: location[1], title: label(feature), color: "#a78bfa", scale: 9 }], polylines: [] }); fitOverlays(); } }}><span className="font-medium">{label(feature)}</span><span className="ml-2 text-muted-foreground">{feature.properties?.feature_type ? String(feature.properties.feature_type) : "Place"}</span></button>)}</div>}</CardContent></Card>
    <Card className="border-border bg-card/60"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Database className="h-4 w-4 text-primary" />Spatial tile query</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">Inspect features in a Mapbox tileset around the selected point.</p><Input value={tileset} onChange={(event) => setTileset(event.target.value)} placeholder="mapbox.mapbox-streets-v8" className="bg-background/50" /><div className="flex gap-2"><Input value={radius} onChange={(event) => setRadius(event.target.value)} type="number" min="0" max="10000" placeholder="Radius (m)" className="bg-background/50" /><Button size="sm" onClick={() => void runTilequery()} disabled={busy !== null}>{busy === "tilequery" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Query"}</Button></div>{results.length > 0 && <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-300">{results.length} nearby features</Badge>}</CardContent></Card>
    {error && <p className="lg:col-span-3 text-sm text-destructive">{error}</p>}
  </div>;
}

export function featureCollectionFromResults(results: MapboxFeature[]): MapboxFeatureCollection { return { type: "FeatureCollection", features: results }; }
