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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import type { Camera, CameraDirection, CameraStatus, Vehicle } from "@/types/database";

const DIRECTIONS: CameraDirection[] = ["FRONT", "DRIVER", "CARGO", "REAR", "OTHER"];
const DIRECTION_LABELS: Record<CameraDirection, string> = {
  FRONT: "Front-facing",
  DRIVER: "Driver-facing",
  CARGO: "Cargo",
  REAR: "Rear-facing",
  OTHER: "Other",
};

const STATUSES: CameraStatus[] = ["ACTIVE", "INACTIVE", "OFFLINE"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  camera: Camera | null;
  onSaved: () => void;
}

export function CameraFormDialog({ open, onOpenChange, camera, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [saving, setSaving] = useState(false);

  const [vehicleId, setVehicleId] = useState("");
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<CameraDirection>("FRONT");
  const [streamUrl, setStreamUrl] = useState("");
  const [resolution, setResolution] = useState("");
  const [status, setStatus] = useState<CameraStatus>("ACTIVE");

  useEffect(() => {
    if (!open || !currentOrg) return;
    supabase
      .from("vehicles")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(({ data }) => setVehicles((data ?? []) as unknown as Vehicle[]));

    setVehicleId(camera?.vehicle_id ?? "");
    setName(camera?.name ?? "");
    setDirection(camera?.direction ?? "FRONT");
    setStreamUrl(camera?.stream_url ?? "");
    setResolution(camera?.resolution ?? "");
    setStatus(camera?.status ?? "ACTIVE");
  }, [open, camera, currentOrg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !name.trim()) return;
    setSaving(true);

    const payload = {
      vehicle_id: vehicleId || null,
      name: name.trim(),
      direction,
      stream_url: streamUrl.trim() || null,
      resolution: resolution.trim() || null,
      status,
    };

    const res = camera
      ? await supabase.from("cameras").update(payload).eq("id", camera.id)
      : await supabase.from("cameras").insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: camera ? "UPDATE" : "CREATE",
      entity: "camera",
      entityId: camera?.id ?? null,
      oldData: camera ?? undefined,
      newData: payload,
    });

    showSuccess(camera ? "Camera updated" : "Camera added");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{camera ? "Edit camera" : "Add camera"}</DialogTitle>
          <DialogDescription>
            Link a dashcam or MDVR camera to a vehicle. Provide its live stream URL (HLS/RTMP) to
            view it under Live Video.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cam-name">Name *</Label>
            <Input
              id="cam-name"
              required
              placeholder="e.g. Front dashcam"
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
                      {v.name} · {v.registration_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as CameraDirection)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {DIRECTION_LABELS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cam-stream">Live stream URL</Label>
            <Input
              id="cam-stream"
              placeholder="https://…/stream.m3u8"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cam-res">Resolution</Label>
              <Input
                id="cam-res"
                placeholder="e.g. 1080p"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as CameraStatus)}>
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
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {camera ? "Save changes" : "Add camera"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
