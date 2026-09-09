import { useCallback, useEffect, useState } from "react";
import { Battery, BatteryLow, BatteryMedium, BatteryFull, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError } from "@/utils/toast";

type BatteryRow = { device_id: string; battery_level: number | null; recorded_at: string; device: { name: string; imei: string } | null; vehicle: { name: string; registration_number: string | null } | null };

function level(value: number | null) { return value == null ? "UNKNOWN" : value <= 20 ? "CRITICAL" : value <= 40 ? "LOW" : value <= 70 ? "NORMAL" : "GOOD"; }
function levelClass(value: number | null) { const state = level(value); return state === "CRITICAL" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : state === "LOW" ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : state === "UNKNOWN" ? "border-slate-500/30 bg-slate-500/10 text-slate-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"; }
function BatteryIcon({ value }: { value: number | null }) { const Icon = value == null || value <= 20 ? BatteryLow : value <= 70 ? BatteryMedium : BatteryFull; return <Icon className="h-5 w-5" />; }

export default function BatteryMonitoringPage() {
  const { currentOrg } = useAuth();
  const [rows, setRows] = useState<BatteryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const [assignmentsResult, positionsResult] = await Promise.all([
      supabase.from("device_assignments").select("device_id,device:gps_devices(name,imei),vehicle:vehicles(name,registration_number)").eq("organization_id", currentOrg.id).is("unassigned_at", null),
      supabase.from("latest_positions").select("device_id,battery_level,recorded_at").eq("organization_id", currentOrg.id),
    ]);
    setLoading(false);
    if (assignmentsResult.error || positionsResult.error) { showError(assignmentsResult.error?.message ?? positionsResult.error?.message ?? "Unable to load battery levels"); return; }
    const latest = new Map((positionsResult.data ?? []).map((row) => [row.device_id, row]));
    const mapped = ((assignmentsResult.data ?? []) as unknown as { device_id: string; device: { name: string; imei: string } | null; vehicle: { name: string; registration_number: string | null } | null }[]).map((assignment) => ({ ...assignment, ...(latest.get(assignment.device_id) ?? { battery_level: null, recorded_at: new Date(0).toISOString() }) }));
    mapped.sort((a, b) => (a.battery_level ?? -1) - (b.battery_level ?? -1));
    setRows(mapped);
  }, [currentOrg]);
  useEffect(() => { load(); }, [load]);
  const critical = rows.filter((r) => level(r.battery_level) === "CRITICAL").length;
  const low = rows.filter((r) => level(r.battery_level) === "LOW").length;
  return <div className="space-y-4"><PageHeader title="Battery monitoring" description="Live tracker battery levels so your team can intervene before a device goes dark" actions={<Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>} />
    <div className="grid gap-3 sm:grid-cols-3"><Card className="border-border bg-card/60"><CardContent className="flex items-center gap-3 p-4"><Battery className="h-5 w-5 text-emerald-400" /><div><p className="text-xs text-muted-foreground">Tracked devices</p><p className="text-xl font-bold">{rows.length}</p></div></CardContent></Card><Card className="border-amber-500/20 bg-amber-500/5"><CardContent className="flex items-center gap-3 p-4"><BatteryMedium className="h-5 w-5 text-amber-400" /><div><p className="text-xs text-muted-foreground">Low battery</p><p className="text-xl font-bold">{low}</p></div></CardContent></Card><Card className="border-rose-500/20 bg-rose-500/5"><CardContent className="flex items-center gap-3 p-4"><BatteryLow className="h-5 w-5 text-rose-400" /><div><p className="text-xs text-muted-foreground">Critical</p><p className="text-xl font-bold">{critical}</p></div></CardContent></Card></div>
    <Card className="border-border bg-card/40"><CardHeader><CardTitle className="text-sm font-semibold">Device battery levels</CardTitle></CardHeader><CardContent>{loading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div> : rows.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">No live battery readings are available yet.</div> : <div className="space-y-2">{rows.map((row) => { const value = row.battery_level == null ? null : Math.round(row.battery_level); return <div key={row.device_id} className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${levelClass(value)}`}><BatteryIcon value={value} /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{row.vehicle?.name ?? row.device?.name ?? "Unassigned device"}</p><p className="truncate text-xs text-muted-foreground">{row.vehicle?.registration_number ?? "No vehicle"} · IMEI {row.device?.imei ?? "—"}</p></div></div><div className="flex items-center gap-3 sm:w-64"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${value == null ? "bg-slate-500" : value <= 20 ? "bg-rose-400" : value <= 40 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} /></div><Badge variant="outline" className={levelClass(value)}>{value == null ? "Unknown" : `${value}%`}</Badge></div><p className="text-xs text-muted-foreground sm:w-36 sm:text-right">{new Date(row.recorded_at).toLocaleString()}</p></div>; })}</div>}</CardContent></Card>
    <p className="text-xs text-muted-foreground">For timely driver communication, configure low-battery alert rules in Monitoring → Alert Rules. Unknown readings are intentionally separated from healthy battery values.</p>
  </div>;
}
