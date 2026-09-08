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
import type { FuelSensor, FuelSensorType, GpsDevice, Vehicle } from "@/types/database";

const SENSOR_TYPES: FuelSensorType[] = ["CAPACITIVE", "ANALOG", "DIGITAL", "ULTRASONIC"];
const SENSOR_TYPE_LABELS: Record<FuelSensorType, string> = {
  CAPACITIVE: "Capacitive",
  ANALOG: "Analog (voltage)",
  DIGITAL: "Digital",
  ULTRASONIC: "Ultrasonic",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sensor: FuelSensor | null;
  onSaved: () => void;
}

export function FuelSensorFormDialog({ open, onOpenChange, sensor, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [devices, setDevices] = useState<GpsDevice[]>([]);
  const [saving, setSaving] = useState(false);

  const [vehicleId, setVehicleId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [sensorType, setSensorType] = useState<FuelSensorType>("CAPACITIVE");
  const [capacity, setCapacity] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open || !currentOrg) return;
    supabase
      .from("vehicles")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(({ data }) => setVehicles((data ?? []) as unknown as Vehicle[]));
    supabase
      .from("gps_devices")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(({ data }) => setDevices((data ?? []) as unknown as GpsDevice[]));

    setVehicleId(sensor?.vehicle_id ?? "");
    setDeviceId(sensor?.device_id ?? "");
    setSensorType(sensor?.sensor_type ?? "CAPACITIVE");
    setCapacity(sensor?.tank_capacity_liters?.toString() ?? "");
    setIsActive(sensor?.is_active ?? true);
  }, [open, sensor, currentOrg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !vehicleId) return;
    setSaving(true);

    const payload = {
      vehicle_id: vehicleId,
      device_id: deviceId || null,
      sensor_type: sensorType,
      tank_capacity_liters: capacity ? parseFloat(capacity) : null,
      is_active: isActive,
    };

    const res = sensor
      ? await supabase.from("fuel_sensors").update(payload).eq("id", sensor.id)
      : await supabase
          .from("fuel_sensors")
          .insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: sensor ? "UPDATE" : "CREATE",
      entity: "fuel_sensor",
      entityId: sensor?.id ?? null,
      oldData: sensor ?? undefined,
      newData: payload,
    });

    showSuccess(sensor ? "Fuel sensor updated" : "Fuel sensor added");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{sensor ? "Edit fuel sensor" : "Add fuel sensor"}</DialogTitle>
          <DialogDescription>
            Link a fuel sensor to a vehicle and, optionally, the GPS device that reports its
            readings.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
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

          <div className="space-y-2">
            <Label>Reporting GPS device</Label>
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} · {d.imei}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Sensor type</Label>
              <Select value={sensorType} onValueChange={(v) => setSensorType(v as FuelSensorType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SENSOR_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {SENSOR_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fs-capacity">Tank capacity (L)</Label>
              <Input
                id="fs-capacity"
                type="number"
                min="0"
                step="1"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3">
            <Label htmlFor="fs-active" className="text-sm">
              Active
            </Label>
            <Switch id="fs-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !vehicleId}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {sensor ? "Save changes" : "Add sensor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
