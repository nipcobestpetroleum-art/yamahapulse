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

export type VehicleStatus = "ACTIVE" | "INACTIVE" | "MAINTENANCE" | "DECOMMISSIONED";

export type DeviceStatus =
  | "IN_STOCK"
  | "ASSIGNED"
  | "ACTIVE"
  | "INACTIVE"
  | "FAULTY"
  | "RETIRED";

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

export interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  phone: string | null;
}

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

export interface DeviceModel {
  id: string;
  organization_id: string | null;
  manufacturer: string;
  model: string;
  protocol: string | null;
  category: string | null;
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
  device?: GpsDevice | null;
  vehicle?: Vehicle | null;
}