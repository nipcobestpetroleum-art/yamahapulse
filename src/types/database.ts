// ... append to existing file

export type Position = {
  id: string;
  organization_id: string;
  device_id: string;
  vehicle_id: string | null;
  recorded_at: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  course: number | null;
  altitude: number | null;
  accuracy: number | null;
  address: string | null;
  battery_level: number | null;
  ignition: boolean | null;
};

export type LatestPosition = Omit<Position, "id"> & { device_id: string };

export type GeofenceType = "circle" | "polygon";

export interface Geofence {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  geometry: { type: "circle"; coordinates: { center: [number, number]; radius: number } };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type DeviceEventType =
  | "IGNITION_ON"
  | "IGNITION_OFF"
  | "MOVING"
  | "STOPPED"
  | "IDLE"
  | "OVERSPEED"
  | "GEOFENCE_ENTER"
  | "GEOFENCE_EXIT"
  | "DEVICE_ONLINE"
  | "DEVICE_OFFLINE";

export interface DeviceEvent {
  id: string;
  organization_id: string;
  device_id: string;
  vehicle_id: string | null;
  type: DeviceEventType;
  severity: "info" | "warning" | "critical";
  message: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}