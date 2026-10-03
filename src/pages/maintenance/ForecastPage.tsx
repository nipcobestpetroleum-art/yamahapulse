import { useCallback, useEffect, useState } from "react";
import { CalendarClock, RefreshCw, Wrench } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError, showSuccess } from "@/utils/toast";

type Forecast = { id: string; vehicle_id: string; forecast_type: string; predicted_date: string | null; confidence: number; rationale: string; status: string; vehicle?: { name: string; registration_number: string | null } | null };
export default function ForecastPage() {
  const { currentOrg } = useAuth();
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const load = useCallback(async () => { if (!currentOrg) return; const { data, error } = await supabase.from("asset_maintenance_forecasts").select("*, vehicle:vehicles(name,registration_number)").eq("organization_id", currentOrg.id).eq("status", "OPEN").order("predicted_date"); if (error) showError(error.message); else setForecasts((data ?? []) as unknown as Forecast[]); }, [currentOrg]);
  useEffect(() => { void load(); }, [load]);
  const calculate = async () => { if (!currentOrg) return; const { error } = await supabase.functions.invoke("maintenance-forecast", { body: { organizationId: currentOrg.id } }); if (error) showError(error.message); else { showSuccess("Maintenance forecasts updated"); await load(); } };
  const resolve = async (forecast: Forecast) => { const { error } = await supabase.from("asset_maintenance_forecasts").update({ status: "ACKNOWLEDGED" }).eq("id", forecast.id); if (error) showError(error.message); else void load(); };
  return <div className="space-y-5"><PageHeader title="Predictive Maintenance" description="Upcoming service and device health forecasts based on current fleet evidence" actions={<div className="flex gap-2"><Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button><Button onClick={() => void calculate()}><CalendarClock className="mr-2 h-4 w-4" />Calculate forecasts</Button></div>} /><Card className="border-border bg-card/60"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4 text-primary" />Open forecasts</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{forecasts.length ? forecasts.map((forecast) => <div key={forecast.id} className="rounded-xl border border-border bg-background/30 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{forecast.vehicle?.name ?? "Unknown bike"}</p><p className="text-xs text-muted-foreground">{forecast.vehicle?.registration_number ?? "—"} · {forecast.forecast_type.replace(/_/g, " ")}</p></div><Badge variant="outline">{forecast.confidence}% confidence</Badge></div><p className="mt-3 text-sm text-muted-foreground">{forecast.rationale}</p><div className="mt-3 flex items-center justify-between"><span className="text-xs text-muted-foreground">Predicted: {forecast.predicted_date ?? "Review now"}</span><Button size="sm" variant="outline" onClick={() => void resolve(forecast)}>Acknowledge</Button></div></div>) : <p className="col-span-full py-10 text-center text-sm text-muted-foreground">No open forecasts. Calculate forecasts after loading maintenance and device data.</p>}</CardContent></Card></div>;
}
