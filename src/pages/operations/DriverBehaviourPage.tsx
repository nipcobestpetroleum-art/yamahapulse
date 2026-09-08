import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Gauge, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { Driver, DeviceEvent } from "@/types/database";

const TRACKED_TYPES = [
  "OVERSPEED",
  "HARSH_ACCEL",
  "HARSH_BRAKE",
  "HARSH_CORNER",
  "CRASH",
  "IDLE",
] as const;

// Weighted penalty per event type — crashes and overspeeding hurt the most.
const PENALTY: Record<string, number> = {
  OVERSPEED: 4,
  HARSH_ACCEL: 3,
  HARSH_BRAKE: 3,
  HARSH_CORNER: 3,
  CRASH: 25,
  IDLE: 1,
};

interface DriverScore {
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

function scoreBadgeStyle(score: number) {
  if (score >= 85) return "border-emerald-500/25 bg-emerald-500/10 text-emerald-400";
  if (score >= 60) return "border-amber-500/25 bg-amber-500/10 text-amber-400";
  return "border-rose-500/25 bg-rose-500/10 text-rose-400";
}

export default function DriverBehaviourPage() {
  const { currentOrg } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [events, setEvents] = useState<DeviceEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: driverData, error: driverError }, { data: eventData, error: eventError }] =
      await Promise.all([
        supabase
          .from("drivers")
          .select("*")
          .eq("organization_id", currentOrg.id)
          .not("vehicle_id", "is", null),
        supabase
          .from("device_events")
          .select("*")
          .eq("organization_id", currentOrg.id)
          .in("type", TRACKED_TYPES as unknown as string[])
          .gte("created_at", since)
          .limit(5000),
      ]);

    setLoading(false);
    if (driverError || eventError) {
      showError((driverError ?? eventError)!.message);
      return;
    }
    setDrivers((driverData ?? []) as unknown as Driver[]);
    setEvents((eventData ?? []) as unknown as DeviceEvent[]);
  }, [currentOrg]);

  useEffect(() => {
    load();
  }, [load]);

  const scores = useMemo<DriverScore[]>(() => {
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
          overspeedCount * PENALTY.OVERSPEED +
          harshAccelCount * PENALTY.HARSH_ACCEL +
          harshBrakeCount * PENALTY.HARSH_BRAKE +
          harshCornerCount * PENALTY.HARSH_CORNER +
          crashCount * PENALTY.CRASH +
          idleCount * PENALTY.IDLE;

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
      .sort((a, b) => a.score - b.score);
  }, [drivers, events]);

  return (
    <div>
      <PageHeader
        title="Driver Behaviour"
        description="Safety scores from harsh driving, overspeeding, idling and crash events over the last 30 days"
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : scores.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No driver data yet"
          description="Assign drivers to vehicles to start tracking behaviour scores based on telemetry events."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Driver</TableHead>
                <TableHead className="hidden md:table-cell">Overspeed</TableHead>
                <TableHead className="hidden lg:table-cell">Harsh accel</TableHead>
                <TableHead className="hidden lg:table-cell">Harsh brake</TableHead>
                <TableHead className="hidden lg:table-cell">Harsh corner</TableHead>
                <TableHead className="hidden md:table-cell">Crashes</TableHead>
                <TableHead className="hidden xl:table-cell">Total events</TableHead>
                <TableHead>Safety score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scores.map((s) => (
                <TableRow key={s.driver.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Gauge className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="truncate text-sm font-medium">{s.driver.name}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">{s.overspeedCount}</span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">{s.harshAccelCount}</span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">{s.harshBrakeCount}</span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">{s.harshCornerCount}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {s.crashCount > 0 ? (
                      <span className="flex items-center gap-1 text-sm font-medium text-rose-400">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {s.crashCount}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <span className="text-sm text-muted-foreground">{s.totalEvents}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("font-medium", scoreBadgeStyle(s.score))}>
                      {s.score}/100
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
