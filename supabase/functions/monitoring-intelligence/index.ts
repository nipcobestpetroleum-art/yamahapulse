import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const severityWeight: Record<string, number> = { LOW: 8, MEDIUM: 18, HIGH: 30, CRITICAL: 45 };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json().catch(() => ({}));
    const organizationId = body.organizationId as string | undefined;
    const deviceId = body.deviceId as string | undefined;
    if (!organizationId) return new Response(JSON.stringify({ error: "organizationId is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let eventQuery = service.from("device_events").select("id,device_id,vehicle_id,type,severity,message,created_at").eq("organization_id", organizationId).gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if (deviceId) eventQuery = eventQuery.eq("device_id", deviceId);
    const { data: events, error: eventError } = await eventQuery.order("created_at", { ascending: false }).limit(1000);
    if (eventError) throw eventError;

    const grouped = new Map<string, typeof events>();
    for (const event of events ?? []) {
      const key = `${event.device_id}:${event.vehicle_id ?? "none"}`;
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    const results = [];
    for (const [key, assetEvents] of grouped) {
      const first = assetEvents[assetEvents.length - 1];
      const factors = new Map<string, { type: string; points: number; evidence: string }>();
      for (const event of assetEvents) {
        const points = severityWeight[event.severity] ?? 5;
        const factorType = event.type === "JAMMING" || event.type === "POWER_CUT" || event.type === "TOWING" ? "DEVICE_TAMPERING" : event.type === "GEOFENCE_EXIT" ? "GEOFENCE_DEVIATION" : event.type === "OVERSPEED" ? "DRIVING_RISK" : "EVENT_ACTIVITY";
        const existing = factors.get(factorType);
        factors.set(factorType, { type: factorType, points: Math.min(50, (existing?.points ?? 0) + points), evidence: `${existing?.evidence ? `${existing.evidence}; ` : ""}${event.type} at ${event.created_at}` });
      }
      const factorRows = [...factors.values()];
      const score = Math.min(100, factorRows.reduce((sum, factor) => sum + factor.points, 0));
      const level = score >= 75 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";
      const confidence = Math.min(100, 45 + assetEvents.length * 8);
      if (first.vehicle_id) {
        await service.from("asset_risk_scores").upsert({ organization_id: organizationId, vehicle_id: first.vehicle_id, device_id: first.device_id, score, level, factors: factorRows, confidence, calculated_at: new Date().toISOString() });
      }
      const critical = assetEvents.filter((event) => ["CRITICAL", "HIGH"].includes(event.severity));
      if (critical.length >= 2 && first.vehicle_id) {
        const incidentType = factorRows.some((factor) => factor.type === "DEVICE_TAMPERING") ? "POSSIBLE_TAMPERING" : "COMPOUND_RISK";
        const summary = factorRows.map((factor) => `${factor.type}: ${factor.evidence}`).join(" | ");
        const { data: existingIncident } = await service.from("monitoring_incidents").select("id").eq("organization_id", organizationId).eq("device_id", first.device_id).eq("incident_type", incidentType).in("status", ["OPEN", "ACKNOWLEDGED", "INVESTIGATING"]).maybeSingle();
        if (existingIncident) await service.from("monitoring_incidents").update({ severity: level, summary, confidence, evidence: assetEvents, last_event_at: first.created_at, updated_at: new Date().toISOString() }).eq("id", existingIncident.id);
        else await service.from("monitoring_incidents").insert({ organization_id: organizationId, vehicle_id: first.vehicle_id, device_id: first.device_id, incident_type: incidentType, severity: level, title: incidentType === "POSSIBLE_TAMPERING" ? "Possible device tampering" : "Compound monitoring risk", summary, confidence, evidence: assetEvents, started_at: assetEvents[assetEvents.length - 1].created_at, last_event_at: first.created_at });
      }
      results.push({ asset: key, score, level, confidence, factors: factorRows });
    }
    return new Response(JSON.stringify({ ok: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[monitoring-intelligence] failed", error);
    return new Response(JSON.stringify({ error: "Intelligence calculation failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
