import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarDays, CircleDot, Gauge, MapPin, Route, Search, Zap } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlatformMap } from "@/components/maps/platform-map";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError } from "@/utils/toast";
import type { MapMarkerSpec, MapPolylineSpec } from "@/components/mapstudio/types";
import type { Position } from "@/types/database";

interface AssignedDevice { deviceId: string; vehicleName: string; registration: string | null; deviceName: string; imei: string; }

function localInput(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function TrailHistoryPage() {
  const { currentOrg } = useAuth();
  const [devices, setDevices] = useState<AssignedDevice[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [from, setFrom] = useState(() => localInput(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(() => localInput(new Date()));
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [logPage, setLogPage] = useState(1);
  const logPageSize = 25;

  useEffect(() => {
    if (!currentOrg) return;
    supabase.from("device_assignments").select("device_id,device:gps_devices!device_assignments_device_id_fkey(name,imei),vehicle:vehicles!device_assignments_vehicle_id_fkey(name,registration_number)").eq("organization_id", currentOrg.id).is("unassigned_at", null).then(({ data, error }) => {
      if (error) { showError(error.message); return; }
      const rows = (data ?? []) as unknown as { device_id: string; device: { name: string; imei: string } | null; vehicle: { name: string; registration_number: string | null } | null }[];
      setDevices(rows.filter((row) => row.device && row.vehicle).map((row) => ({ deviceId: row.device_id, deviceName: row.device!.name, imei: row.device!.imei, vehicleName: row.vehicle!.name, registration: row.vehicle!.registration_number })));
    });
  }, [currentOrg]);

  const loadTrail = async () => {
    if (!currentOrg || !deviceId) return;
    setLoading(true);
    const { data, error } = await supabase.from("positions").select("*").eq("organization_id", currentOrg.id).eq("device_id", deviceId).gte("recorded_at", new Date(from).toISOString()).lte("recorded_at", new Date(to).toISOString()).order("recorded_at", { ascending: true }).limit(10000);
    setLoading(false);
    if (error) { showError(error.message); return; }
    setPositions((data ?? []) as unknown as Position[]);
  };

  const validPositions = useMemo(() => positions.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && (point.latitude !== 0 || point.longitude !== 0)), [positions]);
  const selectedDevice = devices.find((device) => device.deviceId === deviceId);
  const filteredPositions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return validPositions;
    return validPositions.filter((point) => `${point.recorded_at} ${point.latitude} ${point.longitude} ${point.address ?? ""} ${point.place_name ?? ""}`.toLowerCase().includes(normalized));
  }, [validPositions, query]);
  const paginatedPositions = filteredPositions.slice((logPage - 1) * logPageSize, logPage * logPageSize);

  useEffect(() => {
    setLogPage(1);
  }, [query, positions.length]);

  const markers = useMemo<MapMarkerSpec[]>(() => validPositions.map((point, index) => ({
    id: `raw:${point.id}`,
    lat: point.latitude,
    lng: point.longitude,
    title: `${index === validPositions.length - 1 ? "Current location · " : ""}${selectedDevice?.vehicleName ?? "Tracker"} · ${format(new Date(point.recorded_at), "HH:mm:ss")}`,
    icon: "dot",
    color: index === 0 ? "#34d399" : index === validPositions.length - 1 ? "#fb7185" : "#60a5fa",
    scale: index === 0 || index === validPositions.length - 1 ? 8 : 5,
    snippet: [format(new Date(point.recorded_at), "dd MMM yyyy, HH:mm:ss"), `Speed ${point.speed != null ? `${Math.round(point.speed)} km/h` : "—"}`, `Course ${point.course != null ? `${Math.round(point.course)}°` : "—"}`, `Ignition ${point.ignition == null ? "—" : point.ignition ? "On" : "Off"}`, `Battery ${point.battery_voltage_mv != null ? `${(point.battery_voltage_mv / 1000).toFixed(1)}V` : "—"}`, `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`],
  })), [validPositions, selectedDevice]);

  const polylines = useMemo<MapPolylineSpec[]>(() => validPositions.length > 1 ? [{ id: "raw-telemetry-trail", points: validPositions.map((point) => [point.latitude, point.longitude]), color: "#38bdf8", weight: 4, opacity: 0.85 }] : [], [validPositions]);
  const lastPosition = validPositions[validPositions.length - 1];

  return <div className="space-y-4">
    <PageHeader title="Raw telemetry trail" description="Plot every valid position exactly where the tracker reported it. No points are smoothed or discarded." actions={<Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary"><Route className="mr-2 h-4 w-4" />Raw position history</Badge>} />
    <Card className="border-border bg-card/60"><CardContent className="grid gap-3 pt-6 md:grid-cols-12">
      <div className="space-y-2 md:col-span-4"><label className="text-xs font-medium text-muted-foreground">Bike / tracker</label><Select value={deviceId} onValueChange={setDeviceId}><SelectTrigger><SelectValue placeholder="Select a tracked bike" /></SelectTrigger><SelectContent>{devices.map((device) => <SelectItem key={device.deviceId} value={device.deviceId}>{device.vehicleName}{device.registration ? ` · ${device.registration}` : ""} · {device.imei}</SelectItem>)}</SelectContent></Select></div>
      <label className="space-y-2 md:col-span-3"><span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />From</span><Input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="space-y-2 md:col-span-3"><span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />To</span><Input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <div className="flex items-end md:col-span-2"><Button className="w-full" onClick={() => void loadTrail()} disabled={!deviceId || loading}>{loading ? "Loading…" : "Plot raw trail"}</Button></div>
    </CardContent></Card>

    {positions.length > 0 && <div className="grid gap-3 sm:grid-cols-4"><Card className="border-border bg-card/60"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Raw records</div><div className="mt-1 text-2xl font-bold">{positions.length}</div></CardContent></Card><Card className="border-border bg-card/60"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Mapped points</div><div className="mt-1 text-2xl font-bold text-sky-400">{validPositions.length}</div></CardContent></Card><Card className="border-border bg-card/60"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Trail start</div><div className="mt-1 text-sm font-semibold">{validPositions[0] ? format(new Date(validPositions[0].recorded_at), "dd MMM, HH:mm:ss") : "—"}</div></CardContent></Card><Card className="border-border bg-card/60"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Trail end</div><div className="mt-1 text-sm font-semibold">{lastPosition ? format(new Date(lastPosition.recorded_at), "dd MMM, HH:mm:ss") : "—"}</div></CardContent></Card></div>}

    {positions.length === 0 ? <Card className="border-border bg-card/40"><CardContent className="py-20 text-center"><MapPin className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-3 text-lg font-semibold">Select a bike and time range</h2><p className="mt-1 text-sm text-muted-foreground">Every raw telemetry record with valid latitude and longitude will appear as a point on the map.</p></CardContent></Card> : <>
      <Card className="overflow-hidden border-border bg-card/40"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-sm font-semibold">Raw positional history · {selectedDevice?.vehicleName ?? "Tracker"}</CardTitle><span className="text-xs text-muted-foreground">Green start · pink latest · blue every recorded point</span></CardHeader><CardContent className="p-0"><PlatformMap markers={markers} polylines={polylines} heightClass="h-[560px] w-full" /></CardContent></Card>
      <Card className="border-border bg-card/40"><CardHeader className="flex flex-row items-center justify-between gap-3"><CardTitle className="text-sm font-semibold">Telemetry log points</CardTitle><div className="relative w-64"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search time or coordinate" className="pl-9" /></div></CardHeader><CardContent className="p-0"><div className="max-h-[520px] overflow-auto"><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Coordinates</TableHead><TableHead>Speed / course</TableHead><TableHead>Ignition</TableHead><TableHead>Battery</TableHead><TableHead>Satellites</TableHead><TableHead>Map</TableHead></TableRow></TableHeader><TableBody>{paginatedPositions.slice().reverse().map((point) => <TableRow key={`${point.id}:${point.recorded_at}`}><TableCell className="whitespace-nowrap font-mono text-xs">{format(new Date(point.recorded_at), "HH:mm:ss")}</TableCell><TableCell className="font-mono text-xs">{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</TableCell><TableCell><span className="flex items-center gap-1 text-xs"><Gauge className="h-3.5 w-3.5 text-muted-foreground" />{point.speed != null ? `${Math.round(point.speed)} km/h` : "—"} · {point.course != null ? `${Math.round(point.course)}°` : "—"}</span></TableCell><TableCell><span className="flex items-center gap-1 text-xs"><Zap className="h-3.5 w-3.5 text-muted-foreground" />{point.ignition == null ? "—" : point.ignition ? "On" : "Off"}</span></TableCell><TableCell className="text-xs">{point.battery_voltage_mv != null ? `${(point.battery_voltage_mv / 1000).toFixed(1)}V` : "—"}</TableCell><TableCell className="text-xs">{point.satellites ?? "—"}</TableCell><TableCell><a className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={`https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`} target="_blank" rel="noreferrer"><CircleDot className="h-3.5 w-3.5" />Open</a></TableCell></TableRow>)}</TableBody></Table></div><TablePagination page={logPage} pageSize={logPageSize} total={filteredPositions.length} onPageChange={setLogPage} /></CardContent></Card>
    </>}
  </div>;
}
