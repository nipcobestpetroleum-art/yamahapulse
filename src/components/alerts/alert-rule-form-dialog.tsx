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
import type { AlertRule, Geofence } from "@/types/database";

const TYPES = [
  { value: "OVERSPEED", label: "Speed limit exceeded" },
  { value: "GEOFENCE_ENTER", label: "Enters geofence" },
  { value: "GEOFENCE_EXIT", label: "Exits geofence" },
  { value: "DEVICE_OFFLINE", label: "Device goes offline" },
  { value: "IGNITION_ON", label: "Ignition turned on" },
  { value: "IGNITION_OFF", label: "Ignition turned off" },
];

const SEVERITIES = ["info", "warning", "critical"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: AlertRule | null;
  onSaved: () => void;
}

export function AlertRuleFormDialog({ open, onOpenChange, rule, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState("OVERSPEED");
  const [geofenceId, setGeofenceId] = useState("");
  const [speedLimit, setSpeedLimit] = useState("80");
  const [severity, setSeverity] = useState("warning");
  const [notifyInApp, setNotifyInApp] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!open || !currentOrg) return;
    supabase
      .from("geofences")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(({ data }) => setGeofences((data ?? []) as unknown as Geofence[]));

    setName(rule?.name ?? "");
    setType(rule?.type ?? "OVERSPEED");
    setGeofenceId(rule?.geofence_id ?? "");
    setSpeedLimit(rule?.speed_limit?.toString() ?? "80");
    setSeverity(rule?.severity ?? "warning");
    setNotifyInApp(rule?.notify_in_app ?? true);
    setNotifyEmail(rule?.notify_email ?? false);
    setEnabled(rule?.enabled ?? true);
  }, [open, rule, currentOrg]);

  const isGeofenceType = type === "GEOFENCE_ENTER" || type === "GEOFENCE_EXIT";
  const isSpeedType = type === "OVERSPEED";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    setSaving(true);

    const payload = {
      name: name.trim(),
      type,
      geofence_id: isGeofenceType ? geofenceId || null : null,
      speed_limit: isSpeedType ? Number(speedLimit) || null : null,
      severity,
      notify_in_app: notifyInApp,
      notify_email: notifyEmail,
      enabled,
    };

    const res = rule
      ? await supabase.from("alert_rules").update(payload).eq("id", rule.id)
      : await supabase.from("alert_rules").insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: rule ? "UPDATE" : "CREATE",
      entity: "alert_rule",
      entityId: rule?.id ?? null,
      oldData: rule ?? undefined,
      newData: payload,
    });

    showSuccess(rule ? "Alert rule updated" : "Alert rule created");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit alert rule" : "Create alert rule"}</DialogTitle>
          <DialogDescription>
            Define a condition that triggers alerts for your fleet.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ar-name">Name *</Label>
            <Input
              id="ar-name"
              required
              placeholder="e.g. Highway speed limit"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Trigger condition</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isSpeedType && (
            <div className="space-y-2">
              <Label htmlFor="ar-speed">Speed limit (km/h)</Label>
              <Input
                id="ar-speed"
                type="number"
                min="1"
                value={speedLimit}
                onChange={(e) => setSpeedLimit(e.target.value)}
              />
            </div>
          )}

          {isGeofenceType && (
            <div className="space-y-2">
              <Label>Geofence</Label>
              {geofences.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-sm text-muted-foreground">
                  No geofences yet. Create one first.
                </p>
              ) : (
                <Select value={geofenceId} onValueChange={setGeofenceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select geofence" />
                  </SelectTrigger>
                  <SelectContent>
                    {geofences.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <Label htmlFor="ar-inapp" className="text-sm">
                Notify in-app
              </Label>
              <Switch id="ar-inapp" checked={notifyInApp} onCheckedChange={setNotifyInApp} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <Label htmlFor="ar-email" className="text-sm">
                Notify by email
              </Label>
              <Switch id="ar-email" checked={notifyEmail} onCheckedChange={setNotifyEmail} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <Label htmlFor="ar-enabled" className="text-sm">
                Rule enabled
              </Label>
              <Switch id="ar-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !name.trim() || (isGeofenceType && !geofenceId)}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {rule ? "Save changes" : "Create rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
