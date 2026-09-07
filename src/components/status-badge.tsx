import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DeviceStatus, VehicleStatus } from "@/types/database";

const VEHICLE_STYLES: Record<VehicleStatus, string> = {
  ACTIVE: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  INACTIVE: "border-slate-500/25 bg-slate-500/10 text-slate-400",
  MAINTENANCE: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  DECOMMISSIONED: "border-rose-500/25 bg-rose-500/10 text-rose-400",
};

const VEHICLE_LABELS: Record<VehicleStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  MAINTENANCE: "Maintenance",
  DECOMMISSIONED: "Decommissioned",
};

const DEVICE_STYLES: Record<DeviceStatus, string> = {
  IN_STOCK: "border-slate-500/25 bg-slate-500/10 text-slate-400",
  ASSIGNED: "border-sky-500/25 bg-sky-500/10 text-sky-400",
  ACTIVE: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  INACTIVE: "border-zinc-500/25 bg-zinc-500/10 text-zinc-400",
  FAULTY: "border-rose-500/25 bg-rose-500/10 text-rose-400",
  RETIRED: "border-stone-500/25 bg-stone-500/10 text-stone-500",
};

const DEVICE_LABELS: Record<DeviceStatus, string> = {
  IN_STOCK: "In Stock",
  ASSIGNED: "Assigned",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  FAULTY: "Faulty",
  RETIRED: "Retired",
};

export function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  return (
    <Badge variant="outline" className={cn("font-medium", VEHICLE_STYLES[status])}>
      {VEHICLE_LABELS[status]}
    </Badge>
  );
}

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  return (
    <Badge variant="outline" className={cn("font-medium", DEVICE_STYLES[status])}>
      {DEVICE_LABELS[status]}
    </Badge>
  );
}