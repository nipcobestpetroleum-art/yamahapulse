import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Point { latitude: number; longitude: number }
interface Track { deviceId: string; points: Point[] }

function validPoint(point: Point) {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180
    && (point.latitude !== 0 || point.longitude !== 0);
}

async function snapChunk(points: Point[], apiKey: string): Promise<Point[]> {
  const path = points.map((point) => `${point.latitude},${point.longitude}`).join("|");
  const url = new URL("https://roads.googleapis.com/v1/snapToRoads");
  url.searchParams.set("path", path);
  url.searchParams.set("interpolate", "true");
  url.searchParams.set("key", apiKey);
  const result = await fetch(url);
  if (!result.ok) throw new Error(`Google Roads API returned ${result.status}`);
  const body = await result.json();
  return (body.snappedPoints ?? []).map((item: { location?: Point }) => item.location).filter(validPoint);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "POST required" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return response({ error: "Unauthorized" }, 401);
  const authClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: auth } } },
  );
  const { error: authError } = await authClient.auth.getUser();
  if (authError) return response({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) return response({ error: "Road matching is not configured" }, 503);

  let body: { tracks?: Track[] };
  try { body = await req.json(); } catch { return response({ error: "Invalid JSON" }, 400); }
  const tracks = Array.isArray(body.tracks) ? body.tracks.slice(0, 20) : [];
  const roadTrails: Record<string, Point[]> = {};

  for (const track of tracks) {
    if (!track || typeof track.deviceId !== "string" || !Array.isArray(track.points)) continue;
    const points = track.points.filter(validPoint).slice(-300);
    if (points.length < 2) { roadTrails[track.deviceId] = points; continue; }

    const snapped: Point[] = [];
    for (let start = 0; start < points.length; start += 99) {
      const chunk = points.slice(start, start + 100);
      if (chunk.length < 2) break;
      try {
        const matched = await snapChunk(chunk, apiKey);
        for (const point of matched) {
          const last = snapped[snapped.length - 1];
          if (!last || last.latitude !== point.latitude || last.longitude !== point.longitude) snapped.push(point);
        }
      } catch {
        // Keep the raw GPS trail for this chunk if Roads API is unavailable.
        for (const point of chunk) {
          const last = snapped[snapped.length - 1];
          if (!last || last.latitude !== point.latitude || last.longitude !== point.longitude) snapped.push(point);
        }
      }
    }
    roadTrails[track.deviceId] = snapped.length > 1 ? snapped : points;
  }

  return response({ trails: roadTrails });
});
