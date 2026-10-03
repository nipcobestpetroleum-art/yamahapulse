import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Battery, Gauge, Loader2, LockKeyhole, MapPin, Navigation, Radio, Route, Zap } from "lucide-react";
import { format } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { AssetRouteMapbox } from "@/components/vehicles/asset-route-mapbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useLivePositions } from "@/hooks/use-live-positions";
import { ENGINE_CONTROL_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { getTelemetryStatus, TELEMETRY_STATUS_LABELS, TELEMETRY_STATUS_STYLES } from "@/lib/telemetry-status";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { LatestPosition, Position } from "@/types/database";

function Field({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background/35 p-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-sm font-semibold">{value ?? "—"}</div>
    </div>
  );
}

export default function AssetDetailPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { currentOrg, currentRole, user } = useAuth();
  const { positionsByDeviceId } = useLivePositions(currentOrg?.id ?? null);
  const [device, setDevice] = useState<{ id: string; name: string; imei: string; engine_immobilized: boolean } | null>(null);
  const [vehicle, setVehicle] = useState<{ id: string; name: string; registration_number: string | null } | null>(null);
  const [history, setHistory] = useState<Position[]>([]);
  const [historyAddresses, setHistoryAddresses] = useState<Record<string, string>>({});
  const [historyPlaceNames, setHistoryPlaceNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [command, setCommand] = useState<"ENGINE_CUT" | "ENGINE_RESUME" | null>(null);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  const latest = deviceId ? positionsByDeviceId[deviceId] : undefined;
  const status = getTelemetryStatus(latest);
  const canControl = hasAnyRole(currentRole, ENGINE_CONTROL_ROLES);

  useEffect(() => {
    if (!currentOrg || !deviceId) return;
    setLoading(true);
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    Promise.all([
      supabase.from("device_assignments").select("device:gps_devices!device_assignments_device_id_fkey(id,name,imei,engine_immobilized), vehicle:vehicles!device_assignments_vehicle_id_fkey(id,name,registration_number)").eq("organization_id", currentOrg.id).eq("device_id", deviceId).is("unassigned_at", null).maybeSingle(),
      supabase.from("positions").select("*").eq("organization_id", currentOrg.id).eq("device_id", deviceId).gte("recorded_at", start).order("recorded_at", { ascending: true }).limit(5000),
    ]).then(([assignmentResult, positionsResult]) => {
      const row = assignmentResult.data as unknown as { device: typeof device; vehicle: typeof vehicle } | null;
      setDevice(row?.device ?? null);
      setVehicle(row?.vehicle ?? null);
      if (positionsResult.error) showError(positionsResult.error.message);
      setHistory((positionsResult.data ?? []) as unknown as Position[]);
      setLoading(false);
    });
  }, [currentOrg, deviceId]);

  useEffect(() => {
    if (!currentOrg || !deviceId || history.length === 0) return;
    const validHistory = history.filter((point) =>
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      (point.latitude !== 0 || point.longitude !== 0),
    );
    if (validHistory.length === 0) return;
    const sample = validHistory.length <= 25
      ? validHistory
      : Array.from({ length: 25 }, (_, index) => validHistory[Math.floor(index * (validHistory.length - 1) / 24)]);
    let cancelled = false;

    supabase.functions
      .invoke("reverse-geocode", {
        body: {
          mode: "history",
          force: true,
          organizationId: currentOrg.id,
          positions: sample.map((point) => ({
            deviceId,
            recordedAt: point.recorded_at,
            latitude: point.latitude,
            longitude: point.longitude,
          })),
        },
      })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        if (data.addresses) setHistoryAddresses((current) => ({ ...current, ...(data.addresses as Record<string, string>) }));
        if (data.placeNames) setHistoryPlaceNames((current) => ({ ...current, ...(data.placeNames as Record<string, string>) }));
      });

    return () => { cancelled = true; };
  }, [currentOrg, deviceId, history]);

  const route = useMemo(() => history.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && (p.latitude !== 0 || p.longitude !== 0)), [history]);
  const endPosition = route[route.length - 1] ?? null;
  const currentPosition = latest ?? endPosition;
  const locationKey = (point: Position) => `${deviceId}:${point.recorded_at}`;
  const addressTrail = useMemo(
    () =>
      route
        .slice()
        .reverse()
        .filter((p) => p.address || p.place_name || historyAddresses[locationKey(p)] || historyPlaceNames[locationKey(p)])
        .slice(0, 50),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route, historyAddresses, historyPlaceNames, deviceId],
  );
  const trailEntries = useMemo<TrailEntry[]>(() => {
    const chronological = addressTrail.slice().reverse();
    return chronological.map((point, index) => {
      const previous = chronological[index - 1];
      const key = locationKey(point);
      return {
        recordedAt: point.recorded_at,
        place: point.place_name ?? historyPlaceNames[key] ?? null,
        address: point.address ?? historyAddresses[key] ?? null,
        bearing: previous ? bearingDeg(previous, point) : null,
        distance: previous ? haversineMeters(previous.latitude, previous.longitude, point.latitude, point.longitude) : null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressTrail, historyAddresses, historyPlaceNames, deviceId]);

  const sendCommand = async () => {
    if (!command || !device || !currentOrg || !user || !vehicle) return;
    if (password.length < 8) { showError("Enter your account password to authorize this command."); return; }
    if (reason.trim().length < 10) { showError("Enter a clear reason of at least 10 characters."); return; }
    setSending(true);
    const { error: passwordError } = await supabase.auth.signInWithPassword({ email: user.email ?? "", password });
    if (passwordError) {
      setSending(false);
      showError("Password verification failed. The command was not sent.");
      return;
    }
    const { error } = await supabase.rpc("request_engine_command", {
      p_organization_id: currentOrg.id,
      p_device_id: device.id,
      p_vehicle_id: vehicle.id,
      p_command: command,
      p_reason: reason.trim(),
    });
    setSending(false);
    if (error) { showError(error.message); return; }
    await logAudit({ organizationId: currentOrg.id, userId: user.id, action: "UPDATE", entity: "device_command", entityId: device.id, newData: { command, reason: reason.trim(), vehicle_id: vehicle.id } });
    setCommand(null); setPassword(""); setReason("");
    showSuccess(command === "ENGINE_CUT" ? "Immobilization queued for the next tracker check-in." : "Engine restore queued for the next tracker check-in.");
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-[520px] rounded-xl" /></div>;
  if (!device || !vehicle) return <div className="space-y-4"><Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button><Card><CardContent className="py-16 text-center text-sm text-muted-foreground">This tracker is not assigned to a vehicle in your organization.</CardContent></Card></div>;

  return (
    <div className="space-y-4">
      <PageHeader title={vehicle.name} description={`${vehicle.registration_number ?? "No registration"} · ${device.name} · IMEI ${device.imei}`} actions={<Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft className="mr-2 h-4 w-4" />Back to live fleet</Button>} />
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={TELEMETRY_STATUS_STYLES[status]}>{TELEMETRY_STATUS_LABELS[status]}</Badge><span className="text-xs text-muted-foreground">Status is conservative: stale or incomplete telemetry is never shown as stopped.</span></div>

      <Card className="overflow-hidden border-border bg-card/40">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2"><CardTitle className="flex items-center gap-2 text-sm font-semibold"><Route className="h-4 w-4 text-emerald-400" />Today’s route · {route.length} valid points</CardTitle><Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">{trailEntries.length} addressed points</Badge></CardHeader>
        <CardContent className="p-0">
          <div className="h-[380px] min-h-[380px] overflow-hidden border-t border-border sm:h-[500px] sm:min-h-[500px]"><AssetRouteMapbox route={route} currentPosition={currentPosition} /></div>
          <div className="border-t border-border p-4">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><MapPin className="h-3.5 w-3.5" />Address trail · dots and direction of travel</p>
            <AddressTimeline entries={trailEntries} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card/60"><CardHeader><CardTitle className="text-sm font-semibold">Live telemetry</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Field label="Speed" value={latest?.speed != null ? `${Math.round(latest.speed)} km/h` : "Unknown"} icon={<Gauge className="h-3.5 w-3.5" />} /><Field label="Ignition" value={latest?.ignition == null ? "Unknown" : latest.ignition ? "On" : "Off"} icon={<Zap className="h-3.5 w-3.5" />} /><Field label="Battery" value={latest?.battery_level != null ? `${Math.round(latest.battery_level)}%` : "Unknown"} icon={<Battery className="h-3.5 w-3.5" />} /><Field label="GPS timestamp" value={latest ? format(new Date(latest.recorded_at), "dd MMM yyyy, HH:mm:ss") : "Unknown"} icon={<Radio className="h-3.5 w-3.5" />} /></CardContent></Card>

      {canControl && <Card className="border-rose-500/25 bg-rose-500/5"><CardHeader><CardTitle className="flex items-center gap-2 text-sm font-semibold text-rose-300"><LockKeyhole className="h-4 w-4" />Engine control</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">Commands require your password and a reason. Never immobilize a moving vehicle.</p><Button variant={device.engine_immobilized ? "default" : "destructive"} className="w-full sm:w-auto" onClick={() => setCommand(device.engine_immobilized ? "ENGINE_RESUME" : "ENGINE_CUT")}><LockKeyhole className="mr-2 h-4 w-4" />{device.engine_immobilized ? "Restore engine" : "Immobilize engine"}</Button></CardContent></Card>}

      <Card className="border-border bg-card/40"><CardHeader><CardTitle className="text-sm font-semibold">Today’s telemetry history</CardTitle></CardHeader><CardContent><div className="max-h-[360px] overflow-auto rounded-xl border border-border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-card"><tr className="border-b border-border"><th className="px-3 py-2">Time</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Speed</th><th className="px-3 py-2">Battery</th><th className="px-3 py-2">Ignition</th><th className="px-3 py-2">Coordinates</th></tr></thead><tbody>{route.slice().reverse().map((p) => { const pointStatus = getTelemetryStatus(p); return <tr key={p.id} className="border-b border-border/60"><td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{format(new Date(p.recorded_at), "dd MMM yyyy, HH:mm:ss")}</td><td className="px-3 py-2">{TELEMETRY_STATUS_LABELS[pointStatus]}</td><td className="px-3 py-2">{p.speed != null ? `${Math.round(p.speed)} km/h` : "—"}</td><td className="px-3 py-2">{p.battery_level != null ? `${Math.round(p.battery_level)}%` : "—"}</td><td className="px-3 py-2">{p.ignition == null ? "—" : p.ignition ? "On" : "Off"}</td><td className="px-3 py-2 font-mono text-[10px]">{p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}</td></tr>; })}</tbody></table></div></CardContent></Card>

      <AlertDialog open={!!command} onOpenChange={(open) => { if (!open && !sending) { setCommand(null); setPassword(""); setReason(""); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{command === "ENGINE_CUT" ? "Authorize engine immobilization" : "Authorize engine restore"}</AlertDialogTitle><AlertDialogDescription>{command === "ENGINE_CUT" ? "This command will be queued for the tracker’s next check-in. Only proceed when the vehicle is safely stationary." : "This command will restore engine power on the tracker’s next check-in."}</AlertDialogDescription></AlertDialogHeader><div className="space-y-3"><div className="space-y-2"><Label htmlFor="engine-password">Account password</Label><Input id="engine-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div><div className="space-y-2"><Label htmlFor="engine-reason">Reason</Label><Textarea id="engine-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why this command is required…" /></div></div><AlertDialogFooter><AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel><AlertDialogAction onClick={(e) => { e.preventDefault(); void sendCommand(); }} disabled={sending}>{sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm command</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

interface TrailEntry { recordedAt: string; place: string | null; address: string | null; bearing: number | null; distance: number | null; }

function haversineMeters(latA: number, lngA: number, latB: number, lngB: number) {
  const radians = Math.PI / 180;
  const dLat = (latB - latA) * radians;
  const dLng = (lngB - lngA) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(latA * radians) * Math.cos(latB * radians) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(from: Pick<Position, "latitude" | "longitude">, to: Pick<Position, "latitude" | "longitude">) {
  const radians = Math.PI / 180;
  const y = Math.sin((to.longitude - from.longitude) * radians) * Math.cos(to.latitude * radians);
  const x = Math.cos(from.latitude * radians) * Math.sin(to.latitude * radians) - Math.sin(from.latitude * radians) * Math.cos(to.latitude * radians) * Math.cos((to.longitude - from.longitude) * radians);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function compassLabel(bearing: number) {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(bearing / 45) % 8];
}

function formatLeg(distance: number) {
  return distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`;
}

/** Vertical address trail: dot per addressed point, connecting line, and arrows showing direction of travel. */
function AddressTimeline({ entries }: { entries: TrailEntry[] }) {
  if (entries.length === 0) return <div className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">No addresses resolved for today’s route yet — Mapbox reverse geocoding runs on a sample of points. Exact coordinates remain available in the telemetry history below.</div>;
  return (
    <div className="max-h-[440px] space-y-0.5 overflow-auto pr-1">
      {entries.map((entry, index) => {
        const isFirst = index === 0;
        const isLatest = index === entries.length - 1;
        return (
          <div key={`${entry.recordedAt}:${index}`} className="flex gap-3">
            <div className="relative flex flex-col items-center">
              <div className={cn("z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-background", isFirst ? "bg-sky-500/20" : isLatest ? "bg-emerald-500/20" : "bg-muted")}>
                {entry.bearing == null ? (
                  <MapPin className="h-3.5 w-3.5 text-sky-400" />
                ) : (
                  <Navigation className={cn("h-4 w-4", isLatest ? "text-emerald-400" : "text-sky-400")} style={{ transform: `rotate(${entry.bearing}deg)` }} />
                )}
              </div>
              {!isLatest && <div className="w-px flex-1 bg-border" />}
            </div>
            <div className="min-w-0 flex-1 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-foreground">{format(new Date(entry.recordedAt), "dd MMM · HH:mm:ss")}</span>
                {isFirst && <Badge variant="outline" className="border-sky-500/25 bg-sky-500/10 text-[10px] text-sky-300">Start</Badge>}
                {isLatest && <Badge variant="outline" className="border-emerald-500/25 bg-emerald-500/10 text-[10px] text-emerald-300">Latest</Badge>}
                {entry.bearing != null && entry.distance != null && entry.distance > 5 && (
                  <Badge variant="outline" className="gap-1 border-border bg-background/40 text-[10px] text-muted-foreground">
                    <Navigation className="h-3 w-3" style={{ transform: `rotate(${entry.bearing}deg)` }} />
                    {formatLeg(entry.distance)} · {compassLabel(entry.bearing)}
                  </Badge>
                )}
              </div>
              <p className="mt-1 truncate text-sm font-medium text-primary">{entry.place ?? "Unnamed area"}</p>
              <p className="truncate text-xs text-muted-foreground">{entry.address ?? "—"}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
