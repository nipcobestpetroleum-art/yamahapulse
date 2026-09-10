import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import L, { type LatLngExpression } from "leaflet";
import { ArrowLeft, Battery, Car, Gauge, Loader2, LockKeyhole, Radio, Route, Zap } from "lucide-react";
import { format } from "date-fns";
import { PageHeader } from "@/components/page-header";
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
import type { LatestPosition, Position } from "@/types/database";

const currentIcon = L.divIcon({
  className: "asset-current-dot",
  html: '<div style="width:20px;height:20px;border-radius:9999px;background:#34d399;border:3px solid white;box-shadow:0 0 0 6px rgba(52,211,153,.22),0 0 24px rgba(52,211,153,.95);"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const routeStartIcon = L.divIcon({
  className: "asset-route-start-dot",
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#60a5fa;border:3px solid white;box-shadow:0 0 0 4px rgba(96,165,250,.25);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const routeEndIcon = L.divIcon({
  className: "asset-route-end-dot",
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#fb923c;border:3px solid white;box-shadow:0 0 0 4px rgba(251,146,60,.25);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function FitRoute({ positions }: { positions: Position[] }) {
  const map = useMap();
  useEffect(() => {
    if (!positions.length) return;
    const points = positions.map((p) => [p.latitude, p.longitude] as LatLngExpression);
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(points as any, { padding: [28, 28], maxZoom: 15 });
  }, [map, positions]);
  return null;
}

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

  const route = useMemo(() => history.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && (p.latitude !== 0 || p.longitude !== 0)), [history]);
  const routePoints = route.map((p) => [p.latitude, p.longitude] as LatLngExpression);
  const startPosition = route[0] ?? null;
  const endPosition = route[route.length - 1] ?? null;
  const currentPosition = latest ?? endPosition;
  const center: LatLngExpression = currentPosition ? [currentPosition.latitude, currentPosition.longitude] : [20, 0];

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
    const { error } = await supabase.from("device_commands").insert({
      organization_id: currentOrg.id,
      device_id: device.id,
      vehicle_id: vehicle.id,
      command,
      requested_by: user.id,
      reason: reason.trim(),
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,.8fr)]">
        <Card className="overflow-hidden border-border bg-card/40">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-semibold"><Route className="h-4 w-4 text-emerald-400" />Today’s route · {route.length} valid points</CardTitle></CardHeader>
          <CardContent className="p-0"><div className="h-[500px] overflow-hidden border-t border-border"><MapContainer center={center} zoom={14} className="h-full w-full" scrollWheelZoom><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' /><FitRoute positions={route} />{routePoints.length > 1 && <Polyline positions={routePoints} pathOptions={{ color: "#34d399", weight: 5, opacity: .9 }} />}{startPosition && <Marker position={[startPosition.latitude, startPosition.longitude]} icon={routeStartIcon} />}{route.length > 1 && endPosition && <Marker position={[endPosition.latitude, endPosition.longitude]} icon={routeEndIcon} />}{currentPosition && <Marker position={[currentPosition.latitude, currentPosition.longitude]} icon={currentIcon} />}</MapContainer></div></CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border bg-card/60"><CardHeader><CardTitle className="text-sm font-semibold">Live telemetry</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3"><Field label="Speed" value={latest?.speed != null ? `${Math.round(latest.speed)} km/h` : "Unknown"} icon={<Gauge className="h-3.5 w-3.5" />} /><Field label="Ignition" value={latest?.ignition == null ? "Unknown" : latest.ignition ? "On" : "Off"} icon={<Zap className="h-3.5 w-3.5" />} /><Field label="Battery" value={latest?.battery_level != null ? `${Math.round(latest.battery_level)}%` : "Unknown"} icon={<Battery className="h-3.5 w-3.5" />} /><Field label="GPS timestamp" value={latest ? format(new Date(latest.recorded_at), "dd MMM yyyy, HH:mm:ss") : "Unknown"} icon={<Radio className="h-3.5 w-3.5" />} /></CardContent></Card>
          {canControl && <Card className="border-rose-500/25 bg-rose-500/5"><CardHeader><CardTitle className="flex items-center gap-2 text-sm font-semibold text-rose-300"><LockKeyhole className="h-4 w-4" />Engine control</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">Commands require your password and a reason. Never immobilize a moving vehicle.</p><Button variant={device.engine_immobilized ? "default" : "destructive"} className="w-full" onClick={() => setCommand(device.engine_immobilized ? "ENGINE_RESUME" : "ENGINE_CUT")}><LockKeyhole className="mr-2 h-4 w-4" />{device.engine_immobilized ? "Restore engine" : "Immobilize engine"}</Button></CardContent></Card>}
        </div>
      </div>

      <Card className="border-border bg-card/40"><CardHeader><CardTitle className="text-sm font-semibold">Today’s telemetry history</CardTitle></CardHeader><CardContent><div className="max-h-[360px] overflow-auto rounded-xl border border-border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-card"><tr className="border-b border-border"><th className="px-3 py-2">Time</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Speed</th><th className="px-3 py-2">Battery</th><th className="px-3 py-2">Ignition</th><th className="px-3 py-2">Coordinates</th></tr></thead><tbody>{route.slice().reverse().map((p) => { const pointStatus = getTelemetryStatus(p); return <tr key={p.id} className="border-b border-border/60"><td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{format(new Date(p.recorded_at), "dd MMM yyyy, HH:mm:ss")}</td><td className="px-3 py-2">{TELEMETRY_STATUS_LABELS[pointStatus]}</td><td className="px-3 py-2">{p.speed != null ? `${Math.round(p.speed)} km/h` : "—"}</td><td className="px-3 py-2">{p.battery_level != null ? `${Math.round(p.battery_level)}%` : "—"}</td><td className="px-3 py-2">{p.ignition == null ? "—" : p.ignition ? "On" : "Off"}</td><td className="px-3 py-2 font-mono text-[10px]">{p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}</td></tr>; })}</tbody></table></div></CardContent></Card>

      <AlertDialog open={!!command} onOpenChange={(open) => { if (!open && !sending) { setCommand(null); setPassword(""); setReason(""); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{command === "ENGINE_CUT" ? "Authorize engine immobilization" : "Authorize engine restore"}</AlertDialogTitle><AlertDialogDescription>{command === "ENGINE_CUT" ? "This command will be queued for the tracker’s next check-in. Only proceed when the vehicle is safely stationary." : "This command will restore engine power on the tracker’s next check-in."}</AlertDialogDescription></AlertDialogHeader><div className="space-y-3"><div className="space-y-2"><Label htmlFor="engine-password">Account password</Label><Input id="engine-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div><div className="space-y-2"><Label htmlFor="engine-reason">Reason</Label><Textarea id="engine-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why this command is required…" /></div></div><AlertDialogFooter><AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel><AlertDialogAction onClick={(e) => { e.preventDefault(); void sendCommand(); }} disabled={sending}>{sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm command</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
