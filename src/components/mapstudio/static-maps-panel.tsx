import { useState } from "react";
import { Download, Image as ImageIcon, Layers3, Loader2, View } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { StudioVehicle } from "@/components/mapstudio/types";
import {
  gmapsInvoke,
  latToTileY,
  lngToTileX,
  type ImageResponse,
} from "@/lib/google-maps";

interface StaticMapsPanelProps {
  mapView: { lat: number; lng: number; zoom: number } | null;
  lastMapClick: { lat: number; lng: number } | null;
  vehicles: StudioVehicle[];
}

type MapTypeName = "roadmap" | "satellite" | "terrain";

export function StaticMapsPanel({ mapView, lastMapClick, vehicles }: StaticMapsPanelProps) {
  const center = lastMapClick ?? (mapView ? { lat: mapView.lat, lng: mapView.lng } : null);
  const zoom = Math.min(Math.max(mapView?.zoom ?? 12, 0), 21);

  const [staticMapType, setStaticMapType] = useState<MapTypeName>("roadmap");
  const [staticUrl, setStaticUrl] = useState<string | null>(null);
  const [staticBusy, setStaticBusy] = useState(false);
  const [staticError, setStaticError] = useState<string | null>(null);

  const [heading, setHeading] = useState(45);
  const [fov, setFov] = useState(90);
  const [streetUrl, setStreetUrl] = useState<string | null>(null);
  const [streetBusy, setStreetBusy] = useState(false);
  const [streetError, setStreetError] = useState<string | null>(null);

  const [tileType, setTileType] = useState<"roadmap" | "satellite" | "terrain" | "streetview">("roadmap");
  const [tileZoom, setTileZoom] = useState(14);
  const [tileUrls, setTileUrls] = useState<string[][] | null>(null);
  const [tileCoord, setTileCoord] = useState<{ x: number; y: number } | null>(null);
  const [tileBusy, setTileBusy] = useState(false);
  const [tileError, setTileError] = useState<string | null>(null);

  const fleetMarkers = vehicles
    .filter(
      (vehicle) =>
        vehicle.position &&
        Number.isFinite(vehicle.position.latitude) &&
        Number.isFinite(vehicle.position.longitude) &&
        !(vehicle.position.latitude === 0 && vehicle.position.longitude === 0),
    )
    .slice(0, 10)
    .map((vehicle, index) => ({
      latitude: vehicle.position!.latitude,
      longitude: vehicle.position!.longitude,
      color: "0x6366f1",
      label: String.fromCharCode(65 + index),
    }));

  const generateStatic = async () => {
    if (!center) return;
    setStaticBusy(true);
    setStaticError(null);
    try {
      const data = await gmapsInvoke<ImageResponse>("static-map", {
        center: { latitude: center.lat, longitude: center.lng },
        zoom,
        width: 620,
        height: 380,
        mapType: staticMapType,
        markers: fleetMarkers,
      });
      setStaticUrl(data.dataUrl);
    } catch (caught) {
      setStaticError(caught instanceof Error ? caught.message : "Static map failed");
    } finally {
      setStaticBusy(false);
    }
  };

  const generateStreet = async () => {
    if (!center) return;
    setStreetBusy(true);
    setStreetError(null);
    try {
      const data = await gmapsInvoke<ImageResponse>("streetview", {
        location: { latitude: center.lat, longitude: center.lng },
        width: 620,
        height: 340,
        heading,
        fov,
      });
      setStreetUrl(data.dataUrl);
    } catch (caught) {
      setStreetError(caught instanceof Error ? caught.message : "Street View failed");
    } finally {
      setStreetBusy(false);
    }
  };

  const generateTiles = async () => {
    if (!center) return;
    setTileBusy(true);
    setTileError(null);
    const x = lngToTileX(center.lng, tileZoom);
    const y = latToTileY(center.lat, tileZoom);
    setTileCoord({ x, y });
    try {
      const grid: string[][] = [];
      for (let dx = 0; dx < 2; dx += 1) {
        const row: string[] = [];
        for (let dy = 0; dy < 2; dy += 1) {
          const data = await gmapsInvoke<ImageResponse>("tile", {
            mapType: tileType,
            zoom: tileZoom,
            x: x + dx,
            y: y + dy,
          });
          row.push(data.dataUrl);
        }
        grid.push(row);
      }
      setTileUrls(grid);
    } catch (caught) {
      setTileError(caught instanceof Error ? caught.message : "Map tiles failed");
    } finally {
      setTileBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card/60">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ImageIcon className="h-4 w-4 text-primary" /> Static map
            <span className="text-[10px] font-normal text-muted-foreground">Maps Static API</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={staticMapType} onValueChange={(value) => setStaticMapType(value as MapTypeName)}>
              <SelectTrigger className="h-8 w-[130px] bg-card/60 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="roadmap">Roadmap</SelectItem>
                <SelectItem value="satellite">Satellite</SelectItem>
                <SelectItem value="terrain">Terrain</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => void generateStatic()} disabled={staticBusy || !center}>
              {staticBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Generate
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-xs text-muted-foreground">
            Renders the current view ({center ? `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)} · z${zoom}` : "pan the map first"}) with up to 10 fleet markers (A–J). Perfect for reports and email digests.
          </p>
          {staticError && <p className="text-sm text-destructive">{staticError}</p>}
          {staticUrl && (
            <div className="space-y-2">
              <img src={staticUrl} alt="Static map" className="w-full rounded-xl border border-border" />
              <a href={staticUrl} download="yamahapulse-static-map.png">
                <Button size="sm" variant="outline">
                  <Download className="mr-2 h-4 w-4" /> Download PNG
                </Button>
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <View className="h-4 w-4 text-sky-400" /> Street View
              <span className="text-[10px] font-normal text-muted-foreground">Static Street View</span>
            </CardTitle>
            <Button size="sm" onClick={() => void generateStreet()} disabled={streetBusy || !center}>
              {streetBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Generate
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Heading</Label>
                  <span className="text-xs font-medium">{heading}°</span>
                </div>
                <Slider value={[heading]} min={0} max={360} step={5} onValueChange={([value]) => setHeading(value)} />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Field of view</Label>
                  <span className="text-xs font-medium">{fov}°</span>
                </div>
                <Slider value={[fov]} min={30} max={120} step={5} onValueChange={([value]) => setFov(value)} />
              </div>
            </div>
            {streetError && <p className="text-sm text-destructive">{streetError}</p>}
            {streetUrl && <img src={streetUrl} alt="Street view" className="w-full rounded-xl border border-border" />}
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Layers3 className="h-4 w-4 text-emerald-400" /> Map tiles
              <span className="text-[10px] font-normal text-muted-foreground">Map Tiles API</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={tileType} onValueChange={(value) => setTileType(value as typeof tileType)}>
                <SelectTrigger className="h-8 w-[130px] bg-card/60 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="roadmap">Roadmap</SelectItem>
                  <SelectItem value="satellite">Satellite</SelectItem>
                  <SelectItem value="terrain">Terrain</SelectItem>
                  <SelectItem value="streetview">Street View</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => void generateTiles()} disabled={tileBusy || !center}>
                {tileBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Fetch tiles
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Zoom (z{tileZoom})</Label>
                {tileCoord && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {tileZoom}/{tileCoord.x}/{tileCoord.y}
                  </Badge>
                )}
              </div>
              <Slider value={[tileZoom]} min={3} max={19} step={1} onValueChange={([value]) => setTileZoom(value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Fetches a session token and a 2×2 grid of raw map tiles around the current view — the building blocks for fully custom map renderers.
            </p>
            {tileError && <p className="text-sm text-destructive">{tileError}</p>}
            {tileUrls && (
              <div className="grid w-fit grid-cols-2 overflow-hidden rounded-xl border border-border">
                {tileUrls.map((row, rowIndex) =>
                  row.map((url, colIndex) => <img key={`${rowIndex}-${colIndex}`} src={url} alt={`Tile ${rowIndex}-${colIndex}`} className="block h-[128px] w-[128px]" />),
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
