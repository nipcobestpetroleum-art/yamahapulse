import { useCallback, useEffect, useMemo, useState } from "react";
import { CloudSun, KeyRound, Loader2, MapPin, Route as RouteIcon, Satellite, Signpost, Truck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useLivePositions } from "@/hooks/use-live-positions";
import { fetchBrowserMapKey } from "@/lib/google-maps";
import { GoogleMapCanvas } from "@/components/mapstudio/google-map-canvas";
import { FleetPanel } from "@/components/mapstudio/fleet-panel";
import { PlacesPanel } from "@/components/mapstudio/places-panel";
import { RoutingPanel } from "@/components/mapstudio/routing-panel";
import { RoadsPanel } from "@/components/mapstudio/roads-panel";
import { EnvironmentPanel } from "@/components/mapstudio/environment-panel";
import { StaticMapsPanel } from "@/components/mapstudio/static-maps-panel";
import type { StudioOverlays, StudioTab, StudioVehicle, ViewRequest } from "@/components/mapstudio/types";

const EMPTY_OVERLAYS: StudioOverlays = { markers: [], polylines: [] };

interface AssignedVehicle {
  deviceId: string;
  deviceName: string;
  vehicleName: string;
  registration: string | null;
}

export default function MapStudioPage() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id ?? null;

  const [keyStatus, setKeyStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [browserKey, setBrowserKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<StudioTab>("fleet");
  const [overlaysByTab, setOverlaysByTab] = useState<Record<StudioTab, StudioOverlays>>({
    fleet: EMPTY_OVERLAYS,
    places: EMPTY_OVERLAYS,
    routing: EMPTY_OVERLAYS,
    roads: EMPTY_OVERLAYS,
    environment: EMPTY_OVERLAYS,
    static: EMPTY_OVERLAYS,
  });
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [lastMapClick, setLastMapClick] = useState<{ lat: number; lng: number } | null>(null);
  const [mapView, setMapView] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [viewRequest, setViewRequest] = useState<ViewRequest | null>(null);
  const [fitNonce, setFitNonce] = useState(0);

  const [assigned, setAssigned] = useState<AssignedVehicle[] | null>(null);
  const { positionsByDeviceId } = useLivePositions(orgId);

  useEffect(() => {
    fetchBrowserMapKey()
      .then((key) => {
        setBrowserKey(key);
        setKeyStatus("ready");
      })
      .catch((error: unknown) => {
        setKeyError(error instanceof Error ? error.message : "Google Maps API key is unavailable");
        setKeyStatus("missing");
      });
  }, []);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    supabase
      .from("device_assignments")
      .select(
        `
        device_id,
        device:gps_devices!device_assignments_device_id_fkey(id,name),
        vehicle:vehicles!device_assignments_vehicle_id_fkey(id,name,registration_number)
      `,
      )
      .eq("organization_id", orgId)
      .is("unassigned_at", null)
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as unknown as {
          device_id: string;
          device: { id: string; name: string } | null;
          vehicle: { id: string; name: string; registration_number: string | null } | null;
        }[];
        setAssigned(
          rows
            .filter((row) => row.device && row.vehicle)
            .map((row) => ({
              deviceId: row.device!.id,
              deviceName: row.device!.name,
              vehicleName: row.vehicle!.name,
              registration: row.vehicle!.registration_number,
            })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const vehicles = useMemo<StudioVehicle[]>(
    () =>
      (assigned ?? []).map((item) => ({
        deviceId: item.deviceId,
        deviceName: item.deviceName,
        vehicleName: item.vehicleName,
        registration: item.registration,
        position: positionsByDeviceId[item.deviceId] ?? null,
      })),
    [assigned, positionsByDeviceId],
  );

  useEffect(() => {
    if (!selectedDeviceId && vehicles.length > 0) setSelectedDeviceId(vehicles[0].deviceId);
  }, [vehicles, selectedDeviceId]);

  const setOverlays = useCallback(
    (tab: StudioTab, next: StudioOverlays) => {
      setOverlaysByTab((current) => ({ ...current, [tab]: next }));
    },
    [],
  );

  const requestView = useCallback((view: { lat: number; lng: number; zoom?: number }) => {
    setViewRequest({ ...view, nonce: Date.now() });
  }, []);

  const fitOverlays = useCallback(() => setFitNonce((nonce) => nonce + 1), []);

  const activeOverlays = overlaysByTab[activeTab];

  const statusBadge =
    keyStatus === "ready" ? (
      <Badge variant="outline" className="border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
        <Satellite className="mr-2 h-4 w-4" /> Google Maps connected
      </Badge>
    ) : keyStatus === "loading" ? (
      <Badge variant="outline" className="border-border bg-card/40">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking API key…
      </Badge>
    ) : (
      <Badge variant="outline" className="border-amber-500/25 bg-amber-500/10 text-amber-400">
        <KeyRound className="mr-2 h-4 w-4" /> API key not configured
      </Badge>
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Map Studio"
        description="The full Google Maps Platform toolbox — live fleet, places, routing, roads, environment data, static imagery and raw tiles."
        actions={statusBadge}
      />

      {keyStatus !== "ready" && (
        <Card className="border-amber-500/25 bg-amber-500/5">
          <CardContent className="space-y-2 p-4 text-sm">
            <div className="font-semibold text-amber-400">{keyError ?? "Set up Google Maps in two steps"}</div>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                In Google Cloud Console, enable these APIs on your project: <span className="font-mono text-xs">Maps JavaScript API, Maps Static API, Map Tiles API, Street View Static API, Routes API, Route Optimization API, Roads API, Places API, Geocoding API, Geolocation API, Weather API, Air Quality API, Pollen API, Solar API</span>.
              </li>
              <li>
                Create an API key and add it as the <span className="font-mono text-xs">GOOGLE_MAPS_API_KEY</span> secret: Supabase Console → Project → Edge Functions → Manage Secrets.
              </li>
            </ol>
            <p className="text-xs text-muted-foreground">
              Panels that call Google server-side (routes, roads, weather, tiles…) start working immediately after the secret is saved. The interactive map also needs the Maps JavaScript API enabled on that key.
            </p>
          </CardContent>
        </Card>
      )}

      <GoogleMapCanvas
        apiKey={keyStatus === "ready" ? browserKey : null}
        markers={activeOverlays.markers}
        polylines={activeOverlays.polylines}
        selectedMarkerId={selectedMarkerId}
        onMarkerClick={(id) => {
          if (id.startsWith("fleet:")) {
            const deviceId = id.slice("fleet:".length);
            setSelectedDeviceId(deviceId);
          }
          setSelectedMarkerId(id);
        }}
        onMapClick={(lat, lng) => setLastMapClick({ lat, lng })}
        viewRequest={viewRequest}
        fitNonce={fitNonce}
        onViewChange={setMapView}
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as StudioTab)}>
        <TabsList className="h-auto w-full flex-wrap justify-start bg-card/60">
          <TabsTrigger value="fleet" className="gap-1.5 text-xs">
            <Truck className="h-3.5 w-3.5" /> Fleet
          </TabsTrigger>
          <TabsTrigger value="places" className="gap-1.5 text-xs">
            <MapPin className="h-3.5 w-3.5" /> Places & Geocoding
          </TabsTrigger>
          <TabsTrigger value="routing" className="gap-1.5 text-xs">
            <RouteIcon className="h-3.5 w-3.5" /> Routing
          </TabsTrigger>
          <TabsTrigger value="roads" className="gap-1.5 text-xs">
            <Signpost className="h-3.5 w-3.5" /> Roads
          </TabsTrigger>
          <TabsTrigger value="environment" className="gap-1.5 text-xs">
            <CloudSun className="h-3.5 w-3.5" /> Environment
          </TabsTrigger>
          <TabsTrigger value="static" className="gap-1.5 text-xs">
            <Satellite className="h-3.5 w-3.5" /> Static & Tiles
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fleet" className="mt-4">
          <FleetPanel
            vehicles={vehicles}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
            setOverlays={setOverlays}
            requestView={requestView}
            fitOverlays={fitOverlays}
          />
        </TabsContent>
        <TabsContent value="places" className="mt-4">
          <PlacesPanel setOverlays={setOverlays} requestView={requestView} lastMapClick={lastMapClick} />
        </TabsContent>
        <TabsContent value="routing" className="mt-4">
          <RoutingPanel
            vehicles={vehicles}
            selectedDeviceId={selectedDeviceId}
            setOverlays={setOverlays}
            fitOverlays={fitOverlays}
          />
        </TabsContent>
        <TabsContent value="roads" className="mt-4">
          <RoadsPanel
            vehicles={vehicles}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
            setOverlays={setOverlays}
            fitOverlays={fitOverlays}
            lastMapClick={lastMapClick}
          />
        </TabsContent>
        <TabsContent value="environment" className="mt-4">
          <EnvironmentPanel mapView={mapView} lastMapClick={lastMapClick} vehicles={vehicles} selectedDeviceId={selectedDeviceId} />
        </TabsContent>
        <TabsContent value="static" className="mt-4">
          <StaticMapsPanel mapView={mapView} lastMapClick={lastMapClick} vehicles={vehicles} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
