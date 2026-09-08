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
import type { Driver, Trip, TripStatus, Vehicle } from "@/types/database";

const STATUSES: TripStatus[] = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const STATUS_LABELS: Record<TripStatus, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function toLocalInputValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Trip | null;
  onSaved: () => void;
}

export function TripFormDialog({ open, onOpenChange, trip, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [saving, setSaving] = useState(false);

  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [startLocation, setStartLocation] = useState("");
  const [endLocation, setEndLocation] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [status, setStatus] = useState<TripStatus>("SCHEDULED");
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
      .from("drivers")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(({ data }) => setDrivers((data ?? []) as unknown as Driver[]));

    setVehicleId(trip?.vehicle_id ?? "");
    setDriverId(trip?.driver_id ?? "");
    setStartTime(toLocalInputValue(trip?.start_time ?? new Date().toISOString()));
    setEndTime(toLocalInputValue(trip?.end_time ?? null));
    setStartLocation(trip?.start_location ?? "");
    setEndLocation(trip?.end_location ?? "");
    setDistanceKm(trip?.distance_km?.toString() ?? "");
    setStatus(trip?.status ?? "SCHEDULED");
    setNotes(trip?.notes ?? "");
  }, [open, trip, currentOrg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !vehicleId || !startTime) return;
    setSaving(true);

    const payload = {
      vehicle_id: vehicleId,
      driver_id: driverId || null,
      start_time: new Date(startTime).toISOString(),
      end_time: endTime ? new Date(endTime).toISOString() : null,
      start_location: startLocation.trim() || null,
      end_location: endLocation.trim() || null,
      distance_km: distanceKm ? parseFloat(distanceKm) : null,
      status,
      notes: notes.trim() || null,
    };

    const res = trip
      ? await supabase.from("trips").update(payload).eq("id", trip.id)
      : await supabase.from("trips").insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: trip ? "UPDATE" : "CREATE",
      entity: "trip",
      entityId: trip?.id ?? null,
      oldData: trip ?? undefined,
      newData: payload,
    });

    showSuccess(trip ? "Trip updated" : "Trip created");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{trip ? "Edit trip" : "Log a trip"}</DialogTitle>
          <DialogDescription>
            {trip ? "Update this trip's details." : "Record a scheduled or completed trip."}
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
              <Label>Driver</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger>
                  <SelectValue placeholder="No driver" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-start">Start time *</Label>
              <Input
                id="tr-start"
                type="datetime-local"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-end">End time</Label>
              <Input
                id="tr-end"
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-start-loc">Start location</Label>
              <Input
                id="tr-start-loc"
                placeholder="e.g. Main Depot"
                value={startLocation}
                onChange={(e) => setStartLocation(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-end-loc">End location</Label>
              <Input
                id="tr-end-loc"
                placeholder="e.g. Client site"
                value={endLocation}
                onChange={(e) => setEndLocation(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-distance">Distance (km)</Label>
              <Input
                id="tr-distance"
                type="number"
                min="0"
                step="0.1"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TripStatus)}>
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
            <Label htmlFor="tr-notes">Notes</Label>
            <Textarea
              id="tr-notes"
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
            <Button type="submit" disabled={saving || !vehicleId || !startTime}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {trip ? "Save changes" : "Log trip"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
