import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import type { GpsDevice, Vehicle } from "@/types/database";

interface Props {
  device: GpsDevice | null;
  onClose: () => void;
  onAssigned: () => void;
}

export function AssignDeviceDialog({ device, onClose, onAssigned }: Props) {
  const { currentOrg, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!device || !currentOrg) return;
    setVehicleId("");
    setNotes("");

    // Only offer vehicles that do not already have a device attached.
    supabase
      .from("vehicles")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(async ({ data }) => {
        const all = (data ?? []) as Vehicle[];
        const { data: assignments } = await supabase
          .from("device_assignments")
          .select("vehicle_id")
          .eq("organization_id", currentOrg.id)
          .is("unassigned_at", null);
        const taken = new Set(((assignments ?? []) as { vehicle_id: string }[]).map((a) => a.vehicle_id));
        setVehicles(all.filter((v) => !taken.has(v.id)));
      });
  }, [device, currentOrg]);

  const handleAssign = async () => {
    if (!device || !currentOrg || !vehicleId) return;
    setSaving(true);

    const { error: assignError } = await supabase.from("device_assignments").insert({
      organization_id: currentOrg.id,
      device_id: device.id,
      vehicle_id: vehicleId,
      assigned_by: user?.id ?? null,
      notes: notes.trim() || null,
    });

    const { error: deviceError } = assignError
      ? { error: null }
      : await supabase.from("gps_devices").update({ status: "ASSIGNED" }).eq("id", device.id);

    setSaving(false);

    const error = assignError ?? deviceError;
    if (error) {
      showError(error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: "ASSIGN",
      entity: "gps_device",
      entityId: device.id,
      newData: { vehicle_id: vehicleId },
    });

    showSuccess("Device assigned to vehicle");
    onAssigned();
  };

  return (
    <Dialog open={!!device} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Assign device</DialogTitle>
          <DialogDescription>
            Attach <span className="font-medium text-foreground">{device?.name}</span> (IMEI{" "}
            {device?.imei}) to a vehicle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Vehicle</Label>
            {vehicles.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                No unassigned vehicles available. Add a vehicle first.
              </p>
            ) : (
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} · {v.registration_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="assign-notes">Notes</Label>
            <Textarea
              id="assign-notes"
              rows={2}
              placeholder="Installation notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={saving || !vehicleId}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign device
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}