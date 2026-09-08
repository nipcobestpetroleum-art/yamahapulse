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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { GeofenceMapPicker } from "@/components/geofences/geofence-map-picker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import type { Geofence } from "@/types/database";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  geofence: Geofence | null;
  onSaved: () => void;
}

const DEFAULT_CENTER: [number, number] = [6.5244, 3.3792];

export function GeofenceFormDialog({ open, onOpenChange, geofence, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [radius, setRadius] = useState(500);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(geofence?.name ?? "");
    setDescription(geofence?.description ?? "");
    setCenter(geofence?.geometry.coordinates.center ?? DEFAULT_CENTER);
    setRadius(geofence?.geometry.coordinates.radius ?? 500);
    setIsActive(geofence?.is_active ?? true);

    if (!geofence && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCenter([pos.coords.latitude, pos.coords.longitude]),
        () => {},
        { timeout: 5000 },
      );
    }
  }, [open, geofence]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    setSaving(true);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      geometry: { type: "circle" as const, coordinates: { center, radius } },
      is_active: isActive,
    };

    const res = geofence
      ? await supabase.from("geofences").update(payload).eq("id", geofence.id)
      : await supabase.from("geofences").insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: geofence ? "UPDATE" : "CREATE",
      entity: "geofence",
      entityId: geofence?.id ?? null,
      oldData: geofence ?? undefined,
      newData: payload,
    });

    showSuccess(geofence ? "Geofence updated" : "Geofence created");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{geofence ? "Edit geofence" : "Create geofence"}</DialogTitle>
          <DialogDescription>
            Click on the map to set the center point, then adjust the radius.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gf-name">Name *</Label>
            <Input
              id="gf-name"
              required
              placeholder="e.g. Main Depot"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <GeofenceMapPicker center={center} radius={radius} onChange={setCenter} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="gf-radius">Radius (meters)</Label>
              <Input
                id="gf-radius"
                type="number"
                min="50"
                step="50"
                value={radius}
                onChange={(e) => setRadius(Math.max(50, Number(e.target.value) || 50))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3">
              <Label htmlFor="gf-active" className="text-sm">
                Active
              </Label>
              <Switch id="gf-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gf-desc">Description</Label>
            <Textarea
              id="gf-desc"
              rows={2}
              placeholder="Optional description…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {geofence ? "Save changes" : "Create geofence"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
