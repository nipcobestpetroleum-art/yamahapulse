import { useCallback, useEffect, useState } from "react";
import { format, isPast } from "date-fns";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, CircleDollarSign, Disc3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { MaintenanceSchedule, MaintenanceStatus } from "@/types/database";

const STATUS_STYLES: Record<MaintenanceStatus, string> = {
  SCHEDULED: "border-sky-500/25 bg-sky-500/10 text-sky-400",
  COMPLETED: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  OVERDUE: "border-rose-500/25 bg-rose-500/10 text-rose-400",
  CANCELLED: "border-slate-500/25 bg-slate-500/10 text-slate-400",
};

export default function MaintenanceDashboardPage() {
  const { currentOrg } = useAuth();
  const [loading, setLoading] = useState(true);
  const [upcoming, setUpcoming] = useState<MaintenanceSchedule[]>([]);
  const [stats, setStats] = useState({
    overdue: 0,
    scheduled: 0,
    monthCost: 0,
    tiresNeedingReplacement: 0,
  });

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [{ data: allSchedules, error }, { count: tireCount }] = await Promise.all([
      supabase
        .from("maintenance_schedules")
        .select("*, vehicle:vehicles(name, registration_number)")
        .eq("organization_id", currentOrg.id)
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("vehicle_tires")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", currentOrg.id)
        .eq("status", "NEEDS_REPLACEMENT"),
    ]);

    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }

    const rows = (allSchedules ?? []) as unknown as MaintenanceSchedule[];
    const normalized = rows.map((r) =>
      r.status === "SCHEDULED" && r.due_date && isPast(new Date(r.due_date))
        ? { ...r, status: "OVERDUE" as MaintenanceStatus }
        : r,
    );

    const overdue = normalized.filter((r) => r.status === "OVERDUE").length;
    const scheduled = normalized.filter((r) => r.status === "SCHEDULED").length;
    const monthCost = normalized
      .filter(
        (r) =>
          r.status === "COMPLETED" &&
          r.completed_at &&
          new Date(r.completed_at) >= monthStart,
      )
      .reduce((sum, r) => sum + (r.cost ?? 0), 0);

    setStats({
      overdue,
      scheduled,
      monthCost,
      tiresNeedingReplacement: tireCount ?? 0,
    });
    setUpcoming(normalized.filter((r) => r.status === "SCHEDULED" || r.status === "OVERDUE").slice(0, 8));
  }, [currentOrg]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Maintenance Dashboard" description="Fleet-wide service health at a glance" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Maintenance Dashboard" description="Fleet-wide service health at a glance" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue</CardTitle>
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.overdue}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scheduled</CardTitle>
            <CalendarClock className="h-4 w-4 text-sky-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.scheduled}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cost this month
            </CardTitle>
            <CircleDollarSign className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${stats.monthCost.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tires to replace
            </CardTitle>
            <Disc3 className="h-4 w-4 text-rose-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.tiresNeedingReplacement}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card/40">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Upcoming & overdue service</CardTitle>
          <Link
            to="/maintenance/schedule"
            className="text-xs font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Nothing due"
              description="No scheduled or overdue maintenance right now."
            />
          ) : (
            <div className="space-y-2">
              {upcoming.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.vehicle?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.service_type}
                      {r.due_date ? ` · Due ${format(new Date(r.due_date), "dd MMM yyyy")}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn("font-medium", STATUS_STYLES[r.status])}>
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
