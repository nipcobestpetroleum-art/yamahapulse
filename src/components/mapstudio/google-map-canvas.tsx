import { useEffect, useRef, useState } from "react";
import { Crosshair, Globe2, Loader2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  gmapsInvoke,
  loadGoogleMaps,
  type GeolocateResponse,
} from "@/lib/google-maps";
import type { MapMarkerSpec, MapPolylineSpec, ViewRequest } from "@/components/mapstudio/types";

interface GoogleMapCanvasProps {
  apiKey: string | null;
  markers: MapMarkerSpec[];
  polylines: MapPolylineSpec[];
  selectedMarkerId?: string | null;
  onMarkerClick?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  viewRequest?: ViewRequest | null;
  fitNonce?: number;
  onViewChange?: (view: { lat: number; lng: number; zoom: number }) => void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markerContent(marker: MapMarkerSpec): string {
  const lines = (marker.snippet ?? [])
    .filter(Boolean)
    .map((line) => `<div style="color:#52525b;font-size:11px;margin-top:2px">${escapeHtml(line)}</div>`)
    .join("");
  return `<div style="min-width:180px;font-family:inherit"><div style="font-weight:600;font-size:13px;color:#27272a">${escapeHtml(marker.title)}</div>${lines}</div>`;
}

export function GoogleMapCanvas({
  apiKey,
  markers,
  polylines,
  selectedMarkerId,
  onMarkerClick,
  onMapClick,
  viewRequest,
  fitNonce,
  onViewChange,
}: GoogleMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const renderedMarkersRef = useRef<google.maps.Marker[]>([]);
  const renderedLinesRef = useRef<google.maps.Polyline[]>([]);

  const onMarkerClickRef = useRef(onMarkerClick);
  const onMapClickRef = useRef(onMapClick);
  const onViewChangeRef = useRef(onViewChange);
  onMarkerClickRef.current = onMarkerClick;
  onMapClickRef.current = onMapClick;
  onViewChangeRef.current = onViewChange;

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(apiKey ? "loading" : "idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [ipLocating, setIpLocating] = useState(false);

  // Create the map once a key is available.
  useEffect(() => {
    if (!apiKey || !containerRef.current || mapRef.current) return;
    let cancelled = false;
    setStatus("loading");

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const map = new google.maps.Map(containerRef.current, {
          center: { lat: -1.2864, lng: 36.8172 },
          zoom: 12,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
          clickableIcons: false,
        });
        mapRef.current = map;
        infoWindowRef.current = new google.maps.InfoWindow();

        map.addListener("click", (event: google.maps.MapMouseEvent) => {
          if (event.latLng) onMapClickRef.current?.(event.latLng.lat(), event.latLng.lng());
        });

        const emitView = () => {
          const center = map.getCenter();
          if (!center) return;
          onViewChangeRef.current?.({ lat: center.lat(), lng: center.lng(), zoom: map.getZoom() ?? 12 });
        };
        map.addListener("idle", emitView);

        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setErrorText(error instanceof Error ? error.message : "Failed to load Google Maps");
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  // Render markers (diff = clear + recreate; fleet scale is small).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    renderedMarkersRef.current.forEach((marker) => marker.setMap(null));
    renderedMarkersRef.current = [];

    for (const spec of markers) {
      const selected = spec.id === selectedMarkerId;
      const color = spec.color ?? "#6366f1";
      const marker = new google.maps.Marker({
        position: { lat: spec.lat, lng: spec.lng },
        map,
        title: spec.title,
        zIndex: selected ? 999 : 1,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: selected ? (spec.scale ?? 8) + 3 : spec.scale ?? 8,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2.5,
        },
      });
      marker.addListener("click", () => {
        infoWindowRef.current?.setContent(markerContent(spec));
        infoWindowRef.current?.open({ map, anchor: marker });
        onMarkerClickRef.current?.(spec.id);
      });
      renderedMarkersRef.current.push(marker);
    }
  }, [markers, selectedMarkerId, status]);

  // Render polylines.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    renderedLinesRef.current.forEach((line) => line.setMap(null));
    renderedLinesRef.current = [];

    for (const spec of polylines) {
      const path = spec.points.map(([lat, lng]) => ({ lat, lng }));
      if (path.length < 2) continue;
      const color = spec.color ?? "#6366f1";
      const line = new google.maps.Polyline({
        path,
        map,
        strokeColor: color,
        strokeOpacity: spec.dashed ? 0 : (spec.opacity ?? 0.9),
        strokeWeight: spec.weight ?? 4,
      });
      if (spec.dashed) {
        line.setOptions({
          strokeOpacity: 0,
          icons: [
            {
              icon: { path: google.maps.SymbolPath.CIRCLE, scale: 2.5, fillColor: color, fillOpacity: 1 },
              offset: "0",
              repeat: "12px",
            },
          ],
        });
      }
      renderedLinesRef.current.push(line);
    }
  }, [polylines, status]);

  // Fly to a requested view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewRequest) return;
    map.panTo({ lat: viewRequest.lat, lng: viewRequest.lng });
    if (viewRequest.zoom) map.setZoom(viewRequest.zoom);
  }, [viewRequest?.nonce]);

  // Fit all overlays.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitNonce) return;
    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;
    for (const marker of markers) {
      bounds.extend({ lat: marker.lat, lng: marker.lng });
      hasPoints = true;
    }
    for (const line of polylines) {
      for (const [lat, lng] of line.points) {
        bounds.extend({ lat, lng });
        hasPoints = true;
      }
    }
    if (hasPoints) map.fitBounds(bounds, 60);
  }, [fitNonce]);

  const locateWithBrowser = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.panTo({ lat: position.coords.latitude, lng: position.coords.longitude });
        mapRef.current?.setZoom(15);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const locateWithGoogle = async () => {
    if (ipLocating) return;
    setIpLocating(true);
    setLocationError(null);
    try {
      const data = await gmapsInvoke<GeolocateResponse>("geolocate");
      if (data.location && mapRef.current) {
        mapRef.current.panTo({ lat: data.location.lat, lng: data.location.lng });
        mapRef.current.setZoom(13);
      }
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "Google Geolocation is unavailable");
    } finally {
      setIpLocating(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card/40">
      <div ref={containerRef} className="h-[420px] w-full md:h-[540px]" />

      {status !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
          {status === "loading" ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading Google Maps…</p>
            </>
          ) : apiKey === null ? (
            <p className="max-w-sm px-4 text-center text-sm text-muted-foreground">
              Google Maps API key is not configured yet. Add the <span className="font-mono text-xs">GOOGLE_MAPS_API_KEY</span> secret to enable the interactive map.
            </p>
          ) : (
            <p className="max-w-sm px-4 text-center text-sm text-destructive">{errorText ?? "Google Maps failed to load."}</p>
          )}
        </div>
      )}

      {status === "ready" && (
        <>
          {locationError && (
            <div className="absolute bottom-3 left-3 right-3 z-10 rounded-lg border border-amber-500/30 bg-background/90 px-3 py-2 text-xs text-amber-300 shadow-lg backdrop-blur">
              {locationError}. Browser GPS remains available through the GPS button.
            </div>
          )}
          <div className="pointer-events-none absolute left-3 top-3">
            <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-background/75 px-3 py-2 text-xs font-medium text-foreground backdrop-blur">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              Google Maps
              <span className="text-muted-foreground">
                · {markers.length} marker{markers.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="pointer-events-none absolute right-3 top-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="pointer-events-auto bg-background/75 backdrop-blur"
              onClick={locateWithBrowser}
              title="Locate me (browser GPS)"
            >
              <Crosshair className="mr-2 h-4 w-4" />
              GPS
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="pointer-events-auto bg-background/75 backdrop-blur"
              onClick={() => void locateWithGoogle()}
              title="Locate via Google Geolocation API (IP-based)"
              disabled={ipLocating}
            >
              {ipLocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe2 className="mr-2 h-4 w-4" />}
              IP
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="pointer-events-auto bg-background/75 backdrop-blur"
              onClick={() => {
                mapRef.current?.getDiv().scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              title="Focus map"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
