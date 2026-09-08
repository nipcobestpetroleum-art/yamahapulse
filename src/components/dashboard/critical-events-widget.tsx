import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight, ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import type { DeviceEvent } from "@/types/database";

const CRITICAL_TYPES = ["CRASH", "PANIC", "TOWING", "JAMMING", "ALARM", "POWER_CUT"];

interface CriticalEventRow extends DeviceEvent {
  vehicle: { name: string } | null;
}

export function CriticalEventsWidget() {
  const { currentOrg } = useAuth();
  const [events, setEvents] = useState<CriticalEventRow[] | null>(null);

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    supabase
      .from("device_events")
      .select("*, vehicle:vehicles(name)")
      .eq("organization_id", currentOrg.id)
      .in("type", CRITICAL_TYPES)
      .gte("created_at", startOfDay.toISOString())
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (!cancelled) setEvents((data ?? []) as unknown as CriticalEventRow[]);
      });

    return () => {
      cancelled = true;
    };
  }, [currentOrg]);

  return (
    <Card className="border-border bg-card/60">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ShieldAlert className="h-4 w-4 text-rose-400" />
          Today's critical events
        </CardTitle>
        <Link
          to="/monitoring/events"
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {events === null ? (
          <div className="flex h-[160px] items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : events.length === 0 ? (
          <div className="flex h-[160px] flex-col items-center justify-center text-center">
            <ShieldCheck className="h-8 w-8 text-emerald-500/60" />
            <p className="mt-3 text-sm text-muted-foreground">
              No crashes, panics or tamper alerts today.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    "bg-rose-500/10",
                  )}
                >
                  <ShieldAlert className="h-4 w-4 text-rose-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.message ?? e.type}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.vehicle?.name ?? "Unknown vehicle"}
                  </p>
                </div>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                </span>
                <Badge
                  variant="outline"
                  className="shrink-0 border-rose-500/25 bg-rose-500/10 font-medium text-rose-400"
                >
                  {e.severity}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
