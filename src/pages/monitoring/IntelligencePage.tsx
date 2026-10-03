import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BrainCircuit, RefreshCw, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError, showSuccess } from "@/utils/toast";

type Risk = { vehicle_id: string; score: number; level: string; factors: { type: string; points: number; evidence: string }[]; confidence: number; calculated_at: string; vehicle?: { name: string; registration_number: string | null } | null };
type Incident = { id: string; title: string; summary: string; severity: string; status: string; confidence: number; last_event_at: string; vehicle?: { name: string; registration_number: string | null } | null };

const levelClass: Record<string, string> = { LOW: "bg-emerald-500/15 text-emerald-300", MEDIUM: "bg-amber-500/15 text-amber-300", HIGH: "bg-orange-500/15 text-orange-300", CRITICAL: "bg-rose-500/15 text-rose-300" };

export default function IntelligencePage() {
  const { currentOrg, user } = useAuth();
  const [risks, setRisks] = useState<Risk[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const [riskResult, incidentResult] = await Promise.all([
      supabase.from("asset_risk_scores").select("*, vehicle:vehicles(name,registration_number)").eq("organization_id", currentOrg.id).order("score", { ascending: false }),
      supabase.from("monitoring_incidents").select("id,title,summary,severity,status,confidence,last_event_at,vehicle:vehicles(name,registration_number)").eq("organization_id", currentOrg.id).in("status", ["OPEN", "ACKNOWLEDGED", "INVESTIGATING"]).order("last_event_at", { ascending: false }),
    ]);
    setLoading(false);
    if (riskResult.error) showError(riskResult.error.message); else setRisks((riskResult.data ?? []) as unknown as Risk[]);
    if (incidentResult.error) showError(incidentResult.error.message); else setIncidents((incidentResult.data ?? []) as unknown as Incident[]);
  }, [currentOrg]);
  useEffect(() => { void load(); }, [load]);
  const calculate = async () => {
    if (!currentOrg) return;
    const { error } = await supabase.functions.invoke("monitoring-intelligence", { body: { organizationId: currentOrg.id } });
    if (error) showError(error.message); else { showSuccess("Risk scores recalculated"); await load(); }
  };
  const acknowledge = async (incident: Incident) => {
    const { error } = await supabase.from("monitoring_incidents").update({ status: "ACKNOWLEDGED", acknowledged_by: user?.id ?? null, acknowledged_at: new Date().toISOString() }).eq("id", incident.id);
    if (error) showError(error.message); else void load();
  };
  return <div className="space-y-5"><PageHeader title="Monitoring Intelligence" description="Explainable asset risk scores and correlated incidents from the last 24 hours" actions={<div className="flex gap-2"><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button><Button onClick={() => void calculate()}><BrainCircuit className="mr-2 h-4 w-4" />Recalculate</Button></div>} /><div className="grid gap-4 lg:grid-cols-2"><Card className="border-border bg-card/60"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-4 w-4 text-primary" />Asset risk scores</CardTitle></CardHeader><CardContent className="space-y-3">{risks.length ? risks.map((risk) => <div key={risk.vehicle_id} className="rounded-xl border border-border bg-background/30 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{risk.vehicle?.name ?? "Unknown bike"}</p><p className="text-xs text-muted-foreground">{risk.vehicle?.registration_number ?? "—"} · {risk.confidence}% confidence</p></div><Badge className={levelClass[risk.level] ?? ""}>{risk.level} · {risk.score}/100</Badge></div><div className="mt-3 space-y-1.5">{risk.factors.map((factor) => <div key={factor.type} className="text-xs"><span className="font-semibold">{factor.type.replace(/_/g, " ")} +{factor.points}</span><span className="ml-2 text-muted-foreground">{factor.evidence}</span></div>)}</div></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No calculated risk scores yet. Recalculate after telemetry events arrive.</p>}</CardContent></Card><Card className="border-border bg-card/60"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-400" />Open correlated incidents</CardTitle></CardHeader><CardContent className="space-y-3">{incidents.length ? incidents.map((incident) => <div key={incident.id} className="rounded-xl border border-border bg-background/30 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{incident.title}</p><p className="text-xs text-muted-foreground">{incident.vehicle?.name ?? "Unknown bike"} · {incident.confidence}% confidence</p></div><Badge className={levelClass[incident.severity] ?? ""}>{incident.severity}</Badge></div><p className="mt-3 text-xs leading-relaxed text-muted-foreground">{incident.summary}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => void acknowledge(incident)}>Acknowledge</Button></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No open correlated incidents.</p>}</CardContent></Card></div></div>;
}
