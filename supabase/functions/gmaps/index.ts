import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * Google Maps Platform proxy.
 *
 * Exposes every web-facing Google Maps API family through one authenticated
 * endpoint so the API key never reaches the browser:
 *   Maps      -> browser-key (Maps JS load key), static-map, tile (Map Tiles API)
 *   Routes    -> compute-routes, route-matrix, optimize-tours (Route Optimization API)
 *   Roads     -> snap-to-roads, nearest-roads
 *   Places    -> places-autocomplete, place-details, places-search-text
 *   Geocoding -> geocode, reverse-geocode
 *   Geolocation -> geolocate
 *   Data      -> weather-current, weather-forecast, air-quality, pollen, solar
 *   Street View -> streetview (Static Street View image)
 *
 * Images are returned as base64 data URLs so clients can use
 * supabase.functions.invoke() without blob handling.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GOOGLE_HOST = "https://maps.googleapis.com";
const PLACES_HOST = "https://places.googleapis.com";
const ROUTES_HOST = "https://routes.googleapis.com";
const ROADS_HOST = "https://roads.googleapis.com";
const WEATHER_HOST = "https://weather.googleapis.com";
const AIR_HOST = "https://airquality.googleapis.com";
const POLLEN_HOST = "https://pollen.googleapis.com";
const SOLAR_HOST = "https://solar.googleapis.com";
const GEOLOCATE_HOST = "https://www.googleapis.com";
const TILE_HOST = "https://tile.googleapis.com";
const ROUTE_OPT_HOST = "https://routeoptimization.googleapis.com";

interface LatLng {
  latitude: number;
  longitude: number;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function badRequest(message: string) {
  return jsonResponse({ error: message, code: "BAD_REQUEST" }, 400);
}

class ValidationError extends Error {}

function requireNumber(params: Record<string, unknown>, name: string, opts: { min?: number; max?: number; integer?: boolean } = {}): number {
  const raw = params[name];
  if (typeof raw !== "number" || !Number.isFinite(raw)) throw new ValidationError(`${name} must be a number`);
  if (opts.integer && !Number.isInteger(raw)) throw new ValidationError(`${name} must be an integer`);
  if (opts.min !== undefined && raw < opts.min) throw new ValidationError(`${name} must be >= ${opts.min}`);
  if (opts.max !== undefined && raw > opts.max) throw new ValidationError(`${name} must be <= ${opts.max}`);
  return raw;
}

function requireString(params: Record<string, unknown>, name: string, opts: { minLen?: number; maxLen?: number; pattern?: RegExp } = {}): string {
  const raw = params[name];
  if (typeof raw !== "string") throw new ValidationError(`${name} must be a string`);
  if (opts.minLen !== undefined && raw.trim().length < opts.minLen) throw new ValidationError(`${name} is too short`);
  if (opts.maxLen !== undefined && raw.length > opts.maxLen) throw new ValidationError(`${name} is too long`);
  if (opts.pattern && !opts.pattern.test(raw)) throw new ValidationError(`${name} has an invalid format`);
  return raw;
}

function optionalString(params: Record<string, unknown>, name: string, fallback: string, opts: { maxLen?: number; pattern?: RegExp } = {}): string {
  if (params[name] === undefined || params[name] === null) return fallback;
  return requireString(params, name, { maxLen: opts.maxLen ?? 64, pattern: opts.pattern });
}

function optionalBoolean(params: Record<string, unknown>, name: string, fallback = false): boolean {
  const raw = params[name];
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== "boolean") throw new ValidationError(`${name} must be a boolean`);
  return raw;
}

function requireLatLng(params: Record<string, unknown>, name: string): LatLng {
  const raw = params[name];
  if (!raw || typeof raw !== "object") throw new ValidationError(`${name} must be {latitude, longitude}`);
  const point = raw as Record<string, unknown>;
  const latitude = requireNumber(point, "latitude", { min: -90, max: 90 });
  const longitude = requireNumber(point, "longitude", { min: -180, max: 180 });
  return { latitude, longitude };
}

function requireLatLngList(params: Record<string, unknown>, name: string, min: number, max: number): LatLng[] {
  const raw = params[name];
  if (!Array.isArray(raw)) throw new ValidationError(`${name} must be an array of points`);
  if (raw.length < min) throw new ValidationError(`${name} needs at least ${min} point(s)`);
  if (raw.length > max) throw new ValidationError(`${name} allows at most ${max} points`);
  return raw.map((_, index) => requireLatLng({ point: raw[index] }, "point"));
}

function latLngToStringList(points: LatLng[]): string[] {
  return points.map((p) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`);
}

function extractGoogleError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.error_message === "string") return record.error_message;
  if (record.error && typeof record.error === "object") {
    const message = (record.error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  if (typeof record.error === "string") return record.error;
  return null;
}

async function googleJson(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    console.error("[gmaps] google api error", { status: response.status, url: url.slice(0, 160), body: text.slice(0, 300) });
    return jsonResponse(
      { error: extractGoogleError(parsed) ?? `Google API responded with ${response.status}`, code: "GOOGLE_ERROR" },
      502,
    );
  }
  return jsonResponse(parsed);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function googleImage(url: string, label: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("[gmaps] google image api error", { label, status: response.status, body: text.slice(0, 200) });
    return jsonResponse({ error: `Google ${label} request failed (${response.status})`, code: "GOOGLE_ERROR" }, 502);
  }
  const contentType = response.headers.get("content-type") ?? "image/png";
  const base64 = arrayBufferToBase64(await response.arrayBuffer());
  return jsonResponse({ contentType, dataUrl: `data:${contentType};base64,${base64}` });
}

/** Map Tiles API sessions are valid ~2 weeks; cache per map type. */
const tileSessions = new Map<string, { session: string; expiry: number }>();

async function getTileSession(apiKey: string, mapType: string): Promise<string> {
  const cached = tileSessions.get(mapType);
  if (cached && cached.expiry > Date.now() + 60_000) return cached.session;
  const response = await fetch(`${TILE_HOST}/v1/createSession?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mapType, language: "en-US", region: "US" }),
  });
  const data = (await response.json()) as { session?: string; expiry?: string };
  if (!response.ok || !data.session) {
    console.error("[gmaps] tile session creation failed", { status: response.status });
    throw new Error("Map Tiles session creation failed");
  }
  const expiry = data.expiry ? new Date(data.expiry).getTime() : Date.now() + 3_600_000;
  tileSessions.set(mapType, { session: data.session, expiry });
  console.info("[gmaps] tile session created", { mapType, expiry });
  return data.session;
}

const VALID_MAP_TYPES = ["roadmap", "satellite", "terrain", "streetview"] as const;
type MapType = (typeof VALID_MAP_TYPES)[number];

const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{5,200}$/;
const HEX_COLOR_PATTERN = /^(?:[0-9a-fA-F]{6}|blue|green|red|yellow|purple|orange|white|black|gray|brown|pink)$/;
const PROJECT_NUMBER_PATTERN = /^\d{6,32}$/;

async function handleResource(resource: string, params: Record<string, unknown>, apiKey: string): Promise<Response> {
  switch (resource) {
    // ---------- Geocoding ----------
    case "geocode": {
      const address = requireString(params, "address", { minLen: 2, maxLen: 256 });
      const url = new URL(`${GOOGLE_HOST}/maps/api/geocode/json`);
      url.searchParams.set("address", address);
      url.searchParams.set("key", apiKey);
      return googleJson(url.toString());
    }
    case "reverse-geocode": {
      const point = requireLatLng(params, "location");
      const url = new URL(`${GOOGLE_HOST}/maps/api/geocode/json`);
      url.searchParams.set("latlng", `${point.latitude},${point.longitude}`);
      url.searchParams.set("key", apiKey);
      return googleJson(url.toString());
    }

    // ---------- Places ----------
    case "places-autocomplete": {
      const input = requireString(params, "input", { minLen: 2, maxLen: 128 });
      return googleJson(`${PLACES_HOST}/v1/places:autocomplete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
        body: JSON.stringify({ input, languageCode: "en" }),
      });
    }
    case "place-details": {
      const placeId = requireString(params, "placeId", { minLen: 5, maxLen: 200, pattern: PLACE_ID_PATTERN });
      const url = new URL(`${PLACES_HOST}/v1/places/${encodeURIComponent(placeId)}`);
      url.searchParams.set("languageCode", "en");
      const response = await fetch(url, {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "id",
            "displayName",
            "formattedAddress",
            "location",
            "rating",
            "userRatingCount",
            "internationalPhoneNumber",
            "websiteUri",
            "primaryTypeDisplayName",
            "businessStatus",
            "priceLevel",
            "regularOpeningHours",
          ].join(","),
        },
      });
      const text = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text.slice(0, 500) };
      }
      if (!response.ok) {
        console.error("[gmaps] place details error", { status: response.status, body: text.slice(0, 200) });
        return jsonResponse({ error: extractGoogleError(parsed) ?? "Place details failed", code: "GOOGLE_ERROR" }, 502);
      }
      return jsonResponse(parsed);
    }
    case "places-search-text": {
      const query = requireString(params, "query", { minLen: 2, maxLen: 200 });
      return googleJson(`${PLACES_HOST}/v1/places:searchText`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
        },
        body: JSON.stringify({ textQuery: query, maxResultCount: 5, languageCode: "en" }),
      });
    }

    // ---------- Routes ----------
    case "compute-routes": {
      const origin = requireLatLng(params, "origin");
      const destination = requireLatLng(params, "destination");
      const waypoints = params.waypoints === undefined || params.waypoints === null
        ? []
        : requireLatLngList(params, "waypoints", 1, 25);
      const traffic = optionalBoolean(params, "traffic", false);
      const optimize = optionalBoolean(params, "optimize", false);
      const body: Record<string, unknown> = {
        origin: { latLng: origin },
        destination: { latLng: destination },
        travelMode: "DRIVE",
        optimizeWaypointOrder: optimize && waypoints.length > 1,
        units: "METRIC",
      };
      if (traffic) body.routingPreference = "TRAFFIC_AWARE_OPTIMAL";
      if (waypoints.length > 0) body.intermediates = waypoints.map((point) => ({ latLng: point }));
      return googleJson(`${ROUTES_HOST}/directions/v2:computeRoutes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "routes.duration",
            "routes.distanceMeters",
            "routes.polyline.encodedPolyline",
            "routes.legs.duration",
            "routes.legs.distanceMeters",
            "routes.waypointOrder",
          ].join(","),
        },
        body: JSON.stringify(body),
      });
    }
    case "route-matrix": {
      const origins = requireLatLngList(params, "origins", 1, 10);
      const destinations = requireLatLngList(params, "destinations", 1, 10);
      if (origins.length * destinations.length > 100) throw new ValidationError("Matrix is limited to 100 elements");
      return googleJson(`${ROUTES_HOST}/distanceMatrix/v2:computeRouteMatrix`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status",
        },
        body: JSON.stringify({
          origins: origins.map((point) => ({ waypoint: { location: { latLng: point } } })),
          destinations: destinations.map((point) => ({ waypoint: { location: { latLng: point } } })),
          travelMode: "DRIVE",
        }),
      });
    }
    case "optimize-tours": {
      const projectNumber = requireString(params, "projectNumber", { minLen: 6, maxLen: 32, pattern: PROJECT_NUMBER_PATTERN });
      const depot = requireLatLng(params, "depot");
      const stops = requireLatLngList(params, "stops", 2, 24);
      const nowSeconds = Math.floor(Date.now() / 1000);
      return googleJson(`${ROUTE_OPT_HOST}/v1/projects/${projectNumber}:optimizeTours?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: {
            shipments: stops.map((stop) => ({
              pickup: { arrivalLocation: stop },
            })),
            vehicles: [
              {
                travelMode: "DRIVE",
                startLocation: depot,
                endLocation: depot,
              },
            ],
            globalStartTime: { seconds: nowSeconds },
            globalEndTime: { seconds: nowSeconds + 7 * 24 * 3600 },
          },
        }),
      });
    }

    // ---------- Roads ----------
    case "snap-to-roads": {
      const points = requireLatLngList(params, "points", 2, 100);
      const interpolate = optionalBoolean(params, "interpolate", true);
      const url = new URL(`${ROADS_HOST}/v1/snapToRoads`);
      url.searchParams.set("path", latLngToStringList(points).join("|"));
      url.searchParams.set("interpolate", String(interpolate));
      url.searchParams.set("key", apiKey);
      return googleJson(url.toString());
    }
    case "nearest-roads": {
      const points = requireLatLngList(params, "points", 1, 100);
      const url = new URL(`${ROADS_HOST}/v1/nearestRoads`);
      url.searchParams.set("points", latLngToStringList(points).join("|"));
      url.searchParams.set("key", apiKey);
      return googleJson(url.toString());
    }

    // ---------- Weather ----------
    case "weather-current": {
      const location = requireLatLng(params, "location");
      const url = new URL(`${WEATHER_HOST}/v1/currentConditions:lookup`);
      url.searchParams.set("location.latitude", String(location.latitude));
      url.searchParams.set("location.longitude", String(location.longitude));
      url.searchParams.set("weatherUnits", "metric");
      url.searchParams.set("key", apiKey);
      return googleJson(url.toString());
    }
    case "weather-forecast": {
      const location = requireLatLng(params, "location");
      const days = requireNumber(params, "days", { min: 1, max: 10, integer: true });
      const url = new URL(`${WEATHER_HOST}/v1/forecast/days:lookup`);
      url.searchParams.set("location.latitude", String(location.latitude));
      url.searchParams.set("location.longitude", String(location.longitude));
      url.searchParams.set("days", String(days));
      url.searchParams.set("pageSize", String(days));
      url.searchParams.set("weatherUnits", "metric");
      url.searchParams.set("key", apiKey);
      return googleJson(url.toString());
    }

    // ---------- Air quality ----------
    case "air-quality": {
      const location = requireLatLng(params, "location");
      return googleJson(`${AIR_HOST}/v1/currentConditions:lookup?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location,
          extraComputations: ["DOMINANT_POLLUTANT_CONCENTRATION"],
        }),
      });
    }

    // ---------- Pollen ----------
    case "pollen": {
      const location = requireLatLng(params, "location");
      const days = requireNumber(params, "days", { min: 1, max: 5, integer: true });
      const url = new URL(`${POLLEN_HOST}/v1/forecasts:lookup`);
      url.searchParams.set("location.latitude", String(location.latitude));
      url.searchParams.set("location.longitude", String(location.longitude));
      url.searchParams.set("days", String(days));
      url.searchParams.set("pageSize", String(days));
      url.searchParams.set("languageCode", "en");
      url.searchParams.set("key", apiKey);
      return googleJson(url.toString());
    }

    // ---------- Solar ----------
    case "solar": {
      const location = requireLatLng(params, "location");
      const url = new URL(`${SOLAR_HOST}/v1/buildingInsights:findClosest`);
      url.searchParams.set("location.latitude", String(location.latitude));
      url.searchParams.set("location.longitude", String(location.longitude));
      url.searchParams.set("requiredQuality", "HIGH");
      url.searchParams.set("key", apiKey);
      return googleJson(url.toString());
    }

    // ---------- Geolocation ----------
    case "geolocate": {
      return googleJson(`${GEOLOCATE_HOST}/geolocation/v1/geolocate?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ considerIp: true }),
      });
    }

    // ---------- Static Maps ----------
    case "static-map": {
      const center = requireLatLng(params, "center");
      const zoom = requireNumber(params, "zoom", { min: 0, max: 21, integer: true });
      const width = requireNumber(params, "width", { min: 100, max: 640, integer: true });
      const height = requireNumber(params, "height", { min: 100, max: 640, integer: true });
      const mapType = optionalString(params, "mapType", "roadmap", { pattern: /^(roadmap|satellite|terrain)$/ });
      const rawMarkers = Array.isArray(params.markers) ? params.markers.slice(0, 12) : [];
      const rawPath = Array.isArray(params.path) ? params.path.slice(0, 100) : [];

      const url = new URL(`${GOOGLE_HOST}/maps/api/staticmap`);
      url.searchParams.set("center", `${center.latitude.toFixed(6)},${center.longitude.toFixed(6)}`);
      url.searchParams.set("zoom", String(zoom));
      url.searchParams.set("size", `${width}x${height}`);
      url.searchParams.set("scale", "2");
      url.searchParams.set("maptype", mapType);
      url.searchParams.set("key", apiKey);

      for (const entry of rawMarkers) {
        const point = requireLatLng({ marker: entry }, "marker");
        const marker = entry as Record<string, unknown>;
        const color = optionalString(marker, "color", "0x6366f1", { pattern: HEX_COLOR_PATTERN });
        const label = typeof marker.label === "string" && /^[A-Za-z0-9]{1}$/.test(marker.label) ? marker.label : null;
        const parts = [`color:${color}`];
        if (label) parts.push(`label:${label}`);
        parts.push(`${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`);
        url.searchParams.append("markers", parts.join("|"));
      }

      if (rawPath.length > 1) {
        const pathPoints: string[] = [];
        for (const entry of rawPath) {
          const point = requireLatLng({ p: entry }, "p");
          pathPoints.push(`${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`);
        }
        url.searchParams.append("path", `weight:4|color:0x10b981ff|${pathPoints.join("|")}`);
      }

      return googleImage(url.toString(), "static map");
    }

    // ---------- Street View Static ----------
    case "streetview": {
      const location = requireLatLng(params, "location");
      const width = requireNumber(params, "width", { min: 100, max: 640, integer: true });
      const height = requireNumber(params, "height", { min: 100, max: 640, integer: true });
      const heading = requireNumber(params, "heading", { min: 0, max: 360 });
      const fov = requireNumber(params, "fov", { min: 10, max: 120 });
      const url = new URL(`${GOOGLE_HOST}/maps/api/streetview`);
      url.searchParams.set("size", `${width}x${height}`);
      url.searchParams.set("location", `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`);
      url.searchParams.set("heading", String(Math.round(heading)));
      url.searchParams.set("fov", String(Math.round(fov)));
      url.searchParams.set("pitch", "6");
      url.searchParams.set("source", "outdoor");
      url.searchParams.set("key", apiKey);
      return googleImage(url.toString(), "street view");
    }

    // ---------- Map Tiles ----------
    case "tile": {
      const mapType = optionalString(params, "mapType", "roadmap", { pattern: /^(roadmap|satellite|terrain|streetview)$/ }) as MapType;
      const zoom = requireNumber(params, "zoom", { min: 3, max: 20, integer: true });
      const maxIndex = 2 ** zoom - 1;
      const x = requireNumber(params, "x", { min: 0, max: maxIndex, integer: true });
      const y = requireNumber(params, "y", { min: 0, max: maxIndex, integer: true });
      const session = await getTileSession(apiKey, mapType);
      const url = new URL(`${TILE_HOST}/v1/2dtiles/${zoom}/${x}/${y}`);
      url.searchParams.set("session", session);
      url.searchParams.set("key", apiKey);
      return googleImage(url.toString(), "map tile");
    }

    default:
      return badRequest(`Unknown resource "${resource}"`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    console.warn("[gmaps] rejected request without bearer token");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const token = authHeader.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) {
    console.warn("[gmaps] rejected invalid authentication token");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: { resource?: unknown; params?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const resource = typeof body.resource === "string" ? body.resource : "";
  const params = body.params && typeof body.params === "object" && !Array.isArray(body.params)
    ? (body.params as Record<string, unknown>)
    : {};

  if (resource === "browser-key") {
    const key = (Deno.env.get("GOOGLE_MAPS_BROWSER_KEY") || Deno.env.get("GOOGLE_MAPS_API_KEY") || "").trim();
    if (!key) {
      console.warn("[gmaps] no google maps key configured");
      return jsonResponse({ error: "Google Maps is not configured", code: "GOOGLE_MAPS_NOT_CONFIGURED" }, 503);
    }
    return jsonResponse({ key });
  }

  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) {
    console.warn("[gmaps] GOOGLE_MAPS_API_KEY is not configured");
    return jsonResponse({ error: "Google Maps is not configured", code: "GOOGLE_MAPS_NOT_CONFIGURED" }, 503);
  }

  try {
    return await handleResource(resource, params, apiKey);
  } catch (error) {
    if (error instanceof ValidationError) {
      return badRequest(error.message);
    }
    console.error("[gmaps] unhandled error", { resource, error: String(error) });
    return jsonResponse({ error: "Google Maps proxy failed", code: "PROXY_ERROR" }, 500);
  }
});
