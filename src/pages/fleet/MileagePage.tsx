import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Activity,
  BatteryCharging,
  CalendarDays,
  ChevronDown,
  Download,
  Gauge,
  Radio,
  Route,
  UserRound,
  WifiOff,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { downloadCsv, timestampSlug } from "@/lib/export";
import { showError } from "@/utils/toast";

type Tracker = {
  deviceId: string;
  deviceName: string;
  imei: string;
  vehicleId: string;
  vehicleName: string;
  registration: string | null;
};

type TelemetryPoint = {
  recorded_at: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  movement: boolean | null;
  ignition: boolean | null;
  battery_voltage_mv: number | null;
  battery_level: number | null;
  satellites: number | null;
};

type DailyMetric = {
  date: string;
  distance: number;
  stops: number;
  points: TelemetryPoint[];
  battery: number[];
  latest: TelemetryPoint;
};

const EARTH_RADIUS_KM = 6371;
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function distanceBetween(a: TelemetryPoint, b: TelemetryPoint) {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isMoving(point: TelemetryPoint) {
  return point.movement === true || (point.speed ?? 0) > 2;
}

function buildDailyMetrics(points: TelemetryPoint[]) {
  const grouped = new Map<string, TelemetryPoint[]>();
  for (const point of points) {
    const key = point.recorded_at.slice(0, 10);
    const day = grouped.get(key) ?? [];
    day.push(point);
    grouped.set(key, day);
  }

  return [...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, dayPoints]) => {
    const ordered = [...dayPoints].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
    let distance = 0;
    let stops = 0;
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      const gapMinutes = (new Date(current.recorded_at).getTime() - new Date(previous.recorded_at).getTime()) / 60000;
      const segment = distanceBetween(previous, current);
      if (gapMinutes <= 30 && segment < 10) distance += segment;
      if (isMoving(previous) && !isMoving(current)) stops += 1;
    }
    const battery = ordered.map((point) => point.battery_voltage_mv).filter((value): value is number => value !== null && value > 0);
    return { date, distance, stops, points: ordered, battery, latest: ordered[ordered.length - 1] } satisfies DailyMetric;
  });
}

function formatVoltage(millivolts: number | null) {
  return millivolts === null ? "—" : `${(millivolts / 1000).toFixed(1)} V`;
}

function formatDateLabel(value: string) {
  return format(new Date(`${value}T12:00:00`), "EEE");
}

function BatteryBars({ values }: { values: number[] }) {
  const sample = values.length > 0 ? values.filter((_, index) => index % Math.max(1, Math.ceil(values.length / 6)) === 0).slice(0, 6) : [];
  const min = sample.length ? Math.min(...sample) : 0;
  const max = sample.length ? Math.max(...sample) : 1;
  return (
    <div className="flex h-12 items-end gap-1.5">
      {(sample.length ? sample : [0, 0, 0, 0, 0, 0]).map((value, index) => {
        const height = value === 0 ? 24 : 26 + ((value - min) / Math.max(1, max - min)) * 20;
        return <span key={`${value}-${index}`} className={cn("w-3 rounded-t-sm", value === 0 ? "bg-muted" : value < 48000 ? "bg-amber-400" : "bg-emerald-400")} style={{ height }} />;
      })}
    </div>
  );
}

export default function MileagePage() {
  const { currentOrg } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [points, setPoints] = useState<TelemetryPoint[]>([]);
  const [latest, setLatest] = useState<TelemetryPoint | null>(null);
  const [driverName, setDriverName] = useState<string | null>(null);
  const [loadingTrackers, setLoadingTrackers] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  useEffect(() => {
    if (!currentOrg) return;
    setLoadingTrackers(true);
    supabase
      .from("device_assignments")
      .select("device_id,vehicle_id,device:gps_devices!device_assignments_device_id_fkey(id,name,imei),vehicle:vehicles!device_assignments_vehicle_id_fkey(id,name,registration_number)")
      .eq("organization_id", currentOrg.id)
      .is("unassigned_at", null)
      .then(({ data, error }) => {
        setLoadingTrackers(false);
        if (error) {
          showError(error.message);
          return;
        }
        const mapped = (data ?? []).flatMap((row) => {
          const item = row as unknown as { device_id: string; vehicle_id: string; device: { id: string; name: string; imei: string } | null; vehicle: { id: string; name: string; registration_number: string | null } | null };
          return item.device && item.vehicle ? [{ deviceId: item.device_id, deviceName: item.device.name, imei: item.device.imei, vehicleId: item.vehicle_id, vehicleName: item.vehicle.name, registration: item.vehicle.registration_number }] : [];
        });
        setTrackers(mapped);
        setSelectedDeviceId((current) => current || mapped[0]?.deviceId || "");
      });
  }, [currentOrg]);

  const selectedTracker = trackers.find((tracker) => tracker.deviceId === selectedDeviceId) ?? null;

  useEffect(() => {
    if (!currentOrg || !selectedTracker) return;
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 1).toISOString();
    setLoadingMetrics(true);
    Promise.all([
      supabase.from("positions").select("recorded_at,latitude,longitude,speed,movement,ignition,battery_voltage_mv,battery_level,satellites").eq("organization_id", currentOrg.id).eq("device_id", selectedTracker.deviceId).gte("recorded_at", start).lt("recorded_at", end).order("recorded_at", { ascending: true }).limit(10000),
      supabase.from("latest_positions").select("recorded_at,latitude,longitude,speed,movement,ignition,battery_voltage_mv,battery_level,satellites").eq("device_id", selectedTracker.deviceId).maybeSingle(),
      supabase.from("drivers").select("name").eq("organization_id", currentOrg.id).eq("vehicle_id", selectedTracker.vehicleId).eq("status", "ACTIVE").limit(1).maybeSingle(),
    ]).then(([historyResult, latestResult, driverResult]) => {
      setLoadingMetrics(false);
      if (historyResult.error) showError(historyResult.error.message);
      setPoints((historyResult.data ?? []) as unknown as TelemetryPoint[]);
      setLatest((latestResult.data ?? null) as unknown as TelemetryPoint | null);
      setDriverName(driverResult.data?.name ?? null);
    });
  }, [currentOrg, selectedTracker, year, month]);

  const dailyMetrics = useMemo(() => buildDailyMetrics(points), [points]);
  const monthDistance = dailyMetrics.reduce((sum, day) => sum + day.distance, 0);
  const totalStops = dailyMetrics.reduce((sum, day) => sum + day.stops, 0);
  const voltageValues = points.map((point) => point.battery_voltage_mv).filter((value): value is number => value !== null && value > 0);
  const averageVoltage = voltageValues.length ? voltageValues.reduce((sum, value) => sum + value, 0) / voltageValues.length : null;
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  const exportRows = dailyMetrics.map((day) => [
    day.date,
    `${day.distance.toFixed(2)} km`,
    String(day.stops),
    formatVoltage(day.battery.length ? day.battery[day.battery.length - 1] : null),
    format(new Date(day.latest.recorded_at), "HH:mm:ss"),
    selectedTracker?.vehicleName ?? "",
    driverName ?? "",
  ]);

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Mileage & Telemetry"
        description="Daily trajectory logs, stop analysis, and battery voltage diagnostics"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-300"><span className="mr-2 h-2 w-2 rounded-full bg-emerald-400" />Live sync</Badge>
            {dailyMetrics.length > 0 && <Button variant="outline" size="sm" className="border-border bg-card/60" onClick={() => downloadCsv(`mileage-${timestampSlug()}.csv`, ["Date", "Distance", "Stops", "Voltage", "Latest telemetry", "Vehicle", "Driver"], exportRows)}><Download className="mr-2 h-4 w-4" />Export</Button>}
          </div>
        }
      />

      <div className="grid gap-3 rounded-2xl border border-border/80 bg-card/50 p-3 md:grid-cols-[minmax(260px,1fr)_auto] md:items-end">
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Select tracker / bike</label>
          <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId} disabled={loadingTrackers || trackers.length === 0}>
            <SelectTrigger className="h-12 rounded-xl border-border bg-background/70 text-left"><SelectValue placeholder={loadingTrackers ? "Loading trackers…" : "Select a tracker"} /></SelectTrigger>
            <SelectContent>{trackers.map((tracker) => <SelectItem key={tracker.deviceId} value={tracker.deviceId}>{tracker.vehicleName} · {tracker.deviceName} ({tracker.imei})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Year</label><div className="flex rounded-xl border border-border bg-background/70 p-1">{years.map((item) => <button key={item} type="button" onClick={() => setYear(item)} className={cn("rounded-lg px-4 py-2 text-sm font-semibold transition-colors", year === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{item}</button>)}</div></div>
      </div>

      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-border/80 bg-card/50 p-2">{monthLabels.map((label, index) => <button key={label} type="button" onClick={() => setMonth(index)} className={cn("min-w-[72px] rounded-xl px-3 py-2 text-sm font-medium transition-colors", month === index ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{label}{month === index && year === now.getFullYear() ? " (Current)" : ""}</button>)}</div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Month total distance" value={`${monthDistance.toFixed(1)} km`} helper={`${Math.round(monthDistance * 1000).toLocaleString()} m`} icon={<Route className="h-5 w-5" />} />
        <MetricCard label="Total stops" value={String(totalStops)} helper={dailyMetrics.length ? `Avg ${Math.round(totalStops / dailyMetrics.length)} / day` : "No stop data"} icon={<Activity className="h-5 w-5" />} />
        <MetricCard label="Avg battery voltage" value={averageVoltage === null ? "—" : `${(averageVoltage / 1000).toFixed(1)} V`} helper="Tracker voltage history" icon={<BatteryCharging className="h-5 w-5" />} />
        <MetricCard label="Active driver" value={driverName ?? "Unassigned"} helper={selectedTracker?.registration ?? "No registration"} icon={<UserRound className="h-5 w-5" />} />
      </div>

      <Card className="overflow-hidden border-border/80 bg-card/40">
        <CardContent className="p-0">
          <div className="hidden min-w-[1080px] grid-cols-[260px_210px_160px_170px_190px_180px] border-b border-border bg-muted/25 px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground xl:grid">
            <div>Date & day</div><div>Distance covered</div><div>Stops / idle times</div><div>Battery history</div><div>Latest telemetry</div><div>Assigned driver</div>
          </div>
          {loadingMetrics ? <div className="space-y-3 p-5"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div> : dailyMetrics.length === 0 ? <div className="p-12 text-center"><Gauge className="mx-auto h-9 w-9 text-muted-foreground" /><p className="mt-3 font-semibold">No telemetry logged for {monthLabels[month]} {year}</p><p className="mt-1 text-sm text-muted-foreground">Choose another month or select a different tracker.</p></div> : <div className="divide-y divide-border/70">{dailyMetrics.map((day) => <MileageRow key={day.date} day={day} driverName={driverName} vehicleName={selectedTracker?.vehicleName ?? "Tracker"} />)}</div>}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-xs text-muted-foreground"><span><Radio className="mr-1 inline h-3.5 w-3.5 text-emerald-400" />Showing {dailyMetrics.length} logged day{dailyMetrics.length === 1 ? "" : "s"} for {monthLabels[month]} {year}</span><span>{latest ? `Latest device update ${format(new Date(latest.recorded_at), "dd MMM yyyy, HH:mm:ss")}` : "No latest device update"}</span></div>
    </div>
  );
}

function MetricCard({ label, value, helper, icon }: { label: string; value: string; helper: string; icon: React.ReactNode }) {
  return <Card className="border-border/80 bg-card/50"><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm font-medium text-muted-foreground">{label}</span><span className="rounded-xl bg-primary/10 p-2 text-primary">{icon}</span></div><div className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{value}</div><div className="mt-1 text-sm text-muted-foreground">{helper}</div></CardContent></Card>;
}

function MileageRow({ day, driverName, vehicleName }: { day: DailyMetric; driverName: string | null; vehicleName: string }) {
  const latest = day.latest;
  const status = isMoving(latest) ? "Moving" : latest.ignition ? "Idling" : "Stopped";
  return <div className="grid gap-5 px-5 py-5 xl:min-w-[1080px] xl:grid-cols-[260px_210px_160px_170px_190px_180px] xl:items-center">
    <div className="flex items-center gap-3"><div className="flex h-16 w-14 flex-col items-center justify-center rounded-xl border border-border bg-background/60"><span className="text-xs font-medium text-muted-foreground">{formatDateLabel(day.date)}</span><span className="text-2xl font-semibold">{day.date.slice(8, 10)}</span></div><div><div className="font-medium">{format(new Date(`${day.date}T12:00:00`), "MMM d, yyyy")}</div><Badge variant="outline" className={cn("mt-1 rounded-full", status === "Moving" ? "border-emerald-500/30 text-emerald-300" : "border-border text-muted-foreground")}>{status}</Badge></div></div>
    <div><div className="text-3xl font-semibold tracking-tight">{day.distance.toFixed(1)} <span className="text-base font-normal text-muted-foreground">km</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, day.distance / 2)}%` }} /></div></div>
    <div><div className="inline-flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xl font-semibold text-amber-300"><Activity className="h-4 w-4" />{day.stops}</div><div className="mt-2 text-xs text-muted-foreground">Detected stop transitions</div></div>
    <div><BatteryBars values={day.battery} /><div className="text-xs text-muted-foreground">Min {formatVoltage(day.battery.length ? Math.min(...day.battery) : null)} · Latest {formatVoltage(day.battery.length ? day.battery[day.battery.length - 1] : null)}</div></div>
    <div><div className="font-semibold">{format(new Date(latest.recorded_at), "HH:mm:ss")}</div><div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Zap className="h-3.5 w-3.5" />{latest.speed !== null ? `${Math.round(latest.speed)} km/h` : "Speed unavailable"}</div><div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">{latest.satellites !== null ? `${latest.satellites} satellites` : "GPS status unavailable"}</div></div>
    <div><div className="flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4 text-primary" />{driverName ?? "Unassigned"}</div><div className="mt-1 text-xs text-muted-foreground">{vehicleName}</div><div className="mt-2 flex items-center gap-1 text-xs text-emerald-300"><WifiOff className="h-3.5 w-3.5" />Telemetry synced</div></div>
  </div>;
}
