/** Formats a number of minutes as a compact human duration, e.g. "2h 15m". */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Trip duration in minutes from start to end (null when still in progress). */
export function tripDurationMinutes(startIso: string, endIso: string | null): number | null {
  if (!endIso) return null;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return ms > 0 ? ms / 60_000 : null;
}
