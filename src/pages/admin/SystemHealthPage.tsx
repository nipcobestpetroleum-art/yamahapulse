import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock, Gauge, RefreshCw, Signal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { PipelineHealth } from "@/types/database";
import { cn } from "@/lib/utils";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  return (
    <Card className="border-border bg-card/60">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
            tone === "good" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
            tone === "warn" && "border-amber-500/30 bg-amber-500/10 text-amber-500",
            tone === "bad" && "border-destructive/40 bg-destructive/10 text-destructive",
            tone === "default" && "border-border bg-muted/40 text-primary",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-bold tabular-nums">{value}</p>
          {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SystemHealthPage() {
  const { currentOrg } = useAuth();
  const [latest, setLatest] = useState<PipelineHealth | null>(null);
  const [history, setHistory] = useState<PipelineHealth[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    const [latestRes, historyRes] = await Promise.all([
      supabase
        .from("pipeline_health")
        .select("*")
        .eq("organization_id", currentOrg.id)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("pipeline_health")
        .select("*")
        .eq("organization_id", currentOrg.id)
        .order("recorded_at", { ascending: false })
        .limit(24),
    ]);
    if (latestRes.data) setLatest(latestRes.data as unknown as PipelineHealth);
    if (historyRes.data) setHistory((historyRes.data ?? []) as unknown as PipelineHealth[]);
    setLoading(false);
  }, [currentOrg]);

  useEffect(() => {
    setLoading(true);
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const criticalIssues = latest?.issues.filter((i) => i.severity === "critical") ?? [];
  const warningIssues = latest?.issues.filter((i) => i.severity !== "critical") ?? [];
  const overallOk = !!latest && criticalIssues.length === 0;

  return (
    <div>
      <PageHeader
        title="System Health"
        description="Telemetry pipeline status for your fleet, refreshed every 5 minutes"
      />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : !latest ? (
        <Card className="border-border bg-card/60">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Clock className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No health snapshots yet</p>
            <p className="text-sm text-muted-foreground">
              The first snapshot lands within 5 minutes once your organization has active devices.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              label="Pipeline"
              value={overallOk ? "Healthy" : "Attention"}
              hint={`Snapshot ${formatTime(latest.recorded_at)}`}
              icon={overallOk ? CheckCircle2 : AlertTriangle}
              tone={overallOk ? "good" : "bad"}
            />
            <StatCard
              label="Reporting now (15m)"
              value={`${latest.reporting_15m} / ${latest.active_devices}`}
              hint={`${latest.positions_15m.toLocaleString()} positions in last 15 min`}
              icon={Signal}
              tone={latest.reporting_15m > 0 ? "good" : "bad"}
            />
            <StatCard
              label="Stale devices (24h+)"
              value={String(latest.stale_devices)}
              hint={
                latest.stale_devices === 0
                  ? "All in-use devices reported recently"
                  : "In use, but silent for over 24 hours"
              }
              icon={Gauge}
              tone={latest.stale_devices > 0 ? "warn" : "good"}
            />
            <StatCard
              label="Active devices"
              value={String(latest.active_devices)}
              hint="Status ACTIVE or ASSIGNED"
              icon={Activity}
            />
            <StatCard
              label="Reporting (1h)"
              value={String(latest.reporting_1h)}
              icon={Signal}
            />
            <StatCard
              label="Reporting (24h)"
              value={String(latest.reporting_24h)}
              icon={Signal}
            />
          </div>

          <Card className="border-border bg-card/60">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <RefreshCw className="h-4 w-4 text-primary" /> Detected issues
              </CardTitle>
            </CardHeader>
            <CardContent>
              {latest.issues.length === 0 ? (
                <p className="flex items-center gap-2 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  No issues detected — telemetry is flowing normally.
                </p>
              ) : (
                <ul className="space-y-2">
                  {[...criticalIssues, ...warningIssues].map((issue) => (
                    <li
                      key={issue.code}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border px-3 py-2",
                        issue.severity === "critical"
                          ? "border-destructive/40 bg-destructive/10"
                          : "border-amber-500/30 bg-amber-500/10",
                      )}
                    >
                      <AlertTriangle
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          issue.severity === "critical" ? "text-destructive" : "text-amber-500",
                        )}
                      />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide">
                          {issue.code}
                        </p>
                        <p className="text-sm text-muted-foreground">{issue.message}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-4 w-4 text-primary" /> Recent snapshots
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead className="text-right">Reporting 15m</TableHead>
                    <TableHead className="text-right">Positions 15m</TableHead>
                    <TableHead className="text-right">Stale</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        No history yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    history.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatTime(h.recorded_at)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {h.reporting_15m} / {h.active_devices}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {h.positions_15m.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{h.stale_devices}</TableCell>
                        <TableCell className="text-sm">
                          {h.issues.length === 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400">OK</span>
                          ) : (
                            <span className="text-amber-500">
                              {h.issues.map((i) => i.code).join(", ")}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
