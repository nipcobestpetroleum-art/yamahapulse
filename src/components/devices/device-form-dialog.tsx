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
import type { DeviceModel, DeviceStatus, GpsDevice } from "@/types/database";

const STATUSES: DeviceStatus[] = ["IN_STOCK", "ACTIVE", "INACTIVE", "FAULTY", "RETIRED"];
const STATUS_LABELS: Record<DeviceStatus, string> = {
  IN_STOCK: "In Stock",
  ASSIGNED: "Assigned",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  FAULTY: "Faulty",
  RETIRED: "Retired",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: GpsDevice | null;
  onSaved: () => void;
}

export function DeviceFormDialog({ open, onOpenChange, device, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [models, setModels] = useState<DeviceModel[]>([]);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [imei, setImei] = useState("");
  const [modelId, setModelId] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [simIccid, setSimIccid] = useState("");
  const [status, setStatus] = useState<DeviceStatus>("IN_STOCK");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    supabase
      .from("device_models")
      .select("*")
      .order("manufacturer")
      .then(({ data }) => setModels((data ?? []) as DeviceModel[]));

    setName(device?.name ?? "");
    setImei(device?.imei ?? "");
    setModelId(device?.device_model_id ?? "");
    setSerialNumber(device?.serial_number ?? "");
    setPhoneNumber(device?.phone_number ?? "");
    setSimIccid(device?.sim_iccid ?? "");
    setStatus(device?.status ?? "IN_STOCK");
    setNotes(device?.notes ?? "");
  }, [open, device]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    setSaving(true);

    const selectedModel = models.find((m) => m.id === modelId) ?? null;
    const payload = {
      name: name.trim(),
      imei: imei.trim(),
      device_model_id: modelId || null,
      protocol: selectedModel?.protocol ?? null,
      serial_number: serialNumber.trim() || null,
      phone_number: phoneNumber.trim() || null,
      sim_iccid: simIccid.trim() || null,
      status,
      notes: notes.trim() || null,
    };

    const res = device
      ? await supabase.from("gps_devices").update(payload).eq("id", device.id)
      : await supabase
          .from("gps_devices")
          .insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(
        res.error.code === "23505"
          ? "A device with this IMEI already exists."
          : res.error.message,
      );
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: device ? "UPDATE" : "CREATE",
      entity: "gps_device",
      entityId: device?.id ?? null,
      oldData: device ?? undefined,
      newData: payload,
    });

    showSuccess(device ? "Device updated" : "Device registered");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>{device ? "Edit device" : "Register GPS device"}</DialogTitle>
          <DialogDescription>
            {device
              ? "Update this tracker's details."
              : "Add a GPS tracker to your inventory. It must point to your telematics server (e.g. Traccar) to start reporting positions."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="d-name">Device name *</Label>
              <Input
                id="d-name"
                required
                placeholder="e.g. Tracker T12"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-imei">IMEI *</Label>
              <Input
                id="d-imei"
                required
                placeholder="15-digit IMEI"
                pattern="[0-9]{10,17}"
                title="Enter the device IMEI (10–17 digits)"
                value={imei}
                onChange={(e) => setImei(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Device model</Label>
              <Select value={modelId} onValueChange={setModelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select model (sets the protocol)" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.manufacturer} {m.model}
                      {m.protocol ? ` · ${m.protocol}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-serial">Serial number</Label>
              <Input
                id="d-serial"
                placeholder="Optional"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-phone">SIM phone number</Label>
              <Input
                id="d-phone"
                placeholder="+1 555 000 0000"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-iccid">SIM ICCID</Label>
              <Input
                id="d-iccid"
                placeholder="Optional"
                value={simIccid}
                onChange={(e) => setSimIccid(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as DeviceStatus)}>
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="d-notes">Notes</Label>
            <Textarea
              id="d-notes"
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
            <Button type="submit" disabled={saving || !name.trim() || imei.length < 10}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {device ? "Save changes" : "Register device"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}