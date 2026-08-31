import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function corsResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseTeltonikaCoord(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;

  // Common: "56.9484,24.1019" or "56.9484" (already decimal)
  if (s.includes(",")) {
    const parts = s.split(",");
    if (parts.length >= 1) {
      const n = parseFloat(parts[0].trim());
      return Number.isFinite(n) ? n : null;
    }
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeTimestamp(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;

  // Seconds epoch from Teltonika is common (10 digits). Milliseconds epoch is 13 digits.
  if (/^\d+$/.test(s)) {
    const num = Number(s);
    if (s.length === 13) return new Date(num).toISOString();
    if (s.length === 10) return new Date(num * 1000).toISOString();
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parsePayload(url: URL, body: Record<string, unknown> | null) {
  const p = (k: string) => url.searchParams.get(k) ?? body?.[k];

  const ident =
    p("imei") ?? p("id") ?? p("device_id") ?? p("sn") ?? p("uniqueId") ?? p("token");

  // Teltonika fields seen in collectors/webhooks often use:
  // lat/latitude, lon/longitude, coordinates like "lat,lon", speed, course/angle, alt/altitude/hgt,
  // acc/accuracy, power/battery, ignition/din1, timestamp/gps_time/utc_time.
  const latRaw = p("lat") ?? p("latitude");
  const lonRaw =
    p("lon") ?? p("longitude") ?? p("lng") ?? p("coordinates") ?? p("coordinate") ?? p("position");

  const latitude = parseTeltonikaCoord(latRaw) ?? null;

  let longitude: number | null = parseTeltonikaCoord(lonRaw);
  if (longitude === null && typeof body?.["coordinates"] === "string") {
    // e.g., "56.9484,24.1019"
    longitude = parseTeltonikaCoord(body["coordinates"]);
  }
  if (longitude === null && typeof body?.["position"] === "string") {
    longitude = parseTeltonikaCoord(body["position"]);
  }

  const speedRaw = p("speed") ?? p("spd");
  let speed_kmh: number | null = null;
  if (speedRaw !== null && speedRaw !== undefined) {
    const n = toNumber(speedRaw);
    if (n !== null) speed_kmh = n <= 250 ? Number((n * 1.852).toFixed(1)) : n;
  }

  const courseRaw = p("course") ?? p("angle") ?? p("bearing");
  const altitudeRaw = p("alt") ?? p("altitude") ?? p("height") ?? p("hgt");
  const accuracyRaw = p("accuracy") ?? p("hdop") ?? p("pdop") ?? p("vacc");
  const batteryRaw = p("batt") ?? p("battery") ?? p("power") ?? p("ext_power");

  const ignitionRaw =
    p("ignition") ?? p("ign") ?? p("din1") ?? p("ign_state") ?? p("on_ignition") ?? p("engine");

  let ignition: boolean | null = null;
  if (ignitionRaw !== null && ignitionRaw !== undefined) {
    const s = String(ignitionRaw).toLowerCase().trim();
    if (["1", "true", "on", "yes"].includes(s)) ignition = true;
    else if (["0", "false", "off", "no"].includes(s)) ignition = false;
  }

  const recorded_at = normalizeTimestamp(p("timestamp") ?? p("time") ?? p("gps_time") ?? p("utc_time"));

  return {
    ident: ident ? String(ident).trim() : null,
    latitude,
    longitude,
    speed_kmh,
    course: courseRaw !== null && courseRaw !== undefined ? toNumber(courseRaw) : null,
    altitude: altitudeRaw !== null && altitudeRaw !== undefined ? toNumber(altitudeRaw) : null,
    accuracy: accuracyRaw !== null && accuracyRaw !== undefined ? toNumber(accuracyRaw) : null,
    battery: batteryRaw !== null && batteryRaw !== undefined ? toNumber(batteryRaw) : null,
    ignition,
    recorded_at: recorded_at ? new Date(recorded_at).toISOString() : null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let body: Record<string, unknown> | null = null;
  const contentType = req.headers.get("content-type") ?? "";
  if (req.method === "POST" && contentType.includes("application/json")) {
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return corsResponse({ error: "Invalid JSON body" }, 400);
    }
  }

  const url = new URL(req.url);
  const data = parsePayload(url, body);

  if (!data.ident) return corsResponse({ error: "Missing device identifier (imei)" }, 400);
  if (data.latitude === null || data.longitude === null) {
    return corsResponse({ error: "Missing or invalid coordinates" }, 400);
  }
  if (Math.abs(data.latitude) > 90 || Math.abs(data.longitude) > 180) {
    return corsResponse({ error: "Coordinates out of range" }, 400);
  }

  // Resolve device by IMEI (globally unique per tracker)
  const { data: device, error: deviceError } = await supabase
    .from("gps_devices")
    .select("id, organization_id, status")
    .eq("imei", data.ident)
    .maybeSingle();

  if (deviceError) return corsResponse({ error: "Device lookup failed" }, 500);
  if (!device) return corsResponse({ error: "Unknown device — register it first in Asset Management" }, 404);

  // Find the vehicle this device is currently assigned to
  const { data: assignment } = await supabase
    .from("device_assignments")
    .select("vehicle_id")
    .eq("device_id", device.id)
    .is("unassigned_at", null)
    .maybeSingle();

  const now = new Date();
  const recordedAt = data.recorded_at ? new Date(data.recorded_at) : now;
  if (isNaN(recordedAt.getTime())) recordedAt.setTime(now.getTime());

  const position = {
    device_id: device.id,
    organization_id: device.organization_id,
    vehicle_id: assignment?.vehicle_id ?? null,
    recorded_at: recordedAt.toISOString(),
    latitude: data.latitude,
    longitude: data.longitude,
    speed: data.speed_kmh,
    course: data.course,
    altitude: data.altitude,
    accuracy: data.accuracy,
    battery_level: data.battery,
    ignition: data.ignition,
  };

  // Insert history row
  const { error: insertError } = await supabase.from("positions").insert(position);
  if (insertError) return corsResponse({ error: "Failed to store position" }, 500);

  // Update the live "latest" snapshot
  await supabase
    .from("latest_positions")
    .upsert({ ...position, updated_at: now.toISOString() }, { onConflict: "device_id" });

  // Device heartbeat
  await supabase
    .from("gps_devices")
    .update({
      last_seen_at: now.toISOString(),
      status: device.status === "IN_STOCK" ? "ACTIVE" : device.status,
    })
    .eq("id", device.id);

  return corsResponse({
    ok: true,
    device_id: device.id,
    recorded_at: position.recorded_at,
  });
});