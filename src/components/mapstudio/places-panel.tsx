import { useState } from "react";
import { ExternalLink, Globe2, Home, Loader2, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PlaceAutocomplete } from "@/components/mapstudio/place-autocomplete";
import type { StudioOverlays, StudioTab } from "@/components/mapstudio/types";
import {
  gmapsInvoke,
  type GeocodeResponse,
  type PlaceDetails,
  type PlacePrediction,
} from "@/lib/google-maps";

interface PlacesPanelProps {
  setOverlays: (tab: StudioTab, overlays: StudioOverlays) => void;
  requestView: (view: { lat: number; lng: number; zoom?: number }) => void;
  lastMapClick: { lat: number; lng: number } | null;
}

export function PlacesPanel({ setOverlays, requestView, lastMapClick }: PlacesPanelProps) {
  const [place, setPlace] = useState<PlaceDetails | null>(null);
  const [placeBusy, setPlaceBusy] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  const [geocodeQuery, setGeocodeQuery] = useState("");
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geocodeResults, setGeocodeResults] = useState<GeocodeResponse["results"]>([]);

  const [reverseBusy, setReverseBusy] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [reverseAddress, setReverseAddress] = useState<string | null>(null);
  const [reversePoint, setReversePoint] = useState<{ lat: number; lng: number } | null>(null);

  const pickPlace = async (prediction: PlacePrediction) => {
    setPlaceBusy(true);
    setPlaceError(null);
    setPlace(null);
    try {
      const details = await gmapsInvoke<PlaceDetails>("place-details", { placeId: prediction.placeId });
      setPlace(details);
      if (details.location) {
        setOverlays("places", {
          markers: [
            {
              id: "place:selected",
              lat: details.location.latitude,
              lng: details.location.longitude,
              title: details.displayName?.text ?? prediction.primaryText,
              color: "#f43f5e",
              scale: 9,
              snippet: [details.formattedAddress, details.primaryTypeDisplayName?.text, details.internationalPhoneNumber].filter(Boolean) as string[],
            },
          ],
          polylines: [],
        });
        requestView({ lat: details.location.latitude, lng: details.location.longitude, zoom: 16 });
      }
    } catch (error) {
      setPlaceError(error instanceof Error ? error.message : "Place details failed");
    } finally {
      setPlaceBusy(false);
    }
  };

  const runGeocode = async () => {
    const address = geocodeQuery.trim();
    if (address.length < 2) return;
    setGeocodeBusy(true);
    setGeocodeError(null);
    try {
      const data = await gmapsInvoke<GeocodeResponse>("geocode", { address });
      if (data.status !== "OK" || !data.results || data.results.length === 0) {
        setGeocodeError(data.error_message ?? `Geocoder returned ${data.status}`);
        setGeocodeResults([]);
        return;
      }
      setGeocodeResults(data.results.slice(0, 5));
    } catch (error) {
      setGeocodeError(error instanceof Error ? error.message : "Geocoding failed");
      setGeocodeResults([]);
    } finally {
      setGeocodeBusy(false);
    }
  };

  const runReverseGeocode = async () => {
    if (!lastMapClick) return;
    setReverseBusy(true);
    setReverseError(null);
    try {
      const data = await gmapsInvoke<GeocodeResponse>("reverse-geocode", { location: lastMapClick });
      if (data.status !== "OK" || !data.results || data.results.length === 0) {
        setReverseError(data.error_message ?? `Geocoder returned ${data.status}`);
        setReverseAddress(null);
        return;
      }
      setReverseAddress(data.results[0].formatted_address);
      setReversePoint(lastMapClick);
    } catch (error) {
      setReverseError(error instanceof Error ? error.message : "Reverse geocoding failed");
    } finally {
      setReverseBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Place search (Places API)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <PlaceAutocomplete placeholder="Search any business, landmark or address…" onPick={(prediction) => void pickPlace(prediction)} />

          {placeBusy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading place details…
            </div>
          )}
          {placeError && <p className="text-sm text-destructive">{placeError}</p>}

          {place && (
            <div className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{place.displayName?.text ?? "Unnamed place"}</div>
                  <div className="text-xs text-muted-foreground">{place.primaryTypeDisplayName?.text ?? "Place"}</div>
                </div>
                {place.rating != null && (
                  <div className="flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-400">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    {place.rating.toFixed(1)}
                    {place.userRatingCount != null && <span className="font-normal opacity-70">({place.userRatingCount})</span>}
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                {place.formattedAddress && (
                  <div className="flex items-start gap-2">
                    <Home className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {place.formattedAddress}
                  </div>
                )}
                {place.internationalPhoneNumber && (
                  <div className="flex items-start gap-2">
                    <Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {place.internationalPhoneNumber}
                  </div>
                )}
                {place.websiteUri && (
                  <a
                    href={place.websiteUri}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" /> Website
                  </a>
                )}
                {place.location && (
                  <div className="font-mono text-[11px]">
                    {place.location.latitude.toFixed(5)}, {place.location.longitude.toFixed(5)}
                  </div>
                )}
              </div>
              {place.regularOpeningHours?.weekdayText && place.regularOpeningHours.weekdayText.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-primary">Opening hours</summary>
                  <div className="mt-2 space-y-0.5 rounded-lg border border-border bg-card/60 p-2 text-[11px] text-muted-foreground">
                    {place.regularOpeningHours.weekdayText.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Forward geocoding (Geocoding API)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={geocodeQuery}
                onChange={(event) => setGeocodeQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void runGeocode()}
                placeholder="e.g. Kenyatta Avenue, Nairobi"
                className="bg-card/60"
              />
              <Button size="sm" onClick={() => void runGeocode()} disabled={geocodeBusy || geocodeQuery.trim().length < 2}>
                {geocodeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            {geocodeError && <p className="text-sm text-destructive">{geocodeError}</p>}

            {geocodeResults.length > 0 && (
              <div className="space-y-1.5">
                {geocodeResults.map((result) => (
                  <button
                    key={result.place_id}
                    type="button"
                    className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-left text-xs transition-colors hover:border-primary/40"
                    onClick={() => {
                      setOverlays("places", {
                        markers: [
                          {
                            id: "geocode:result",
                            lat: result.geometry.location.lat,
                            lng: result.geometry.location.lng,
                            title: "Geocoded point",
                            color: "#8b5cf6",
                            snippet: [result.formatted_address],
                          },
                        ],
                        polylines: [],
                      });
                      requestView({ lat: result.geometry.location.lat, lng: result.geometry.location.lng, zoom: 15 });
                    }}
                  >
                    <span className="block truncate font-medium">{result.formatted_address}</span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {result.geometry.location.lat.toFixed(5)}, {result.geometry.location.lng.toFixed(5)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Reverse geocoding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Click anywhere on the map, then resolve the coordinates to a street address.
            </p>
            <div className="rounded-lg border border-border bg-background/40 px-3 py-2 font-mono text-xs">
              {lastMapClick
                ? `${lastMapClick.lat.toFixed(5)}, ${lastMapClick.lng.toFixed(5)}`
                : "No map click captured yet"}
            </div>
            <Button size="sm" variant="outline" onClick={() => void runReverseGeocode()} disabled={!lastMapClick || reverseBusy}>
              {reverseBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Resolve address
            </Button>

            {reverseError && <p className="text-sm text-destructive">{reverseError}</p>}
            {reverseAddress && (
              <div className="rounded-xl border border-border bg-background/40 p-3">
                <div className="text-xs font-medium">{reverseAddress}</div>
                {reversePoint && (
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {reversePoint.lat.toFixed(5)}, {reversePoint.lng.toFixed(5)}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
