export type RoleName =
  | "SUPER_ADMIN"
  | "RESELLER_ADMIN"
  | "ORGANIZATION_ADMIN"
  | "BRANCH_MANAGER"
  | "FLEET_MANAGER"
  | "DISPATCHER"
  | "DRIVER_MANAGER"
  | "TECHNICIAN"
  | "ACCOUNTANT"
  | "VIEWER";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  industry: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  timezone: string;
  plan: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  alert_emails: string[];
}

export interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  updated_at: string;
}

export interface Branch {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Fleet {
  id: string;
  organization_id: string;
  branch_id: string | null;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export type VehicleStatus = "ACTIVE" | "INACTIVE" | "MAINTENANCE" | "DECOMMISSIONED";

export interface Vehicle {
  id: string;
  organization_id: string;
  fleet_id: string | null;
  branch_id: string | null;
  name: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  color: string | null;
  fuel_type: string | null;
  fuel_capacity: number | null;
  odometer: number;
  status: VehicleStatus;
  image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  fleet?: { name: string } | null;
}

export type DeviceStatus = "IN_STOCK" | "ASSIGNED" | "ACTIVE" | "INACTIVE" | "FAULTY" | "RETIRED";

export interface DeviceModel {
  id: string;
  organization_id: string | null;
  manufacturer: string;
  model: string;
  protocol: string | null;
  category: string | null;
  created_at: string;
}

export interface GpsDevice {
  id: string;
  organization_id: string;
  device_model_id: string | null;
  imei: string;
  name: string;
  serial_number: string | null;
  phone_number: string | null;
  sim_iccid: string | null;
  protocol: string | null;
  status: DeviceStatus;
  last_seen_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  device_model?: DeviceModel | null;
}

export interface DeviceAssignment {
  id: string;
  organization_id: string;
  device_id: string;
  vehicle_id: string;
  assigned_by: string | null;
  assigned_at: string;
  unassigned_at: string | null;
  notes: string | null;
}

export type DriverStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface Driver {
  id: string;
  organization_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  license_number: string | null;
  vehicle_id: string | null;
  status: DriverStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vehicle?: { name: string; registration_number: string } | null;
}

export type TripStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface Trip {
  id: string;
  organization_id: string;
  vehicle_id: string;
  driver_id: string | null;
  start_time: string;
  end_time: string | null;
  start_location: string | null;
  end_location: string | null;
  distance_km: number | null;
  status: TripStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vehicle?: { name: string; registration_number: string } | null;
  driver?: { name: string } | null;
}

export type MaintenanceStatus = "SCHEDULED" | "COMPLETED" | "OVERDUE" | "CANCELLED";

export interface MaintenanceSchedule {
  id: string;
  organization_id: string;
  vehicle_id: string;
  service_type: string;
  due_date: string | null;
  due_odometer: number | null;
  status: MaintenanceStatus;
  completed_at: string | null;
  cost: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vehicle?: { name: string; registration_number: string } | null;
}

export interface AlertRule {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  geofence_id: string | null;
  speed_limit: number | null;
  severity: string;
  notify_in_app: boolean;
  notify_email: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Alert {
  id: string;
  organization_id: string;
  device_id: string;
  vehicle_id: string | null;
  rule_id: string | null;
  type: string;
  severity: string;
  message: string;
  latitude: number | null;
  longitude: number | null;
  read_at: string | null;
  created_at: string;
}

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

export interface RouteWaypoint {
  lat: number;
  lon: number;
  name?: string;
}

export interface FleetRoute {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  waypoints: RouteWaypoint[];
  distance_km: number | null;
  estimated_duration_minutes: number | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type FuelSensorType = "ANALOG" | "DIGITAL" | "CAPACITIVE" | "ULTRASONIC";

export interface FuelCalibrationPoint {
  raw: number;
  liters: number;
}

export interface FuelSensor {
  id: string;
  organization_id: string;
  vehicle_id: string;
  device_id: string | null;
  sensor_type: FuelSensorType;
  tank_capacity_liters: number | null;
  calibration_points: FuelCalibrationPoint[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  vehicle?: { name: string; registration_number: string } | null;
}

export type FuelTransactionType = "REFUEL" | "DRAIN" | "THEFT";

export interface FuelTransaction {
  id: string;
  organization_id: string;
  vehicle_id: string;
  sensor_id: string | null;
  type: FuelTransactionType;
  liters: number;
  cost: number | null;
  odometer: number | null;
  location: string | null;
  recorded_at: string;
  notes: string | null;
  reviewed: boolean;
  created_at: string;
  vehicle?: { name: string; registration_number: string } | null;
}

export type JobStatus = "PENDING" | "DISPATCHED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface Job {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  status: JobStatus;
  scheduled_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vehicle?: { name: string; registration_number: string } | null;
  driver?: { name: string } | null;
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
