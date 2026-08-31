import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  Activity,
  ArrowRight,
  Car,
  Cpu,
  Link2,
  Package,
  Plus,
  Wrench,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { VehicleStatusBadge } from "@/components/status-badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { Vehicle, VehicleStatus } from "@/types/database";

interface DashStats {
  vehiclesTotal: number;
  vehiclesActive: number;
  vehiclesMaintenance: number;
  vehiclesInactive: number;
  devicesTotal: number;
  devicesAssigned: number;
  devicesInStock: number;
  devicesFaulty: number;
  fleetsTotal: number;
  recentVehicles: Vehicle[];
}

const STATUS_COLORS: Record<VehicleStatus, string> = {
  ACTIVE: "#34d399",
  MAINTENANCE: "#fbbf24",
  INACTIVE: "#94a3b8",
  DECOMMISSIONED: "#f87171",
};

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <Card className="border-border bg-card/60">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { currentOrg, profile } = useAuth();
  const [stats, setStats] = useState<DashStats | null>(null);

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;

    const count = (table: string, status?: string) => {
      let q = supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("organization_id", currentOrg.id);
      if (status) q = q.eq("status", status);
      return q;
    };

    (async () => {
      const [vTotal, vActive, vMaint, vInactive, dTotal, dAssigned, dStock, dFaulty, fTotal, recent] =
        await Promise.all([
          count("vehicles"),
          count("vehicles", "ACTIVE"),
          count("vehicles", "MAINTENANCE"),
          count("vehicles", "INACTIVE"),
          count("gps_devices"),
          count("gps_devices", "ASSIGNED"),
          count("gps_devices", "IN_STOCK"),
          count("gps_devices", "FAULTY"),
          count("fleets"),
          supabase
            .from("vehicles")
            .select("*")
            .eq("organization_id", currentOrg.id)
            .order("created_at", { ascending: false })
            .limit(6),
        ]);
      if (cancelled) return;
      setStats({
        vehiclesTotal: vTotal.count ?? 0,
        vehiclesActive: vActive.count ?? 0,
        vehiclesMaintenance: vMaint.count ?? 0,
        vehiclesInactive: vInactive.count ?? 0,
        devicesTotal: dTotal.count ?? 0,
        devicesAssigned: dAssigned.count ?? 0,
        devicesInStock: dStock.count ?? 0,
        devicesFaulty: dFaulty.count ?? 0,
        fleetsTotal: fTotal.count ?? 0,
        recentVehicles: (recent.data ?? []) as Vehicle[],
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [currentOrg]);

  const firstName = profile?.first_name ?? "there";

  const composition = stats
    ? ([
        { name: "Active", status: "ACTIVE" as const, value: stats.vehiclesActive },
        { name: "Maintenance", status: "MAINTENANCE" as const, value: stats.vehiclesMaintenance },
        { name: "Inactive", status: "INACTIVE" as const, value: stats.vehiclesInactive },
        {
          name: "Decommissioned",
          status: "DECOMMISSIONED" as const,
          value:
            stats.vehiclesTotal -
            stats.vehiclesActive -
            stats.vehiclesMaintenance -
            stats.vehiclesInactive,
        },
      ] as const).filter((s) => s.value > 0)
    : [];

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={`${currentOrg?.name ?? ""} · Fleet overview for today`}
        actions={
          <Link to="/vehicles?new=1">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add vehicle
            </Button>
          </Link>
        }
      />

      {!stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={Car} label="Total vehicles" value={stats.vehiclesTotal} sub={`${stats.fleetsTotal} fleets`} />
            <KpiCard icon={Activity} label="Active vehicles" value={stats.vehiclesActive} sub={`${stats.vehiclesMaintenance} in maintenance`} />
            <KpiCard icon={Cpu} label="GPS devices" value={stats.devicesTotal} sub={`${stats.devicesInStock} in stock`} />
            <KpiCard icon={Link2} label="Assigned devices" value={stats.devicesAssigned} sub={`${stats.devicesFaulty} faulty`} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-5">
            <Card className="border-border bg-card/60 lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Fleet composition</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.vehiclesTotal === 0 ? (
                  <div className="flex h-[220px] flex-col items-center justify-center text-center">
                    <Car className="h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-3 text-sm text-muted-foreground">No vehicles yet</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="h-[200px] w-1/2">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={composition as unknown as { name: string; value: number }[]}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={52}
                            outerRadius={78}
                            paddingAngle={3}
                            strokeWidth={0}
                          >
                            {composition.map((entry) => (
                              <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "hsl(223 24% 8%)",
                              border: "1px solid hsl(222 14% 15%)",
                              borderRadius: 10,
                              fontSize: 12,
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="flex-1 space-y-2.5">
                      {composition.map((entry) => (
                        <li key={entry.status} className="flex items-center gap-2.5 text-sm">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: STATUS_COLORS[entry.status] }}
                          />
                          <span className="text-muted-foreground">{entry.name}</span>
                          <span className="ml-auto font-semibold">{entry.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card/60 lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold">Recent vehicles</CardTitle>
                <Link
                  to="/vehicles"
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent>
                {stats.recentVehicles.length === 0 ? (
                  <div className="flex h-[220px] flex-col items-center justify-center text-center">
                    <Car className="h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-3 text-sm text-muted-foreground">
                      Vehicles you add will appear here.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {stats.recentVehicles.map((v) => (
                      <li key={v.id} className="flex items-center gap-3 py-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Car className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{v.name}</p>
                          <p className="text-xs text-muted-foreground">{v.registration_number}</p>
                        </div>
                        <span className="hidden text-xs text-muted-foreground sm:block">
                          {format(new Date(v.created_at), "dd MMM yyyy")}
                        </span>
                        <VehicleStatusBadge status={v.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {stats.vehiclesTotal === 0 && (
            <Card className="mt-4 border-primary/20 bg-primary/5">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                  <Wrench className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Get your fleet online</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    1. Register a GPS device → 2. Add a vehicle → 3. Assign the device. Live
                    tracking arrives in Phase 2.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link to="/devices?new=1">
                    <Button variant="outline" size="sm" className="border-border bg-card">
                      <Package className="mr-2 h-4 w-4" />
                      Register device
                    </Button>
                  </Link>
                  <Link to="/vehicles?new=1">
                    <Button size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Add vehicle
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}