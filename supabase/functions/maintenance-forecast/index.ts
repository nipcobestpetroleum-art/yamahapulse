import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json().catch(() => ({}));
    const organizationId = body.organizationId as string | undefined;
    if (!organizationId) return new Response(JSON.stringify({ error: "organizationId is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: vehicles, error } = await service.from("vehicles").select("id,name,odometer").eq("organization_id", organizationId);
    if (error) throw error;
    const forecasts = [];
    for (const vehicle of vehicles ?? []) {
      const { data: schedules } = await service.from("maintenance_schedules").select("scheduled_date,status,maintenance_type").eq("organization_id", organizationId).eq("vehicle_id", vehicle.id).order("scheduled_date", { ascending: true }).limit(5);
      const nextSchedule = schedules?.find((schedule) => schedule.status !== "COMPLETED");
      if (nextSchedule) {
        forecasts.push({ organization_id: organizationId, vehicle_id: vehicle.id, forecast_type: "SERVICE_DUE", predicted_date: nextSchedule.scheduled_date, confidence: 85, rationale: `Scheduled ${nextSchedule.maintenance_type ?? "maintenance"} is due on ${nextSchedule.scheduled_date}.`, source_metrics: { odometer: vehicle.odometer, maintenance_status: nextSchedule.status } });
      }
      const { data: devices } = await service.from("device_assignments").select("device:gps_devices(battery_voltage_mv)").eq("organization_id", organizationId).eq("vehicle_id", vehicle.id).is("unassigned_at", null).limit(1);
      const voltage = (devices?.[0] as { device: { battery_voltage_mv: number | null } | null } | undefined)?.device?.battery_voltage_mv;
      if (voltage != null && voltage < 11500) forecasts.push({ organization_id: organizationId, vehicle_id: vehicle.id, forecast_type: "BATTERY_RISK", predicted_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), confidence: 72, rationale: `Tracker battery voltage is low at ${voltage} mV; inspect charging and backup battery health.`, source_metrics: { battery_voltage_mv: voltage } });
    }
    if (forecasts.length) await service.from("asset_maintenance_forecasts").upsert(forecasts, { onConflict: "organization_id,vehicle_id,forecast_type" });
    return new Response(JSON.stringify({ ok: true, forecasts: forecasts.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[maintenance-forecast] failed", error);
    return new Response(JSON.stringify({ error: "Forecast calculation failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
