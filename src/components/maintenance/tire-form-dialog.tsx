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
import type { TirePosition, TireStatus, Vehicle, VehicleTire } from "@/types/database";

const POSITIONS: TirePosition[] = ["FRONT_LEFT", "FRONT_RIGHT", "REAR_LEFT", "REAR_RIGHT", "SPARE"];
const POSITION_LABELS: Record<TirePosition, string> = {
  FRONT_LEFT: "Front left",
  FRONT_RIGHT: "Front right",
  REAR_LEFT: "Rear left",
  REAR_RIGHT: "Rear right",
  SPARE: "Spare",
};

const STATUSES: TireStatus[] = ["GOOD", "WORN", "NEEDS_REPLACEMENT"];
const STATUS_LABELS: Record<TireStatus, string> = {
  GOOD: "Good",
  WORN: "Worn",
  NEEDS_REPLACEMENT: "Needs replacement",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tire: VehicleTire | null;
  onSaved: () => void;
}

export function TireFormDialog({ open, onOpenChange, tire, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [saving, setSaving] = useState(false);

  const [vehicleId, setVehicleId] = useState("");
  const [position, setPosition] = useState<TirePosition>("FRONT_LEFT");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [installedAt, setInstalledAt] = useState("");
  const [treadDepth, setTreadDepth] = useState("");
  const [status, setStatus] = useState<TireStatus>("GOOD");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !currentOrg) return;
    supabase
      .from("vehicles")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(({ data }) => setVehicles((data ?? []) as unknown as Vehicle[]));

    setVehicleId(tire?.vehicle_id ?? "");
    setPosition(tire?.position ?? "FRONT_LEFT");
    setBrand(tire?.brand ?? "");
    setSize(tire?.size ?? "");
    setInstalledAt(tire?.installed_at?.slice(0, 10) ?? "");
    setTreadDepth(tire?.tread_depth_mm?.toString() ?? "");
    setStatus(tire?.status ?? "GOOD");
    setNotes(tire?.notes ?? "");
  }, [open, tire, currentOrg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !vehicleId) return;
    setSaving(true);

    const payload = {
      vehicle_id: vehicleId,
      position,
      brand: brand.trim() || null,
      size: size.trim() || null,
      installed_at: installedAt || null,
      tread_depth_mm: treadDepth ? parseFloat(treadDepth) : null,
      status,
      notes: notes.trim() || null,
    };

    const res = tire
      ? await supabase.from("vehicle_tires").update(payload).eq("id", tire.id)
      : await supabase.from("vehicle_tires").insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: tire ? "UPDATE" : "CREATE",
      entity: "vehicle_tire",
      entityId: tire?.id ?? null,
      oldData: tire ?? undefined,
      newData: payload,
    });

    showSuccess(tire ? "Tire updated" : "Tire added");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{tire ? "Edit tire" : "Add tire"}</DialogTitle>
          <DialogDescription>Track tire condition and replacement schedule.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
              <Label>Position</Label>
              <Select value={position} onValueChange={(v) => setPosition(v as TirePosition)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {POSITION_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tire-brand">Brand</Label>
              <Input id="tire-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tire-size">Size</Label>
              <Input
                id="tire-size"
                placeholder="e.g. 195/65R15"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tire-installed">Installed on</Label>
              <Input
                id="tire-installed"
                type="date"
                value={installedAt}
                onChange={(e) => setInstalledAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tire-tread">Tread depth (mm)</Label>
              <Input
                id="tire-tread"
                type="number"
                min="0"
                step="0.1"
                value={treadDepth}
                onChange={(e) => setTreadDepth(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TireStatus)}>
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
            <Label htmlFor="tire-notes">Notes</Label>
            <Textarea
              id="tire-notes"
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
              {tire ? "Save changes" : "Add tire"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
