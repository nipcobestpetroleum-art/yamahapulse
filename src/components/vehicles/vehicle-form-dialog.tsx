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
import type { Fleet, Vehicle, VehicleStatus } from "@/types/database";

const FUEL_TYPES = ["Diesel", "Petrol", "Electric", "Hybrid", "CNG", "LPG"];
const STATUSES: VehicleStatus[] = ["ACTIVE", "INACTIVE", "MAINTENANCE", "DECOMMISSIONED"];
const STATUS_LABELS: Record<VehicleStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  MAINTENANCE: "Maintenance",
  DECOMMISSIONED: "Decommissioned",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle | null;
  onSaved: () => void;
}

export function VehicleFormDialog({ open, onOpenChange, vehicle, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [registration, setRegistration] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [fuelCapacity, setFuelCapacity] = useState("");
  const [odometer, setOdometer] = useState("0");
  const [fleetId, setFleetId] = useState("");
  const [status, setStatus] = useState<VehicleStatus>("ACTIVE");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !currentOrg) return;
    supabase
      .from("fleets")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(({ data }) => setFleets((data ?? []) as Fleet[]));

    setName(vehicle?.name ?? "");
    setRegistration(vehicle?.registration_number ?? "");
    setMake(vehicle?.make ?? "");
    setModel(vehicle?.model ?? "");
    setYear(vehicle?.year?.toString() ?? "");
    setColor(vehicle?.color ?? "");
    setFuelType(vehicle?.fuel_type ?? "");
    setFuelCapacity(vehicle?.fuel_capacity?.toString() ?? "");
    setOdometer(vehicle?.odometer?.toString() ?? "0");
    setFleetId(vehicle?.fleet_id ?? "");
    setStatus(vehicle?.status ?? "ACTIVE");
    setNotes(vehicle?.notes ?? "");
  }, [open, vehicle, currentOrg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    setSaving(true);

    const payload = {
      name: name.trim(),
      registration_number: registration.trim().toUpperCase(),
      make: make.trim() || null,
      model: model.trim() || null,
      year: year ? parseInt(year, 10) : null,
      color: color.trim() || null,
      fuel_type: fuelType || null,
      fuel_capacity: fuelCapacity ? parseFloat(fuelCapacity) : null,
      odometer: odometer ? parseFloat(odometer) : 0,
      fleet_id: fleetId || null,
      status,
      notes: notes.trim() || null,
    };

    const res = vehicle
      ? await supabase.from("vehicles").update(payload).eq("id", vehicle.id)
      : await supabase
          .from("vehicles")
          .insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(
        res.error.code === "23505"
          ? "A vehicle with this registration number already exists."
          : res.error.message,
      );
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: vehicle ? "UPDATE" : "CREATE",
      entity: "vehicle",
      entityId: vehicle?.id ?? null,
      oldData: vehicle ?? undefined,
      newData: payload,
    });

    showSuccess(vehicle ? "Vehicle updated" : "Vehicle added");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>{vehicle ? "Edit vehicle" : "Add vehicle"}</DialogTitle>
          <DialogDescription>
            {vehicle
              ? "Update the details of this vehicle."
              : "Register a new vehicle in your fleet."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="v-name">Name *</Label>
              <Input
                id="v-name"
                required
                placeholder="e.g. Truck 12"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-reg">Registration number *</Label>
              <Input
                id="v-reg"
                required
                placeholder="e.g. KDX 452A"
                value={registration}
                onChange={(e) => setRegistration(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-make">Make</Label>
              <Input id="v-make" placeholder="Toyota" value={make} onChange={(e) => setMake(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-model">Model</Label>
              <Input id="v-model" placeholder="Hilux" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-year">Year</Label>
              <Input
                id="v-year"
                type="number"
                min="1950"
                max="2100"
                placeholder="2022"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-color">Color</Label>
              <Input id="v-color" placeholder="White" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fuel type</Label>
              <Select value={fuelType} onValueChange={setFuelType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select fuel type" />
                </SelectTrigger>
                <SelectContent>
                  {FUEL_TYPES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-cap">Fuel capacity (L)</Label>
              <Input
                id="v-cap"
                type="number"
                min="0"
                step="0.1"
                placeholder="80"
                value={fuelCapacity}
                onChange={(e) => setFuelCapacity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-odo">Odometer (km)</Label>
              <Input
                id="v-odo"
                type="number"
                min="0"
                step="0.1"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Fleet</Label>
              <Select value={fleetId} onValueChange={setFleetId}>
                <SelectTrigger>
                  <SelectValue placeholder="No fleet" />
                </SelectTrigger>
                <SelectContent>
                  {fleets.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as VehicleStatus)}>
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
            <Label htmlFor="v-notes">Notes</Label>
            <Textarea
              id="v-notes"
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
            <Button type="submit" disabled={saving || !name.trim() || !registration.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {vehicle ? "Save changes" : "Add vehicle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}