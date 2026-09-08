import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Car,
  CircleDot,
  Gauge,
  MapPin,
  MoveRight,
  Power,
  PowerOff,
  RefreshCw,
  Satellite,
  Signal,
  Smartphone,
  Siren,
  Timer,
  Wifi,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { formatDuration, tripDurationMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DeviceEvent, LatestPosition, Position, Trip } from "@/types/database";

const ONLINE_WINDOW_MS = 10 * 60 * 1000;
const RAW_PAGE_SIZE = 25;

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const GSM_BARS = ["No signal", "Very poor", "Poor", "Fair", "Good", "Excellent"];

const SLEEP_MODES: Record<number, string> = {
  0: "Awake",
  1: "Deep sleep",
  2: "GPS sleep",
  3: "Online sleep",
};

const EVENT_META: Record<string, { label: string; icon: React.ElementType; tone: string }> = {
  IGNITION_ON: { label: "Ignition turned on", icon: Power, tone: "text-emerald-400" },
  IGNITION_OFF: { label: "Ignition turned off", icon: PowerOff, tone: "text-muted-foreground" },
  MOVING: { label: "Started moving", icon: MoveRight, tone: "text-sky-400" },
  STOPPED: { label: "Stopped moving", icon: CircleDot, tone: "text-muted-foreground" },
  OVERSPEED: { label: "Speed limit exceeded", icon: Gauge, tone: "text-amber-400" },
  HARSH_ACCEL: { label: "Harsh acceleration", icon: Zap, tone: "text-amber-400" },
  HARSH_BRAKE: { label: "Harsh braking", icon: Zap, tone: "text-amber-400" },
  HARSH_CORNER: { label: "Harsh cornering", icon: Zap, tone: "text-amber-400" },
  CRASH: { label: "Crash detected", icon: AlertTriangle, tone: "text-rose-400" },
  PANIC: { label: "Panic button pressed", icon: Siren, tone: "text-rose-400" },
  TOWING: { label: "Possible towing", icon: AlertTriangle, tone: "text-rose-400" },
  JAMMING: { label: "Signal jamming", icon: Wifi, tone: "text-rose-400" },
  ALARM: { label: "Alarm triggered", icon: Siren, tone: "text-rose-400" },
  POWER_CUT: { label: "External power lost", icon: PowerOff, tone: "text-rose-400" },
  POWER_RESTORED: { label: "External power restored", icon: Power, tone: "text-emerald-400" },
  GPS_LOST: { label: "GPS fix lost", icon: Satellite, tone: "text-amber-400" },
  GPS_RESTORED: { label: "GPS fix restored", icon: Satellite, tone: "text-emerald-400" },
  GEOFENCE_ENTER: { label: "Entered geofence", icon: MapPin, tone: "text-sky-400" },
  GEOFENCE_EXIT: { label: "Exited geofence", icon: MapPin, tone: "text-sky-400" },
  IDLE: { label: "Excessive idling", icon: Timer, tone: "text-amber-400" },
  LOW_BATTERY: { label: "Low device battery", icon: BatteryCharging, tone: "text-amber-400" },
  DOOR_OPEN: { label: "Door opened", icon: CircleDot, tone: "text-muted-foreground" },
  DOOR_CLOSE: { label: "Door closed", icon: CircleDot, tone: "text-muted-foreground" },
  DRIVER_IDENTIFIED: { label: "Driver identified", icon: Smartphone, tone: "text-sky-400" },
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
  vehicle: VehicleRow | null;
  openTrip: Trip | null;
  todayTrips: Trip[];
  todayEvents: DeviceEvent[];
  lastIgnitionOff: DeviceEvent | null;
}

function fmtCoords(p: Pick<Position, "latitude" | "longitude">, precision = 5): string {
  return `${p.latitude.toFixed(precision)}, ${p.longitude.toFixed(precision)}`;
}

function headingLabel(course: number | null | undefined): string {
  if (course === null || course === undefined) return "—";
  return `${Math.round(course)}° ${COMPASS[Math.round(course / 45) % 8]}`;
}

function dopQuality(dop: number | null | undefined) {
  if (dop === null || dop === undefined) return null;
  if (dop <= 1) return { label: "Excellent", cls: "text-emerald-400" };
  if (dop <= 2) return { label: "Good", cls: "text-emerald-400" };
  if (dop <= 5) return { label: "Moderate", cls: "text-amber-400" };
  return { label: "Poor", cls: "text-rose-400" };
}

function operatorLabel(op: number | null | undefined): string | null {
  if (op === null || op === undefined) return null;
  const s = String(op).padStart(5, "0");
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

/** A row in the hero/health cards. Hidden gracefully when value is null. */
function Field({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className="text-[13px] font-medium">{value}</span>
        {sub != null && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}

export default function AiReportPage() {
  const { currentOrg } = useAuth();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

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

    const [deviceRes, latestRes, assignmentRes] = await Promise.all([
      supabase
        .from("gps_devices")
        .select("id, imei, name, status, last_seen_at, device_model:device_models(manufacturer, model)")
        .eq("id", deviceId)
        .maybeSingle(),
      supabase.from("latest_positions").select("*").eq("device_id", deviceId).maybeSingle(),
      supabase
        .from("device_assignments")
        .select("vehicle:vehicles(id, name, odometer)")
        .eq("device_id", deviceId)
        .is("unassigned_at", null)
        .maybeSingle(),
    ]);

    const error = deviceRes.error ?? latestRes.error ?? assignmentRes.error;
    if (error) {
      setLoading(false);
      showError(error.message);
      return;
    }

    const device = deviceRes.data as unknown as DeviceRow;
    const vehicle =
      (assignmentRes.data as unknown as { vehicle: VehicleRow | null } | null)?.vehicle ?? null;

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
            .in("status", ["COMPLETED", "IN_PROGRESS"])
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

    setData({
      device,
      latest: (latestRes.data ?? null) as unknown as LatestPosition | null,
      vehicle,
      openTrip: (openTripRes.data ?? null) as unknown as Trip | null,
      todayTrips: (todayTripsRes.data ?? []) as unknown as Trip[],
      todayEvents: (todayEventsRes.data ?? []) as unknown as DeviceEvent[],
      lastIgnitionOff: (ignitionOffRes.data ?? null) as unknown as DeviceEvent | null,
    });
    setLoading(false);
  }, [currentOrg, deviceId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  /* ---------- Paginated raw telemetry (independent of the overview refresh) ---------- */
  const [rawPage, setRawPage] = useState(0);
  const [rawLog, setRawLog] = useState<Position[]>([]);
  const [rawTotal, setRawTotal] = useState(0);
  const [rawLoading, setRawLoading] = useState(false);

  useEffect(() => {
    setRawPage(0);
  }, [deviceId]);

  const loadRawPage = useCallback(async () => {
    if (!deviceId) return;
    setRawLoading(true);
    const from = rawPage * RAW_PAGE_SIZE;
    const to = from + RAW_PAGE_SIZE - 1;
    const { data: rows, count, error } = await supabase
      .from("positions")
      .select("*", { count: "exact" })
      .eq("device_id", deviceId)
      .order("recorded_at", { ascending: false })
      .range(from, to);
    setRawLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setRawLog((rows ?? []) as unknown as Position[]);
    setRawTotal(count ?? 0);
  }, [deviceId, rawPage]);

  useEffect(() => {
    loadRawPage();
  }, [loadRawPage]);

  const rawPageCount = Math.max(1, Math.ceil(rawTotal / RAW_PAGE_SIZE));

  const isOnline =
    !!data?.device.last_seen_at &&
    Date.now() - new Date(data.device.last_seen_at).getTime() < ONLINE_WINDOW_MS;

  /* ---------- Derived analytics ---------- */
  const analytics = useMemo(() => {
    if (!data) return null;
    const now = Date.now();

    const open = data.openTrip;
    const runningDistance =
      open && open.start_odometer != null && data.vehicle?.odometer != null
        ? Math.max(0, data.vehicle.odometer - open.start_odometer)
        : open?.distance_km ?? 0;
    const runningMinutes = open ? (now - new Date(open.start_time).getTime()) / 60_000 : 0;

    const completed = data.todayTrips.filter((t) => t.status === "COMPLETED");
    const todayDistance =
      completed.reduce((sum, t) => sum + (t.distance_km ?? 0), 0) + runningDistance;
    const todayMinutes =
      completed.reduce((sum, t) => sum + (tripDurationMinutes(t.start_time, t.end_time) ?? 0), 0) +
      runningMinutes;

    const idleSince = data.latest?.idle_since ? new Date(data.latest.idle_since).getTime() : null;
    const stopMinutes =
      data.latest?.ignition === false && data.lastIgnitionOff
        ? (now - new Date(data.lastIgnitionOff.created_at).getTime()) / 60_000
        : null;
    const stationaryMinutes =
      data.latest && (data.latest.speed ?? 0) <= 2
        ? (now - new Date(data.latest.recorded_at).getTime()) / 60_000
        : null;

    const stopCount = data.todayEvents.filter((e) => e.type === "STOPPED").length;

    return {
      runningDistance,
      runningMinutes,
      todayDistance,
      todayMinutes,
      tripCount: data.todayTrips.length,
      idleMinutes: idleSince ? (now - idleSince) / 60_000 : null,
      stopMinutes,
      stationaryMinutes,
      stopCount,
    };
  }, [data]);

  /* ---------- AI insight rules ---------- */
  const insights = useMemo(() => {
    if (!data?.latest || !analytics) return [];
    const out: { tone: "ok" | "warn" | "alert" | "neutral"; text: string }[] = [];
    const l = data.latest;

    if (!isOnline) {
      out.push({
        tone: "alert",
        text: `Tracker is offline — last contact ${formatDistanceToNow(new Date(data.device.last_seen_at!), { addSuffix: true })}. Data below may be stale.`,
      });
    } else {
      out.push({ tone: "ok", text: "Tracker is communicating normally." });
    }

    if (l.ignition === false && analytics.stopMinutes != null) {
      out.push({
        tone: "neutral",
        text: `Vehicle has been parked with ignition off for ${formatDuration(analytics.stopMinutes)}.`,
      });
    } else if (l.ignition === true && (l.speed ?? 0) <= 2) {
      out.push({ tone: "neutral", text: "Engine is running but the vehicle is stationary." });
    } else if ((l.speed ?? 0) > 2) {
      out.push({
        tone: "neutral",
        text: `Vehicle is currently moving at ${Math.round(l.speed ?? 0)} km/h ${data.latest.course != null ? `heading ${headingLabel(l.course)}` : ""}.`,
      });
    }

    if (l.satellites != null) {
      out.push(
        l.satellites >= 5
          ? { tone: "ok", text: `GPS reception is strong (${l.satellites} satellites).` }
          : { tone: "warn", text: `GPS reception is weak (${l.satellites} satellites).` },
      );
    }

    const criticalToday = data.todayEvents.filter((e) =>
      ["CRASH", "PANIC", "TOWING", "JAMMING", "ALARM", "POWER_CUT"].includes(e.type),
    ).length;
    const harshToday = data.todayEvents.filter((e) =>
      ["HARSH_ACCEL", "HARSH_BRAKE", "HARSH_CORNER", "OVERSPEED"].includes(e.type),
    ).length;

    if (criticalToday > 0) {
      out.push({
        tone: "alert",
        text: `${criticalToday} critical alert${criticalToday === 1 ? "" : "s"} recorded today — review the Events tab.`,
      });
    } else if (harshToday > 0) {
      out.push({
        tone: "warn",
        text: `${harshToday} driving-behavior event${harshToday === 1 ? "" : "s"} today (speeding or harsh maneuvers).`,
      });
    } else {
      out.push({ tone: "ok", text: "No aggressive driving or tampering detected today." });
    }

    return out;
  }, [data, analytics, isOnline]);

  /* ---------- Unified activity timeline ---------- */
  const timeline = useMemo(() => {
    if (!data) return [];
    const items: {
      key: string;
      time: string;
      icon: React.ElementType;
      tone: string;
      title: string;
      detail?: string;
    }[] = [];

    for (const e of data.todayEvents) {
      const meta = EVENT_META[e.type] ?? {
        label: e.type,
        icon: CircleDot,
        tone: "text-muted-foreground",
      };
      items.push({
        key: `ev-${e.id}`,
        time: e.created_at,
        icon: meta.icon,
        tone: meta.tone,
        title: meta.label,
        detail: e.message ?? undefined,
      });
    }

    for (const t of data.todayTrips) {
      items.push({
        key: `trip-${t.id}-start`,
        time: t.start_time,
        icon: Car,
        tone: "text-sky-400",
        title: "Trip started",
        detail: t.start_location ?? undefined,
      });
      if (t.end_time) {
        items.push({
          key: `trip-${t.id}-end`,
          time: t.end_time,
          icon: CircleDot,
          tone: "text-muted-foreground",
          title: `Trip ended — ${t.distance_km != null ? `${t.distance_km} km` : ""}${t.end_time ? ` · ${formatDuration(tripDurationMinutes(t.start_time, t.end_time) ?? 0)}` : ""}`,
          detail: t.end_location ?? undefined,
        });
      }
    }

    return items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [data]);

  const locationAddress = data?.latest?.address ?? null;

  const gpsQuality = data?.latest
    ? (dopQuality(data.latest.hdop) ?? dopQuality(data.latest.pdop))
    : null;

  return (
    <div>
      <PageHeader
        title="AI Report"
        description="What is happening now, what happened today, and why — with full telemetry available on demand."
        actions={
          <div className="flex items-center gap-2">
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger className="w-[260px] bg-card/60">
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
            <Button
              variant="outline"
              size="sm"
              className="border-border bg-card/60"
              onClick={() => {
                load();
                loadRawPage();
              }}
              disabled={loading || !deviceId}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      {devices.length === 0 ? (
        <EmptyState
          icon={BrainCircuit}
          title="No trackers registered"
          description="Register a GPS device under Assets → GPS Devices to unlock its full telemetry report."
        />
      ) : loading && !data ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : !data?.latest ? (
        <EmptyState
          icon={Satellite}
          title="Waiting for the first transmission"
          description="This tracker is registered but hasn't reported a position yet. Data appears here within a minute of its first ping."
        />
      ) : (
        <div className="space-y-4">
          {/* ============ LEVEL 1 — WHAT'S HAPPENING NOW ============ */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-border bg-card/60">
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Signal className="h-4 w-4 text-primary" /> Tracker
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "relative flex h-3 w-3",
                      isOnline ? "text-emerald-400" : "text-rose-400",
                    )}
                  >
                    {isOnline && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
                    )}
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-current" />
                  </span>
                  <span
                    className={cn(
                      "text-xl font-bold tracking-tight",
                      isOnline ? "text-emerald-400" : "text-rose-400",
                    )}
                  >
                    {isOnline ? "Online" : "Offline"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Last seen{" "}
                  {data.device.last_seen_at
                    ? formatDistanceToNow(new Date(data.device.last_seen_at), { addSuffix: true })
                    : "never"}
                </p>
                <p className="mt-2 truncate text-xs text-muted-foreground">
                  {data.device.device_model?.manufacturer ?? ""}{" "}
                  {data.device.device_model?.model ?? data.device.name} · IMEI {data.device.imei}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card/60">
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <MapPin className="h-4 w-4 text-primary" /> Current location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="truncate text-xl font-bold tracking-tight">
                  {locationAddress ?? fmtCoords(data.latest)}
                </p>
                {locationAddress && (
                  <p className="text-xs text-muted-foreground">{fmtCoords(data.latest)}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(data.latest.recorded_at), { addSuffix: true })}
                  {(data.latest.speed ?? 0) <= 2
                    ? " · Parked"
                    : ` · ${Math.round(data.latest.speed ?? 0)} km/h ${headingLabel(data.latest.course)}`}
                </p>
                <a
                  href={`https://maps.google.com/?q=${data.latest.latitude},${data.latest.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  View on map <MoveRight className="h-3 w-3" />
                </a>
              </CardContent>
            </Card>

            <Card className="border-border bg-card/60">
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Timer className="h-4 w-4 text-primary" /> Today
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold tracking-tight">
                  {analytics ? analytics.todayDistance.toFixed(1) : "0.0"} km
                </p>
                <p className="text-xs text-muted-foreground">
                  {analytics ? formatDuration(analytics.todayMinutes) : "0m"} driving ·{" "}
                  {analytics?.tripCount ?? 0} trips
                </p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                  {analytics && analytics.stopCount > 0 && (
                    <span className="text-muted-foreground">{analytics.stopCount} stops</span>
                  )}
                  {data.openTrip && (
                    <span className="font-medium text-sky-400">
                      Trip in progress — {analytics!.runningDistance.toFixed(1)} km so far
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ============ AI INSIGHT ============ */}
          <Card className="border-primary/25 bg-primary/5">
            <CardHeader className="pb-1 pt-4">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                <BrainCircuit className="h-4 w-4" /> AI Insight
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {insights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm">
                  {insight.tone === "ok" && (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  )}
                  {insight.tone === "warn" && (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  )}
                  {insight.tone === "alert" && (
                    <Siren className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  )}
                  {insight.tone === "neutral" && (
                    <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                  )}
                  <span>{insight.text}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ============ TABS ============ */}
          <Tabs defaultValue="overview">
            <TabsList className="bg-card/60">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="events">
                Events{data.todayEvents.length > 0 ? ` (${data.todayEvents.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="trips">
                Trips{data.todayTrips.length > 0 ? ` (${data.todayTrips.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="raw">Raw Telemetry</TabsTrigger>
            </TabsList>

            {/* ---------- OVERVIEW ---------- */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Vehicle activity */}
                <Card className="border-border bg-card/60">
                  <CardHeader className="pb-1 pt-4">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Car className="h-4 w-4 text-primary" /> Vehicle activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="divide-y divide-border/40">
                    <Field
                      label="Status"
                      value={
                        (data.latest.speed ?? 0) > 2
                          ? "Moving"
                          : data.latest.ignition === true
                            ? "Running — stationary"
                            : ((data.latest.speed ?? 0) <= 2 ? "Parked" : "—")
                      }
                    />
                    <Field
                      label="Speed"
                      value={data.latest.speed != null ? `${data.latest.speed} km/h` : "—"}
                    />
                    <Field
                      label="Ignition"
                      value={
                        data.latest.ignition == null ? null : data.latest.ignition ? (
                          <span className="text-emerald-400">On</span>
                        ) : (
                          "Off"
                        )
                      }
                    />
                    {data.latest.movement != null && (
                      <Field
                        label="Movement"
                        value={data.latest.movement ? "Detected" : "Not detected"}
                      />
                    )}
                    {analytics?.stopMinutes != null && (
                      <Field
                        label="Stopped for"
                        value={formatDuration(analytics.stopMinutes)}
                      />
                    )}
                    {analytics?.idleMinutes != null && analytics.idleMinutes > 1 && (
                      <Field label="Idling for" value={formatDuration(analytics.idleMinutes)} />
                    )}
                  </CardContent>
                </Card>

                {/* Tracker health — merged device/power/network/gps */}
                <Card className="border-border bg-card/60">
                  <CardHeader className="pb-1 pt-4">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <BatteryCharging className="h-4 w-4 text-primary" /> Tracker health
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="divide-y divide-border/40">
                    <Field
                      label="Network"
                      value={`${isOnline ? "Online" : "Offline"}${data.latest.gsm_signal != null ? ` · ${GSM_BARS[data.latest.gsm_signal] ?? data.latest.gsm_signal} signal${operatorLabel(data.latest.gsm_operator) ? ` · ${operatorLabel(data.latest.gsm_operator)}` : ""}` : ""}`}
                      sub={data.latest.sleep_mode != null && data.latest.sleep_mode > 0 ? SLEEP_MODES[data.latest.sleep_mode] : null}
                    />
                    {gpsQuality ? (
                      <Field
                        label="GPS"
                        value={
                          <span className={gpsQuality.cls}>
                            {gpsQuality.label}
                            {data.latest.satellites != null && ` (${data.latest.satellites} sats)`}
                          </span>
                        }
                      />
                    ) : data.latest.satellites != null ? (
                      <Field label="GPS" value={`${data.latest.satellites} satellites`} />
                    ) : null}
                    {data.latest.external_voltage_mv != null || data.latest.external_power != null ? (
                      <Field
                        label="External power"
                        value={
                          <span
                            className={
                              data.latest.external_power === false ? "text-rose-400" : undefined
                            }
                          >
                            {data.latest.external_voltage_mv != null
                              ? `${(data.latest.external_voltage_mv / 1000).toFixed(2)} V`
                              : data.latest.external_power
                                ? "Connected"
                                : "Disconnected"}
                          </span>
                        }
                      />
                    ) : null}
                    {data.latest.battery_voltage_mv != null || data.latest.battery_level != null ? (
                      <Field
                        label="Battery"
                        value={
                          data.latest.battery_voltage_mv != null
                            ? `${(data.latest.battery_voltage_mv / 1000).toFixed(2)} V${data.latest.battery_level != null ? ` · ${data.latest.battery_level}%` : ""}`
                            : `${data.latest.battery_level}%`
                        }
                      />
                    ) : null}
                  </CardContent>
                </Card>
              </div>

              {/* Quick glance day's events as compact summary chips */}
              {timeline.length > 0 && (
                <Card className="border-border bg-card/60">
                  <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Activity className="h-4 w-4 text-primary" /> Latest activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="relative space-y-4 before:absolute before:left-[7px] before:top-1 before:h-[calc(100%-12px)] before:w-px before:bg-border">
                      {timeline.slice(0, 4).map((item) => (
                        <div key={item.key} className="relative flex items-start gap-3 pl-6">
                          <span className="absolute left-0 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-card">
                            <item.icon className={cn("h-3.5 w-3.5", item.tone)} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-tight">{item.title}</p>
                            {item.detail && (
                              <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                            )}
                            <p className="text-xs text-muted-foreground/70">
                              {format(new Date(item.time), "HH:mm")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ---------- EVENTS TIMELINE ---------- */}
            <TabsContent value="events">
              <Card className="border-border bg-card/60">
                <CardContent className="pt-6">
                  {timeline.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No events recorded today. New activity appears here automatically.
                    </p>
                  ) : (
                    <div className="relative space-y-5 before:absolute before:left-[7px] before:top-1 before:h-[calc(100%-12px)] before:w-px before:bg-border">
                      {timeline.map((item) => (
                        <div key={item.key} className="relative flex items-start gap-4 pl-7">
                          <span className="absolute left-0 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-card">
                            <item.icon className={cn("h-3.5 w-3.5", item.tone)} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-tight">{item.title}</p>
                            {item.detail && (
                              <p className="text-xs text-muted-foreground">{item.detail}</p>
                            )}
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {format(new Date(item.time), "HH:mm:ss")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ---------- TRIPS ---------- */}
            <TabsContent value="trips">
              <Card className="border-border bg-card/60">
                <CardContent className="pt-6">
                  {data.todayTrips.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No trips recorded today.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {data.todayTrips.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-4 rounded-lg border border-border/60 bg-card/40 px-4 py-3"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <Car className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              {format(new Date(t.start_time), "HH:mm")}
                              {t.end_time ? ` – ${format(new Date(t.end_time), "HH:mm")}` : " —"}
                              {t.status === "IN_PROGRESS" && (
                                <Badge className="ml-2 border-sky-500/25 bg-sky-500/10 text-sky-400" variant="outline">
                                  In progress
                                </Badge>
                              )}
                            </p>
                            {(t.start_location || t.end_location) && (
                              <p className="truncate text-xs text-muted-foreground">
                                {t.start_location ?? "?"} → {t.end_location ?? "…"}
                              </p>
                            )}
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            {t.distance_km != null && <p className="font-medium">{t.distance_km} km</p>}
                            <p>{formatDuration(tripDurationMinutes(t.start_time, t.end_time) ?? (t.status === "IN_PROGRESS" ? analytics?.runningMinutes ?? 0 : 0))}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ---------- RAW TELEMETRY ---------- */}
            <TabsContent value="raw" className="space-y-4">
              {/* Detailed technical fields — only visible here */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-border bg-card/60">
                  <CardHeader className="pb-1 pt-4">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Satellite className="h-4 w-4 text-primary" /> GNSS detail
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="divide-y divide-border/40">
                    <Field label="Satellites" value={data.latest.satellites ?? "Not reported"} />
                    <Field
                      label="HDOP"
                      value={
                        data.latest.hdop != null
                          ? `${data.latest.hdop}${dopQuality(data.latest.hdop) ? ` · ${dopQuality(data.latest.hdop)!.label}` : ""}`
                          : "Not reported"
                      }
                    />
                    <Field
                      label="PDOP"
                      value={
                        data.latest.pdop != null
                          ? `${data.latest.pdop}${dopQuality(data.latest.pdop) ? ` · ${dopQuality(data.latest.pdop)!.label}` : ""}`
                          : "Not reported"
                      }
                    />
                    <Field label="GNSS status code" value={data.latest.gnss_status ?? "Not reported"} />
                  </CardContent>
                </Card>

                <Card className="border-border bg-card/60">
                  <CardHeader className="pb-1 pt-4">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Zap className="h-4 w-4 text-primary" /> Power detail
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="divide-y divide-border/40">
                    <Field
                      label="External voltage"
                      value={
                        data.latest.external_voltage_mv != null
                          ? `${(data.latest.external_voltage_mv / 1000).toFixed(2)} V`
                          : "Not reported"
                      }
                    />
                    <Field
                      label="Battery voltage"
                      value={
                        data.latest.battery_voltage_mv != null
                          ? `${(data.latest.battery_voltage_mv / 1000).toFixed(2)} V`
                          : "Not reported"
                      }
                    />
                    <Field
                      label="Battery current"
                      value={
                        data.latest.battery_current_ma != null
                          ? `${data.latest.battery_current_ma} mA`
                          : "Not reported"
                      }
                    />
                  </CardContent>
                </Card>

                <Card className="border-border bg-card/60">
                  <CardHeader className="pb-1 pt-4">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Signal className="h-4 w-4 text-primary" /> Network detail
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="divide-y divide-border/40">
                    <Field
                      label="GSM signal"
                      value={
                        data.latest.gsm_signal != null
                          ? `${"▮".repeat(data.latest.gsm_signal)}${"▯".repeat(5 - data.latest.gsm_signal)} ${GSM_BARS[data.latest.gsm_signal] ?? data.latest.gsm_signal}`
                          : "Not reported"
                      }
                    />
                    <Field
                      label="Operator (MCC-MNC)"
                      value={operatorLabel(data.latest.gsm_operator) ?? "Not reported"}
                    />
                    <Field
                      label="Sleep mode"
                      value={
                        data.latest.sleep_mode != null
                          ? (SLEEP_MODES[data.latest.sleep_mode] ?? `Code ${data.latest.sleep_mode}`)
                          : "Not reported"
                      }
                    />
                    <Field label="Device timestamp" value={format(new Date(data.latest.recorded_at), "dd MMM yyyy HH:mm:ss")} />
                    <Field label="Server received" value={format(new Date(data.latest.updated_at), "dd MMM yyyy HH:mm:ss")} />
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border bg-card/60">
                <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2 pt-4">
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Compass className="h-4 w-4 text-primary" /> Raw telemetry log
                    {rawTotal > 0 && (
                      <span className="normal-case text-muted-foreground/70">
                        · {rawTotal.toLocaleString()} records
                      </span>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 border-border bg-card/60"
                      disabled={rawLoading || rawPage <= 0}
                      onClick={() => setRawPage((p) => Math.max(0, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Page {rawPage + 1} of {rawPageCount}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 border-border bg-card/60"
                      disabled={rawLoading || rawPage >= rawPageCount - 1}
                      onClick={() => setRawPage((p) => Math.min(rawPageCount - 1, p + 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="pl-4">Time</TableHead>
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
                        {rawLoading ? (
                          <TableRow>
                            <TableCell colSpan={14} className="py-8 text-center text-sm text-muted-foreground">
                              Loading…
                            </TableCell>
                          </TableRow>
                        ) : rawLog.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={14} className="py-8 text-center text-sm text-muted-foreground">
                              No telemetry records yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          rawLog.map((p) => (
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
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
