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
import type { AssetSensor, AssetSensorType, GpsDevice, Vehicle } from "@/types/database";

const SENSOR_TYPES: AssetSensorType[] = ["TEMPERATURE", "HUMIDITY", "DOOR", "PANIC_BUTTON", "CUSTOM"];
const SENSOR_TYPE_LABELS: Record<AssetSensorType, string> = {
  TEMPERATURE: "Temperature",
  HUMIDITY: "Humidity",
  DOOR: "Door sensor",
  PANIC_BUTTON: "Panic button",
  CUSTOM: "Custom",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sensor: AssetSensor | null;
  onSaved: () => void;
}

export function SensorFormDialog({ open, onOpenChange, sensor, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [devices, setDevices] = useState<GpsDevice[]>([]);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [sensorType, setSensorType] = useState<AssetSensorType>("TEMPERATURE");
  const [unit, setUnit] = useState("");
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

    setName(sensor?.name ?? "");
    setVehicleId(sensor?.vehicle_id ?? "");
    setDeviceId(sensor?.device_id ?? "");
    setSensorType(sensor?.sensor_type ?? "TEMPERATURE");
    setUnit(sensor?.unit ?? "");
    setIsActive(sensor?.is_active ?? true);
  }, [open, sensor, currentOrg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !name.trim()) return;
    setSaving(true);

    const payload = {
      name: name.trim(),
      vehicle_id: vehicleId || null,
      device_id: deviceId || null,
      sensor_type: sensorType,
      unit: unit.trim() || null,
      is_active: isActive,
    };

    const res = sensor
      ? await supabase.from("asset_sensors").update(payload).eq("id", sensor.id)
      : await supabase.from("asset_sensors").insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: sensor ? "UPDATE" : "CREATE",
      entity: "asset_sensor",
      entityId: sensor?.id ?? null,
      oldData: sensor ?? undefined,
      newData: payload,
    });

    showSuccess(sensor ? "Sensor updated" : "Sensor added");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{sensor ? "Edit sensor" : "Add sensor"}</DialogTitle>
          <DialogDescription>
            Register temperature, door, or panic-button sensors linked to a vehicle or GPS device.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sensor-name">Name *</Label>
            <Input
              id="sensor-name"
              required
              placeholder="e.g. Cargo temperature sensor"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Vehicle</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reporting device</Label>
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={sensorType} onValueChange={(v) => setSensorType(v as AssetSensorType)}>
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
              <Label htmlFor="sensor-unit">Unit</Label>
              <Input
                id="sensor-unit"
                placeholder="e.g. °C"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3">
            <Label htmlFor="sensor-active" className="text-sm">
              Active
            </Label>
            <Switch id="sensor-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {sensor ? "Save changes" : "Add sensor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
