import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getMapboxPublicToken, type MapboxError } from "@/lib/mapbox";
import { MapboxMapCanvas } from "@/components/mapstudio/mapbox-map-canvas";
import type { MapMarkerSpec, MapPolylineSpec, ViewRequest } from "@/components/mapstudio/types";

interface PlatformMapProps {
  markers?: MapMarkerSpec[];
  polylines?: MapPolylineSpec[];
  heightClass?: string;
  selectedMarkerId?: string | null;
  onMarkerClick?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  viewRequest?: ViewRequest | null;
  fitNonce?: number;
  onViewChange?: (view: { lat: number; lng: number; zoom: number }) => void;
}

export function PlatformMap({ markers = [], polylines = [], heightClass, selectedMarkerId, onMarkerClick, onMapClick, viewRequest, fitNonce, onViewChange }: PlatformMapProps) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMapboxPublicToken().then(setToken).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Mapbox public token is unavailable"));
  }, []);

  if (error) return <Card className="flex min-h-[220px] items-center justify-center border-amber-500/25 bg-amber-500/5 p-6 text-center text-sm text-amber-300">{error}</Card>;
  if (!token) return <Card className={`flex ${heightClass ?? "min-h-[280px]"} items-center justify-center border-border bg-card/40`}><Loader2 className="h-5 w-5 animate-spin text-primary" /></Card>;

  return <MapboxMapCanvas token={token} markers={markers} polylines={polylines} selectedMarkerId={selectedMarkerId} onMarkerClick={onMarkerClick} onMapClick={onMapClick} viewRequest={viewRequest} fitNonce={fitNonce} onViewChange={onViewChange} heightClass={heightClass ?? "h-[420px] w-full md:h-[540px]"} />;
}
