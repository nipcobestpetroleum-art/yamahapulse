import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import {
  Activity,
  CalendarDays,
  Car,
  CircleDot,
  Cpu,
  Filter,
  LocateFixed,
  MapPin,
  PauseCircle,
  Route,
  Search,
  Signal,
  Volume2,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
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

interface TrailLog {
  latitude: number;
  longitude: number;
  recorded_at: string;
  speed: number | null;
  ignition: boolean | null;
}

function formatUpdated(ts: string) {
  return format(new Date(ts), "dd MMM yyyy, HH:mm:ss");
}

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function nextDateInputValue(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return dateInputValue(date);
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
  const [selectedBike, setSelectedBike] = useReactState("ALL");
  const [fromDate, setFromDate] = useReactState(dateInputValue(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [toDate, setToDate] = useReactState(dateInputValue(new Date()));
  const [selectedKey, setSelectedKey] = useReactState<string | null>(null);
  const [trailLogPage, setTrailLogPage] = useReactState(1);
  const trailLogPageSize = 25;

  const [assigned, setAssigned] = useReactState<AssignedDevice[] | null>(null);
  const [assignedError, setAssignedError] = useReactState<string | null>(null);
  const [trails, setTrails] = useReactState<Record<string, [number, number][]>>({});
  const [trailLogs, setTrailLogs] = useReactState<Record<string, TrailLog[]>>({});
  const [roadTrails, setRoadTrails] = useReactState<Record<string, [number, number][]>>({});

  const {
    positionsByDeviceId,
    loading: positionsLoading,
    error: positionsError,
    realtimeStatus,
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

  useEffect(() => {
    if (!orgId || vehiclesToTrack.length === 0 || fromDate > toDate) {
      setTrails({});
      setTrailLogs({});
      return;
    }

    let cancelled = false;
    const deviceIds = vehiclesToTrack.map((vehicle) => vehicle.deviceId);
    const until = nextDateInputValue(toDate);
    supabase
      .from("positions")
      .select("device_id,latitude,longitude,recorded_at,speed,ignition")
      .eq("organization_id", orgId)
      .in("device_id", deviceIds)
      .gte("recorded_at", `${fromDate}T00:00:00.000Z`)
      .lt("recorded_at", `${until}T00:00:00.000Z`)
      .order("recorded_at", { ascending: true })
      .limit(5000)
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const next: Record<string, [number, number][]> = {};
        const logs: Record<string, TrailLog[]> = {};
        for (const row of data ?? []) {
          if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude) || (row.latitude === 0 && row.longitude === 0)) continue;
          (next[row.device_id] ??= []).push([row.latitude, row.longitude] as [number, number]);
          (logs[row.device_id] ??= []).push({ latitude: row.latitude, longitude: row.longitude, recorded_at: row.recorded_at, speed: row.speed, ignition: row.ignition });
        }
        setTrails(next);
        setTrailLogs(logs);
      });

    return () => { cancelled = true; };
  }, [orgId, vehiclesToTrack, fromDate, toDate]);

  useEffect(() => {
    setTrails((current) => {
      let changed = false;
      const next = { ...current };
      for (const vehicle of vehiclesToTrack) {
        const position = positionsByDeviceId[vehicle.deviceId];
        if (!position || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude) || (position.latitude === 0 && position.longitude === 0)) continue;
        const points = next[vehicle.deviceId] ?? [];
        const last = points[points.length - 1];
        if (last?.[0] === position.latitude && last?.[1] === position.longitude) continue;
        next[vehicle.deviceId] = [...points, [position.latitude, position.longitude] as [number, number]].slice(-300);
        changed = true;
      }
      return changed ? next : current;
    });
  }, [positionsByDeviceId, vehiclesToTrack]);

  const routeRequestSignature = useMemo(
    () => vehiclesToTrack.map((vehicle) => `${vehicle.deviceId}:${Math.floor((trails[vehicle.deviceId]?.length ?? 0) / 10)}`).join("|"),
    [trails, vehiclesToTrack],
  );

  useEffect(() => {
    if (!orgId || !routeRequestSignature || Object.keys(trails).length === 0) {
      setRoadTrails({});
      return;
    }
    let cancelled = false;
    const tracks = vehiclesToTrack
      .map((vehicle) => ({
        deviceId: vehicle.deviceId,
        points: (trails[vehicle.deviceId] ?? []).map(([latitude, longitude]) => ({ latitude, longitude })),
      }))
      .filter((track) => track.points.length > 1);
    if (tracks.length === 0) return;

    supabase.functions.invoke("route-history", { body: { tracks } }).then(({ data, error }) => {
      if (cancelled || error || !data?.trails) return;
      const next: Record<string, [number, number][]> = {};
      for (const [deviceId, points] of Object.entries(data.trails as Record<string, { latitude: number; longitude: number }[]>)) {
        next[deviceId] = points.map((point) => [point.latitude, point.longitude] as [number, number]);
      }
      setRoadTrails(next);
    });
    return () => { cancelled = true; };
  }, [orgId, routeRequestSignature, vehiclesToTrack]);

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
      const matchesBike = selectedBike === "ALL" || v.deviceId === selectedBike;
      return matchesSearch && matchesStatus && matchesBike;
    });
  }, [vehiclesToTrack, search, statusFilter, statusByDevice, selectedBike]);

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
        trail: roadTrails[v.deviceId] ?? trails[v.deviceId] ?? [],
      };
      })
      .filter(Boolean) as LiveMapVehicle[];
  }, [filtered, positionsByDeviceId, roadTrails, trails]);

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
  const selectedTrailLogs = effectiveSelectedKey ? (trailLogs[effectiveSelectedKey] ?? []) : [];
  const paginatedTrailLogs = selectedTrailLogs.slice((trailLogPage - 1) * trailLogPageSize, trailLogPage * trailLogPageSize);

  useEffect(() => {
    setTrailLogPage(1);
  }, [effectiveSelectedKey, fromDate, toDate]);

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
                realtimeStatus !== "CONNECTED" ? "opacity-70" : "",
              )}
            >
              <Signal className="mr-2 h-4 w-4 text-primary" />
              {positionsLoading || realtimeStatus === "CONNECTING" ? "Connecting…" : realtimeStatus === "DEGRADED" ? "Live updates degraded" : "Live updates on"}
            </Badge>
          </div>
        }
      />

      <div className="space-y-4">
        <LiveMapCanvas
          vehicles={liveMapVehicles}
          selectedKey={effectiveSelectedKey}
          onSelectVehicle={(k) => {
            const vehicleKey = k.split(":")[0];
            setSelectedKey(vehicleKey);
            navigate(`/fleet/live/${vehicleKey}`);
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

        <Card className="border-border bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3"><div><CardTitle className="flex items-center gap-2 text-sm font-semibold"><Route className="h-4 w-4 text-primary" />Movement trail logs</CardTitle><p className="mt-1 text-xs text-muted-foreground">Start, stops, and recorded GPS points for the selected bike.</p></div><Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">{selectedTrailLogs.length} points</Badge></CardHeader>
          <CardContent>{selectedTrailLogs.length === 0 ? <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">Choose a bike and date range with recorded positions to view its trail log.</div> : <div className="max-h-64 overflow-auto rounded-xl border border-border"><div className="divide-y divide-border">{paginatedTrailLogs.slice().reverse().map((log, index) => <div key={`${log.recorded_at}:${index}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"><div className="flex min-w-0 items-center gap-2"><CircleDot className={cn("h-3.5 w-3.5 shrink-0", index === selectedTrailLogs.length - 1 ? "text-emerald-400" : "text-sky-400")} /><span className="truncate text-foreground">{formatUpdated(log.recorded_at)}</span></div><div className="flex shrink-0 items-center gap-3 text-muted-foreground"><span>{log.speed != null ? `${Math.round(log.speed)} km/h` : "—"}</span><span>{log.ignition == null ? "Ignition —" : log.ignition ? "Ignition on" : "Ignition off"}</span><a className="text-primary hover:underline" href={`https://www.google.com/maps/search/?api=1&query=${log.latitude},${log.longitude}`} target="_blank" rel="noreferrer">Map</a></div></div>)}</div></div>}<TablePagination page={trailLogPage} pageSize={trailLogPageSize} total={selectedTrailLogs.length} onPageChange={setTrailLogPage} /></CardContent>
        </Card>

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
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="space-y-1 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Filter className="h-3.5 w-3.5" />Bike</span><select value={selectedBike} onChange={(e) => setSelectedBike(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background/60 px-2 text-xs text-foreground"><option value="ALL">All bikes</option>{vehiclesToTrack.map((vehicle) => <option key={vehicle.deviceId} value={vehicle.deviceId}>{vehicle.vehicleName}</option>)}</select></label>
                <label className="space-y-1 text-xs text-muted-foreground"><span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />From</span><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 bg-background/60 text-xs" /></label>
                <label className="space-y-1 text-xs text-muted-foreground"><span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />To</span><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 bg-background/60 text-xs" /></label>
              </div>
              <p className="text-xs text-muted-foreground">Showing {filtered.length} assigned device{filtered.length === 1 ? "" : "s"} · trail window {fromDate} to {toDate}</p>
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