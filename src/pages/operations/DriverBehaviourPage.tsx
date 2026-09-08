import { useCallback, useEffect, useMemo, useState } from "react";
import { Gauge, Users } from "lucide-react";
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

interface DriverScore {
  driver: Driver;
  overspeedCount: number;
  idleCount: number;
  harshEventCount: number;
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
          .in("type", ["OVERSPEED", "IDLE"])
          .gte("created_at", since)
          .limit(2000),
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
    return drivers.map((d) => {
      const vehicleEvents = events.filter((e) => e.vehicle_id === d.vehicle_id);
      const overspeedCount = vehicleEvents.filter((e) => e.type === "OVERSPEED").length;
      const idleCount = vehicleEvents.filter((e) => e.type === "IDLE").length;
      const harshEventCount = overspeedCount + idleCount;
      const score = Math.max(0, Math.min(100, 100 - overspeedCount * 5 - idleCount * 1));
      return { driver: d, overspeedCount, idleCount, harshEventCount, score };
    }).sort((a, b) => a.score - b.score);
  }, [drivers, events]);

  return (
    <div>
      <PageHeader
        title="Driver Behaviour"
        description="Safety scores from overspeeding and idling events over the last 30 days"
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
          description="Assign drivers to vehicles to start tracking behaviour scores based on overspeeding and idling events."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Driver</TableHead>
                <TableHead className="hidden md:table-cell">Overspeed events</TableHead>
                <TableHead className="hidden md:table-cell">Idle events</TableHead>
                <TableHead className="hidden lg:table-cell">Total events</TableHead>
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
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">{s.idleCount}</span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">{s.harshEventCount}</span>
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
