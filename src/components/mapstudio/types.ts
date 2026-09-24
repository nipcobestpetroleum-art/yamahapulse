import type { LatestPosition } from "@/types/database";

export type StudioTab = "fleet" | "places" | "routing" | "roads" | "environment" | "static";

export interface MapMarkerSpec {
  id: string;
  lat: number;
  lng: number;
  title: string;
  color?: string;
  snippet?: string[];
  scale?: number;
  bearing?: number;
  icon?: "bike" | "dot";
}

export interface MapPolylineSpec {
  id: string;
  points: [number, number][];
  color?: string;
  weight?: number;
  dashed?: boolean;
  opacity?: number;
}

export interface StudioOverlays {
  markers: MapMarkerSpec[];
  polylines: MapPolylineSpec[];
}

export interface StudioVehicle {
  deviceId: string;
  deviceName: string;
  vehicleName: string;
  registration: string | null;
  position: LatestPosition | null;
}

export interface ViewRequest {
  lat: number;
  lng: number;
  zoom?: number;
  nonce: number;
}
