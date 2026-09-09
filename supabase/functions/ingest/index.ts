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

function parseBoolLike(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  const s = String(v).toLowerCase().trim();
  if (!s) return null;
  if (["1", "true", "on", "yes"].includes(s)) return true;
  if (["0", "false", "off", "no", ""].includes(s)) return false;
  return null;
}

function parseCoordValue(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;

  // NMEA-style: "3013.562,E" or "5546.123,N"
  const nmea = s.match(/^(\d+(?:\.\d+)?),?\s*([NSEW])$/i);
  if (nmea) {
    const raw = parseFloat(nmea[1]);
    const deg = Math.floor(raw / 100);
    const dec = deg + (raw - deg * 100) / 60;
    return nmea[2].toUpperCase() === "S" || nmea[2].toUpperCase() === "W" ? -dec : dec;
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeTimestamp(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;

  // Seconds epoch (10 digits) or milliseconds epoch (13 digits)
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

  const latitude = parseCoordValue(p("lat") ?? p("latitude"));
  const longitude = parseCoordValue(p("lon") ?? p("longitude") ?? p("lng"));

  // speed_kmh is trusted as-is (our Teltonika collector sends it).
  // Legacy `speed` could be knots from some trackers, so convert small values.
  let speed_kmh: number | null = null;
  const explicit = toNumber(p("speed_kmh") ?? p("kmh"));
  if (explicit !== null) {
    speed_kmh = explicit;
  } else {
    const raw = toNumber(p("speed") ?? p("spd"));
    if (raw !== null) speed_kmh = raw <= 250 ? Number((raw * 1.852).toFixed(1)) : raw;
  }

  const courseRaw = p("course") ?? p("angle") ?? p("bearing");
  const altitudeRaw = p("alt") ?? p("altitude") ?? p("height") ?? p("hgt");
  const accuracyRaw = p("accuracy") ?? p("hdop") ?? p("pdop") ?? p("vacc");
  const batteryRaw = p("batt") ?? p("battery") ?? p("power") ?? p("ext_power");

  const ignitionRaw =
    p("ignition") ?? p("ign") ?? p("din1") ?? p("ign_state") ?? p("on_ignition") ?? p("engine");

  const ignition = parseBoolLike(ignitionRaw);

  const recorded_at = normalizeTimestamp(p("timestamp") ?? p("time") ?? p("gps_time") ?? p("utc_time"));

  const ibuttonRaw = p("ibutton") ?? p("ibutton_id") ?? p("driver_key") ?? p("rfid");

  const doorRaw = p("door") ?? p("din3");
  const door = parseBoolLike(doorRaw);
  const externalPower = parseBoolLike(p("external_power") ?? p("main_power"));

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
    recorded_at,
    // Accelerometer-driven behaviour & safety events (Teltonika FMB920 built-in detection)
    harshAccel: parseBoolLike(p("harsh_accel") ?? p("harshaccel")),
    harshBrake: parseBoolLike(p("harsh_brake") ?? p("harshbrake")),
    harshCorner: parseBoolLike(p("harsh_corner") ?? p("harshcorner")),
    crash: parseBoolLike(p("crash") ?? p("crash_event")),
    gforce: toNumber(p("gforce") ?? p("g_force")),
    towing: parseBoolLike(p("towing")),
    jamming: parseBoolLike(p("jamming") ?? p("gsm_jamming")),
    // Panic/SOS button and alarm/door digital inputs
    panic: parseBoolLike(p("panic") ?? p("sos") ?? p("din2")),
    alarm: parseBoolLike(p("alarm") ?? p("din4")),
    door,
    externalPower,
    // 1-Wire iButton driver identification
    ibutton: ibuttonRaw ? String(ibuttonRaw).trim() : null,
    // 1-Wire / BLE sensors
    temperature: toNumber(p("temperature") ?? p("temp")),
    humidity: toNumber(p("humidity")),
    // Odometer & engine hours (explicit from device, or derived below)
    odometerKm: toNumber(p("odometer_km") ?? p("odometer") ?? p("total_odometer")),
    engineHours: toNumber(p("engine_hours") ?? p("enginehours")),
    // Extended diagnostics (Teltonika AVL IO elements)
    satellites: toNumber(p("satellites") ?? p("sats")),
    hdop: toNumber(p("hdop")),
    pdop: toNumber(p("pdop")),
    gnssStatus: toNumber(p("gnss_status")),
    gsmSignal: toNumber(p("gsm_signal")),
    gsmOperator: toNumber(p("gsm_operator")),
    sleepMode: toNumber(p("sleep_mode")),
    movement: parseBoolLike(p("movement")),
    batteryVoltageMv: toNumber(p("battery_voltage_mv")),
    batteryCurrentMa: toNumber(p("battery_current_ma")),
    externalVoltageMv: toNumber(p("external_voltage_mv")),
  };
}

interface IngestResult {
  ok?: boolean;
  test?: boolean;
  error?: string;
  device_id?: string;
  organization_id?: string;
  vehicle_id?: string | null;
  recorded_at?: string;
  command?: string | null;
  latitude?: number;
  longitude?: number;
  critical_events?: Array<{ type: string; message: string }>;
}

/** Map a parsed ping to the flat record shape expected by the ingest RPCs. */
function toIngestRecord(data: ReturnType<typeof parsePayload>, imei: string | null): Record<string, unknown> {
  const rec: Record<string, unknown> = {
    imei,
    latitude: data.latitude,
    longitude: data.longitude,
    speed_kmh: data.speed_kmh,
    course: data.course,
    altitude: data.altitude,
    accuracy: data.accuracy,
    battery: data.battery,
    ignition: data.ignition,
    door_open: data.door,
    external_power: data.externalPower,
    satellites: data.satellites === null ? null : Math.round(data.satellites),
    hdop: data.hdop,
    pdop: data.pdop,
    gnss_status: data.gnssStatus === null ? null : Math.round(data.gnssStatus),
    gsm_signal: data.gsmSignal === null ? null : Math.round(data.gsmSignal),
    gsm_operator: data.gsmOperator === null ? null : Math.round(data.gsmOperator),
    sleep_mode: data.sleepMode === null ? null : Math.round(data.sleepMode),
    movement: data.movement,
    battery_voltage_mv: data.batteryVoltageMv === null ? null : Math.round(data.batteryVoltageMv),
    battery_current_ma: data.batteryCurrentMa === null ? null : Math.round(data.batteryCurrentMa),
    external_voltage_mv: data.externalVoltageMv === null ? null : Math.round(data.externalVoltageMv),
    harsh_accel: data.harshAccel,
    harsh_brake: data.harshBrake,
    harsh_corner: data.harshCorner,
    crash: data.crash,
    gforce: data.gforce,
    towing: data.towing,
    jamming: data.jamming,
    panic: data.panic,
    alarm: data.alarm,
    ibutton: data.ibutton,
    temperature: data.temperature,
    humidity: data.humidity,
    odometer_km: data.odometerKm,
    engine_hours: data.engineHours,
  };
  if (data.recorded_at) rec.recorded_at = data.recorded_at;
  return rec;
}

/** Prefix record keys with p_ for the named-arg single-record RPC. */
function recordToRpcArgs(rec: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) args[`p_${k}`] = v;
  return args;
}

function isValidCoords(lat: number | null, lon: number | null): boolean {
  return lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Optional shared secret between collector and ingest: when COLLECTOR_SECRET
  // is set in the function's env, callers must present it in x-collector-key.
  const collectorSecret = Deno.env.get("COLLECTOR_SECRET");
  if (collectorSecret && req.headers.get("x-collector-key") !== collectorSecret) {
    return corsResponse({ error: "Unauthorized collector" }, 401);
  }

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
  const isTest = (url.searchParams.get("test") ?? body?.test) ? true : false;

  // Batch mode: { imei, records: [...] } — the collector sends a whole AVL
  // packet (often many records after reconnect) as ONE RPC call.
  const MAX_BATCH = 100;
  let batchRecords = Array.isArray(body?.records) ? (body!.records as Record<string, unknown>[]) : null;
  if (batchRecords && batchRecords.length > MAX_BATCH) {
    console.warn(`[ingest] batch truncated from ${batchRecords.length} to ${MAX_BATCH} records`);
    batchRecords = batchRecords.slice(0, MAX_BATCH);
  }

  if (batchRecords) {
    const imei = body?.imei ?? url.searchParams.get("imei");
    if (!imei || typeof imei !== "string") {
      return corsResponse({ error: "Missing device identifier (imei)" }, 400);
    }

    const parsed: Record<string, unknown>[] = [];
    const invalid: unknown[] = [];
    for (const raw of batchRecords) {
      const rec = parsePayload(url, { ...raw, imei });
      if (!isValidCoords(rec.latitude, rec.longitude)) {
        invalid.push({ error: "Missing or invalid coordinates" });
        continue;
      }
      parsed.push(toIngestRecord(rec, imei));
    }
    if (parsed.length === 0) {
      return corsResponse({ error: "No valid records in batch", results: invalid }, 400);
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc("ingest_position_batch", { p_records: parsed });
    if (rpcError) {
      console.error("[ingest] batch rpc failed", rpcError);
      return corsResponse({ error: "Failed to process telemetry" }, 500);
    }

    const result = (rpcData ?? null) as { results?: IngestResult[] } | null;
    const results = result?.results ?? [];

    // Critical-event email dispatch per record (no-op unless critical events exist)
    for (const r of results) {
      const criticalEvents = Array.isArray(r.critical_events) ? r.critical_events : [];
      if (criticalEvents.length > 0 && r.organization_id) {
        try {
          await sendCriticalAlertEmails(supabase, r.organization_id, criticalEvents, {
            vehicleId: r.vehicle_id ?? null,
            latitude: r.latitude!,
            longitude: r.longitude!,
            recordedAt: r.recorded_at!,
          });
        } catch (err) {
          console.error("[ingest] alert email dispatch failed", err);
        }
      }
    }

    return corsResponse({ ok: true, results });
  }

  // Single-record mode (live pings, connectivity tests, third-party integrations)
  const data = parsePayload(url, body);

  if (!data.ident) return corsResponse({ error: "Missing device identifier (imei)" }, 400);
  if (!isValidCoords(data.latitude, data.longitude)) {
    return corsResponse({ error: "Missing or invalid coordinates" }, 400);
  }

  // Single server-side RPC: resolves the device, stores telemetry, derives
  // events/alerts/trips/odometer/maintenance, and returns any pending command.
  const args: Record<string, unknown> = recordToRpcArgs(toIngestRecord(data, data.ident));
  args.p_test = isTest;

  const { data: rpcData, error: rpcError } = await supabase.rpc("ingest_position", args);
  if (rpcError) {
    console.error("[ingest] rpc failed", rpcError);
    return corsResponse({ error: "Failed to process telemetry" }, 500);
  }

  const result = (rpcData ?? null) as IngestResult | null;
  if (!result || typeof result !== "object") {
    return corsResponse({ error: "Ingest failed" }, 500);
  }
  if (result.error === "UNKNOWN_DEVICE") {
    return corsResponse({ error: "Unknown device — register it first in Asset Management" }, 404);
  }

  if (result.test) {
    return corsResponse({ ok: true, test: true, device_id: result.device_id, message: "Device recognized" });
  }

  // Critical events also surface as actionable alerts in the notification inbox
  const criticalEvents = Array.isArray(result.critical_events) ? result.critical_events : [];
  if (criticalEvents.length > 0) {
    try {
      await sendCriticalAlertEmails(supabase, result.organization_id!, criticalEvents, {
        vehicleId: result.vehicle_id ?? null,
        latitude: result.latitude!,
        longitude: result.longitude!,
        recordedAt: result.recorded_at!,
      });
    } catch (err) {
      console.error("[ingest] alert email dispatch failed", err);
    }
  }

  return corsResponse({
    ok: true,
    device_id: result.device_id,
    recorded_at: result.recorded_at,
    command: result.command ?? null,
  });
});

const CRITICAL_EVENT_LABELS: Record<string, string> = {
  PANIC: "Panic / SOS",
  CRASH: "Crash detected",
  TOWING: "Possible towing",
  JAMMING: "GSM jamming",
  ALARM: "Alarm triggered",
  POWER_CUT: "Power disconnected",
  LOW_BATTERY: "Low backup battery",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatUtc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

async function sendCriticalAlertEmails(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  orgId: string,
  criticalEvents: Array<{ type: string; message: string }>,
  context: {
    vehicleId: string | null;
    latitude: number;
    longitude: number;
    recordedAt: string;
  },
) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) return;

  const { data: org } = await supabase
    .from("organizations")
    .select("name, alert_emails")
    .eq("id", orgId)
    .maybeSingle();

  const recipients: string[] = org?.alert_emails ?? [];
  if (recipients.length === 0) return;

  let vehicleLabel = "Unassigned device";
  if (context.vehicleId) {
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("name, registration_number")
      .eq("id", context.vehicleId)
      .maybeSingle();
    if (vehicle) {
      vehicleLabel = vehicle.registration_number
        ? `${vehicle.name} (${vehicle.registration_number})`
        : vehicle.name;
    }
  }

  const orgName = escapeHtml(org?.name ?? "Your fleet");
  const plural = criticalEvents.length > 1 ? "s" : "";
  const labels = criticalEvents.map((e) => CRITICAL_EVENT_LABELS[e.type] ?? e.type);
  const primaryLabel = labels[0];
  const extraLabel = labels.length > 1 ? ` +${labels.length - 1} more` : "";

  const eventRows = criticalEvents
    .map((e) => {
      const label = escapeHtml(CRITICAL_EVENT_LABELS[e.type] ?? e.type);
      const message = escapeHtml(e.message ?? e.type);
      return `
        <tr>
          <td style="padding:0 0 12px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-left:4px solid #e11d48;border-radius:6px;">
              <tr>
                <td style="padding:14px 16px;">
                  <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#be123c;">${label}</p>
                  <p style="margin:0;font-size:14px;line-height:1.5;color:#374151;">${message}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join("");

  const mapsUrl = `https://maps.google.com/?q=${context.latitude},${context.longitude}`;
  const dashboardUrl = Deno.env.get("APP_URL")
    ? `${Deno.env.get("APP_URL")?.replace(/\/$/, "")}/monitoring/events`
    : null;

  const ctaButton = dashboardUrl
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px 0;">
        <tr>
          <td style="background:#4f46e5;border-radius:8px;">
            <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Open events dashboard</a>
          </td>
        </tr>
      </table>`
    : "";

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#eef1f6;">
    <div style="display:none;max-height:0;overflow:hidden;">${criticalEvents.length} critical fleet event${plural} on ${vehicleLabel} needs your attention.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#0e1a33;padding:22px 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;">
                      <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">Yamaha<span style="color:#818cf8;">Pulse</span></p>
                      <p style="margin:2px 0 0 0;font-size:12px;color:#94a3b8;">Fleet alerts &middot; ${orgName}</p>
                    </td>
                    <td align="right" style="font-family:Arial,Helvetica,sans-serif;">
                      <span style="display:inline-block;padding:5px 12px;background:#e11d48;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border-radius:999px;">Critical</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;">
                <h1 style="margin:0 0 8px 0;font-size:20px;line-height:1.3;color:#111827;">Critical event${plural} detected</h1>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">
                  ${criticalEvents.length} critical event${plural} <strong>${plural ? "were" : "was"}</strong> reported by the tracker on
                  <strong>${escapeHtml(vehicleLabel)}</strong> on ${formatUtc(context.recordedAt)}.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 4px 28px;font-family:Arial,Helvetica,sans-serif;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${eventRows}</table>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
                  <tr>
                    <td style="padding:14px 16px;font-size:13px;line-height:1.8;color:#334155;">
                      <strong>Vehicle:</strong> ${escapeHtml(vehicleLabel)}<br/>
                      <strong>Time:</strong> ${formatUtc(context.recordedAt)}<br/>
                      <strong>Location:</strong>
                      <a href="${mapsUrl}" style="color:#4f46e5;text-decoration:none;">${context.latitude.toFixed(5)}, ${context.longitude.toFixed(5)} &mdash; view on Google Maps</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;">${ctaButton}</td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px 28px;font-family:Arial,Helvetica,sans-serif;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
                  You are receiving this because you are configured as a critical alert recipient for ${orgName}.
                  Recipients are managed in <strong>Organization settings</strong>. GPS coordinates are approximate.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px;font-family:Arial,Helvetica,sans-serif;">
                <p style="margin:0;font-size:11px;color:#94a3b8;">&copy; YamahaPulse &middot; Automated fleet monitoring &middot; YamahaAlerts@ipmanpay.cloud</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `CRITICAL ALERT — ${org?.name ?? "Your fleet"}\n\n` +
    criticalEvents.map((e) => `- ${CRITICAL_EVENT_LABELS[e.type] ?? e.type}: ${e.message}`).join("\n") +
    `\n\nVehicle: ${vehicleLabel}\nTime: ${formatUtc(context.recordedAt)}\nLocation: ${mapsUrl}\n` +
    (dashboardUrl ? `\nOpen dashboard: ${dashboardUrl}\n` : "");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "YamahaPulse Alerts <YamahaAlerts@ipmanpay.cloud>",
      to: recipients,
      subject: `🚨 Critical Alert: ${primaryLabel}${extraLabel} — ${vehicleLabel}`,
      html,
      text,
    }),
  });

  if (!res.ok) {
    console.error("[ingest] resend email send failed", await res.text());
  } else {
    console.log(`[ingest] critical alert email sent to ${recipients.length} recipient(s)`);
  }
}
