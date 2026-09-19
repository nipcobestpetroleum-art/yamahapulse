import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAPBOX_HOST = "https://api.mapbox.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function bad(message: string) { return json({ error: message, code: "BAD_REQUEST" }, 400); }
class ValidationError extends Error {}
function text(params: Record<string, unknown>, name: string, min = 1, max = 500): string {
  const value = params[name];
  if (typeof value !== "string" || value.trim().length < min || value.length > max) throw new ValidationError(`${name} must be a string between ${min} and ${max} characters`);
  return value.trim();
}
function number(params: Record<string, unknown>, name: string, min?: number, max?: number): number {
  const value = params[name];
  if (typeof value !== "number" || !Number.isFinite(value) || (min != null && value < min) || (max != null && value > max)) throw new ValidationError(`${name} is invalid`);
  return value;
}
function points(params: Record<string, unknown>, name: string, min = 1, max = 100): Array<{ longitude: number; latitude: number }> {
  const value = params[name];
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new ValidationError(`${name} must contain ${min}-${max} points`);
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new ValidationError("Invalid coordinate");
    const point = item as Record<string, unknown>;
    return { longitude: number(point, "longitude", -180, 180), latitude: number(point, "latitude", -90, 90) };
  });
}
function path(points: Array<{ longitude: number; latitude: number }>) { return points.map((point) => `${point.longitude},${point.latitude}`).join(";"); }
function query(params: Record<string, string>, token: string) {
  const url = new URL(`${MAPBOX_HOST}${params.path}`);
  for (const [key, value] of Object.entries(params)) if (key !== "path") url.searchParams.set(key, value);
  url.searchParams.set("access_token", token);
  return url.toString();
}
async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.text();
  let data: unknown;
  try { data = JSON.parse(body); } catch { data = { message: body.slice(0, 400) }; }
  if (!response.ok) return json({ error: (data as { message?: string; error?: string }).message ?? (data as { error?: string }).error ?? `Mapbox returned ${response.status}`, code: "MAPBOX_ERROR" }, 502);
  return json(data);
}
async function image(url: string) {
  const response = await fetch(url);
  if (!response.ok) return json({ error: `Mapbox image request failed (${response.status})`, code: "MAPBOX_ERROR" }, 502);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  const contentType = response.headers.get("content-type") ?? "image/png";
  return json({ contentType, dataUrl: `data:${contentType};base64,${btoa(binary)}` });
}

async function handle(resource: string, params: Record<string, unknown>, token: string) {
  const profile = typeof params.profile === "string" && ["driving", "driving-traffic", "walking", "cycling"].includes(params.profile) ? params.profile : "driving";
  if (resource === "geocode-forward") {
    const url = query({ path: "/search/geocode/v6/forward", q: text(params, "query", 2, 256), limit: "5", language: "en" }, token);
    return call(url);
  }
  if (resource === "geocode-reverse") {
    const longitude = number(params, "longitude", -180, 180); const latitude = number(params, "latitude", -90, 90);
    return call(query({ path: "/search/geocode/v6/reverse", longitude: String(longitude), latitude: String(latitude), limit: "5", language: "en" }, token));
  }
  if (resource === "search-suggest") {
    return call(query({ path: "/search/searchbox/v1/suggest", q: text(params, "query", 2, 160), session_token: text(params, "sessionToken", 10, 100), language: "en", limit: "6" }, token));
  }
  if (resource === "search-retrieve") {
    const id = text(params, "mapboxId", 1, 300);
    return call(query({ path: `/search/searchbox/v1/retrieve/${encodeURIComponent(id)}`, session_token: text(params, "sessionToken", 10, 100) }, token));
  }
  if (resource === "search-forward") {
    return call(query({ path: "/search/searchbox/v1/forward", q: text(params, "query", 2, 200), limit: "10", language: "en" }, token));
  }
  if (resource === "directions") {
    const coords = points(params, "coordinates", 2, 25);
    const queryParams: Record<string, string> = { path: `/directions/v5/mapbox/${profile}/${path(coords)}.json`, geometries: "geojson", overview: "full", steps: "true", annotations: "duration,distance" };
    if (params.continueStraight === true) queryParams.continue_straight = "true";
    return call(query(queryParams, token));
  }
  if (resource === "matrix") {
    const coords = points(params, "coordinates", 2, 25);
    return call(query({ path: `/directions-matrix/v1/mapbox/${profile}/${path(coords)}`, annotations: "duration,distance" }, token));
  }
  if (resource === "matching") {
    const coords = points(params, "coordinates", 2, 100);
    return call(query({ path: `/matching/v5/mapbox/${profile}/${path(coords)}.json`, geometries: "geojson", overview: "full", steps: "true" }, token));
  }
  if (resource === "isochrone") {
    const location = points(params, "coordinates", 1, 1)[0];
    const contourMinutes = typeof params.contoursMinutes === "string" ? params.contoursMinutes : "10,20,30";
    if (!/^[0-9,]+$/.test(contourMinutes)) throw new ValidationError("contoursMinutes is invalid");
    return call(query({ path: `/isochrone/v1/mapbox/${profile}/${location.longitude},${location.latitude}`, contours_minutes: contourMinutes, polygons: "true", denoise: "1" }, token));
  }
  if (resource === "optimization-submit") {
    const body = params.problem;
    if (!body || typeof body !== "object") throw new ValidationError("problem is required");
    return call(`${MAPBOX_HOST}/optimized-trips/v2?access_token=${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  if (resource === "optimization-status") {
    const id = text(params, "submissionId", 1, 200);
    return call(`${MAPBOX_HOST}/optimized-trips/v2/${encodeURIComponent(id)}?access_token=${encodeURIComponent(token)}`);
  }
  if (resource === "static-image") {
    const longitude = number(params, "longitude", -180, 180); const latitude = number(params, "latitude", -90, 90);
    const zoom = Math.round(number(params, "zoom", 0, 22)); const width = Math.round(number(params, "width", 100, 1280)); const height = Math.round(number(params, "height", 100, 1280));
    const style = typeof params.style === "string" && /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(params.style) ? params.style : "mapbox/streets-v12";
    const overlay = typeof params.overlay === "string" && params.overlay.length < 4000 ? params.overlay : "";
    const url = `${MAPBOX_HOST}/styles/v1/${style}/static/${overlay}/${longitude},${latitude},${zoom},0,0/${width}x${height}@2x.png?access_token=${encodeURIComponent(token)}`;
    return image(url);
  }
  if (resource === "tilequery") {
    const tileset = text(params, "tileset", 1, 200); const longitude = number(params, "longitude", -180, 180); const latitude = number(params, "latitude", -90, 90); const radius = Math.round(number(params, "radius", 0, 10000));
    return call(query({ path: `/v4/${tileset}/tilequery/${longitude},${latitude}.json`, radius: String(radius), limit: "50" }, token));
  }
  return bad(`Unknown Mapbox resource: ${resource}`);
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""; const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const auth = createClient(supabaseUrl, anonKey);
  const { data, error } = await auth.auth.getUser(authorization.slice(7));
  if (error || !data.user) return json({ error: "Unauthorized" }, 401);
  let body: { resource?: unknown; params?: unknown };
  try { body = await request.json(); } catch { return bad("Invalid JSON body"); }
  const resource = typeof body.resource === "string" ? body.resource : "";
  const params = body.params && typeof body.params === "object" && !Array.isArray(body.params) ? body.params as Record<string, unknown> : {};
  if (resource === "public-token") {
    const publicToken = (Deno.env.get("MAPBOX_PUBLIC_TOKEN") ?? "").trim();
    if (!/^pk\.[A-Za-z0-9._-]+$/.test(publicToken)) return json({ error: "Mapbox public token is not configured. Add a pk. token as MAPBOX_PUBLIC_TOKEN.", code: "PUBLIC_TOKEN_MISSING" }, 503);
    return json({ token: publicToken });
  }
  const token = (Deno.env.get("MAPBOX_SECRET_TOKEN") ?? "").trim();
  if (!/^sk\.[A-Za-z0-9._-]+$/.test(token)) return json({ error: "Mapbox secret token is not configured. Add the rotated sk. token as MAPBOX_SECRET_TOKEN.", code: "SECRET_TOKEN_MISSING" }, 503);
  try { return await handle(resource, params, token); } catch (error) { return error instanceof ValidationError ? bad(error.message) : json({ error: "Mapbox proxy failed", code: "PROXY_ERROR" }, 500); }
});
