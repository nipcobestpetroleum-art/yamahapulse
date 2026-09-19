import { supabase } from "@/integrations/supabase/client";

export type MapboxResource =
  | "public-token"
  | "geocode-forward"
  | "geocode-reverse"
  | "search-suggest"
  | "search-retrieve"
  | "search-forward"
  | "directions"
  | "matrix"
  | "matching"
  | "isochrone"
  | "optimization-submit"
  | "optimization-status"
  | "static-image"
  | "tilequery";

export class MapboxError extends Error {
  code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "MapboxError";
    this.code = code;
  }
}

export async function mapboxInvoke<T>(resource: MapboxResource, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("mapbox", { body: { resource, params } });
  if (error) throw new MapboxError(error.message, "EDGE_FUNCTION_ERROR");
  if (data?.error) throw new MapboxError(data.error, data.code ?? "MAPBOX_ERROR");
  return data as T;
}

export interface MapboxFeature {
  id?: string;
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
  place_name?: string;
  text?: string;
  center?: [number, number];
}

export interface MapboxFeatureCollection {
  type: "FeatureCollection";
  features: MapboxFeature[];
  attribution?: string;
}

export interface DirectionsResponse {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: { type: "LineString"; coordinates: [number, number][] };
    legs?: Array<{ distance: number; duration: number }>; 
    weight_name?: string;
  }>;
  waypoints?: Array<{ location: [number, number]; name?: string }>;
}

export interface MatrixResponse {
  code: string;
  durations?: Array<Array<number | null>>;
  distances?: Array<Array<number | null>>;
}

export interface MatchingResponse {
  code: string;
  matchings?: Array<{ distance: number; duration: number; geometry: { coordinates: [number, number][] } }>;
  tracepoints?: Array<{ location: [number, number]; name?: string; matchings_index?: number; waypoint_index?: number } | null>;
}

export interface IsochroneResponse extends MapboxFeatureCollection {}

export interface StaticImageResponse {
  dataUrl: string;
  contentType: string;
}

export function coordinatesToPath(points: Array<{ latitude: number; longitude: number }>): string {
  return points.map((point) => `${point.longitude},${point.latitude}`).join(";");
}

export function formatMapboxDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return "—";
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function formatMapboxDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours === 0 ? `${minutes} min` : rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function mapboxFeaturePoint(feature: MapboxFeature): { lat: number; lng: number } | null {
  const coordinates = feature.center ?? (feature.geometry.type === "Point" ? feature.geometry.coordinates as [number, number] : null);
  return coordinates && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])
    ? { lat: coordinates[1], lng: coordinates[0] }
    : null;
}

export function createSearchSessionToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function mapboxLineStringToLatLngs(geometry: { coordinates: [number, number][] }): [number, number][] {
  return geometry.coordinates.map(([lng, lat]) => [lat, lng]);
}

export function mapboxGeoJsonToLatLngs(geometry: { type: string; coordinates: unknown }): [number, number][] {
  if (geometry.type === "LineString") return (geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]);
  if (geometry.type === "MultiLineString") return (geometry.coordinates as [number, number][][]).flat().map(([lng, lat]) => [lat, lng]);
  return [];
}

export function mapboxStaticOverlayPath(points: Array<{ latitude: number; longitude: number }>): string {
  return `path-5+10b981-0.85(${points.map((point) => `${point.longitude},${point.latitude}`).join(",")})`;
}

export function toMapboxColor(color: string | undefined): string {
  return (color ?? "#6366f1").replace("#", "");
}

export function isMapboxPublicToken(value: string): boolean {
  return /^pk\.[A-Za-z0-9._-]+$/.test(value.trim());
}

export function isMapboxSecretToken(value: string): boolean {
  return /^sk\.[A-Za-z0-9._-]+$/.test(value.trim());
}

export async function getMapboxPublicToken(): Promise<string> {
  const response = await mapboxInvoke<{ token?: string }>("public-token");
  if (!response.token || !isMapboxPublicToken(response.token)) {
    throw new MapboxError("Mapbox public token is not configured. Add a pk. token as MAPBOX_PUBLIC_TOKEN.", "PUBLIC_TOKEN_MISSING");
  }
  return response.token;
}
