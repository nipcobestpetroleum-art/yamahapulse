import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { Coins, Droplets, Gauge, Siren } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { FuelTransaction, FuelTransactionType } from "@/types/database";

const TYPE_STYLES: Record<FuelTransactionType, string> = {
  REFUEL: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  DRAIN: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  THEFT: "border-rose-500/25 bg-rose-500/10 text-rose-400",
};

export default function FuelDashboardPage() {
  const { currentOrg } = useAuth();
  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState<FuelTransaction[]>([]);
  const [stats, setStats] = useState({
    monthLiters: 0,
    monthCost: 0,
    activeSensors: 0,
    openIncidents: 0,
  });

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [{ data: monthTx }, { count: sensorCount }, { count: incidentCount }, { data: recentTx }] =
      await Promise.all([
        supabase
          .from("fuel_transactions")
          .select("liters, cost")
          .eq("organization_id", currentOrg.id)
          .eq("type", "REFUEL")
          .gte("recorded_at", monthStart.toISOString()),
        supabase
          .from("fuel_sensors")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", currentOrg.id)
          .eq("is_active", true),
        supabase
          .from("fuel_transactions")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", currentOrg.id)
          .in("type", ["THEFT", "DRAIN"])
          .eq("reviewed", false),
        supabase
          .from("fuel_transactions")
          .select("*, vehicle:vehicles(name, registration_number)")
          .eq("organization_id", currentOrg.id)
          .order("recorded_at", { ascending: false })
          .limit(8),
      ]);

    setLoading(false);

    const monthLiters = (monthTx ?? []).reduce((sum, t) => sum + Number(t.liters ?? 0), 0);
    const monthCost = (monthTx ?? []).reduce((sum, t) => sum + Number(t.cost ?? 0), 0);

    setStats({
      monthLiters,
      monthCost,
      activeSensors: sensorCount ?? 0,
      openIncidents: incidentCount ?? 0,
    });
    setRecent((recentTx ?? []) as unknown as FuelTransaction[]);
  }, [currentOrg]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Fuel Dashboard" description="Overview of fuel usage across your fleet" />
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
      <PageHeader title="Fuel Dashboard" description="Overview of fuel usage across your fleet" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Fuel this month
            </CardTitle>
            <Droplets className="h-4 w-4 text-sky-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{Math.round(stats.monthLiters * 10) / 10} L</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cost this month
            </CardTitle>
            <Coins className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">₦{stats.monthCost.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active sensors
            </CardTitle>
            <Gauge className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.activeSensors}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Open incidents
            </CardTitle>
            <Siren className="h-4 w-4 text-rose-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.openIncidents}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card/40">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Recent transactions</CardTitle>
          <Link
            to="/fuel/transactions"
            className="text-xs font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {recent.length === 0 ? (
            <EmptyState
              icon={Droplets}
              title="No fuel transactions yet"
              description="Log refuels and drains from the Fuel Transactions page."
            />
          ) : (
            <div className="space-y-2">
              {recent.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.vehicle?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(t.recorded_at), "dd MMM yyyy, HH:mm")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t.liters} L</span>
                    <Badge variant="outline" className={cn("font-medium", TYPE_STYLES[t.type])}>
                      {t.type}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
