import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useLivePositions } from "@/hooks/use-live-positions";
import { getTelemetryStatus, type TelemetryStatus } from "@/lib/telemetry-status";
import type { LatestPosition } from "@/types/database";

type TrackingMode = "normal" | "gods-eye";

export interface TrackedVehicle {
  deviceId: string;
  vehicleId: string;
  deviceName: string;
  imei: string;
  vehicleName: string;
  registration: string | null;
  position: LatestPosition | null;
  status: TelemetryStatus;
}

interface TrackingContextValue {
  mode: TrackingMode;
  setMode: (mode: TrackingMode) => void;
  selectedVehicleId: string | null;
  setSelectedVehicleId: (deviceId: string | null) => void;
  vehicles: TrackedVehicle[];
  positionsByDeviceId: Record<string, LatestPosition>;
  loading: boolean;
  error: string | null;
  realtimeStatus: "CONNECTING" | "CONNECTED" | "DEGRADED";
  refetch: () => Promise<void>;
}

const TrackingContext = createContext<TrackingContextValue | null>(null);
const MODE_KEY = "yamahapulse.tracking.mode";
const SELECTED_KEY = "yamahapulse.tracking.selected";

export function TrackingProvider({ children }: { children: ReactNode }) {
  const { currentOrg } = useAuth();
  const organizationId = currentOrg?.id ?? null;
  const [mode, setMode] = useState<TrackingMode>(() => localStorage.getItem(MODE_KEY) === "gods-eye" ? "gods-eye" : "normal");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(() => localStorage.getItem(SELECTED_KEY));
  const [assignments, setAssignments] = useState<Array<{ deviceId: string; vehicleId: string; deviceName: string; imei: string; vehicleName: string; registration: string | null }>>([]);
  const { positionsByDeviceId, loading, error, realtimeStatus, refetch } = useLivePositions(organizationId);

  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    if (selectedVehicleId) localStorage.setItem(SELECTED_KEY, selectedVehicleId);
    else localStorage.removeItem(SELECTED_KEY);
  }, [selectedVehicleId]);

  useEffect(() => {
    if (!organizationId) {
      setAssignments([]);
      setSelectedVehicleId(null);
      return;
    }
    let cancelled = false;
    supabase.from("device_assignments").select("device_id,vehicle_id,device:gps_devices!device_assignments_device_id_fkey(id,name,imei),vehicle:vehicles!device_assignments_vehicle_id_fkey(id,name,registration_number)").eq("organization_id", organizationId).is("unassigned_at", null).then(({ data }) => {
      if (cancelled) return;
      const rows = (data ?? []) as unknown as { device_id: string; vehicle_id: string; device: { id: string; name: string; imei: string } | null; vehicle: { id: string; name: string; registration_number: string | null } | null }[];
      const next = rows.filter((row) => row.device && row.vehicle).map((row) => ({ deviceId: row.device_id, vehicleId: row.vehicle_id, deviceName: row.device!.name, imei: row.device!.imei, vehicleName: row.vehicle!.name, registration: row.vehicle!.registration_number }));
      setAssignments(next);
      setSelectedVehicleId((current) => current && next.some((item) => item.deviceId === current) ? current : next[0]?.deviceId ?? null);
    });
    return () => { cancelled = true; };
  }, [organizationId]);

  const vehicles = useMemo(() => assignments.map((assignment) => ({ ...assignment, position: positionsByDeviceId[assignment.deviceId] ?? null, status: getTelemetryStatus(positionsByDeviceId[assignment.deviceId]) })), [assignments, positionsByDeviceId]);
  const value = useMemo(() => ({ mode, setMode, selectedVehicleId, setSelectedVehicleId, vehicles, positionsByDeviceId, loading, error, realtimeStatus, refetch }), [mode, selectedVehicleId, vehicles, positionsByDeviceId, loading, error, realtimeStatus, refetch]);
  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>;
}

export function useTracking() {
  const value = useContext(TrackingContext);
  if (!value) throw new Error("useTracking must be used inside TrackingProvider");
  return value;
}

export type { TrackingMode };
