import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity,
  BatteryCharging,
  BrainCircuit,
  Compass,
  Gauge,
  MapPin,
  RefreshCw,
  Satellite,
  Signal,
  Timer,
  Zap,
} from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError } from "@/utils/toast";
import { formatDuration, tripDurationMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DeviceEvent, LatestPosition, Position, Trip } from "@/types/database";

const ONLINE_WINDOW_MS = 10 * 60 * 1000;

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const GSM_BARS = ["No signal", "Very poor", "Poor", "Fair", "Good", "Excellent"];

const GNSS_STATUS: Record<number, string> = {
  0: "Off — no fix",
  1: "No fix",
  2: "2D fix",
  3: "3D fix",
};

const SLEEP_MODES: Record<number, string> = {
  0: "Awake",
  1: "Deep sleep",
  2: "GPS sleep",
  3: "Online sleep",
};

const REPORTED_EVENT_TYPES = [
  "OVERSPEED",
  "HARSH_BRAKE",
  "HARSH_ACCEL",
  "HARSH_CORNER",
  "IGNITION_ON",
  "IGNITION_OFF",
  "MOVING",
  "STOPPED",
  "GEOFENCE_ENTER",
  "GEOFENCE_EXIT",
  "POWER_CUT",
  "POWER_RESTORED",
  "GPS_LOST",
  "GPS_RESTORED",
];

const EVENT_SHORT: Record<string, string> = {
  OVERSPEED: "Overspeed",
  HARSH_BRAKE: "Harsh braking",
  HARSH_ACCEL: "Harsh accel",
  HARSH_CORNER: "Harsh corner",
  IGNITION_ON: "Ignition ON",
  IGNITION_OFF: "Ignition OFF",
  MOVING: "Move start",
  STOPPED: "Move stop",
  GEOFENCE_ENTER: "Geofence in",
  GEOFENCE_EXIT: "Geofence out",
  POWER_CUT: "Power lost",
  POWER_RESTORED: "Power restored",
  GPS_LOST: "GPS lost",
  GPS_RESTORED: "GPS restored",
};

interface DeviceRow {
  id: string;
  imei: string;
  name: string;
  status: string;
  last_seen_at: string | null;
  device_model?: { manufacturer: string | null; model: string | null } | null;
}

interface VehicleRow {
  id: string;
  name: string;
  odometer: number | null;
}

interface ReportData {
  device: DeviceRow;
  latest: LatestPosition | null;
  log: Position[];
  vehicle: VehicleRow | null;
  openTrip: Trip | null;
  todayTrips: Trip[];
  todayEvents: DeviceEvent[];
  lastIgnitionOff: DeviceEvent | null;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return format(new Date(iso), "dd MMM yyyy, HH:mm:ss");
}

function headingLabel(course: number | null | undefined): string {
  if (course === null || course === undefined) return "—";
  return `${Math.round(course)}° ${COMPASS[Math.round(course / 45) % 8]}`;
}

function dopQuality(dop: number | null | undefined) {
  if (dop === null || dop === undefined) return { label: "—", cls: "text-muted-foreground" };
  if (dop <= 1) return { label: "Excellent", cls: "text-emerald-400" };
  if (dop <= 2) return { label: "Good", cls: "text-emerald-400" };
  if (dop <= 5) return { label: "Moderate", cls: "text-amber-400" };
  return { label: "Poor", cls: "text-rose-400" };
}

function boolLabel(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return "Unknown";
  return v ? "On" : "Off";
}

function operatorLabel(op: number | null | undefined): string {
  if (op === null || op === undefined) return "—";
  const s = String(op).padStart(5, "0");
  return `${s.slice(0, 3)}-${s.slice(3)} (MCC-MNC)`;
}

function Field({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-[13px] text-muted-foreground">{label}</span>
        </TooltipTrigger>
        {hint && (
          <TooltipContent side="top" className="text-xs">
            {hint}
          </TooltipContent>
        )}
      </Tooltip>
      <span className="text-right text-[13px] font-medium">{value}</span>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-border bg-card/60", className)}>
      <CardHeader className="pb-1 pt-4">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border/40 px-4 pb-3">{children}</CardContent>
    </Card>
  );
}

export default function AiReportPage() {
  const { currentOrg } = useAuth();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    if (!currentOrg) return;
    supabase
      .from("gps_devices")
      .select("id, imei, name, status, last_seen_at, device_model:device_models(manufacturer, model)")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(({ data: rows, error }) => {
        if (error) {
          showError(error.message);
          return;
        }
        const list = (rows ?? []) as unknown as DeviceRow[];
        setDevices(list);
        setDeviceId((prev) => prev || list[0]?.id || "");
      });
  }, [currentOrg]);

  const load = useCallback(async () => {
    if (!currentOrg || !deviceId) return;
    setLoading(true);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [deviceRes, latestRes, logRes, assignmentRes] = await Promise.all([
      supabase
        .from("gps_devices")
        .select("id, imei, name, status, last_seen_at, device_model:device_models(manufacturer, model)")
        .eq("id", deviceId)
        .maybeSingle(),
      supabase.from("latest_positions").select("*").eq("device_id", deviceId).maybeSingle(),
      supabase
        .from("positions")
        .select("*")
        .eq("device_id", deviceId)
        .order("recorded_at", { ascending: false })
        .limit(60),
      supabase
        .from("device_assignments")
        .select("vehicle:vehicles(id, name, odometer)")
        .eq("device_id", deviceId)
        .is("unassigned_at", null)
        .maybeSingle(),
    ]);

    const error =
      deviceRes.error ?? latestRes.error ?? logRes.error ?? assignmentRes.error;
    if (error) {
      setLoading(false);
      showError(error.message);
      return;
    }

    const device = deviceRes.data as unknown as DeviceRow;
    const vehicle = (assignmentRes.data as unknown as { vehicle: VehicleRow | null } | null)?.vehicle ?? null;

    const [openTripRes, todayTripsRes, todayEventsRes, ignitionOffRes] = await Promise.all([
      vehicle
        ? supabase
            .from("trips")
            .select("*")
            .eq("vehicle_id", vehicle.id)
            .eq("status", "IN_PROGRESS")
            .order("start_time", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      vehicle
        ? supabase
            .from("trips")
            .select("*")
            .eq("vehicle_id", vehicle.id)
            .eq("status", "COMPLETED")
            .gte("start_time", startOfDay.toISOString())
            .order("start_time", { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase
        .from("device_events")
        .select("*")
        .eq("device_id", deviceId)
        .gte("created_at", startOfDay.toISOString())
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("device_events")
        .select("*")
        .eq("device_id", deviceId)
        .eq("type", "IGNITION_OFF")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setLoading(false);

    setData({
      device,
      latest: (latestRes.data ?? null) as unknown as LatestPosition | null,
      log: (logRes.data ?? []) as unknown as Position[],
      vehicle,
      openTrip: (openTripRes.data ?? null) as unknown as Trip | null,
      todayTrips: (todayTripsRes.data ?? []) as unknown as Trip[],
      todayEvents: (todayEventsRes.data ?? []) as unknown as DeviceEvent[],
      lastIgnitionOff: (ignitionOffRes.data ?? null) as unknown as DeviceEvent | null,
    });
    setLastRefresh(new Date());
  }, [currentOrg, deviceId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const analytics = useMemo(() => {
    if (!data) return null;
    const now = Date.now();

    const open = data.openTrip;
    const openStart = open ? new Date(open.start_time).getTime() : null;
    const runningDistance =
      open && open.start_odometer != null && data.vehicle?.odometer != null
        ? Math.max(0, data.vehicle.odometer - open.start_odometer)
        : open?.distance_km ?? 0;
    const runningMinutes = openStart ? (now - openStart) / 60_000 : 0;

    const todayDistance =
      data.todayTrips.reduce((sum, t) => sum + (t.distance_km ?? 0), 0) + runningDistance;
    const todayMinutes =
      data.todayTrips.reduce((sum, t) => sum + (tripDurationMinutes(t.start_time, t.end_time) ?? 0), 0) +
      runningMinutes;

    const idleSince = data.latest?.idle_since ? new Date(data.latest.idle_since).getTime() : null;
    const idleMinutes = idleSince ? (now - idleSince) / 60_000 : null;

    const stopSince =
      data.latest?.ignition === false && data.lastIgnitionOff
        ? (now - new Date(data.lastIgnitionOff.created_at).getTime()) / 60_000
        : null;

    return {
      runningDistance,
      runningMinutes,
      todayDistance,
      todayMinutes,
      idleMinutes,
      stopMinutes: stopSince,
    };
  }, [data]);

  const eventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of data?.todayEvents ?? []) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    return counts;
  }, [data]);

  const isOnline =
    !!data?.device.last_seen_at &&
    Date.now() - new Date(data.device.last_seen_at).getTime() < ONLINE_WINDOW_MS;

  const selectedDevice = devices.find((d) => d.id === deviceId);

  return (
    <div>
      <PageHeader
        title="AI Report"
        description="Complete per-minute telemetry extract for every tracker — device, location, GNSS quality, power, network, events and derived analytics"
        actions={
          <Button variant="outline" size="sm" className="border-border bg-card/60" onClick={load} disabled={loading || !deviceId}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={deviceId} onValueChange={setDeviceId}>
          <SelectTrigger className="w-full bg-card/60 sm:w-[340px]">
            <SelectValue placeholder="Select a tracker" />
          </SelectTrigger>
          <SelectContent>
            {devices.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name} · {d.imei}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedDevice && data && (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "font-medium",
                isOnline
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                  : "border-rose-500/25 bg-rose-500/10 text-rose-400",
              )}
            >
              {isOnline ? "Online" : "Offline"}
            </Badge>
            {lastRefresh && (
              <span className="text-xs text-muted-foreground">
                Auto-refreshes every minute · last {format(lastRefresh, "HH:mm:ss")}
              </span>
            )}
          </div>
        )}
      </div>

      {devices.length === 0 ? (
        <EmptyState
          icon={BrainCircuit}
          title="No trackers registered"
          description="Register a GPS device under Assets → GPS Devices to unlock its full telemetry report."
        />
      ) : loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : !data?.latest ? (
        <EmptyState
          icon={Satellite}
          title="Waiting for the first transmission"
          description="This tracker is registered but hasn't reported a position yet. Data appears here within a minute of its first ping."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {/* DEVICE */}
            <SectionCard icon={BrainCircuit} title="Device">
              <Field label="IMEI" value={data.device.imei} />
              <Field
                label="Device model"
                value={
                  data.device.device_model?.model
                    ? `${data.device.device_model.manufacturer ?? ""} ${data.device.device_model.model}`.trim()
                    : data.device.name
                }
              />
              <Field
                label="Last seen"
                value={
                  data.device.last_seen_at
                    ? formatDistanceToNow(new Date(data.device.last_seen_at), { addSuffix: true })
                    : "Never"
                }
              />
              <Field
                label="Online status"
                value={
                  <span className={isOnline ? "text-emerald-400" : "text-rose-400"}>
                    {isOnline ? "● Online" : "● Offline"}
                  </span>
                }
                hint="Online = reported within the last 10 minutes"
              />
            </SectionCard>

            {/* LOCATION */}
            <SectionCard icon={MapPin} title="Location">
              <Field label="Latitude" value={data.latest.latitude.toFixed(6)} />
              <Field label="Longitude" value={data.latest.longitude.toFixed(6)} />
              <Field label="Timestamp (device)" value={fmtDateTime(data.latest.recorded_at)} />
              <Field label="Server received" value={fmtDateTime(data.latest.updated_at)} />
              <Field
                label="Speed"
                value={data.latest.speed != null ? `${data.latest.speed} km/h` : "—"}
              />
              <Field label="Heading" value={headingLabel(data.latest.course)} />
              <Field
                label="Altitude"
                value={data.latest.altitude != null ? `${data.latest.altitude} m` : "—"}
              />
            </SectionCard>

            {/* GPS QUALITY */}
            <SectionCard icon={Satellite} title="GPS quality">
              <Field
                label="GNSS status"
                value={data.latest.gnss_status != null ? (GNSS_STATUS[data.latest.gnss_status] ?? `Code ${data.latest.gnss_status}`) : "—"}
              />
              <Field label="Satellites" value={data.latest.satellites ?? "—"} />
              <Field
                label="HDOP"
                value={
                  <span className={dopQuality(data.latest.hdop).cls}>
                    {data.latest.hdop ?? "—"}
                    {data.latest.hdop != null && ` · ${dopQuality(data.latest.hdop).label}`}
                  </span>
                }
                hint="Horizontal dilution of precision — lower is better"
              />
              <Field
                label="PDOP"
                value={
                  <span className={dopQuality(data.latest.pdop).cls}>
                    {data.latest.pdop ?? "—"}
                    {data.latest.pdop != null && ` · ${dopQuality(data.latest.pdop).label}`}
                  </span>
                }
                hint="Position (3D) dilution of precision — lower is better"
              />
            </SectionCard>

            {/* VEHICLE STATUS */}
            <SectionCard icon={Gauge} title="Vehicle status">
              <Field
                label="Ignition"
                value={
                  <span
                    className={
                      data.latest.ignition === true
                        ? "text-emerald-400"
                        : data.latest.ignition === false
                          ? "text-muted-foreground"
                          : ""
                    }
                  >
                    {boolLabel(data.latest.ignition)}
                  </span>
                }
              />
              <Field label="Movement" value={boolLabel(data.latest.movement)} />
              <Field
                label="Sleep mode"
                value={
                  data.latest.sleep_mode != null
                    ? (SLEEP_MODES[data.latest.sleep_mode] ?? `Code ${data.latest.sleep_mode}`)
                    : "—"
                }
              />
              <Field label="Door" value={boolLabel(data.latest.door_open)} />
            </SectionCard>

            {/* POWER */}
            <SectionCard icon={Zap} title="Power">
              <Field
                label="External voltage"
                value={
                  data.latest.external_voltage_mv != null
                    ? `${(data.latest.external_voltage_mv / 1000).toFixed(2)} V`
                    : data.latest.external_power === true
                      ? "Present"
                      : "—"
                }
              />
              <Field
                label="Battery voltage"
                value={
                  data.latest.battery_voltage_mv != null
                    ? `${(data.latest.battery_voltage_mv / 1000).toFixed(2)} V`
                    : "—"
                }
              />
              <Field
                label="Battery current"
                value={
                  data.latest.battery_current_ma != null
                    ? `${data.latest.battery_current_ma} mA`
                    : "—"
                }
              />
              <Field
                label="Battery level"
                value={
                  data.latest.battery_level != null ? `${data.latest.battery_level}%` : "—"
                }
              />
            </SectionCard>

            {/* NETWORK */}
            <SectionCard icon={Signal} title="Network">
              <Field
                label="GSM signal"
                value={
                  data.latest.gsm_signal != null
                    ? `${"▮".repeat(Math.max(0, data.latest.gsm_signal))}${"▯".repeat(Math.max(0, 5 - data.latest.gsm_signal))} ${GSM_BARS[data.latest.gsm_signal] ?? data.latest.gsm_signal}`
                    : "—"
                }
              />
              <Field label="Active GSM operator" value={operatorLabel(data.latest.gsm_operator)} />
              <Field
                label="Data mode"
                value={isOnline ? "GPRS / TCP (packet data)" : "Offline"}
                hint="How the tracker currently transmits to the platform"
              />
            </SectionCard>

            {/* EVENTS */}
            <SectionCard icon={Activity} title="Events · today" className="md:col-span-2">
              <div className="flex flex-wrap gap-2 py-2">
                {REPORTED_EVENT_TYPES.map((type) => {
                  const count = eventCounts.get(type) ?? 0;
                  return (
                    <Badge
                      key={type}
                      variant="outline"
                      className={cn(
                        "font-medium",
                        count > 0
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground/60",
                      )}
                    >
                      {EVENT_SHORT[type]}: {count}
                    </Badge>
                  );
                })}
              </div>
              {data.todayEvents.length > 0 && (
                <div className="mt-1 space-y-1 border-t border-border/40 pt-2">
                  {data.todayEvents.slice(0, 6).map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate text-muted-foreground">
                        {EVENT_SHORT[e.type] ?? e.type}
                      </span>
                      <span className="shrink-0 text-muted-foreground/70">
                        {format(new Date(e.created_at), "HH:mm:ss")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* DERIVED ANALYTICS */}
          {analytics && (
            <SectionCard icon={Timer} title="Derived analytics">
              <div className="grid gap-x-10 py-1 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <Field
                    label="Trip distance (current)"
                    value={
                      data.openTrip
                        ? `${analytics.runningDistance.toFixed(2)} km`
                        : "No active trip"
                    }
                  />
                  <Field
                    label="Trip duration (current)"
                    value={
                      data.openTrip ? formatDuration(analytics.runningMinutes) : "No active trip"
                    }
                  />
                  <Field
                    label="Idle duration"
                    value={
                      analytics.idleMinutes != null
                        ? formatDuration(analytics.idleMinutes)
                        : "Not idling"
                    }
                  />
                </div>
                <div>
                  <Field
                    label="Stop duration"
                    value={
                      analytics.stopMinutes != null
                        ? formatDuration(analytics.stopMinutes)
                        : "Vehicle in use"
                    }
                    hint="Time since ignition was last switched off"
                  />
                  <Field label="Daily distance" value={`${analytics.todayDistance.toFixed(1)} km`} />
                  <Field label="Daily driving time" value={formatDuration(analytics.todayMinutes)} />
                </div>
                <div>
                  <Field
                    label="Last known location"
                    value={
                      <a
                        className="text-primary hover:underline"
                        href={`https://maps.google.com/?q=${data.latest.latitude},${data.latest.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {data.latest.latitude.toFixed(5)}, {data.latest.longitude.toFixed(5)}
                      </a>
                    }
                  />
                  <Field label="Vehicle" value={data.vehicle?.name ?? "Unassigned"} />
                  <Field
                    label="Odometer"
                    value={data.vehicle?.odometer != null ? `${data.vehicle.odometer} km` : "—"}
                  />
                </div>
                <div>
                  <Field label="Trips today (completed)" value={String(data.todayTrips.length)} />
                  <Field
                    label="Auto trip in progress"
                    value={data.openTrip?.auto_generated ? "Yes" : data.openTrip ? "Manual" : "No"}
                  />
                  <Field
                    label="Log entries (last hour)"
                    value={String(data.log.length)}
                    hint="Per-minute telemetry rows retained for this view"
                  />
                </div>
              </div>
            </SectionCard>
          )}

          {/* PER-MINUTE LOG */}
          <Card className="border-border bg-card/60">
            <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Compass className="h-4 w-4 text-primary" />
                Live telemetry log — per minute
              </CardTitle>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <BatteryCharging className="h-3.5 w-3.5" />
                newest {data.log.length} records
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4">Time (device)</TableHead>
                      <TableHead>Lat</TableHead>
                      <TableHead>Lon</TableHead>
                      <TableHead>km/h</TableHead>
                      <TableHead className="hidden md:table-cell">Head</TableHead>
                      <TableHead className="hidden lg:table-cell">Alt</TableHead>
                      <TableHead className="hidden md:table-cell">Sats</TableHead>
                      <TableHead className="hidden xl:table-cell">HDOP</TableHead>
                      <TableHead className="hidden xl:table-cell">PDOP</TableHead>
                      <TableHead className="hidden sm:table-cell">Ign</TableHead>
                      <TableHead className="hidden lg:table-cell">Move</TableHead>
                      <TableHead className="hidden lg:table-cell">Ext V</TableHead>
                      <TableHead className="hidden xl:table-cell">Batt V</TableHead>
                      <TableHead className="hidden xl:table-cell">GSM</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.log.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap pl-4 text-xs">
                          {format(new Date(p.recorded_at), "HH:mm:ss")}
                        </TableCell>
                        <TableCell className="text-xs">{p.latitude.toFixed(5)}</TableCell>
                        <TableCell className="text-xs">{p.longitude.toFixed(5)}</TableCell>
                        <TableCell className="text-xs">{p.speed ?? "—"}</TableCell>
                        <TableCell className="hidden text-xs md:table-cell">
                          {headingLabel(p.course)}
                        </TableCell>
                        <TableCell className="hidden text-xs lg:table-cell">
                          {p.altitude ?? "—"}
                        </TableCell>
                        <TableCell className="hidden text-xs md:table-cell">
                          {p.satellites ?? "—"}
                        </TableCell>
                        <TableCell className="hidden text-xs xl:table-cell">{p.hdop ?? "—"}</TableCell>
                        <TableCell className="hidden text-xs xl:table-cell">{p.pdop ?? "—"}</TableCell>
                        <TableCell className="hidden text-xs sm:table-cell">
                          {p.ignition == null ? "—" : p.ignition ? "ON" : "off"}
                        </TableCell>
                        <TableCell className="hidden text-xs lg:table-cell">
                          {p.movement == null ? "—" : p.movement ? "yes" : "no"}
                        </TableCell>
                        <TableCell className="hidden text-xs lg:table-cell">
                          {p.external_voltage_mv != null
                            ? `${(p.external_voltage_mv / 1000).toFixed(1)}V`
                            : p.external_power === true
                              ? "OK"
                              : "—"}
                        </TableCell>
                        <TableCell className="hidden text-xs xl:table-cell">
                          {p.battery_voltage_mv != null
                            ? `${(p.battery_voltage_mv / 1000).toFixed(2)}V`
                            : p.battery_level != null
                              ? `${p.battery_level}%`
                              : "—"}
                        </TableCell>
                        <TableCell className="hidden text-xs xl:table-cell">
                          {p.gsm_signal ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
