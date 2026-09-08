import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Car, Cpu, Loader2, Pencil, PowerOff, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VehicleStatusBadge, DeviceStatusBadge } from "@/components/status-badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { ENGINE_CONTROL_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
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
  const { currentOrg, currentRole, user } = useAuth();
  const [assignment, setAssignment] = useState<(DeviceAssignment & { device: GpsDevice | null }) | null>(null);
  const [confirmingCommand, setConfirmingCommand] = useState<"ENGINE_CUT" | "ENGINE_RESUME" | null>(null);
  const [sendingCommand, setSendingCommand] = useState(false);

  const canControlEngine = hasAnyRole(currentRole, ENGINE_CONTROL_ROLES);

  const loadAssignment = () => {
    if (!vehicle) return;
    supabase
      .from("device_assignments")
      .select("*, device:gps_devices(*)")
      .eq("vehicle_id", vehicle.id)
      .is("unassigned_at", null)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setAssignment(data as unknown as DeviceAssignment & { device: GpsDevice | null });
      });
  };

  useEffect(() => {
    if (!vehicle) return;
    setAssignment(null);
    loadAssignment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle]);

  const sendCommand = async () => {
    if (!confirmingCommand || !assignment?.device || !currentOrg || !vehicle) return;
    setSendingCommand(true);
    const { error } = await supabase.from("device_commands").insert({
      organization_id: currentOrg.id,
      device_id: assignment.device.id,
      vehicle_id: vehicle.id,
      command: confirmingCommand,
      requested_by: user?.id ?? null,
    });
    setSendingCommand(false);
    if (error) {
      showError(error.message);
      return;
    }
    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: "UPDATE",
      entity: "device_command",
      entityId: assignment.device.id,
      newData: { command: confirmingCommand, vehicle_id: vehicle.id },
    });
    showSuccess(
      confirmingCommand === "ENGINE_CUT"
        ? "Engine cut command queued — it will be sent on the device's next check-in."
        : "Engine restore command queued — it will be sent on the device's next check-in.",
    );
    setConfirmingCommand(null);
  };

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

            {assignment?.device && (
              <>
                <Separator className="my-5" />
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">Engine control</p>
                    <Badge
                      variant="outline"
                      className={
                        assignment.device.engine_immobilized
                          ? "border-rose-500/25 bg-rose-500/10 font-medium text-rose-400"
                          : "border-emerald-500/25 bg-emerald-500/10 font-medium text-emerald-400"
                      }
                    >
                      {assignment.device.engine_immobilized ? "Immobilized" : "Running"}
                    </Badge>
                  </div>
                  {canControlEngine ? (
                    <div className="flex gap-2">
                      {assignment.device.engine_immobilized ? (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => setConfirmingCommand("ENGINE_RESUME")}
                        >
                          <Zap className="mr-2 h-4 w-4" />
                          Restore engine
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1"
                          onClick={() => setConfirmingCommand("ENGINE_CUT")}
                        >
                          <PowerOff className="mr-2 h-4 w-4" />
                          Immobilize engine
                        </Button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Only fleet managers and admins can send engine control commands.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Commands are sent to the vehicle's relay output on its next check-in with the
                    tracker.
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </SheetContent>

      <AlertDialog open={!!confirmingCommand} onOpenChange={(open) => !open && setConfirmingCommand(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmingCommand === "ENGINE_CUT" ? "Immobilize this vehicle's engine?" : "Restore engine power?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmingCommand === "ENGINE_CUT"
                ? "This cuts power via the relay output on the vehicle's next check-in. Only use this when the vehicle is stationary — cutting the engine while driving is dangerous. This action is logged."
                : "This restores engine power via the relay output on the vehicle's next check-in. This action is logged."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendingCommand}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={sendCommand}
              disabled={sendingCommand}
              className={
                confirmingCommand === "ENGINE_CUT"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {sendingCommand && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}