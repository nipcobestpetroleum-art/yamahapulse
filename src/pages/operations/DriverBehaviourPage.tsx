import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileDown, FileText, Gauge, Minus, TrendingDown, TrendingUp, Trophy, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { downloadCsv, timestampSlug } from "@/lib/export";
import { downloadPdfTable } from "@/lib/pdf";
import { computeDriverScores, DRIVER_EVENT_TYPES, type DriverScore } from "@/lib/driver-score";
import { cn } from "@/lib/utils";
import type { Driver, DeviceEvent } from "@/types/database";

const PERIODS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

const PODIUM_STYLES = [
  { ring: "border-amber-400/40 bg-amber-400/10", badge: "bg-amber-400/20 text-amber-300", medal: "🥇" },
  { ring: "border-slate-300/40 bg-slate-300/10", badge: "bg-slate-300/20 text-slate-200", medal: "🥈" },
  { ring: "border-orange-400/40 bg-orange-400/10", badge: "bg-orange-400/20 text-orange-300", medal: "🥉" },
];

function scoreBadgeStyle(score: number) {
  if (score >= 85) return "border-emerald-500/25 bg-emerald-500/10 text-emerald-400";
  if (score >= 60) return "border-amber-500/25 bg-amber-500/10 text-amber-400";
  return "border-rose-500/25 bg-rose-500/10 text-rose-400";
}

export default function DriverBehaviourPage() {
  const { currentOrg } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [currentEvents, setCurrentEvents] = useState<DeviceEvent[]>([]);
  const [previousEvents, setPreviousEvents] = useState<DeviceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodDays, setPeriodDays] = useState(30);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const now = Date.now();
    const periodMs = periodDays * 24 * 60 * 60 * 1000;
    const currentSince = new Date(now - periodMs).toISOString();
    const previousSince = new Date(now - periodMs * 2).toISOString();

    const [driversRes, currentRes, previousRes] = await Promise.all([
      supabase
        .from("drivers")
        .select("*, vehicle:vehicles(name, registration_number)")
        .eq("organization_id", currentOrg.id)
        .not("vehicle_id", "is", null),
      supabase
        .from("device_events")
        .select("*")
        .eq("organization_id", currentOrg.id)
        .in("type", DRIVER_EVENT_TYPES as unknown as string[])
        .gte("created_at", currentSince)
        .limit(5000),
      supabase
        .from("device_events")
        .select("*")
        .eq("organization_id", currentOrg.id)
        .in("type", DRIVER_EVENT_TYPES as unknown as string[])
        .gte("created_at", previousSince)
        .lt("created_at", currentSince)
        .limit(5000),
    ]);

    setLoading(false);
    const error = driversRes.error ?? currentRes.error ?? previousRes.error;
    if (error) {
      showError(error.message);
      return;
    }
    setDrivers((driversRes.data ?? []) as unknown as Driver[]);
    setCurrentEvents((currentRes.data ?? []) as unknown as DeviceEvent[]);
    setPreviousEvents((previousRes.data ?? []) as unknown as DeviceEvent[]);
  }, [currentOrg, periodDays]);

  useEffect(() => {
    load();
  }, [load]);

  const scores = useMemo(
    () => computeDriverScores(drivers, currentEvents),
    [drivers, currentEvents],
  );

  const previousScores = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of computeDriverScores(drivers, previousEvents)) {
      map.set(s.driver.id, s.score);
    }
    return map;
  }, [drivers, previousEvents]);

  const fleetAvg = scores.length
    ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
    : 0;
  const totalEvents = scores.reduce((sum, s) => sum + s.totalEvents, 0);

  const categoryData = useMemo(
    () => [
      { name: "Overspeed", count: scores.reduce((n, s) => n + s.overspeedCount, 0) },
      { name: "Harsh accel", count: scores.reduce((n, s) => n + s.harshAccelCount, 0) },
      { name: "Harsh brake", count: scores.reduce((n, s) => n + s.harshBrakeCount, 0) },
      { name: "Harsh corner", count: scores.reduce((n, s) => n + s.harshCornerCount, 0) },
      { name: "Crashes", count: scores.reduce((n, s) => n + s.crashCount, 0) },
      { name: "Idling", count: scores.reduce((n, s) => n + s.idleCount, 0) },
    ],
    [scores],
  );

  const worstCategory = categoryData.reduce(
    (worst, c) => (c.count > worst.count ? c : worst),
    { name: "—", count: 0 },
  );

  const exportRows = () =>
    scores.map((s, i) => [
      i + 1,
      s.driver.name,
      s.driver.vehicle?.name ?? "",
      s.overspeedCount,
      s.harshAccelCount,
      s.harshBrakeCount,
      s.harshCornerCount,
      s.crashCount,
      s.idleCount,
      s.totalEvents,
      s.score,
    ]);

  const periodLabel = PERIODS.find((p) => p.days === periodDays)?.label ?? "";

  return (
    <div>
      <PageHeader
        title="Driver Behaviour Scoreboard"
        description="Safety scores from harsh driving, overspeeding, idling and crash events"
        actions={
          scores.length > 0 ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-border bg-card/60"
                onClick={() =>
                  downloadCsv(
                    `driver-behaviour-${timestampSlug()}.csv`,
                    [
                      "Rank",
                      "Driver",
                      "Vehicle",
                      "Overspeed",
                      "Harsh accel",
                      "Harsh brake",
                      "Harsh corner",
                      "Crashes",
                      "Idle",
                      "Total events",
                      "Score /100",
                    ],
                    exportRows(),
                  )
                }
              >
                <FileDown className="mr-2 h-4 w-4" />
                CSV
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  downloadPdfTable({
                    title: "Driver Behaviour Scoreboard",
                    subtitle: `${periodLabel} · ${scores.length} drivers · fleet average ${fleetAvg}/100`,
                    orgName: currentOrg?.name,
                    filename: `driver-behaviour-${timestampSlug()}`,
                    head: [
                      "#",
                      "Driver",
                      "Vehicle",
                      "Overspeed",
                      "Accel",
                      "Brake",
                      "Corner",
                      "Crash",
                      "Idle",
                      "Total",
                      "Score",
                    ],
                    body: exportRows(),
                  })
                }
              >
                <FileText className="mr-2 h-4 w-4" />
                PDF
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 flex">
        <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v))}>
          <SelectTrigger className="w-full bg-card/60 sm:w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.days} value={String(p.days)}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        </div>
      ) : scores.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No driver data yet"
          description="Assign drivers to vehicles to start tracking behaviour scores based on telemetry events."
        />
      ) : (
        <div className="space-y-6">
          {/* Fleet KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Fleet average score", value: `${fleetAvg}/100` },
              { label: "Drivers scored", value: String(scores.length) },
              { label: "Total events", value: String(totalEvents) },
              { label: "Top infraction", value: worstCategory.count > 0 ? `${worstCategory.name} (${worstCategory.count})` : "None" },
            ].map((kpi) => (
              <Card key={kpi.label} className="border-border bg-card/60">
                <CardContent className="p-5">
                  <p className="text-[13px] text-muted-foreground">{kpi.label}</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight">{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Podium — best drivers first */}
          {scores.length > 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              {scores.slice(0, 3).map((s, i) => (
                <Card
                  key={s.driver.id}
                  className={cn("border bg-card/60", PODIUM_STYLES[Math.min(i, 2)].ring)}
                >
                  <CardContent className="flex items-center gap-4 p-5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl">
                      {PODIUM_STYLES[Math.min(i, 2)].medal}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{s.driver.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.driver.vehicle?.name ?? "—"} · {s.totalEvents} event
                        {s.totalEvents === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-sm font-bold",
                        PODIUM_STYLES[Math.min(i, 2)].badge,
                      )}
                    >
                      {s.score}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-5">
            {/* Infraction breakdown */}
            <Card className="border-border bg-card/60 lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Infractions by category</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData} margin={{ top: 8, right: 8, bottom: 8, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 14% 15%)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "hsl(220 9% 64%)", fontSize: 10 }}
                      interval={0}
                      angle={-18}
                      textAnchor="end"
                      height={44}
                    />
                    <YAxis tick={{ fill: "hsl(220 9% 64%)", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "hsl(222 14% 15% / 0.4)" }}
                      contentStyle={{
                        background: "hsl(223 24% 8%)",
                        border: "1px solid hsl(222 14% 15%)",
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={38} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Full scoreboard */}
            <Card className="border-border bg-card/60 lg:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  Scoreboard — ranked best to worst
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-4">#</TableHead>
                        <TableHead>Driver</TableHead>
                        <TableHead className="hidden md:table-cell">Overspeed</TableHead>
                        <TableHead className="hidden lg:table-cell">Harsh</TableHead>
                        <TableHead className="hidden md:table-cell">Crashes</TableHead>
                        <TableHead className="hidden xl:table-cell">Total</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead className="pr-4">Trend</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scores.map((s, i) => {
                        const prev = previousScores.get(s.driver.id);
                        const delta = prev !== undefined ? s.score - prev : null;
                        return (
                          <TableRow key={s.driver.id}>
                            <TableCell className="pl-4 text-sm font-semibold text-muted-foreground">
                              {i + 1}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                                  <Gauge className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{s.driver.name}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {s.driver.vehicle?.name ?? "—"}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className="text-sm text-muted-foreground">{s.overspeedCount}</span>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <span className="text-sm text-muted-foreground">
                                {s.harshAccelCount + s.harshBrakeCount + s.harshCornerCount}
                              </span>
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
                            <TableCell className="pr-4">
                              {delta === null ? (
                                <Minus className="h-4 w-4 text-muted-foreground/50" />
                              ) : delta > 0 ? (
                                <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                                  <TrendingUp className="h-3.5 w-3.5" />+{delta}
                                </span>
                              ) : delta < 0 ? (
                                <span className="flex items-center gap-1 text-xs font-medium text-rose-400">
                                  <TrendingDown className="h-3.5 w-3.5" />
                                  {delta}
                                </span>
                              ) : (
                                <Minus className="h-4 w-4 text-muted-foreground/50" />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
