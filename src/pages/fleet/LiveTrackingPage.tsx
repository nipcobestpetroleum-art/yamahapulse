import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import {
  Activity,
  Car,
  Cpu,
  LocateFixed,
  PauseCircle,
  Search,
  Signal,
  Volume2,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useEffect, useState as useReactState } from "react";
import { useLivePositions } from "@/hooks/use-live-positions";
import { cn } from "@/lib/utils";
import { LiveMapCanvas, type LiveMapVehicle } from "@/components/tracking/live-map-canvas";
import {
  getTelemetryStatus,
  TELEMETRY_STATUS_LABELS,
  type TelemetryStatus,
} from "@/lib/telemetry-status";

interface AssignedDevice {
  deviceId: string;
  deviceName: string;
  imei: string;
  vehicleId: string;
  vehicleName: string;
  registration: string | null;
  vehicleStatus: "ACTIVE" | "INACTIVE" | "MAINTENANCE" | "DECOMMISSIONED";
}

function formatUpdated(ts: string) {
  return format(new Date(ts), "dd MMM yyyy, HH:mm:ss");
}

function isOffline(latestUpdatedAt: string | null) {
  if (!latestUpdatedAt) return true;
  const ageMin = (Date.now() - new Date(latestUpdatedAt).getTime()) / 60000;
  return ageMin > 15;
}

export default function LiveTrackingPage() {
  const { currentOrg } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orgId = currentOrg?.id ?? null;
  const requestedStatus = searchParams.get("status")?.toUpperCase();
  const initialStatus = requestedStatus === "ONLINE" ? "ONLINE" : requestedStatus === "MOVING" || requestedStatus === "IDLING" || requestedStatus === "STOPPED" || requestedStatus === "OFFLINE" || requestedStatus === "NO-DATA" || requestedStatus === "UNKNOWN" ? requestedStatus.replace("-", "_") as TelemetryStatus : "ALL";

  const [search, setSearch] = useReactState("");
  const [statusFilter, setStatusFilter] = useReactState<TelemetryStatus | "ALL" | "ONLINE">(initialStatus);
  const [selectedKey, setSelectedKey] = useReactState<string | null>(null);

  const [assigned, setAssigned] = useReactState<AssignedDevice[] | null>(null);
  const [assignedError, setAssignedError] = useReactState<string | null>(null);

  const {
    positionsByDeviceId,
    loading: positionsLoading,
    error: positionsError,
    refetch,
  } = useLivePositions(orgId);

  useEffect(() => {
    if (!orgId) return;

    (async () => {
      const { data, error } = await supabase
        .from("device_assignments")
        .select(
          `
          device_id,
          device:gps_devices!device_assignments_device_id_fkey(id,name,imei,status),
          vehicle:vehicles!device_assignments_vehicle_id_fkey(id,name,registration_number,status)
        `,
        )
        .eq("organization_id", orgId)
        .is("unassigned_at", null);

      if (error) {
        setAssignedError(error.message);
        setAssigned([]);
        return;
      }

      const rows = (data ?? []) as unknown as {
        device_id: string;
        device: { id: string; name: string; imei: string } | null;
        vehicle: {
          id: string;
          name: string;
          registration_number: string | null;
          status: AssignedDevice["vehicleStatus"];
        } | null;
      }[];

      const mapped: AssignedDevice[] = rows
        .filter((r) => r.device && r.vehicle)
        .map((r) => ({
          deviceId: r.device!.id,
          deviceName: r.device!.name,
          imei: r.device!.imei,
          vehicleId: r.vehicle!.id,
          vehicleName: r.vehicle!.name,
          registration: r.vehicle!.registration_number,
          vehicleStatus: r.vehicle!.status,
        }));

      setAssigned(mapped);
    })();
  }, [orgId]);

  const vehiclesToTrack = useMemo(() => {
    // Keep stable: assigned devices are the "things we can track"
    return (assigned ?? []).map((a) => ({
      key: a.deviceId,
      deviceId: a.deviceId,
      imei: a.imei,
      deviceName: a.deviceName,
      vehicleId: a.vehicleId,
      vehicleName: a.vehicleName,
      registration: a.registration,
      vehicleStatus: a.vehicleStatus,
    }));
  }, [assigned]);

  const statusByDevice = useMemo(() => {
    const result: Record<string, TelemetryStatus> = {};
    for (const vehicle of vehiclesToTrack) {
      result[vehicle.deviceId] = getTelemetryStatus(positionsByDeviceId[vehicle.deviceId]);
    }
    return result;
  }, [vehiclesToTrack, positionsByDeviceId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehiclesToTrack.filter((v) => {
      const matchesSearch = !q || [v.vehicleName, v.registration ?? "", v.deviceName, v.imei]
        .some((value) => value.toLowerCase().includes(q));
      const currentStatus = statusByDevice[v.deviceId];
      const matchesStatus = statusFilter === "ALL" || (statusFilter === "ONLINE" ? ["MOVING", "IDLING", "STOPPED"].includes(currentStatus) : currentStatus === statusFilter);
      return matchesSearch && matchesStatus;
    });
  }, [vehiclesToTrack, search, statusFilter, statusByDevice]);

  const liveMapVehicles = useMemo<LiveMapVehicle[]>(() => {
    return filtered
      .map((v) => {
        const pos = positionsByDeviceId[v.deviceId];
        if (!pos) return null;
        return {
          key: v.key,
          deviceId: v.deviceId,
          vehicleName: v.vehicleName,
          registration: v.registration,
          position: pos,
        };
      })
      .filter(Boolean) as LiveMapVehicle[];
  }, [filtered, positionsByDeviceId]);

  const stats = useMemo(() => {
    const counts = { tracked: vehiclesToTrack.length, moving: 0, idling: 0, stopped: 0, offline: 0, noData: 0, unknown: 0 };
    for (const status of Object.values(statusByDevice)) {
      if (status === "MOVING") counts.moving += 1;
      else if (status === "IDLING") counts.idling += 1;
      else if (status === "STOPPED") counts.stopped += 1;
      else if (status === "OFFLINE") counts.offline += 1;
      else if (status === "NO_DATA") counts.noData += 1;
      else counts.unknown += 1;
    }
    return counts;
  }, [vehiclesToTrack.length, statusByDevice]);

  useEffect(() => {
    if (selectedKey) return;
    if (liveMapVehicles.length === 0) return;
    setSelectedKey(liveMapVehicles[0].key);
  }, [liveMapVehicles, selectedKey]);

  const effectiveSelectedKey = selectedKey ?? liveMapVehicles[0]?.key ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Live Tracking"
        description="Realtime GPS positions for assigned devices across your fleet"
        actions={
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "border-border bg-card/40",
                positionsLoading ? "opacity-70" : "",
              )}
            >
              <Signal className="mr-2 h-4 w-4 text-primary" />
              {positionsLoading ? "Connecting…" : "Live updates on"}
            </Badge>
          </div>
        }
      />

      <div className="space-y-4">
        <LiveMapCanvas
          vehicles={liveMapVehicles}
          selectedKey={effectiveSelectedKey}
          onSelectVehicle={(k) => {
            setSelectedKey(k);
            navigate(`/fleet/live/${k}`);
          }}
        />

        {positionsError && (
          <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
            {positionsError}
          </div>
        )}
        {assignedError && (
          <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
            {assignedError}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Fleet status</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Cpu className="h-4 w-4" /> Tracked
                </div>
                <div className="mt-1 text-xl font-bold">{stats.tracked}</div>
              </div>
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="h-4 w-4 text-emerald-400" /> Moving
              </div>
              <div className="mt-1 text-xl font-bold">{stats.moving}</div>
              </div>
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Car className="h-4 w-4 text-sky-400" /> Idling
              </div>
              <div className="mt-1 text-xl font-bold">{stats.idling}</div>
              </div>
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <PauseCircle className="h-4 w-4 text-amber-400" /> Stopped
                </div>
                <div className="mt-1 text-xl font-bold">
                  {stats.stopped}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Search tracked assets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Vehicle, registration, device name, IMEI…"
                  className="bg-card/60 pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Showing {filtered.length} assigned device{filtered.length === 1 ? "" : "s"}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border bg-card/60">
          <CardContent className="flex flex-wrap gap-2 p-3">
            {(["ALL", "MOVING", "IDLING", "STOPPED", "OFFLINE", "NO_DATA", "UNKNOWN"] as const).map((tab) => {
                          const countKey = tab === "NO_DATA" ? "noData" : tab.toLowerCase();
                          const count = tab === "ALL" ? stats.tracked : stats[countKey as keyof typeof stats] ?? 0;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    statusFilter === tab
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border bg-background/40 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  {tab === "ALL" ? "All" : TELEMETRY_STATUS_LABELS[tab]} <span className="ml-1 opacity-70">{count}</span>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card/40">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Tracked assets</CardTitle>
          <div className="text-xs text-muted-foreground">
            Click a row to focus on the map
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {vehiclesToTrack.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No assigned GPS devices yet. Assign devices to vehicles to start live tracking.
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No tracked assets match your search.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card/60">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Vehicle</TableHead>
                    <TableHead className="hidden md:table-cell">Device</TableHead>
                    <TableHead className="hidden lg:table-cell">Speed</TableHead>
                    <TableHead className="hidden lg:table-cell">Ignition</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden xl:table-cell">GPS timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((v) => {
                    const pos = positionsByDeviceId[v.deviceId];
                    const status = statusByDevice[v.deviceId];
                    const ignition = pos?.ignition;
                    const speed = pos?.speed;
                    const statusLabel = TELEMETRY_STATUS_LABELS[status];

                    return (
                      <TableRow
                        key={v.key}
                        className={cn(
                          "cursor-pointer",
                          effectiveSelectedKey === v.key && "bg-primary/5",
                        )}
                        onClick={() => {
                          setSelectedKey(v.key);
                          navigate(`/fleet/live/${v.deviceId}`);
                        }}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                              <Car className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{v.vehicleName}</p>
                              <p className="text-xs text-muted-foreground">
                                {v.registration ?? "—"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="min-w-0">
                            <p className="truncate text-sm">{v.deviceName}</p>
                            <p className="truncate font-mono text-xs text-muted-foreground">
                              {v.imei}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {speed != null ? `${Math.round(speed)} km/h` : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {ignition == null ? "—" : ignition ? "On" : "Off"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-medium",
                              statusLabel === "Moving" &&
                                "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
                              statusLabel === "Idling" &&
                                "border-sky-500/25 bg-sky-500/10 text-sky-400",
                              statusLabel === "Stopped" &&
                                "border-amber-500/25 bg-amber-500/10 text-amber-400",
                              statusLabel === "Offline" &&
                                "border-slate-500/25 bg-slate-500/10 text-slate-400",
                            )}
                          >
                            {statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {pos ? formatUpdated(pos.recorded_at) : "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">How devices send data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <Volume2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <p>
              Configure your tracker with this endpoint (replace <span className="font-mono">IMEI</span> with your
              device IMEI):
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background/40 p-3 font-mono text-xs">
            https://glwinxaanstczuubxqqg.supabase.co/functions/v1/ingest?imei=YOUR_IMEI&lat=1.2921&lon=36.8219&speed=12
          </div>
          <div className="flex items-start gap-2">
            <LocateFixed className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <p>
              Once the device sends a valid position, it will appear here automatically.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}