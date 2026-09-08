import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import type {
  ChecklistItem,
  InspectionStatus,
  Technician,
  Vehicle,
  VehicleInspection,
} from "@/types/database";

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { label: "Brakes", passed: true },
  { label: "Tires & wheels", passed: true },
  { label: "Lights & indicators", passed: true },
  { label: "Engine oil level", passed: true },
  { label: "Wipers & fluid", passed: true },
  { label: "Horn", passed: true },
  { label: "Seatbelts", passed: true },
  { label: "Mirrors", passed: true },
];

const STATUSES: InspectionStatus[] = ["PASS", "NEEDS_ATTENTION", "FAIL"];
const STATUS_LABELS: Record<InspectionStatus, string> = {
  PASS: "Pass",
  NEEDS_ATTENTION: "Needs attention",
  FAIL: "Fail",
};

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspection: VehicleInspection | null;
  onSaved: () => void;
}

export function InspectionFormDialog({ open, onOpenChange, inspection, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [saving, setSaving] = useState(false);

  const [vehicleId, setVehicleId] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [inspectedAt, setInspectedAt] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST);
  const [overallStatus, setOverallStatus] = useState<InspectionStatus>("PASS");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !currentOrg) return;
    supabase
      .from("vehicles")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(({ data }) => setVehicles((data ?? []) as unknown as Vehicle[]));
    supabase
      .from("technicians")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setTechnicians((data ?? []) as unknown as Technician[]));

    setVehicleId(inspection?.vehicle_id ?? "");
    setTechnicianId(inspection?.technician_id ?? "");
    setInspectedAt(toLocalInputValue(inspection?.inspected_at ?? new Date().toISOString()));
    setChecklist(inspection?.checklist?.length ? inspection.checklist : DEFAULT_CHECKLIST);
    setOverallStatus(inspection?.overall_status ?? "PASS");
    setNotes(inspection?.notes ?? "");
  }, [open, inspection, currentOrg]);

  const toggleItem = (index: number) => {
    setChecklist((prev) =>
      prev.map((item, i) => (i === index ? { ...item, passed: !item.passed } : item)),
    );
  };

  const addItem = () => {
    setChecklist((prev) => [...prev, { label: "", passed: true }]);
  };

  const updateLabel = (index: number, label: string) => {
    setChecklist((prev) => prev.map((item, i) => (i === index ? { ...item, label } : item)));
  };

  const removeItem = (index: number) => {
    setChecklist((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !vehicleId) return;
    setSaving(true);

    const payload = {
      vehicle_id: vehicleId,
      technician_id: technicianId || null,
      inspected_at: new Date(inspectedAt).toISOString(),
      checklist: checklist.filter((c) => c.label.trim()),
      overall_status: overallStatus,
      notes: notes.trim() || null,
    };

    const res = inspection
      ? await supabase.from("vehicle_inspections").update(payload).eq("id", inspection.id)
      : await supabase
          .from("vehicle_inspections")
          .insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: inspection ? "UPDATE" : "CREATE",
      entity: "vehicle_inspection",
      entityId: inspection?.id ?? null,
      oldData: inspection ?? undefined,
      newData: payload,
    });

    showSuccess(inspection ? "Inspection updated" : "Inspection recorded");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{inspection ? "Edit inspection" : "Record inspection"}</DialogTitle>
          <DialogDescription>
            Run through the checklist and record the overall condition of the vehicle.
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
              <Label>Technician</Label>
              <Select value={technicianId} onValueChange={setTechnicianId}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="insp-date">Inspected at *</Label>
              <Input
                id="insp-date"
                type="datetime-local"
                required
                value={inspectedAt}
                onChange={(e) => setInspectedAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Overall status</Label>
              <Select
                value={overallStatus}
                onValueChange={(v) => setOverallStatus(v as InspectionStatus)}
              >
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
            <div className="flex items-center justify-between">
              <Label>Checklist</Label>
              <Button type="button" size="sm" variant="outline" onClick={addItem}>
                <Plus className="mr-2 h-4 w-4" />
                Add item
              </Button>
            </div>
            <div className="space-y-2 rounded-lg border border-border p-3">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Checkbox checked={item.passed} onCheckedChange={() => toggleItem(i)} />
                  <Input
                    value={item.label}
                    onChange={(e) => updateLabel(i, e.target.value)}
                    className="h-8"
                    placeholder="Checklist item"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive"
                    onClick={() => removeItem(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="insp-notes">Notes</Label>
            <Textarea
              id="insp-notes"
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
              {inspection ? "Save changes" : "Save inspection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
