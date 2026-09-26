import { useEffect, useRef, useState } from "react";
import { Check, Crosshair, Eraser, Loader2, Maximize2, Mountain, Pencil, Satellite, TrafficCone } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MapMarkerSpec, MapPolylineSpec, MapHeatPoint, ViewRequest } from "@/components/mapstudio/types";
import mapboxgl, { type Map as MapboxMap, type Marker, type Popup } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface MapboxMapCanvasProps {
  token: string | null;
  markers: MapMarkerSpec[];
  polylines: MapPolylineSpec[];
  heatPoints?: MapHeatPoint[];
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

export function MapboxMapCanvas({ token, markers, polylines, heatPoints = [], selectedMarkerId, onMarkerClick, onMapClick, viewRequest, fitNonce, onViewChange, heightClass }: MapboxMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<Popup | null>(null);
  const autoFittedRef = useRef(false);
  const callbacksRef = useRef({ onMarkerClick, onMapClick, onViewChange });
  callbacksRef.current = { onMarkerClick, onMapClick, onViewChange };
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(token ? "loading" : "idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [aerial, setAerial] = useState(false);
  const [terrain3d, setTerrain3d] = useState(false);
  const [traffic] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const drawingRef = useRef(false);
  drawingRef.current = drawing;
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
      map.on("click", (event) => {
        if (drawingRef.current) setDraft((current) => [...current, [event.lngLat.lat, event.lngLat.lng]]);
        callbacksRef.current.onMapClick?.(event.lngLat.lat, event.lngLat.lng);
      });
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
    const visibleMarkers = markers.length > 40 ? [] : markers;
    for (const spec of visibleMarkers) {
      const element = document.createElement("button");
      element.type = "button";
      element.title = spec.title;
      const isBike = spec.icon === "bike";
      const selected = spec.id === selectedMarkerId;
      element.style.display = "flex";
      element.style.alignItems = "center";
      element.style.justifyContent = "center";
      if (isBike) {
        // 3D tracker ball: green while reporting within 24h, grey when stale beyond 24h.
        const size = selected ? 26 : 20;
        const base = spec.color ?? "#22c55e";
        element.style.width = `${size}px`;
        element.style.height = `${size}px`;
        element.style.borderRadius = "9999px";
        element.style.padding = "0";
        element.style.border = "1.5px solid rgba(255,255,255,.92)";
        element.style.cursor = "pointer";
        element.style.background =
          "radial-gradient(circle at 30% 26%, rgba(255,255,255,.95) 0%, rgba(255,255,255,.45) 15%, rgba(255,255,255,0) 38%)," +
          `radial-gradient(circle at 68% 74%, ${base} 0%, color-mix(in srgb, ${base} 74%, #000) 58%, color-mix(in srgb, ${base} 48%, #000) 100%)`;
        element.style.boxShadow = selected
          ? "0 0 0 5px rgba(255,255,255,.35), 0 5px 10px rgba(2,6,23,.5)"
          : "0 4px 9px rgba(2,6,23,.5)";
      } else {
        element.style.width = `${(spec.scale ?? 8) * 2}px`;
        element.style.height = `${(spec.scale ?? 8) * 2}px`;
        element.style.borderRadius = "9999px";
        element.style.background = spec.color ?? "#6366f1";
        element.style.border = selected ? "3px solid white" : "2px solid white";
        element.style.boxShadow = "0 2px 8px rgba(15,23,42,.35)";
        element.style.overflow = "hidden";
      }
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
    if (!map || status !== "ready" || !map.isStyleLoaded()) return;
    const sourceId = "mapstudio-clusters";
    const clusterLayer = "mapstudio-clusters-layer";
    const countLayer = "mapstudio-cluster-count";
    const pointLayer = "mapstudio-cluster-point";
    const data = { type: "FeatureCollection" as const, features: markers.map((marker) => ({ type: "Feature" as const, properties: { title: marker.title }, geometry: { type: "Point" as const, coordinates: [marker.lng, marker.lat] } })) };
    try {
      if (markers.length > 40) {
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, { type: "geojson", data, cluster: true, clusterRadius: 48, clusterMaxZoom: 14 });
          map.addLayer({ id: clusterLayer, type: "circle", source: sourceId, filter: ["has", "point_count"], paint: { "circle-color": "#6366f1", "circle-radius": ["step", ["get", "point_count"], 18, 25, 23, 100, 29], "circle-stroke-width": 2, "circle-stroke-color": "#fff" } });
          map.addLayer({ id: countLayer, type: "symbol", source: sourceId, filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 }, paint: { "text-color": "#fff" } });
          map.addLayer({ id: pointLayer, type: "circle", source: sourceId, filter: ["!", ["has", "point_count"]], paint: { "circle-color": "#22c55e", "circle-radius": 7, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
        } else (map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(data);
      } else {
        if (map.getLayer(countLayer)) map.removeLayer(countLayer);
        if (map.getLayer(clusterLayer)) map.removeLayer(clusterLayer);
        if (map.getLayer(pointLayer)) map.removeLayer(pointLayer);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }
    } catch {
      return;
    }
  }, [markers, status, styleRevision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready" || !map.isStyleLoaded()) return;
    try {
      if (!map.getSource("mapbox-dem")) map.addSource("mapbox-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
      if (terrain3d) map.setTerrain({ source: "mapbox-dem", exaggeration: 1.25 });
      else map.setTerrain(null);
    } catch {
      return;
    }
    const sourceId = "mapstudio-lines";
    const layerId = "mapstudio-lines-layer";
    const allPolylines = draft.length > 1 ? [...polylines, { id: "mapstudio:drawing", points: draft, color: "#f97316", weight: 4, opacity: 0.95, dashed: true }] : polylines;
    const data = { type: "FeatureCollection" as const, features: allPolylines.filter((line) => line.points.length > 1).map((line) => ({ type: "Feature" as const, properties: { color: line.color ?? "#6366f1", weight: line.weight ?? 4, opacity: line.opacity ?? 0.9, dashed: Boolean(line.dashed) }, geometry: { type: "LineString" as const, coordinates: line.points.map(([lat, lng]) => [lng, lat]) } })) };
    if (map.getSource(sourceId)) (map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(data);
    else {
      map.addSource(sourceId, { type: "geojson", data });
      map.addLayer({ id: layerId, type: "line", source: sourceId, paint: { "line-color": ["get", "color"], "line-width": ["get", "weight"], "line-opacity": ["get", "opacity"], "line-dasharray": ["case", ["get", "dashed"], [2, 2], [1, 0]] } });
    }
    return () => {
      if (!map.isStyleLoaded()) return;
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // The style may have been replaced between cleanup and teardown.
      }
    };
  }, [draft, polylines, status, terrain3d, styleRevision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready" || !map.isStyleLoaded()) return;
    const sourceId = "mapstudio-heat";
    const layerId = "mapstudio-heat-layer";
    const data = { type: "FeatureCollection" as const, features: heatPoints.map((point) => ({ type: "Feature" as const, properties: { weight: point.weight ?? 1 }, geometry: { type: "Point" as const, coordinates: [point.lng, point.lat] } })) };
    if (map.getSource(sourceId)) (map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(data);
    else {
      map.addSource(sourceId, { type: "geojson", data });
      map.addLayer({ id: layerId, type: "heatmap", source: sourceId, paint: { "heatmap-weight": ["get", "weight"], "heatmap-intensity": 1.2, "heatmap-radius": 28, "heatmap-opacity": 0.78, "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(34,197,94,0)", 0.35, "#facc15", 0.7, "#f97316", 1, "#ef4444"] } });
    }
  }, [heatPoints, status, styleRevision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready" || !map.isStyleLoaded()) return;
    const sourceId = "mapstudio-traffic";
    const layerId = "mapstudio-traffic-layer";
    try {
      if (traffic && !map.getSource(sourceId)) {
        map.addSource(sourceId, { type: "vector", url: "mapbox://mapbox.mapbox-traffic-v1" });
        map.addLayer({ id: layerId, type: "line", source: sourceId, "source-layer": "traffic", minzoom: 8, paint: { "line-color": ["match", ["get", "congestion"], "low", "#22c55e", "moderate", "#facc15", "heavy", "#f97316", "severe", "#ef4444", "#94a3b8"], "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.5, 14, 4], "line-opacity": 0.8 } });
      } else if (!traffic && map.getLayer(layerId)) map.removeLayer(layerId);
      if (!traffic && map.getSource(sourceId)) map.removeSource(sourceId);
    } catch {
      return;
    }
  }, [traffic, status, styleRevision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewRequest) return;
    map.flyTo({ center: [viewRequest.lng, viewRequest.lat], zoom: viewRequest.zoom ?? map.getZoom(), essential: true });
  }, [viewRequest?.nonce]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready" || autoFittedRef.current) return;
    const points = [...markers.map((marker) => [marker.lat, marker.lng] as [number, number]), ...polylines.flatMap((line) => line.points)];
    const valid = points.filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (valid.length === 0) return;
    const lngs = valid.map(([, lng]) => lng); const lats = valid.map(([lat]) => lat);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 70, maxZoom: 15, essential: true });
    autoFittedRef.current = true;
  }, [markers, polylines, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitNonce) return;
    const points = [...markers.map((marker) => [marker.lat, marker.lng] as [number, number]), ...polylines.flatMap((line) => line.points)];
    const valid = points.filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (valid.length === 0) return;
    const lngs = valid.map(([, lng]) => lng); const lats = valid.map(([lat]) => lat);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 70, maxZoom: 15, essential: true });
  }, [fitNonce, markers, polylines]);

  const locate = () => navigator.geolocation?.getCurrentPosition((position) => mapRef.current?.flyTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 15, essential: true }), undefined, { enableHighAccuracy: true, timeout: 8000 });

  return <div className="relative overflow-hidden rounded-xl border border-border bg-card/40">
    <div ref={containerRef} className={heightClass ?? "h-[420px] w-full md:h-[540px]"} />
    {status !== "ready" && <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">{status === "loading" ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading Mapbox…</div> : <p className="max-w-sm px-4 text-center text-sm text-destructive">{errorText ?? "Mapbox public token is not configured."}</p>}</div>}
    {status === "ready" && <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2"><div className="pointer-events-auto rounded-lg border border-border bg-background/80 px-3 py-2 text-xs font-medium backdrop-blur">Mapbox · {markers.length} marker{markers.length === 1 ? "" : "s"}</div><Button variant={aerial ? "default" : "outline"} size="sm" className="pointer-events-auto bg-background/80 backdrop-blur" onClick={() => { const map = mapRef.current; if (!map) return; setAerial((current) => { const next = !current; map.setStyle(next ? "mapbox://styles/mapbox/satellite-streets-v12" : "mapbox://styles/mapbox/standard"); return next; }); }}><Satellite className="mr-2 h-4 w-4" />{aerial ? "Map" : "Aerial"}</Button><Button variant={terrain3d ? "default" : "outline"} size="sm" className="pointer-events-auto bg-background/80 backdrop-blur" onClick={() => { const next = !terrain3d; setTerrain3d(next); mapRef.current?.easeTo({ pitch: next ? 55 : 0, bearing: next ? -18 : 0, duration: 700 }); }}><Mountain className="mr-2 h-4 w-4" />3D</Button><Button variant="outline" size="sm" className="pointer-events-auto bg-background/80 backdrop-blur" onClick={locate}><Crosshair className="mr-2 h-4 w-4" />GPS</Button><Button variant="outline" size="sm" className="pointer-events-auto bg-background/80 backdrop-blur" onClick={() => mapRef.current?.getContainer().scrollIntoView({ behavior: "smooth", block: "center" })}><Maximize2 className="h-4 w-4" /></Button></div>}
  </div>;
}
