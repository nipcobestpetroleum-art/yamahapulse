import { mapboxInvoke, type MapboxFeatureCollection, type MapboxFeature, type DirectionsResponse, type MatrixResponse, type MatchingResponse, type StaticImageResponse } from "@/lib/mapbox";

export interface PanelPrediction { placeId: string; primaryText: string; secondaryText: string; fullText: string; }
export interface PanelPlace { id: string; displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }; primaryTypeDisplayName?: { text: string }; websiteUri?: string; internationalPhoneNumber?: string; rating?: number; userRatingCount?: number; regularOpeningHours?: { weekdayText?: string[] }; }
export interface PanelGeocodeResult { place_id: string; formatted_address: string; geometry: { location: { lat: number; lng: number } }; }
export interface PanelGeocodeResponse { status: string; results?: PanelGeocodeResult[]; error_message?: string; }

function featurePoint(feature: MapboxFeature) {
  const point = feature.center ?? (feature.geometry.type === "Point" ? feature.geometry.coordinates as [number, number] : null);
  return point ? { latitude: point[1], longitude: point[0] } : undefined;
}
function featureLabel(feature: MapboxFeature) { return feature.place_name ?? feature.properties?.full_address as string ?? feature.text ?? "Location"; }

export async function panelAutocomplete(input: string): Promise<PanelPrediction[]> {
  const sessionToken = crypto.randomUUID();
  const data = await mapboxInvoke<{ suggestions?: Array<Record<string, unknown>> }>("search-suggest", { query: input, sessionToken });
  return (data.suggestions ?? []).map((suggestion) => {
    const id = String(suggestion.mapbox_id ?? suggestion.id ?? "");
    const primary = String(suggestion.name ?? suggestion.text ?? suggestion.place_formatted ?? "Location");
    const secondary = String(suggestion.place_formatted ?? suggestion.address ?? "");
    return { placeId: id, primaryText: primary, secondaryText: secondary, fullText: `${primary}, ${secondary}` };
  }).filter((suggestion) => suggestion.placeId);
}

export async function panelPlaceDetails(mapboxId: string): Promise<PanelPlace> {
  const data = await mapboxInvoke<MapboxFeatureCollection>("search-retrieve", { mapboxId, sessionToken: crypto.randomUUID() });
  const feature = data.features?.[0];
  if (!feature) throw new Error("Mapbox did not return place details");
  const location = featurePoint(feature);
  return { id: feature.id ?? mapboxId, displayName: { text: feature.text ?? feature.place_name ?? "Location" }, formattedAddress: feature.place_name, location, primaryTypeDisplayName: { text: String(feature.properties?.feature_type ?? "Place") }, websiteUri: typeof feature.properties?.website === "string" ? feature.properties.website : undefined };
}

function toGeocodeResponse(data: MapboxFeatureCollection): PanelGeocodeResponse {
  return { status: data.features?.length ? "OK" : "ZERO_RESULTS", results: data.features?.map((feature) => { const point = featurePoint(feature)!; return { place_id: feature.id ?? feature.place_name ?? "mapbox-feature", formatted_address: featureLabel(feature), geometry: { location: { lat: point.latitude, lng: point.longitude } } }; }) };
}
export async function panelForwardGeocode(query: string) { return toGeocodeResponse(await mapboxInvoke<MapboxFeatureCollection>("geocode-forward", { query })); }
export async function panelReverseGeocode(location: { lat: number; lng: number }) { return toGeocodeResponse(await mapboxInvoke<MapboxFeatureCollection>("geocode-reverse", { latitude: location.lat, longitude: location.lng })); }

export async function panelDirections(coordinates: Array<{ latitude: number; longitude: number }>, traffic: boolean) { return mapboxInvoke<DirectionsResponse>("directions", { coordinates, profile: traffic ? "driving-traffic" : "driving" }); }
export async function panelMatrix(coordinates: Array<{ latitude: number; longitude: number }>, profile = "driving") { return mapboxInvoke<MatrixResponse>("matrix", { coordinates, profile }); }
export async function panelMatching(coordinates: Array<{ latitude: number; longitude: number }>) { return mapboxInvoke<MatchingResponse>("matching", { coordinates, profile: "driving" }); }
export async function panelStaticImage(params: Record<string, unknown>) { return mapboxInvoke<StaticImageResponse>("static-image", params); }
