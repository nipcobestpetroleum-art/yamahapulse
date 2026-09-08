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
import type { GpsDevice, SimCard, SimCardStatus } from "@/types/database";

const STATUSES: SimCardStatus[] = ["ACTIVE", "SUSPENDED", "INACTIVE"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  simCard: SimCard | null;
  onSaved: () => void;
}

export function SimCardFormDialog({ open, onOpenChange, simCard, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [devices, setDevices] = useState<GpsDevice[]>([]);
  const [saving, setSaving] = useState(false);

  const [deviceId, setDeviceId] = useState("");
  const [iccid, setIccid] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [planDataMb, setPlanDataMb] = useState("");
  const [status, setStatus] = useState<SimCardStatus>("ACTIVE");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !currentOrg) return;
    supabase
      .from("gps_devices")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(({ data }) => setDevices((data ?? []) as unknown as GpsDevice[]));

    setDeviceId(simCard?.device_id ?? "");
    setIccid(simCard?.iccid ?? "");
    setPhoneNumber(simCard?.phone_number ?? "");
    setCarrier(simCard?.carrier ?? "");
    setPlanDataMb(simCard?.plan_data_mb?.toString() ?? "");
    setStatus(simCard?.status ?? "ACTIVE");
    setExpiryDate(simCard?.expiry_date?.slice(0, 10) ?? "");
    setNotes(simCard?.notes ?? "");
  }, [open, simCard, currentOrg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !iccid.trim()) return;
    setSaving(true);

    const payload = {
      device_id: deviceId || null,
      iccid: iccid.trim(),
      phone_number: phoneNumber.trim() || null,
      carrier: carrier.trim() || null,
      plan_data_mb: planDataMb ? parseInt(planDataMb, 10) : null,
      status,
      expiry_date: expiryDate || null,
      notes: notes.trim() || null,
    };

    const res = simCard
      ? await supabase.from("sim_cards").update(payload).eq("id", simCard.id)
      : await supabase.from("sim_cards").insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: simCard ? "UPDATE" : "CREATE",
      entity: "sim_card",
      entityId: simCard?.id ?? null,
      oldData: simCard ?? undefined,
      newData: payload,
    });

    showSuccess(simCard ? "SIM card updated" : "SIM card added");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{simCard ? "Edit SIM card" : "Add SIM card"}</DialogTitle>
          <DialogDescription>
            Track SIM cards used by GPS trackers and cameras across your fleet.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sim-iccid">ICCID *</Label>
            <Input
              id="sim-iccid"
              required
              placeholder="89…"
              value={iccid}
              onChange={(e) => setIccid(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Assigned device</Label>
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
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
            <div className="space-y-2">
              <Label htmlFor="sim-phone">Phone number</Label>
              <Input
                id="sim-phone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sim-carrier">Carrier</Label>
              <Input
                id="sim-carrier"
                placeholder="e.g. MTN"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sim-data">Data plan (MB)</Label>
              <Input
                id="sim-data"
                type="number"
                min="0"
                value={planDataMb}
                onChange={(e) => setPlanDataMb(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as SimCardStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sim-expiry">Expiry date</Label>
              <Input
                id="sim-expiry"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sim-notes">Notes</Label>
            <Textarea
              id="sim-notes"
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
            <Button type="submit" disabled={saving || !iccid.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {simCard ? "Save changes" : "Add SIM card"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
