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
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import type { MaintenanceInterval, Vehicle } from "@/types/database";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interval: MaintenanceInterval | null;
  onSaved: () => void;
}

export function IntervalFormDialog({ open, onOpenChange, interval, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [saving, setSaving] = useState(false);

  const [serviceType, setServiceType] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [intervalKm, setIntervalKm] = useState("");
  const [intervalDays, setIntervalDays] = useState("");
  const [intervalHours, setIntervalHours] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open || !currentOrg) return;
    supabase
      .from("vehicles")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(({ data }) => setVehicles((data ?? []) as unknown as Vehicle[]));

    setServiceType(interval?.service_type ?? "");
    setVehicleId(interval?.vehicle_id ?? "");
    setIntervalKm(interval?.interval_km?.toString() ?? "");
    setIntervalDays(interval?.interval_days?.toString() ?? "");
    setIntervalHours(interval?.interval_hours?.toString() ?? "");
    setIsActive(interval?.is_active ?? true);
  }, [open, interval, currentOrg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !serviceType.trim()) return;
    if (!intervalKm && !intervalDays && !intervalHours) {
      showError("Set at least a distance, time, or engine-hours interval.");
      return;
    }
    setSaving(true);

    const payload = {
      service_type: serviceType.trim(),
      vehicle_id: vehicleId || null,
      interval_km: intervalKm ? parseFloat(intervalKm) : null,
      interval_days: intervalDays ? parseInt(intervalDays, 10) : null,
      interval_hours: intervalHours ? parseFloat(intervalHours) : null,
      is_active: isActive,
    };

    const res = interval
      ? await supabase.from("maintenance_intervals").update(payload).eq("id", interval.id)
      : await supabase
          .from("maintenance_intervals")
          .insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: interval ? "UPDATE" : "CREATE",
      entity: "maintenance_interval",
      entityId: interval?.id ?? null,
      oldData: interval ?? undefined,
      newData: payload,
    });

    showSuccess(interval ? "Interval updated" : "Interval created");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{interval ? "Edit interval" : "Add maintenance interval"}</DialogTitle>
          <DialogDescription>
            Automatically schedule service when a vehicle's real odometer reading, engine
            hours (from GPS telemetry), or time since last service crosses this threshold.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="int-service">Service type *</Label>
            <Input
              id="int-service"
              required
              placeholder="e.g. Oil change"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Applies to</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger>
                <SelectValue placeholder="All vehicles in organization" />
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

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="int-km">Every (km)</Label>
              <Input
                id="int-km"
                type="number"
                min="0"
                placeholder="e.g. 3000"
                value={intervalKm}
                onChange={(e) => setIntervalKm(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="int-days">Every (days)</Label>
              <Input
                id="int-days"
                type="number"
                min="0"
                placeholder="e.g. 180"
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="int-hours">Every (engine hours)</Label>
              <Input
                id="int-hours"
                type="number"
                min="0"
                placeholder="e.g. 250"
                value={intervalHours}
                onChange={(e) => setIntervalHours(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3">
            <Label htmlFor="int-active" className="text-sm">
              Active
            </Label>
            <Switch id="int-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !serviceType.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {interval ? "Save changes" : "Add interval"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
