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

// Many trackers "ping" a URL with query params; others POST JSON/XML.
// We support the most common conventions so any device can be onboarded
// without firmware changes.
function parsePayload(url: URL, body: Record<string, unknown> | null) {
  const p = (k: string) => url.searchParams.get(k) ?? body?.[k];

  const ident =
    p("imei") ?? p("id") ?? p("deviceId") ?? p("device_id") ?? p("sn") ?? p("uniqueId");
  let lat = p("lat") ?? p("latitude");
  let lon = p("lon") ?? p("lng") ?? p("longitude");

  // NMEA-style: lat="5001.43510,N" or lon="03031.64912,E"
  function parseCoord(v: string | unknown): number | null {
    if (v === null || v === undefined) return null;
    const s = String(v);
    if (s.includes(",")) {
      const [degMin, hemi] = s.split(",");
      const deg = parseFloat(degMin);
      if (isNaN(deg)) return null;
      const d = Math.floor(deg / 100);
      const m = deg - d * 100;
      const dec = d + m / 60;
      return hemi?.toUpperCase() === "S" || hemi?.toUpperCase() === "W" ? -dec : dec;
    }
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  const speedRaw = p("speed") ?? p("spd");
  let speed_kmh: number | null = null;
  if (speedRaw !== null && speedRaw !== undefined) {
    const s = parseFloat(String(speedRaw));
    if (!isNaN(s)) {
      // Many devices send knots — assume knots when value looks small for road use, else km/h
      speed_kmh = s <= 250 ? Math.round(s * 1.852 * 10) / 10 : s;
    }
  }

  return {
    ident: ident ? String(ident).trim() : null,
    latitude: parseCoord(lat),
    longitude: parseCoord(lon),
    speed_kmh,
    course: p("course") ? parseFloat(String(p("course"))) : p("angle") ? parseFloat(String(p("angle"))) : null,
    altitude: p("alt") ? parseFloat(String(p("alt"))) : p("altitude") ? parseFloat(String(p("altitude"))) : null,
    accuracy: p("accuracy") ? parseFloat(String(p("accuracy"))) : p("hdop") ? parseFloat(String(p("hdop"))) : null,
    battery: p("batt") ? parseFloat(String(p("batt"))) : p("battery") ? parseFloat(String(p("battery"))) : p("power") ? parseFloat(String(p("power"))) : null,
    ignition: p("ignition") !== undefined && p("ignition") !== null
      ? ["1", "true", "on", "ON", "yes"].includes(String(p("ignition")))
      : p("in1") !== undefined && p("in1") !== null
        ? ["1", "true", "on"].includes(String(p("in1")))
        : null,
    recorded_at: p("timestamp") ?? p("time") ?? p("gps_time") ?? p("device_time"),
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
  const recordedAt = data.recorded_at ? new Date(String(data.recorded_at)) : now;
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
    .update({ last_seen_at: now.toISOString(), status: device.status === "IN_STOCK" ? "ACTIVE" : device.status })
    .eq("id", device.id);

  return corsResponse({ ok: true, device_id: device.id, recorded_at: position.recorded_at });
});