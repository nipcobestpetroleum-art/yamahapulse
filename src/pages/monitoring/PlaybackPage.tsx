import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useSearchParams } from "react-router-dom";
import { Gauge, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { PlaybackMap } from "@/components/tracking/playback-map";
import { EmptyState } from "@/components/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError } from "@/utils/toast";
import type { Position } from "@/types/database";

interface AssignedDevice {
  deviceId: string;
  vehicleName: string;
  registration: string | null;
}

const SPEEDS = [1, 2, 4, 8];

function toLocalInputValue(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function PlaybackPage() {
  const { currentOrg } = useAuth();
  const [searchParams] = useSearchParams();
  const [devices, setDevices] = useState<AssignedDevice[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [from, setFrom] = useState(() => {
    const param = searchParams.get("from");
    if (param && !isNaN(new Date(param).getTime())) return toLocalInputValue(new Date(param));
    return toLocalInputValue(new Date(Date.now() - 24 * 3600 * 1000));
  });
  const [to, setTo] = useState(() => {
    const param = searchParams.get("to");
    if (param && !isNaN(new Date(param).getTime())) return toLocalInputValue(new Date(param));
    return toLocalInputValue(new Date());
  });

  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!currentOrg) return;
    supabase
      .from("device_assignments")
      .select(
        "device_id, vehicle:vehicles!device_assignments_vehicle_id_fkey(name, registration_number)",
      )
      .eq("organization_id", currentOrg.id)
      .is("unassigned_at", null)
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as {
          device_id: string;
          vehicle: { name: string; registration_number: string | null } | null;
        }[];
        setDevices(
          rows
            .filter((r) => r.vehicle)
            .map((r) => ({
              deviceId: r.device_id,
              vehicleName: r.vehicle!.name,
              registration: r.vehicle!.registration_number,
            })),
        );
      });
  }, [currentOrg]);

  const stopPlayback = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setPlaying(false);
  };

  const handleLoad = async () => {
    if (!currentOrg || !deviceId) return;
    stopPlayback();
    setLoading(true);
    setActiveIndex(0);

    const { data, error } = await supabase
      .from("positions")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .eq("device_id", deviceId)
      .gte("recorded_at", new Date(from).toISOString())
      .lte("recorded_at", new Date(to).toISOString())
      .order("recorded_at", { ascending: true })
      .limit(2000);

    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setPositions((data ?? []) as unknown as Position[]);
  };

  useEffect(() => {
    return () => stopPlayback();
  }, []);

  const togglePlay = () => {
    if (playing) {
      stopPlayback();
      return;
    }
    if (positions.length === 0) return;
    setPlaying(true);
    intervalRef.current = setInterval(() => {
      setActiveIndex((idx) => {
        if (idx >= positions.length - 1) {
          stopPlayback();
          return idx;
        }
        return idx + 1;
      });
    }, 1000 / speed);
  };

  useEffect(() => {
    if (playing) {
      stopPlayback();
      setPlaying(true);
      intervalRef.current = setInterval(() => {
        setActiveIndex((idx) => {
          if (idx >= positions.length - 1) {
            stopPlayback();
            return idx;
          }
          return idx + 1;
        });
      }, 1000 / speed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed]);

  const active = positions[activeIndex] ?? null;

  const selectedDevice = useMemo(
    () => devices.find((d) => d.deviceId === deviceId) ?? null,
    [devices, deviceId],
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Playback" description="Replay historical GPS routes for any tracked vehicle" />

      <Card className="border-border bg-card/60">
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-4">
          <div className="space-y-2 sm:col-span-2">
            <Label>Vehicle</Label>
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger className="bg-background/60">
                <SelectValue placeholder="Select a tracked vehicle" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => (
                  <SelectItem key={d.deviceId} value={d.deviceId}>
                    {d.vehicleName} {d.registration ? `· ${d.registration}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pb-from">From</Label>
            <Input
              id="pb-from"
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-background/60"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pb-to">To</Label>
            <Input
              id="pb-to"
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-background/60"
            />
          </div>
          <div className="sm:col-span-4">
            <Button onClick={handleLoad} disabled={!deviceId || loading}>
              {loading ? "Loading…" : "Load route"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {positions.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="No route loaded"
          description="Select a vehicle and time range, then load its route to replay it on the map."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PlaybackMap positions={positions} activeIndex={activeIndex} />
          </div>

          <Card className="border-border bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                {selectedDevice?.vehicleName ?? "Vehicle"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="text-xs text-muted-foreground">Speed</div>
                  <div className="mt-1 font-semibold">
                    {active?.speed != null ? `${Math.round(active.speed)} km/h` : "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="text-xs text-muted-foreground">Ignition</div>
                  <div className="mt-1 font-semibold">
                    {active?.ignition == null ? "—" : active.ignition ? "On" : "Off"}
                  </div>
                </div>
                <div className="col-span-2 rounded-lg border border-border bg-background/40 p-3">
                  <div className="text-xs text-muted-foreground">Time</div>
                  <div className="mt-1 font-semibold">
                    {active ? format(new Date(active.recorded_at), "dd MMM yyyy, HH:mm:ss") : "—"}
                  </div>
                </div>
                <div className="col-span-2 rounded-lg border border-border bg-background/40 p-3">
                  <div className="text-xs text-muted-foreground">Address</div>
                  <div className="mt-1 truncate font-semibold">{active?.address ?? "—"}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Slider
                  value={[activeIndex]}
                  min={0}
                  max={Math.max(0, positions.length - 1)}
                  step={1}
                  onValueChange={([v]) => setActiveIndex(v)}
                />
                <p className="text-center text-xs text-muted-foreground">
                  Point {activeIndex + 1} of {positions.length}
                </p>
              </div>

              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                >
                  <SkipBack className="h-4 w-4" />
                </Button>
                <Button size="icon" onClick={togglePlay}>
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setActiveIndex((i) => Math.min(positions.length - 1, i + 1))}
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setActiveIndex(0)}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Playback speed</Label>
                <div className="flex gap-2">
                  {SPEEDS.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={speed === s ? "default" : "outline"}
                      onClick={() => setSpeed(s)}
                    >
                      {s}x
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
