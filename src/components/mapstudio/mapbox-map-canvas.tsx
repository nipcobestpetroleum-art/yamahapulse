import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, Maximize2, Mountain, Satellite } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MapMarkerSpec, MapPolylineSpec, ViewRequest } from "@/components/mapstudio/types";
import mapboxgl, { type Map as MapboxMap, type Marker, type Popup } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface MapboxMapCanvasProps {
  token: string | null;
  markers: MapMarkerSpec[];
  polylines: MapPolylineSpec[];
  selectedMarkerId?: string | null;
  onMarkerClick?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  viewRequest?: ViewRequest | null;
  fitNonce?: number;
  onViewChange?: (view: { lat: number; lng: number; zoom: number }) => void;
  heightClass?: string;
}

function popupHtml(marker: MapMarkerSpec): string {
  const lines = (marker.snippet ?? []).filter(Boolean).map((line) => `<div style="color:#52525b;font-size:11px;margin-top:2px">${line.replace(/[&<>\"]/g, "")}</div>`).join("");
  return `<div style="min-width:180px"><strong>${marker.title.replace(/[&<>\"]/g, "")}</strong>${lines}</div>`;
}

export function MapboxMapCanvas({ token, markers, polylines, selectedMarkerId, onMarkerClick, onMapClick, viewRequest, fitNonce, onViewChange, heightClass }: MapboxMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<Popup | null>(null);
  const callbacksRef = useRef({ onMarkerClick, onMapClick, onViewChange });
  callbacksRef.current = { onMarkerClick, onMapClick, onViewChange };
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(token ? "loading" : "idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [aerial, setAerial] = useState(false);
  const [terrain3d, setTerrain3d] = useState(false);
  const [styleRevision, setStyleRevision] = useState(0);

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;
    let cancelled = false;
    setStatus("loading");
    Promise.resolve().then(() => {
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = token;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/standard",
        center: [36.8172, -1.2864],
        zoom: 12,
        projection: "mercator",
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");
      map.addControl(new mapboxgl.FullscreenControl(), "top-right");
      map.on("load", () => {
        if (!map.getSource("mapbox-dem")) map.addSource("mapbox-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
        setStatus("ready");
      });
      map.on("style.load", () => setStyleRevision((revision) => revision + 1));
      map.on("click", (event) => callbacksRef.current.onMapClick?.(event.lngLat.lat, event.lngLat.lng));
      map.on("moveend", () => callbacksRef.current.onViewChange?.({ lat: map.getCenter().lat, lng: map.getCenter().lng, zoom: map.getZoom() }));
      mapRef.current = map;
    }).catch((error: unknown) => {
      if (cancelled) return;
      setStatus("error");
      setErrorText(error instanceof Error ? error.message : "Failed to load Mapbox");
    });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    for (const spec of markers) {
      const element = document.createElement("button");
      element.type = "button";
      element.title = spec.title;
      element.style.width = `${(spec.scale ?? 8) * 2}px`;
      element.style.height = `${(spec.scale ?? 8) * 2}px`;
      element.style.borderRadius = "9999px";
      element.style.background = spec.color ?? "#6366f1";
      element.style.border = spec.id === selectedMarkerId ? "3px solid white" : "2px solid white";
      element.style.boxShadow = "0 2px 8px rgba(15,23,42,.35)";
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ offset: 12 }).setLngLat([spec.lng, spec.lat]).setHTML(popupHtml(spec)).addTo(map);
        callbacksRef.current.onMarkerClick?.(spec.id);
      });
      const marker = new mapboxgl.Marker({ element }).setLngLat([spec.lng, spec.lat]).addTo(map);
      markersRef.current.push(marker);
    }
  }, [markers, selectedMarkerId, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    if (!map.getSource("mapbox-dem")) map.addSource("mapbox-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
    if (terrain3d) map.setTerrain({ source: "mapbox-dem", exaggeration: 1.25 });
    else if (!terrain3d) map.setTerrain(null);
    const sourceId = "mapstudio-lines";
    const layerId = "mapstudio-lines-layer";
    const data = { type: "FeatureCollection" as const, features: polylines.filter((line) => line.points.length > 1).map((line) => ({ type: "Feature" as const, properties: { color: line.color ?? "#6366f1", weight: line.weight ?? 4, opacity: line.opacity ?? 0.9, dashed: Boolean(line.dashed) }, geometry: { type: "LineString" as const, coordinates: line.points.map(([lat, lng]) => [lng, lat]) } })) };
    if (map.getSource(sourceId)) (map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(data);
    else {
      map.addSource(sourceId, { type: "geojson", data });
      map.addLayer({ id: layerId, type: "line", source: sourceId, paint: { "line-color": ["get", "color"], "line-width": ["get", "weight"], "line-opacity": ["get", "opacity"], "line-dasharray": ["case", ["get", "dashed"], [2, 2], [1, 0]] } });
    }
    return () => { if (map.getLayer(layerId)) map.removeLayer(layerId); if (map.getSource(sourceId)) map.removeSource(sourceId); };
  }, [polylines, status, terrain3d, styleRevision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewRequest) return;
    map.flyTo({ center: [viewRequest.lng, viewRequest.lat], zoom: viewRequest.zoom ?? map.getZoom(), essential: true });
  }, [viewRequest?.nonce]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitNonce) return;
    const valid = markers.filter((marker) => Number.isFinite(marker.lat) && Number.isFinite(marker.lng));
    if (valid.length === 0) return;
    const lngs = valid.map((marker) => marker.lng); const lats = valid.map((marker) => marker.lat);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 70, maxZoom: 15, essential: true });
  }, [fitNonce]);

  const locate = () => navigator.geolocation?.getCurrentPosition((position) => mapRef.current?.flyTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 15, essential: true }), undefined, { enableHighAccuracy: true, timeout: 8000 });

  return <div className="relative overflow-hidden rounded-xl border border-border bg-card/40">
    <div ref={containerRef} className={heightClass ?? "h-[420px] w-full md:h-[540px]"} />
    {status !== "ready" && <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">{status === "loading" ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading Mapbox…</div> : <p className="max-w-sm px-4 text-center text-sm text-destructive">{errorText ?? "Mapbox public token is not configured."}</p>}</div>}
    {status === "ready" && <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2"><div className="pointer-events-auto rounded-lg border border-border bg-background/80 px-3 py-2 text-xs font-medium backdrop-blur">Mapbox · {markers.length} marker{markers.length === 1 ? "" : "s"}</div><Button variant={aerial ? "default" : "outline"} size="sm" className="pointer-events-auto bg-background/80 backdrop-blur" onClick={() => { const map = mapRef.current; if (!map) return; setAerial((current) => { const next = !current; map.setStyle(next ? "mapbox://styles/mapbox/satellite-streets-v12" : "mapbox://styles/mapbox/standard"); return next; }); }}><Satellite className="mr-2 h-4 w-4" />{aerial ? "Map" : "Aerial"}</Button><Button variant={terrain3d ? "default" : "outline"} size="sm" className="pointer-events-auto bg-background/80 backdrop-blur" onClick={() => { const next = !terrain3d; setTerrain3d(next); mapRef.current?.easeTo({ pitch: next ? 55 : 0, bearing: next ? -18 : 0, duration: 700 }); }}><Mountain className="mr-2 h-4 w-4" />3D</Button><Button variant="outline" size="sm" className="pointer-events-auto bg-background/80 backdrop-blur" onClick={locate}><Crosshair className="mr-2 h-4 w-4" />GPS</Button><Button variant="outline" size="sm" className="pointer-events-auto bg-background/80 backdrop-blur" onClick={() => mapRef.current?.getContainer().scrollIntoView({ behavior: "smooth", block: "center" })}><Maximize2 className="h-4 w-4" /></Button></div>}
  </div>;
}
