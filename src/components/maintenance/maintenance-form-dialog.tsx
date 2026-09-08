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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import type { MaintenanceSchedule, MaintenanceStatus, Vehicle } from "@/types/database";

const SERVICE_TYPES = [
  "Oil change",
  "Tire rotation",
  "Brake service",
  "Battery check",
  "General inspection",
  "Filter replacement",
  "Other",
];

const STATUSES: MaintenanceStatus[] = ["SCHEDULED", "COMPLETED", "OVERDUE", "CANCELLED"];
const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: MaintenanceSchedule | null;
  onSaved: () => void;
}

export function MaintenanceFormDialog({ open, onOpenChange, record, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [saving, setSaving] = useState(false);

  const [vehicleId, setVehicleId] = useState("");
  const [serviceType, setServiceType] = useState("Oil change");
  const [dueDate, setDueDate] = useState("");
  const [dueOdometer, setDueOdometer] = useState("");
  const [status, setStatus] = useState<MaintenanceStatus>("SCHEDULED");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !currentOrg) return;
    supabase
      .from("vehicles")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(({ data }) => setVehicles((data ?? []) as unknown as Vehicle[]));

    setVehicleId(record?.vehicle_id ?? "");
    setServiceType(record?.service_type ?? "Oil change");
    setDueDate(record?.due_date ?? "");
    setDueOdometer(record?.due_odometer?.toString() ?? "");
    setStatus(record?.status ?? "SCHEDULED");
    setCost(record?.cost?.toString() ?? "");
    setNotes(record?.notes ?? "");
  }, [open, record, currentOrg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !vehicleId) return;
    setSaving(true);

    const payload = {
      vehicle_id: vehicleId,
      service_type: serviceType,
      due_date: dueDate || null,
      due_odometer: dueOdometer ? parseFloat(dueOdometer) : null,
      status,
      completed_at: status === "COMPLETED" ? new Date().toISOString() : record?.completed_at ?? null,
      cost: cost ? parseFloat(cost) : null,
      notes: notes.trim() || null,
    };

    const res = record
      ? await supabase.from("maintenance_schedules").update(payload).eq("id", record.id)
      : await supabase
          .from("maintenance_schedules")
          .insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: record ? "UPDATE" : "CREATE",
      entity: "maintenance_schedule",
      entityId: record?.id ?? null,
      oldData: record ?? undefined,
      newData: payload,
    });

    showSuccess(record ? "Schedule updated" : "Maintenance scheduled");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{record ? "Edit maintenance" : "Schedule maintenance"}</DialogTitle>
          <DialogDescription>
            {record
              ? "Update this maintenance record."
              : "Plan an upcoming service for a vehicle."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Vehicle *</Label>
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
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Service type</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ms-date">Due date</Label>
              <Input id="ms-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ms-odo">Due odometer (km)</Label>
              <Input
                id="ms-odo"
                type="number"
                min="0"
                value={dueOdometer}
                onChange={(e) => setDueOdometer(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as MaintenanceStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ms-cost">Cost</Label>
              <Input
                id="ms-cost"
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ms-notes">Notes</Label>
            <Textarea
              id="ms-notes"
              rows={2}
              placeholder="Optional notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !vehicleId}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {record ? "Save changes" : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
