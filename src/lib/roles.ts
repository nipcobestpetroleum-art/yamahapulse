import type { RoleName } from "@/types/database";

export const ROLE_LABELS: Record<RoleName, string> = {
  SUPER_ADMIN: "Super Admin",
  RESELLER_ADMIN: "Reseller Admin",
  ORGANIZATION_ADMIN: "Organization Admin",
  BRANCH_MANAGER: "Branch Manager",
  FLEET_MANAGER: "Fleet Manager",
  DISPATCHER: "Dispatcher",
  DRIVER_MANAGER: "Driver Manager",
  TECHNICIAN: "Technician",
  ACCOUNTANT: "Accountant",
  VIEWER: "Viewer",
};

export const ADMIN_ROLES: RoleName[] = ["SUPER_ADMIN", "ORGANIZATION_ADMIN"];
export const FINANCE_ROLES: RoleName[] = ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "ACCOUNTANT"];

export const VEHICLE_WRITE_ROLES: RoleName[] = [
  "SUPER_ADMIN",
  "ORGANIZATION_ADMIN",
  "BRANCH_MANAGER",
  "FLEET_MANAGER",
  "DISPATCHER",
];

export const VEHICLE_DELETE_ROLES: RoleName[] = [
  "SUPER_ADMIN",
  "ORGANIZATION_ADMIN",
  "FLEET_MANAGER",
];

export const DEVICE_WRITE_ROLES: RoleName[] = [
  "SUPER_ADMIN",
  "ORGANIZATION_ADMIN",
  "BRANCH_MANAGER",
  "FLEET_MANAGER",
  "TECHNICIAN",
];

export const DEVICE_DELETE_ROLES: RoleName[] = ["SUPER_ADMIN", "ORGANIZATION_ADMIN"];

export function hasAnyRole(role: RoleName | null, allowed: RoleName[]): boolean {
  if (!role) return false;
  return allowed.includes(role);
}