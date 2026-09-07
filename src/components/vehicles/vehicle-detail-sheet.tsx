import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Car, Cpu, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { VehicleStatusBadge, DeviceStatusBadge } from "@/components/status-badge";
import { supabase } from "@/integrations/supabase/client";
import type { DeviceAssignment, GpsDevice, Vehicle } from "@/types/database";

interface Props {
  vehicle: Vehicle | null;
  onClose: () => void;
  onEdit?: (vehicle: Vehicle) => void;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value ?? "—"}</p>
    </div>
  );
}

export function VehicleDetailSheet({ vehicle, onClose, onEdit }: Props) {
  const [assignment, setAssignment] = useState<(DeviceAssignment & { device: GpsDevice | null }) | null>(null);

  useEffect(() => {
    if (!vehicle) return;
    setAssignment(null);
    supabase
      .from("device_assignments")
      .select("*, device:gps_devices(*)")
      .eq("vehicle_id", vehicle.id)
      .is("unassigned_at", null)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setAssignment(data as unknown as DeviceAssignment & { device: GpsDevice | null });
      });
  }, [vehicle]);

  return (
    <Sheet open={!!vehicle} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {vehicle && (
          <>
            <SheetHeader>
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted">
                <Car className="h-8 w-8 text-muted-foreground" />
              </div>
              <SheetTitle className="text-lg">{vehicle.name}</SheetTitle>
              <SheetDescription className="flex items-center gap-2">
                {vehicle.registration_number}
                <VehicleStatusBadge status={vehicle.status} />
              </SheetDescription>
            </SheetHeader>

            {onEdit && (
              <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => onEdit(vehicle)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit vehicle
              </Button>
            )}

            <Separator className="my-5" />

            <div className="grid grid-cols-2 gap-4">
              <Field label="Make" value={vehicle.make} />
              <Field label="Model" value={vehicle.model} />
              <Field label="Year" value={vehicle.year} />
              <Field label="Color" value={vehicle.color} />
              <Field label="Fuel type" value={vehicle.fuel_type} />
              <Field
                label="Fuel capacity"
                value={vehicle.fuel_capacity ? `${vehicle.fuel_capacity} L` : null}
              />
              <Field label="Odometer" value={`${Number(vehicle.odometer).toLocaleString()} km`} />
              <Field label="Fleet" value={vehicle.fleet?.name} />
              <Field label="VIN" value={vehicle.vin} />
              <Field label="Added" value={format(new Date(vehicle.created_at), "dd MMM yyyy")} />
            </div>

            {vehicle.notes && (
              <>
                <Separator className="my-5" />
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{vehicle.notes}</p>
                </div>
              </>
            )}

            <Separator className="my-5" />

            <div>
              <p className="mb-3 text-sm font-semibold">Assigned GPS device</p>
              {assignment?.device ? (
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Cpu className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{assignment.device.name}</p>
                      <p className="text-xs text-muted-foreground">IMEI {assignment.device.imei}</p>
                    </div>
                    <DeviceStatusBadge status={assignment.device.status} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Assigned {format(new Date(assignment.assigned_at), "dd MMM yyyy, HH:mm")}
                  </p>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No device assigned. Assign one from Device Management.
                </p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}