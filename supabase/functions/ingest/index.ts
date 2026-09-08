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

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  const isTest = (url.searchParams.get("test") ?? body?.test) ? true : false;

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

  // Connectivity test: confirm the device is recognized without writing any position data
  if (isTest) {
    return corsResponse({ ok: true, test: true, device_id: device.id, message: "Device recognized" });
  }

  // Find the vehicle this device is currently assigned to
  const { data: assignment } = await supabase
    .from("device_assignments")
    .select("vehicle_id")
    .eq("device_id", device.id)
    .is("unassigned_at", null)
    .maybeSingle();

  const vehicleId: string | null = assignment?.vehicle_id ?? null;
  const orgId: string = device.organization_id;

  // Fetch the previous snapshot before we overwrite it, so we can derive
  // distance travelled and elapsed time for odometer / engine-hour tracking.
  const { data: previousPosition } = await supabase
    .from("latest_positions")
    .select(
      "latitude, longitude, recorded_at, ignition, door_open, external_power, idle_since, idle_alerted, low_battery_alerted, satellites, movement",
    )
    .eq("device_id", device.id)
    .maybeSingle();

  const now = new Date();
  const recordedAt = data.recorded_at ? new Date(data.recorded_at) : now;
  if (isNaN(recordedAt.getTime())) recordedAt.setTime(now.getTime());

  const position = {
    device_id: device.id,
    organization_id: orgId,
    vehicle_id: vehicleId,
    recorded_at: recordedAt.toISOString(),
    latitude: data.latitude,
    longitude: data.longitude,
    speed: data.speed_kmh,
    course: data.course,
    altitude: data.altitude,
    accuracy: data.accuracy,
    battery_level: data.battery,
    ignition: data.ignition,
    door_open: data.door,
    external_power: data.externalPower,
    satellites: data.satellites,
    hdop: data.hdop,
    pdop: data.pdop,
    gnss_status: data.gnssStatus,
    gsm_signal: data.gsmSignal,
    gsm_operator: data.gsmOperator,
    sleep_mode: data.sleepMode,
    movement: data.movement,
    battery_voltage_mv: data.batteryVoltageMv,
    battery_current_ma: data.batteryCurrentMa,
    external_voltage_mv: data.externalVoltageMv,
  };

  // Insert history row
  const { error: insertError } = await supabase.from("positions").insert(position);
  if (insertError) return corsResponse({ error: "Failed to store position" }, 500);

  // Excessive idling: ignition on + near-zero speed sustained past the org's configured threshold.
  const isIdlingNow = data.ignition === true && data.speed_kmh !== null && data.speed_kmh <= 2;
  let idleSince: Date | null = previousPosition?.idle_since ? new Date(previousPosition.idle_since) : null;
  let idleAlerted = previousPosition?.idle_alerted ?? false;
  let idleEventDurationMinutes = 0;

  if (isIdlingNow) {
    if (!idleSince) idleSince = recordedAt;
  } else {
    idleSince = null;
    idleAlerted = false;
  }

  if (isIdlingNow && idleSince && !idleAlerted) {
    const { data: idleRule } = await supabase
      .from("alert_rules")
      .select("idle_minutes")
      .eq("organization_id", orgId)
      .eq("type", "IDLE")
      .eq("enabled", true)
      .not("idle_minutes", "is", null)
      .limit(1)
      .maybeSingle();

    if (idleRule?.idle_minutes) {
      idleEventDurationMinutes = (recordedAt.getTime() - idleSince.getTime()) / 60_000;
      if (idleEventDurationMinutes >= idleRule.idle_minutes) idleAlerted = true;
    }
  }

  // Low battery: debounced so we alert once per drop below threshold, then reset once recovered.
  let lowBatteryAlerted = previousPosition?.low_battery_alerted ?? false;
  let lowBatteryTriggered = false;
  let batteryThreshold: number | null = null;

  if (data.battery !== null) {
    const { data: batteryRule } = await supabase
      .from("alert_rules")
      .select("battery_threshold")
      .eq("organization_id", orgId)
      .eq("type", "LOW_BATTERY")
      .eq("enabled", true)
      .not("battery_threshold", "is", null)
      .limit(1)
      .maybeSingle();

    batteryThreshold = batteryRule?.battery_threshold ?? null;

    if (batteryThreshold !== null) {
      if (data.battery < batteryThreshold) {
        if (!lowBatteryAlerted) lowBatteryTriggered = true;
        lowBatteryAlerted = true;
      } else if (data.battery >= batteryThreshold + 5) {
        lowBatteryAlerted = false;
      }
    }
  }

  // Update the live "latest" snapshot
  await supabase.from("latest_positions").upsert(
    {
      ...position,
      updated_at: now.toISOString(),
      idle_since: idleSince?.toISOString() ?? null,
      idle_alerted: idleAlerted,
      low_battery_alerted: lowBatteryAlerted,
    },
    { onConflict: "device_id" },
  );

  // Device heartbeat
  await supabase
    .from("gps_devices")
    .update({
      last_seen_at: now.toISOString(),
      status: device.status === "IN_STOCK" ? "ACTIVE" : device.status,
    })
    .eq("id", device.id);

  const events: Array<{
    type: string;
    severity: "info" | "warning" | "critical";
    message: string;
    metadata?: Record<string, unknown>;
  }> = [];

  if (data.harshAccel) events.push({ type: "HARSH_ACCEL", severity: "warning", message: "Harsh acceleration detected" });
  if (data.harshBrake) events.push({ type: "HARSH_BRAKE", severity: "warning", message: "Harsh braking detected" });
  if (data.harshCorner) events.push({ type: "HARSH_CORNER", severity: "warning", message: "Harsh cornering detected" });
  if (data.towing) events.push({ type: "TOWING", severity: "critical", message: "Vehicle moved while ignition is off — possible towing" });
  if (data.jamming) events.push({ type: "JAMMING", severity: "critical", message: "GSM signal jamming detected" });
  if (data.panic) events.push({ type: "PANIC", severity: "critical", message: "Panic/SOS button pressed" });
  if (data.alarm) events.push({ type: "ALARM", severity: "critical", message: "Vehicle alarm triggered" });
  if (data.door !== null && previousPosition && data.door !== previousPosition.door_open) {
    events.push(
      data.door
        ? { type: "DOOR_OPEN", severity: "warning", message: "Door opened" }
        : { type: "DOOR_CLOSE", severity: "info", message: "Door closed" },
    );
  }
  // Ignition transitions (these also drive automatic trip detection)
  if (data.ignition === true && previousPosition?.ignition === false) {
    events.push({ type: "IGNITION_ON", severity: "info", message: "Ignition turned on" });
  }
  if (data.ignition === false && previousPosition?.ignition === true) {
    events.push({ type: "IGNITION_OFF", severity: "info", message: "Ignition turned off" });
  }
  // Built-in movement sensor transitions
  if (data.movement === true && previousPosition?.movement === false) {
    events.push({ type: "MOVING", severity: "info", message: "Movement started" });
  }
  if (data.movement === false && previousPosition?.movement === true) {
    events.push({ type: "STOPPED", severity: "info", message: "Movement stopped" });
  }
  // GNSS fix lost / restored
  if (data.satellites !== null && previousPosition?.satellites !== null && previousPosition?.satellites !== undefined) {
    if (data.satellites === 0 && previousPosition.satellites > 0) {
      events.push({ type: "GPS_LOST", severity: "warning", message: "GNSS fix lost — no satellites in view" });
    } else if (data.satellites > 0 && previousPosition.satellites === 0) {
      events.push({
        type: "GPS_RESTORED",
        severity: "info",
        message: `GNSS fix restored (${data.satellites} satellites)`,
      });
    }
  }
  if (data.crash) {
    events.push({
      type: "CRASH",
      severity: "critical",
      message: data.gforce ? `Crash detected (${data.gforce.toFixed(1)}G)` : "Crash detected",
      metadata: { gforce: data.gforce },
    });
  }

  // External power lost/restored — a common tamper/unplug signal
  if (
    data.externalPower !== null &&
    previousPosition?.external_power !== null &&
    previousPosition?.external_power !== undefined &&
    data.externalPower !== previousPosition.external_power
  ) {
    events.push(
      data.externalPower
        ? { type: "POWER_RESTORED", severity: "info", message: "External power restored" }
        : { type: "POWER_CUT", severity: "critical", message: "External power lost — possible tamper or unplug" },
    );
  }

  // Excessive idling
  if (isIdlingNow && idleAlerted && idleEventDurationMinutes > 0) {
    events.push({
      type: "IDLE",
      severity: "warning",
      message: `Vehicle idling for over ${Math.round(idleEventDurationMinutes)} minutes`,
      metadata: { idle_minutes: Math.round(idleEventDurationMinutes) },
    });
  }

  // Low battery
  if (lowBatteryTriggered && batteryThreshold !== null) {
    events.push({
      type: "LOW_BATTERY",
      severity: "warning",
      message: `Device battery at ${data.battery}% — below the ${batteryThreshold}% threshold`,
      metadata: { battery: data.battery, threshold: batteryThreshold },
    });
  }

  // Geofence containment: track enter/exit and apply geofence-scoped speed zones
  const { data: geofences } = await supabase
    .from("geofences")
    .select("id, name, geometry")
    .eq("organization_id", orgId)
    .eq("is_active", true);

  const insideGeofenceIds: string[] = [];
  const insideGeofenceNames = new Map<string, string>();

  for (const gf of geofences ?? []) {
    if (gf.geometry?.type !== "circle") continue;
    const { center, radius } = gf.geometry.coordinates;
    const distanceKm = haversineKm(center[0], center[1], data.latitude, data.longitude);
    if (distanceKm * 1000 <= radius) {
      insideGeofenceIds.push(gf.id);
      insideGeofenceNames.set(gf.id, gf.name);
    }
  }

  if (geofences && geofences.length > 0) {
    const { data: states } = await supabase
      .from("geofence_states")
      .select("geofence_id, inside")
      .eq("device_id", device.id);

    const stateByGeofence = new Map((states ?? []).map((s: { geofence_id: string; inside: boolean }) => [s.geofence_id, s.inside]));

    for (const gf of geofences) {
      const nowInside = insideGeofenceIds.includes(gf.id);
      const wasInside = stateByGeofence.get(gf.id) ?? false;
      if (nowInside !== wasInside) {
        events.push({
          type: nowInside ? "GEOFENCE_ENTER" : "GEOFENCE_EXIT",
          severity: "info",
          message: `Vehicle ${nowInside ? "entered" : "exited"} ${gf.name}`,
          metadata: { geofence_id: gf.id, geofence_name: gf.name },
        });
        await supabase
          .from("geofence_states")
          .upsert(
            { device_id: device.id, geofence_id: gf.id, organization_id: orgId, inside: nowInside },
            { onConflict: "device_id,geofence_id" },
          );
      }
    }
  }

  // Overspeed check — a geofence-scoped speed zone takes priority over the org-wide limit
  if (data.speed_kmh !== null) {
    const { data: speedRules } = await supabase
      .from("alert_rules")
      .select("speed_limit, geofence_id")
      .eq("organization_id", orgId)
      .eq("type", "OVERSPEED")
      .eq("enabled", true)
      .not("speed_limit", "is", null);

    const zoneRule = (speedRules ?? []).find(
      (r: { geofence_id: string | null }) => r.geofence_id && insideGeofenceIds.includes(r.geofence_id),
    );
    const globalRule = (speedRules ?? []).find((r: { geofence_id: string | null }) => !r.geofence_id);
    const activeRule = zoneRule ?? globalRule;

    if (activeRule?.speed_limit && data.speed_kmh > activeRule.speed_limit) {
      const zoneName = zoneRule ? insideGeofenceNames.get(zoneRule.geofence_id) : null;
      events.push({
        type: "OVERSPEED",
        severity: "warning",
        message: zoneName
          ? `Speed ${data.speed_kmh} km/h exceeds ${zoneName} zone limit of ${activeRule.speed_limit} km/h`
          : `Speed ${data.speed_kmh} km/h exceeds limit of ${activeRule.speed_limit} km/h`,
        metadata: { limit: activeRule.speed_limit, geofence_id: zoneRule?.geofence_id ?? null },
      });
    }
  }

  if (events.length > 0) {
    const { error: eventsError } = await supabase.from("device_events").insert(
      events.map((e) => ({
        organization_id: orgId,
        device_id: device.id,
        vehicle_id: vehicleId,
        type: e.type,
        severity: e.severity,
        message: e.message,
        latitude: data.latitude,
        longitude: data.longitude,
        speed: data.speed_kmh,
        metadata: e.metadata ?? {},
      })),
    );
    if (eventsError) console.error("[ingest] failed to insert device events", eventsError);

    // Critical events also surface as actionable alerts in the notification inbox
    const criticalTypes = ["PANIC", "CRASH", "TOWING", "JAMMING", "ALARM", "POWER_CUT", "LOW_BATTERY"];
    const criticalEvents = events.filter((e) => criticalTypes.includes(e.type));
    if (criticalEvents.length > 0) {
      const { error: alertsError } = await supabase.from("alerts").insert(
        criticalEvents.map((e) => ({
          organization_id: orgId,
          device_id: device.id,
          vehicle_id: vehicleId,
          type: e.type,
          severity: e.severity,
          message: e.message,
          latitude: data.latitude,
          longitude: data.longitude,
        })),
      );
      if (alertsError) console.error("[ingest] failed to insert alerts", alertsError);

      try {
        await sendCriticalAlertEmails(supabase, orgId, criticalEvents, {
          vehicleId,
          latitude: data.latitude,
          longitude: data.longitude,
          recordedAt: position.recorded_at,
        });
      } catch (err) {
        console.error("[ingest] alert email dispatch failed", err);
      }
    }
  }

  // Odometer & engine-hour tracking, feeding telemetry-driven maintenance triggers
  if (vehicleId) {
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("odometer, engine_hours")
      .eq("id", vehicleId)
      .maybeSingle();

    if (vehicle) {
      let newOdometer = vehicle.odometer ?? 0;
      let newEngineHours = vehicle.engine_hours ?? 0;

      if (data.odometerKm !== null) {
        newOdometer = data.odometerKm;
      } else if (previousPosition) {
        const deltaKm = haversineKm(
          previousPosition.latitude,
          previousPosition.longitude,
          data.latitude,
          data.longitude,
        );
        // Ignore implausible GPS jumps (e.g. cold-start fix drift) between pings.
        if (deltaKm > 0 && deltaKm < 5) newOdometer = Number((newOdometer + deltaKm).toFixed(2));
      }

      if (data.engineHours !== null) {
        newEngineHours = data.engineHours;
      } else if (previousPosition?.recorded_at && data.ignition) {
        const elapsedHours =
          (recordedAt.getTime() - new Date(previousPosition.recorded_at).getTime()) / 3_600_000;
        if (elapsedHours > 0 && elapsedHours < 1) {
          newEngineHours = Number((newEngineHours + elapsedHours).toFixed(2));
        }
      }

      if (newOdometer !== vehicle.odometer || newEngineHours !== vehicle.engine_hours) {
        await supabase
          .from("vehicles")
          .update({ odometer: newOdometer, engine_hours: newEngineHours })
          .eq("id", vehicleId);
      }

      try {
        await checkMaintenanceTriggers(supabase, orgId, vehicleId, newOdometer, newEngineHours);
      } catch (err) {
        console.error("[ingest] maintenance trigger check failed", err);
      }

      // Automatic trip detection from ignition transitions
      try {
        await syncAutoTrip({
          supabase,
          orgId,
          vehicleId,
          ignition: data.ignition,
          previousIgnition: previousPosition?.ignition ?? null,
          recordedAt,
          latitude: data.latitude,
          longitude: data.longitude,
          currentOdometer: newOdometer,
        });
      } catch (err) {
        console.error("[ingest] auto trip sync failed", err);
      }
    }

    // iButton driver identification: reassign the active driver on this vehicle
    if (data.ibutton) {
      try {
        await identifyDriver(supabase, orgId, device.id, vehicleId, data.ibutton, data.latitude, data.longitude);
      } catch (err) {
        console.error("[ingest] driver identification failed", err);
      }
    }
  }

  // Temperature / humidity sensor readings (1-Wire probe or BLE beacon)
  if (data.temperature !== null || data.humidity !== null) {
    try {
      await recordSensorReadings(supabase, orgId, device.id, {
        TEMPERATURE: data.temperature,
        HUMIDITY: data.humidity,
      });
    } catch (err) {
      console.error("[ingest] sensor reading capture failed", err);
    }
  }

  // Deliver any pending remote engine control command (relay output) to the collector.
  // The collector is expected to send the corresponding Codec12 command to the device
  // on its next contact; we optimistically mark it sent and reflect the new state.
  let command: { id: string; command: string } | null = null;
  const { data: pendingCommand } = await supabase
    .from("device_commands")
    .select("id, command")
    .eq("device_id", device.id)
    .eq("status", "PENDING")
    .order("requested_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (pendingCommand) {
    command = pendingCommand;
    await supabase
      .from("device_commands")
      .update({ status: "SENT", sent_at: now.toISOString() })
      .eq("id", pendingCommand.id);
    await supabase
      .from("gps_devices")
      .update({ engine_immobilized: pendingCommand.command === "ENGINE_CUT" })
      .eq("id", device.id);
  }

  return corsResponse({
    ok: true,
    device_id: device.id,
    recorded_at: position.recorded_at,
    command: command?.command ?? null,
  });
});

/**
 * Automatic trip detection, driven by ignition transitions:
 *  - ignition ON (rising edge)  -> open an IN_PROGRESS trip (defensively closing any
 *    stale one left open by a missed ignition-off, e.g. after signal loss)
 *  - ignition OFF (falling edge) -> close the open trip with end time/location and
 *    distance derived from the vehicle's odometer delta
 *  - trips open longer than 24 h (device kept reporting with ignition on) are split
 */
async function syncAutoTrip(args: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  orgId: string;
  vehicleId: string;
  ignition: boolean | null;
  previousIgnition: boolean | null;
  recordedAt: Date;
  latitude: number;
  longitude: number;
  currentOdometer: number;
}) {
  const { supabase, orgId, vehicleId, ignition, previousIgnition, recordedAt, latitude, longitude, currentOdometer } =
    args;

  if (ignition === null) return;

  const locationLabel = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

  const fetchOpenTrip = () =>
    supabase
      .from("trips")
      .select("id, start_time, start_odometer")
      .eq("vehicle_id", vehicleId)
      .eq("status", "IN_PROGRESS")
      .limit(1)
      .maybeSingle();

  const closeTrip = (tripId: string, startOdometer: number | null) => {
    const distance =
      startOdometer !== null && startOdometer !== undefined && currentOdometer >= startOdometer
        ? Number((currentOdometer - startOdometer).toFixed(2))
        : null;
    return supabase
      .from("trips")
      .update({
        end_time: recordedAt.toISOString(),
        end_location: locationLabel,
        distance_km: distance,
        status: "COMPLETED",
      })
      .eq("id", tripId);
  };

  const openTrip = async () => {
    const { data: driver } = await supabase
      .from("drivers")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .limit(1)
      .maybeSingle();

    await supabase.from("trips").insert({
      organization_id: orgId,
      vehicle_id: vehicleId,
      driver_id: driver?.id ?? null,
      start_time: recordedAt.toISOString(),
      start_location: locationLabel,
      start_odometer: currentOdometer,
      distance_km: 0,
      status: "IN_PROGRESS",
      auto_generated: true,
      notes: "Auto-detected from GPS telemetry (ignition)",
    });
  };

  const rising = ignition === true && previousIgnition !== true;
  const falling = ignition === false && previousIgnition === true;

  if (falling) {
    const { data: open } = await fetchOpenTrip();
    if (open) await closeTrip(open.id, open.start_odometer);
    return;
  }

  if (rising) {
    // Close any trip left open by a missed ignition-off before starting a fresh one.
    const { data: open } = await fetchOpenTrip();
    if (open) await closeTrip(open.id, open.start_odometer);
    await openTrip();
    return;
  }

  if (ignition === true) {
    // Split marathon sessions: a trip open for over 24 h is closed and a new one starts.
    const { data: open } = await fetchOpenTrip();
    if (open && recordedAt.getTime() - new Date(open.start_time).getTime() > 24 * 3_600_000) {
      await closeTrip(open.id, open.start_odometer);
      await openTrip();
    }
  }
}

async function checkMaintenanceTriggers(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  orgId: string,
  vehicleId: string,
  odometer: number,
  engineHours: number,
) {
  const { data: intervals } = await supabase
    .from("maintenance_intervals")
    .select("id, service_type, interval_km, interval_days, interval_hours, vehicle_id")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .or(`vehicle_id.eq.${vehicleId},vehicle_id.is.null`);

  if (!intervals || intervals.length === 0) return;

  for (const interval of intervals) {
    // An open (scheduled/overdue) auto-generated entry for this service type already covers the next service.
    const { data: openSchedule } = await supabase
      .from("maintenance_schedules")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .eq("service_type", interval.service_type)
      .eq("status", "SCHEDULED")
      .limit(1)
      .maybeSingle();
    if (openSchedule) continue;

    const { data: lastCompleted } = await supabase
      .from("maintenance_schedules")
      .select("due_odometer, due_engine_hours, completed_at")
      .eq("vehicle_id", vehicleId)
      .eq("service_type", interval.service_type)
      .eq("status", "COMPLETED")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let dueNow = false;
    let dueOdometer: number | null = null;
    let dueDate: string | null = null;
    let dueEngineHours: number | null = null;

    if (interval.interval_km) {
      const baseline = lastCompleted?.due_odometer ?? 0;
      dueOdometer = Number((baseline + interval.interval_km).toFixed(2));
      if (odometer >= dueOdometer) dueNow = true;
    }

    if (interval.interval_days) {
      const baseline = lastCompleted?.completed_at ? new Date(lastCompleted.completed_at) : null;
      if (baseline) {
        const due = new Date(baseline.getTime() + interval.interval_days * 86_400_000);
        dueDate = due.toISOString().slice(0, 10);
        if (Date.now() >= due.getTime()) dueNow = true;
      }
    }

    if (interval.interval_hours) {
      const baselineHours = lastCompleted?.due_engine_hours ?? 0;
      dueEngineHours = Number((baselineHours + interval.interval_hours).toFixed(2));
      if (engineHours >= dueEngineHours) dueNow = true;
    }

    if (dueNow) {
      await supabase.from("maintenance_schedules").insert({
        organization_id: orgId,
        vehicle_id: vehicleId,
        service_type: interval.service_type,
        due_date: dueDate,
        due_odometer: dueOdometer,
        due_engine_hours: dueEngineHours,
        status: "SCHEDULED",
        auto_generated: true,
        notes: `Auto-generated from telemetry (odometer ${odometer} km, engine hours ${engineHours}).`,
      });
    }
  }
}

async function identifyDriver(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  orgId: string,
  deviceId: string,
  vehicleId: string,
  ibutton: string,
  latitude: number,
  longitude: number,
) {
  const { data: driver } = await supabase
    .from("drivers")
    .select("id, name, vehicle_id")
    .eq("organization_id", orgId)
    .eq("ibutton_id", ibutton)
    .maybeSingle();

  if (!driver || driver.vehicle_id === vehicleId) return;

  // Free up the vehicle from whoever was previously assigned to it.
  await supabase.from("drivers").update({ vehicle_id: null }).eq("vehicle_id", vehicleId);
  await supabase.from("drivers").update({ vehicle_id: vehicleId }).eq("id", driver.id);

  await supabase
    .from("trips")
    .update({ driver_id: driver.id })
    .eq("vehicle_id", vehicleId)
    .eq("status", "IN_PROGRESS")
    .is("end_time", null);

  await supabase.from("device_events").insert({
    organization_id: orgId,
    device_id: deviceId,
    vehicle_id: vehicleId,
    type: "DRIVER_IDENTIFIED",
    severity: "info",
    message: `${driver.name} identified via iButton`,
    latitude,
    longitude,
    metadata: { driver_id: driver.id },
  });
}

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

async function recordSensorReadings(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  orgId: string,
  deviceId: string,
  readings: Record<string, number | null>,
) {
  for (const [sensorType, value] of Object.entries(readings)) {
    if (value === null) continue;

    const { data: sensors } = await supabase
      .from("asset_sensors")
      .select("id")
      .eq("device_id", deviceId)
      .eq("sensor_type", sensorType)
      .eq("is_active", true);

    if (!sensors || sensors.length === 0) continue;

    const now = new Date().toISOString();
    for (const sensor of sensors) {
      await supabase.from("sensor_readings").insert({
        organization_id: orgId,
        sensor_id: sensor.id,
        value,
        recorded_at: now,
      });
      await supabase
        .from("asset_sensors")
        .update({ last_value: value, last_reading_at: now })
        .eq("id", sensor.id);
    }
  }
}
