import { useMemo } from "react";
import { PlatformMap } from "@/components/maps/platform-map";
import type { Position } from "@/types/database";
import type { MapMarkerSpec, MapPolylineSpec, ViewRequest } from "@/components/mapstudio/types";

interface Props { positions: Position[]; activeIndex: number; }

export function PlaybackMap({ positions, activeIndex }: Props) {
  const active = positions[activeIndex] ?? null;
  const markers = useMemo<MapMarkerSpec[]>(() => active ? [{ id: "playback:active", lat: active.latitude, lng: active.longitude, title: "Playback position", color: "#3B82F6", scale: 10, snippet: [new Date(active.recorded_at).toLocaleString()] }] : [], [active]);
  const polylines = useMemo<MapPolylineSpec[]>(() => positions.length > 1 ? [{ id: "playback:trail", points: positions.map((position) => [position.latitude, position.longitude]), color: "#3B82F6", weight: 4 }] : [], [positions]);
  const viewRequest = active ? ({ lat: active.latitude, lng: active.longitude, zoom: 14, nonce: activeIndex }) satisfies ViewRequest : null;
  return <PlatformMap markers={markers} polylines={polylines} viewRequest={viewRequest} heightClass="h-[480px] w-full lg:h-[520px]" />;
}
