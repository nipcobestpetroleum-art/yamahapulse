import type { LatestPosition } from "@/types/database";

export type TelemetryStatus = "MOVING" | "IDLING" | "STOPPED" | "OFFLINE" | "NO_DATA" | "UNKNOWN";

const OFFLINE_AFTER_MINUTES = 15;
const MOVING_SPEED_KMH = 5;
const STOPPED_SPEED_KMH = 2;

export function getTelemetryStatus(position: Pick<LatestPosition, "speed" | "ignition" | "movement" | "recorded_at"> & { updated_at?: string } | null | undefined, now = Date.now()): TelemetryStatus {
  if (!position) return "NO_DATA";
  // GPS time is authoritative for freshness. `updated_at` only tells us when the
  // database row changed and must not make buffered telemetry look live.
  const timestamp = new Date(position.recorded_at).getTime();
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
  NO_DATA: "No data",
  UNKNOWN: "Unknown",
};

export const TELEMETRY_STATUS_STYLES: Record<TelemetryStatus, string> = {
  MOVING: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  IDLING: "border-sky-500/25 bg-sky-500/10 text-sky-400",
  STOPPED: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  OFFLINE: "border-slate-500/25 bg-slate-500/10 text-slate-400",
  NO_DATA: "border-rose-500/25 bg-rose-500/10 text-rose-300",
  UNKNOWN: "border-violet-500/25 bg-violet-500/10 text-violet-400",
};

/** Ball marker colors: green while the tracker reported within 24h, grey once stale beyond 24h. */
export const TRACKER_BALL_LIVE_COLOR = "#22c55e";
export const TRACKER_BALL_STALE_COLOR = "#94a3b8";
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function getTrackerBallColor(
  position: Pick<LatestPosition, "recorded_at"> | null | undefined,
  now = Date.now(),
): string {
  if (!position) return TRACKER_BALL_STALE_COLOR;
  const timestamp = new Date(position.recorded_at).getTime();
  if (!Number.isFinite(timestamp)) return TRACKER_BALL_STALE_COLOR;
  return now - timestamp > STALE_AFTER_MS ? TRACKER_BALL_STALE_COLOR : TRACKER_BALL_LIVE_COLOR;
}
