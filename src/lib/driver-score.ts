import type { DeviceEvent, Driver } from "@/types/database";

export const DRIVER_EVENT_TYPES = [
  "OVERSPEED",
  "HARSH_ACCEL",
  "HARSH_BRAKE",
  "HARSH_CORNER",
  "CRASH",
  "IDLE",
] as const;

/** Weighted penalty per event type — crashes and overspeeding hurt the most. */
export const DRIVER_EVENT_PENALTY: Record<string, number> = {
  OVERSPEED: 4,
  HARSH_ACCEL: 3,
  HARSH_BRAKE: 3,
  HARSH_CORNER: 3,
  CRASH: 25,
  IDLE: 1,
};

export interface DriverScore {
  driver: Driver;
  overspeedCount: number;
  harshAccelCount: number;
  harshBrakeCount: number;
  harshCornerCount: number;
  crashCount: number;
  idleCount: number;
  totalEvents: number;
  score: number;
}

/**
 * Scores drivers from telemetry events attributed to their currently-assigned
 * vehicle. 100 is a perfect driver; each infraction subtracts a weighted penalty.
 */
export function computeDriverScores(drivers: Driver[], events: DeviceEvent[]): DriverScore[] {
  return drivers
    .map((d) => {
      const vehicleEvents = events.filter((e) => e.vehicle_id === d.vehicle_id);
      const count = (type: string) => vehicleEvents.filter((e) => e.type === type).length;

      const overspeedCount = count("OVERSPEED");
      const harshAccelCount = count("HARSH_ACCEL");
      const harshBrakeCount = count("HARSH_BRAKE");
      const harshCornerCount = count("HARSH_CORNER");
      const crashCount = count("CRASH");
      const idleCount = count("IDLE");
      const totalEvents =
        overspeedCount + harshAccelCount + harshBrakeCount + harshCornerCount + crashCount + idleCount;

      const penalty =
        overspeedCount * DRIVER_EVENT_PENALTY.OVERSPEED +
        harshAccelCount * DRIVER_EVENT_PENALTY.HARSH_ACCEL +
        harshBrakeCount * DRIVER_EVENT_PENALTY.HARSH_BRAKE +
        harshCornerCount * DRIVER_EVENT_PENALTY.HARSH_CORNER +
        crashCount * DRIVER_EVENT_PENALTY.CRASH +
        idleCount * DRIVER_EVENT_PENALTY.IDLE;

      return {
        driver: d,
        overspeedCount,
        harshAccelCount,
        harshBrakeCount,
        harshCornerCount,
        crashCount,
        idleCount,
        totalEvents,
        score: Math.max(0, Math.min(100, 100 - penalty)),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function driverScoreLabel(counts: { crashCount: number }): string {
  return counts.crashCount > 0 ? "crash-involved" : "safe";
}
