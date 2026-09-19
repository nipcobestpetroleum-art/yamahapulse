import { supabase } from "@/integrations/supabase/client";

/**
 * Google Maps Platform client helpers.
 *
 * Every server-side Google API call goes through the `gmaps` edge function so
 * the API key stays server-side. Only the Maps JavaScript API is loaded in the
 * browser, using a browser-restricted key served by the same proxy.
 */

export type GmapsResource =
  | "browser-key"
  | "geocode"
  | "reverse-geocode"
  | "places-autocomplete"
  | "place-details"
  | "places-search-text"
  | "compute-routes"
  | "route-matrix"
  | "optimize-tours"
  | "snap-to-roads"
  | "nearest-roads"
  | "weather-current"
  | "weather-forecast"
  | "air-quality"
  | "pollen"
  | "solar"
  | "geolocate"
  | "static-map"
  | "streetview"
  | "tile";

export class GmapsError extends Error {
  code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "GmapsError";
    this.code = code;
  }
}

export async function gmapsInvoke<T>(resource: GmapsResource, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("gmaps", {
    body: { resource, params },
  });

  if (error) {
    let message = error.message;
    let code: string | null = null;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = (await context.json()) as { error?: string; code?: string };
        message = body.error ?? message;
        code = body.code ?? null;
      } catch {
        // keep default message
      }
    }
    throw new GmapsError(message, code);
  }

  return data as T;
}

export async function fetchBrowserMapKey(): Promise<string> {
  const data = await gmapsInvoke<{ key?: string }>("browser-key");
  if (!data.key) throw new GmapsError("Browser map key unavailable", "NO_KEY");
  return data.key;
}

// ---------- Maps JavaScript API loader ----------

let mapsLoader: Promise<void> | null = null;

export function loadGoogleMaps(key: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new GmapsError("Maps can only load in the browser"));
  const existing = (window as { google?: { maps?: unknown } }).google?.maps;
  if (existing) return Promise.resolve();
  if (mapsLoader) return mapsLoader;

  mapsLoader = new Promise<void>((resolve, reject) => {
    const callbackName = "__yamahapulseGmapsReady";
    (window as unknown as Record<string, unknown>)[callbackName] = () => resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      mapsLoader = null;
      reject(new GmapsError("Failed to load Google Maps JavaScript API", "LOAD_FAILED"));
    };
    document.head.appendChild(script);
  });

  return mapsLoader;
}

// ---------- Polyline decoding (Routes API, precision 5) ----------

export interface DecodedPoint {
  lat: number;
  lng: number;
}

export function decodePolyline(encoded: string): DecodedPoint[] {
  const points: DecodedPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }

  return points;
}

// ---------- Web Mercator tile math (Map Tiles API) ----------

export function lngToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** zoom);
}

export function latToTileY(lat: number, zoom: number): number {
  const radians = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** zoom);
}

// ---------- Formatting helpers ----------

export function formatKm(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function parseDurationSeconds(value: string | null | undefined): number | null {
  if (!value || !value.endsWith("s")) return null;
  const parsed = Number.parseFloat(value.slice(0, -1));
  return Number.isFinite(parsed) ? parsed : null;
}

// ---------- API response types (partial; Google responses carry more) ----------

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface GeocodeResponse {
  status: string;
  error_message?: string;
  results?: Array<{
    formatted_address: string;
    place_id: string;
    geometry: { location: { lat: number; lng: number } };
  }>;
}

export interface PlacePrediction {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  fullText: string;
}

export interface AutocompleteResponse {
  suggestions?: Array<{
    placePrediction?: {
      placeId: string;
      text: { text: string };
      structuredFormat: { mainText: { text: string }; secondaryText: { text: string } };
    };
  }>;
}

export interface PlaceDetails {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: LatLng;
  rating?: number;
  userRatingCount?: number;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  primaryTypeDisplayName?: { text: string };
  businessStatus?: string;
  priceLevel?: string;
  regularOpeningHours?: { weekdayText?: string[] };
}

export interface RouteLeg {
  distanceMeters?: number;
  duration?: string;
}

export interface ComputedRoute {
  distanceMeters?: number;
  duration?: string;
  polyline?: { encodedPolyline?: string };
  legs?: RouteLeg[];
  waypointOrder?: number[];
}

export interface ComputeRoutesResponse {
  routes?: ComputedRoute[];
}

export interface MatrixElement {
  originIndex?: number;
  destinationIndex?: number;
  duration?: string;
  distanceMeters?: number;
  status?: { condition?: string; message?: string };
}

export interface RouteMatrixResponse extends Array<MatrixElement> {}

export interface OptimizeToursResponse {
  tours?: Array<{
    visits?: Array<{ shipmentIndex?: number; isRouteStart?: boolean; isRouteEnd?: boolean }>;
  }>;
}

export interface SnappedPoint {
  location: LatLng;
  placeId?: string;
  originalIndex?: number;
}

export interface SnapToRoadsResponse {
  snappedPoints?: SnappedPoint[];
}

export interface ImageResponse {
  contentType: string;
  dataUrl: string;
}

export interface WeatherCurrent {
  isDayTime?: boolean;
  weatherCondition?: { description?: { text?: string }; type?: number };
  temperature?: { degrees?: number };
  dewPoint?: { degrees?: number };
  humidity?: unknown;
  wind?: { speed?: { value?: number }; direction?: { cardinal?: string } };
  cloudCover?: number;
  uvIndex?: number;
  precipitation?: { probability?: { percent?: number } };
  [key: string]: unknown;
}

export interface WeatherForecast {
  forecastDays?: Array<{
    interval?: { startTime?: string };
    daytimeMaxTemperature?: { degrees?: number };
    nighttimeMinTemperature?: { degrees?: number };
    weatherConditionType?: { day?: { description?: { text?: string } } };
  }>;
  [key: string]: unknown;
}

export interface AirQualityResponse {
  dateTime?: string;
  aqi?: number;
  category?: { text?: string } | string;
  dominantPollutant?: { displayName?: string; code?: string } | string;
  [key: string]: unknown;
}

export interface PollenResponse {
  dailyInfo?: Array<{
    date?: { year?: number; month?: number; day?: number };
    pollenTypeInfo?: Array<{
      code?: string;
      indexInfo?: { value?: number; category?: string; indexDescription?: string };
    }>;
    plantInfo?: Array<{ code?: string; indexInfo?: { value?: number; category?: string } }>;
  }>;
  [key: string]: unknown;
}

export interface SolarResponse {
  address?: string;
  imageryDate?: { year?: number; month?: number; day?: number };
  imageryQuality?: string;
  solarPotential?: {
    maxArrayPanelsCount?: number;
    maxArrayAreaMeters2?: number;
    maxSunshineHoursPerYear?: number;
    carbonOffsetFactorKgPerMwh?: number;
    wholeRoofStats?: { sunshineHoursPerYear?: number };
    roofSegmentStats?: Array<unknown>;
    solarPanelConfigs?: Array<{ panelsCount?: number; yearlyEnergyDcKwh?: number }>;
  };
  [key: string]: unknown;
}

export interface GeolocateResponse {
  location?: { lat: number; lng: number };
  accuracy?: number;
}
