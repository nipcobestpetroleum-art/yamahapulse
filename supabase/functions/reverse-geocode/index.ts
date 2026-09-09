import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PositionRequest {
  deviceId: string;
  recordedAt: string;
  latitude: number;
  longitude: number;
}

interface GoogleGeocodingResponse {
  status: string;
  error_message?: string;
  results?: Array<{ formatted_address?: string }>;
}

interface GooglePlacesResponse {
  places?: Array<{ displayName?: { text?: string } }>;
  error?: { message?: string };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isPositionRequest(value: unknown): value is PositionRequest {
  if (!value || typeof value !== "object") return false;
  const position = value as Partial<PositionRequest>;
  return (
    typeof position.deviceId === "string" &&
    typeof position.recordedAt === "string" &&
    typeof position.latitude === "number" &&
    Number.isFinite(position.latitude) &&
    Math.abs(position.latitude) <= 90 &&
    typeof position.longitude === "number" &&
    Number.isFinite(position.longitude) &&
    Math.abs(position.longitude) <= 180
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const token = authHeader.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) {
    console.warn("[reverse-geocode] rejected invalid authentication token");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const googleApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!googleApiKey) {
    console.warn("[reverse-geocode] GOOGLE_MAPS_API_KEY is not configured");
    return jsonResponse({ error: "Google reverse geocoding is not configured", code: "GOOGLE_MAPS_NOT_CONFIGURED" }, 503);
  }

  let body: { organizationId?: unknown; positions?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const requestedPositions = Array.isArray(body.positions)
    ? body.positions.filter(isPositionRequest).slice(0, 25)
    : [];
  if (!organizationId || requestedPositions.length === 0) {
    return jsonResponse({ error: "organizationId and at least one valid position are required" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: membership, error: membershipError } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (membershipError) {
    console.error("[reverse-geocode] organization membership lookup failed", membershipError);
    return jsonResponse({ error: "Unable to verify organization access" }, 500);
  }
  if (!membership) return jsonResponse({ error: "Forbidden" }, 403);

  const deviceIds = [...new Set(requestedPositions.map((position) => position.deviceId))];
  const { data: latestRows, error: latestError } = await admin
    .from("latest_positions")
    .select("device_id,recorded_at,latitude,longitude,address,place_name")
    .eq("organization_id", organizationId)
    .in("device_id", deviceIds);
  if (latestError) {
    console.error("[reverse-geocode] latest position lookup failed", latestError);
    return jsonResponse({ error: "Unable to load current positions" }, 500);
  }

  const latestByDevice = new Map((latestRows ?? []).map((row) => [row.device_id, row]));
  const eligible = requestedPositions.filter((position) => {
    const current = latestByDevice.get(position.deviceId);
    return (
      current &&
      current.recorded_at === position.recordedAt &&
      Math.abs(current.latitude - position.latitude) < 0.000001 &&
      Math.abs(current.longitude - position.longitude) < 0.000001
    );
  });

  const addresses: Record<string, string> = {};
  const placeNames: Record<string, string> = {};
  let failures = 0;

  for (const position of eligible) {
    const current = latestByDevice.get(position.deviceId)!;
    let address = current.address ?? undefined;
    let placeName = current.place_name ?? undefined;

    try {
      if (!address) {
        const geocodeUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
        geocodeUrl.searchParams.set("latlng", `${position.latitude},${position.longitude}`);
        geocodeUrl.searchParams.set("key", googleApiKey);
        const response = await fetch(geocodeUrl);
        const result = (await response.json()) as GoogleGeocodingResponse;
        address = result.status === "OK" ? result.results?.[0]?.formatted_address : undefined;
        if (!response.ok || !address) {
          failures += 1;
          console.warn("[reverse-geocode] Google did not return an address", {
            deviceId: position.deviceId,
            status: result.status,
            error: result.error_message,
          });
        }
      }

      if (!placeName) {
        const placesResponse = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": googleApiKey,
            "X-Goog-FieldMask": "places.displayName",
          },
          body: JSON.stringify({
            includedTypes: ["establishment"],
            maxResultCount: 1,
            rankPreference: "DISTANCE",
            locationRestriction: {
              circle: {
                center: { latitude: position.latitude, longitude: position.longitude },
                radius: 100,
              },
            },
          }),
        });
        const result = (await placesResponse.json()) as GooglePlacesResponse;
        placeName = result.places?.[0]?.displayName?.text;
        if (!placesResponse.ok || !placeName) {
          console.warn("[reverse-geocode] Google did not return a nearby place", {
            deviceId: position.deviceId,
            status: placesResponse.status,
            error: result.error?.message,
          });
        }
      }

      if (address) addresses[position.deviceId] = address;
      if (placeName) placeNames[position.deviceId] = placeName;
      if (!address && !placeName) continue;

      const cache: Record<string, string> = {};
      if (address) cache.address = address;
      if (placeName) cache.place_name = placeName;
      const [latestUpdate, historyUpdate] = await Promise.all([
        admin
          .from("latest_positions")
          .update(cache)
          .eq("organization_id", organizationId)
          .eq("device_id", position.deviceId)
          .eq("recorded_at", position.recordedAt),
        admin
          .from("positions")
          .update(cache)
          .eq("organization_id", organizationId)
          .eq("device_id", position.deviceId)
          .eq("recorded_at", position.recordedAt),
      ]);
      if (latestUpdate.error || historyUpdate.error) {
        console.error("[reverse-geocode] location cache update failed", {
          deviceId: position.deviceId,
          latestError: latestUpdate.error,
          historyError: historyUpdate.error,
        });
      }
    } catch (error) {
      failures += 1;
      console.error("[reverse-geocode] Google request failed", { deviceId: position.deviceId, error });
    }
  }

  console.info("[reverse-geocode] request completed", {
    userId: userData.user.id,
    organizationId,
    requested: requestedPositions.length,
    resolved: Object.keys(addresses).length,
    nearbyPlaces: Object.keys(placeNames).length,
    failures,
  });
  return jsonResponse({ addresses, placeNames, failures });
});
