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
import { RouteMapPicker } from "@/components/routes/route-map-picker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import type { FleetRoute, RouteWaypoint } from "@/types/database";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  route: FleetRoute | null;
  onSaved: () => void;
}

const EARTH_RADIUS_KM = 6371;

function haversineKm(a: RouteWaypoint, b: RouteWaypoint) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function totalDistanceKm(waypoints: RouteWaypoint[]) {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += haversineKm(waypoints[i - 1], waypoints[i]);
  }
  return Math.round(total * 100) / 100;
}

export function RouteFormDialog({ open, onOpenChange, route, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [waypoints, setWaypoints] = useState<RouteWaypoint[]>([]);
  const [duration, setDuration] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(route?.name ?? "");
    setDescription(route?.description ?? "");
    setWaypoints(route?.waypoints ?? []);
    setDuration(route?.estimated_duration_minutes != null ? String(route.estimated_duration_minutes) : "");
    setIsActive(route?.is_active ?? true);
  }, [open, route]);

  const distanceKm = totalDistanceKm(waypoints);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    if (waypoints.length < 2) {
      showError("Add at least a start and end point on the map");
      return;
    }
    setSaving(true);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      waypoints,
      distance_km: distanceKm,
      estimated_duration_minutes: duration.trim() ? Number(duration) : null,
      is_active: isActive,
    };

    const res = route
      ? await supabase.from("routes").update(payload).eq("id", route.id)
      : await supabase.from("routes").insert({
          ...payload,
          organization_id: currentOrg.id,
          created_by: user?.id ?? null,
        });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: route ? "UPDATE" : "CREATE",
      entity: "route",
      entityId: route?.id ?? null,
      oldData: route ?? undefined,
      newData: payload,
    });

    showSuccess(route ? "Route updated" : "Route created");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{route ? "Edit route" : "Create route"}</DialogTitle>
          <DialogDescription>
            Click the map to plot waypoints in order — the first point is the start, the last is
            the destination.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rt-name">Name *</Label>
            <Input
              id="rt-name"
              required
              placeholder="e.g. Depot to Ikeja Warehouse"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <RouteMapPicker waypoints={waypoints} onChange={setWaypoints} />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Distance</Label>
              <Input readOnly value={`${distanceKm} km`} className="bg-muted/40" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rt-duration">Est. duration (min)</Label>
              <Input
                id="rt-duration"
                type="number"
                min="0"
                placeholder="Optional"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3">
              <Label htmlFor="rt-active" className="text-sm">
                Active
              </Label>
              <Switch id="rt-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rt-desc">Description</Label>
            <Textarea
              id="rt-desc"
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
            <Button type="submit" disabled={saving || !name.trim() || waypoints.length < 2}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {route ? "Save changes" : "Create route"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
