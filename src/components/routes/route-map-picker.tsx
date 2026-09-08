import { useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMapEvents } from "react-leaflet";
import L, { type LatLngExpression } from "leaflet";
import type { RouteWaypoint } from "@/types/database";

interface Props {
  waypoints: RouteWaypoint[];
  onChange: (waypoints: RouteWaypoint[]) => void;
}

const DEFAULT_CENTER: [number, number] = [6.5244, 3.3792];

function makePinIcon(label: string, color: string) {
  return L.divIcon({
    className: "route-pin",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.5);color:white;font-size:11px;font-weight:700;">${label}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function ClickHandler({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function RouteMapPicker({ waypoints, onChange }: Props) {
  const center = useMemo<LatLngExpression>(
    () => (waypoints.length > 0 ? [waypoints[0].lat, waypoints[0].lon] : DEFAULT_CENTER),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const line = useMemo<LatLngExpression[]>(
    () => waypoints.map((w) => [w.lat, w.lon]),
    [waypoints],
  );

  const handleAdd = (lat: number, lon: number) => {
    onChange([...waypoints, { lat, lon }]);
  };

  const handleRemoveLast = () => {
    onChange(waypoints.slice(0, -1));
  };

  const handleClear = () => {
    onChange([]);
  };

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-border">
        <MapContainer center={center} zoom={12} className="h-[300px] w-full" scrollWheelZoom>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <ClickHandler onClick={handleAdd} />
          {line.length >= 2 && (
            <Polyline positions={line} pathOptions={{ color: "#3B82F6", weight: 4 }} />
          )}
          {waypoints.map((w, i) => {
            const isStart = i === 0;
            const isEnd = i === waypoints.length - 1 && waypoints.length > 1;
            const label = isStart ? "A" : isEnd ? "B" : String(i + 1);
            const color = isStart ? "#10B981" : isEnd ? "#EF4444" : "#3B82F6";
            return (
              <Marker
                key={`${w.lat}-${w.lon}-${i}`}
                position={[w.lat, w.lon]}
                icon={makePinIcon(label, color)}
              />
            );
          })}
        </MapContainer>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Click the map to add waypoints in order (first = start, last = end).{" "}
          {waypoints.length} point{waypoints.length === 1 ? "" : "s"} added.
        </span>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={handleRemoveLast}
            disabled={waypoints.length === 0}
            className="font-medium text-foreground underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            Undo last
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={waypoints.length === 0}
            className="font-medium text-destructive underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
