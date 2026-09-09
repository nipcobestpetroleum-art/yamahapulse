import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  Activity,
  ArrowRight,
  Car,
  Cpu,
  Link2,
  MapPin,
  Radio,
  WifiOff,
  Package,
  Plus,
  Wrench,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { VehicleStatusBadge } from "@/components/status-badge";
import { CriticalEventsWidget } from "@/components/dashboard/critical-events-widget";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useLivePositions } from "@/hooks/use-live-positions";
import { getTelemetryStatus, TELEMETRY_STATUS_LABELS, TELEMETRY_STATUS_STYLES, type TelemetryStatus } from "@/lib/telemetry-status";
import type { LatestPosition, Vehicle, VehicleStatus } from "@/types/database";

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

interface DashboardAsset {
  deviceId: string;
  deviceName: string;
  imei: string;
  vehicleName: string;
  registration: string | null;
  position: LatestPosition | null;
}

function FleetOperationsCard({ organizationId }: { organizationId: string }) {
  const { positionsByDeviceId, loading: positionsLoading } = useLivePositions(organizationId);
  const [assignments, setAssignments] = useState<DashboardAsset[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("device_assignments")
      .select("device_id, device:gps_devices!device_assignments_device_id_fkey(id,name,imei), vehicle:vehicles!device_assignments_vehicle_id_fkey(id,name,registration_number)")
      .eq("organization_id", organizationId)
      .is("unassigned_at", null)
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as unknown as {
          device_id: string;
          device: { id: string; name: string; imei: string } | null;
          vehicle: { id: string; name: string; registration_number: string | null } | null;
        }[];
        setAssignments(rows.filter((row) => row.device && row.vehicle).map((row) => ({
          deviceId: row.device!.id,
          deviceName: row.device!.name,
          imei: row.device!.imei,
          vehicleName: row.vehicle!.name,
          registration: row.vehicle!.registration_number,
          position: null,
        })));
      });
    return () => { cancelled = true; };
  }, [organizationId]);

  const assets = useMemo(() => (assignments ?? []).map((asset) => ({
    ...asset,
    position: positionsByDeviceId[asset.deviceId] ?? null,
  })), [assignments, positionsByDeviceId]);
  const counts = useMemo(() => {
    const result = { total: assets.length, online: 0, offline: 0, noData: 0, moving: 0, idling: 0, stopped: 0 };
    for (const asset of assets) {
      if (!asset.position) { result.noData += 1; continue; }
      const status = getTelemetryStatus(asset.position);
      if (status === "OFFLINE") result.offline += 1;
      else if (status === "MOVING") { result.online += 1; result.moving += 1; }
      else if (status === "IDLING") { result.online += 1; result.idling += 1; }
      else if (status === "STOPPED") { result.online += 1; result.stopped += 1; }
      else result.offline += 1;
    }
    return result;
  }, [assets]);

  const summary = [
    { label: "Fleet size", value: counts.total, icon: Car, href: "/fleet/live", style: "text-foreground" },
    { label: "Online", value: counts.online, icon: Radio, href: "/fleet/live?status=online", style: "text-emerald-400" },
    { label: "Offline", value: counts.offline, icon: WifiOff, href: "/fleet/live?status=offline", style: "text-slate-300" },
    { label: "No data", value: counts.noData, icon: WifiOff, href: "/fleet/live?status=no-data", style: "text-rose-300" },
  ];

  return (
    <Card className="mt-6 border-border bg-card/60">
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold">Fleet operations</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">See which trackers are reporting and where they last reported.</p>
        </div>
        <Link to="/fleet/live" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">Open live fleet <ArrowRight className="h-3 w-3" /></Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {summary.map((item) => { const Icon = item.icon; return <Link key={item.label} to={item.href} className="rounded-xl border border-border bg-background/40 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={`h-4 w-4 ${item.style}`} />{item.label}</div><p className={`mt-1 text-2xl font-bold ${item.style}`}>{positionsLoading && assignments === null ? "—" : item.value}</p></Link>; })}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(["MOVING", "IDLING", "STOPPED"] as TelemetryStatus[]).map((status) => <Link key={status} to={`/fleet/live?status=${status.toLowerCase()}`} className={`rounded-full border px-3 py-1.5 font-medium ${TELEMETRY_STATUS_STYLES[status]}`}>{TELEMETRY_STATUS_LABELS[status]} <span className="ml-1 opacity-70">{counts[status.toLowerCase() as "moving" | "idling" | "stopped"]}</span></Link>)}
        </div>
        {assignments === null ? <Skeleton className="h-16 rounded-xl" /> : assets.length === 0 ? <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No assigned trackers yet. Assign a GPS device to a vehicle to see live reporting here.</div> : <div className="overflow-x-auto rounded-xl border border-border"><div className="min-w-[760px]"><div className="grid grid-cols-[1.4fr_1fr_.8fr_1.5fr_1.3fr] gap-3 border-b border-border bg-background/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><span>Asset</span><span>Status</span><span>Speed</span><span>Last location</span><span>GPS timestamp</span></div>{assets.map((asset) => { const position = asset.position; const status = getTelemetryStatus(position); const location = position ? position.address ?? `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}` : "No location data"; return <Link key={asset.deviceId} to={`/fleet/live/${asset.deviceId}`} className="grid grid-cols-[1.4fr_1fr_.8fr_1.5fr_1.3fr] items-center gap-3 border-b border-border/60 px-4 py-3 text-sm transition-colors last:border-0 hover:bg-primary/5"><div className="min-w-0"><p className="truncate font-medium">{asset.vehicleName}</p><p className="truncate text-xs text-muted-foreground">{asset.deviceName} · IMEI {asset.imei}</p></div><Badge variant="outline" className={`w-fit ${position ? TELEMETRY_STATUS_STYLES[status] : "border-rose-500/25 bg-rose-500/10 text-rose-300"}`}>{position ? TELEMETRY_STATUS_LABELS[status] : "No data"}</Badge><span className="text-muted-foreground">{position?.speed != null ? `${Math.round(position.speed)} km/h` : "—"}</span><span className="max-w-[220px] truncate text-xs text-muted-foreground"><MapPin className="mr-1 inline h-3.5 w-3.5" />{location}</span><span className="whitespace-nowrap text-xs text-muted-foreground">{position ? format(new Date(position.recorded_at), "dd MMM yyyy, HH:mm:ss") : "—"}</span></Link>; })}</div></div>}
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

          <FleetOperationsCard organizationId={currentOrg.id} />

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

          <div className="mt-4">
            <CriticalEventsWidget />
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