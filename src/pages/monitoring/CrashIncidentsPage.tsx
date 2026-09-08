import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Gauge, MapPin, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IncidentMapPreview } from "@/components/monitoring/incident-map-preview";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError } from "@/utils/toast";
import type { DeviceEvent } from "@/types/database";

interface IncidentRow extends DeviceEvent {
  device: { name: string } | null;
  vehicle: { name: string; registration_number: string } | null;
}

export default function CrashIncidentsPage() {
  const { currentOrg } = useAuth();
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("device_events")
      .select("*, device:gps_devices(name), vehicle:vehicles(name, registration_number)")
      .eq("organization_id", currentOrg.id)
      .eq("type", "CRASH")
      .order("created_at", { ascending: false })
      .limit(50);

    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setIncidents((data ?? []) as unknown as IncidentRow[]);
  }, [currentOrg]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Crash Incidents"
        description="Accelerometer-detected crash events with location, speed and impact snapshot"
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : incidents.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No crash incidents"
          description="When the accelerometer detects a crash-level impact, it will appear here with the vehicle's location, speed and impact force at the moment of the event."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {incidents.map((incident) => {
            const gforce =
              typeof incident.metadata?.gforce === "number" ? incident.metadata.gforce : null;
            return (
              <div
                key={incident.id}
                className="overflow-hidden rounded-xl border border-rose-500/30 bg-card/40"
              >
                {incident.latitude != null && incident.longitude != null ? (
                  <IncidentMapPreview
                    latitude={incident.latitude}
                    longitude={incident.longitude}
                    className="h-40 w-full"
                  />
                ) : (
                  <div className="flex h-40 w-full items-center justify-center bg-muted text-muted-foreground">
                    <MapPin className="h-6 w-6" />
                  </div>
                )}
                <div className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-rose-400" />
                      <p className="text-sm font-semibold">
                        {incident.vehicle?.name ?? "Unknown vehicle"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-rose-500/25 bg-rose-500/10 font-medium text-rose-400"
                    >
                      Critical
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {incident.vehicle?.registration_number ?? incident.device?.name ?? ""}
                  </p>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Gauge className="h-3.5 w-3.5" />
                      {incident.speed != null ? `${incident.speed} km/h` : "Speed n/a"}
                    </span>
                    {gforce != null && <span className="font-medium text-rose-400">{gforce.toFixed(1)}G</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(incident.created_at), "dd MMM yyyy, HH:mm:ss")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
