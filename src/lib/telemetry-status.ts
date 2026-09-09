import type { LatestPosition } from "@/types/database";

export type TelemetryStatus = "MOVING" | "IDLING" | "STOPPED" | "OFFLINE" | "UNKNOWN";

const OFFLINE_AFTER_MINUTES = 15;
const MOVING_SPEED_KMH = 5;
const STOPPED_SPEED_KMH = 2;

export function getTelemetryStatus(position: Pick<LatestPosition, "speed" | "ignition" | "movement" | "recorded_at"> & { updated_at?: string } | null | undefined, now = Date.now()): TelemetryStatus {
  if (!position) return "OFFLINE";
  const timestamp = new Date(position.updated_at ?? position.recorded_at).getTime();
  if (!Number.isFinite(timestamp) || now - timestamp > OFFLINE_AFTER_MINUTES * 60_000) return "OFFLINE";

  const speed = typeof position.speed === "number" ? position.speed : null;
  if (speed !== null && speed >= MOVING_SPEED_KMH) return "MOVING";
  if (speed !== null && speed <= STOPPED_SPEED_KMH) {
    if (position.ignition === true) return "IDLING";
    if (position.ignition === false) return "STOPPED";
  }
  if (position.movement === true && speed !== null && speed > STOPPED_SPEED_KMH) return "MOVING";
  return "UNKNOWN";
}

export const TELEMETRY_STATUS_LABELS: Record<TelemetryStatus, string> = {
  MOVING: "Moving",
  IDLING: "Idling",
  STOPPED: "Stopped",
  OFFLINE: "Offline",
  UNKNOWN: "Unknown",
};

export const TELEMETRY_STATUS_STYLES: Record<TelemetryStatus, string> = {
  MOVING: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  IDLING: "border-sky-500/25 bg-sky-500/10 text-sky-400",
  STOPPED: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  OFFLINE: "border-slate-500/25 bg-slate-500/10 text-slate-400",
  UNKNOWN: "border-violet-500/25 bg-violet-500/10 text-violet-400",
};
