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
import type { FuelTransaction, FuelTransactionType, Vehicle } from "@/types/database";

const TYPES: FuelTransactionType[] = ["REFUEL", "DRAIN", "THEFT"];
const TYPE_LABELS: Record<FuelTransactionType, string> = {
  REFUEL: "Refuel",
  DRAIN: "Drain (maintenance)",
  THEFT: "Theft / unexplained loss",
};

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: FuelTransaction | null;
  onSaved: () => void;
}

export function FuelTransactionFormDialog({ open, onOpenChange, transaction, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [saving, setSaving] = useState(false);

  const [vehicleId, setVehicleId] = useState("");
  const [type, setType] = useState<FuelTransactionType>("REFUEL");
  const [liters, setLiters] = useState("");
  const [cost, setCost] = useState("");
  const [odometer, setOdometer] = useState("");
  const [location, setLocation] = useState("");
  const [recordedAt, setRecordedAt] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !currentOrg) return;
    supabase
      .from("vehicles")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(({ data }) => setVehicles((data ?? []) as unknown as Vehicle[]));

    setVehicleId(transaction?.vehicle_id ?? "");
    setType(transaction?.type ?? "REFUEL");
    setLiters(transaction?.liters?.toString() ?? "");
    setCost(transaction?.cost?.toString() ?? "");
    setOdometer(transaction?.odometer?.toString() ?? "");
    setLocation(transaction?.location ?? "");
    setRecordedAt(toLocalInputValue(transaction?.recorded_at ?? new Date().toISOString()));
    setNotes(transaction?.notes ?? "");
  }, [open, transaction, currentOrg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !vehicleId || !liters) return;
    setSaving(true);

    const payload = {
      vehicle_id: vehicleId,
      type,
      liters: parseFloat(liters),
      cost: cost ? parseFloat(cost) : null,
      odometer: odometer ? parseFloat(odometer) : null,
      location: location.trim() || null,
      recorded_at: new Date(recordedAt).toISOString(),
      notes: notes.trim() || null,
    };

    const res = transaction
      ? await supabase.from("fuel_transactions").update(payload).eq("id", transaction.id)
      : await supabase
          .from("fuel_transactions")
          .insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: transaction ? "UPDATE" : "CREATE",
      entity: "fuel_transaction",
      entityId: transaction?.id ?? null,
      oldData: transaction ?? undefined,
      newData: payload,
    });

    showSuccess(transaction ? "Transaction updated" : "Transaction logged");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{transaction ? "Edit fuel transaction" : "Log fuel transaction"}</DialogTitle>
          <DialogDescription>
            Record refuels, drains, or unexplained fuel loss for a vehicle.
          </DialogDescription>
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
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as FuelTransactionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ft-liters">Liters *</Label>
              <Input
                id="ft-liters"
                type="number"
                min="0"
                step="0.1"
                required
                value={liters}
                onChange={(e) => setLiters(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ft-cost">Cost</Label>
              <Input
                id="ft-cost"
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ft-odo">Odometer (km)</Label>
              <Input
                id="ft-odo"
                type="number"
                min="0"
                step="0.1"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ft-when">Date/time *</Label>
              <Input
                id="ft-when"
                type="datetime-local"
                required
                value={recordedAt}
                onChange={(e) => setRecordedAt(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ft-location">Location</Label>
              <Input
                id="ft-location"
                placeholder="e.g. Mobil Station, Ikeja"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ft-notes">Notes</Label>
            <Textarea
              id="ft-notes"
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
            <Button type="submit" disabled={saving || !vehicleId || !liters}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {transaction ? "Save changes" : "Log transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
