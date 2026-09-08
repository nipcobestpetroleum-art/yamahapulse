import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Gauge,
  LogIn,
  LogOut,
  MapPin,
  Pause,
  Play,
  Power,
  PowerOff,
  Radio,
  Truck,
  User,
  Zap,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { DeviceEvent, DeviceEventType } from "@/types/database";

interface EventRow extends DeviceEvent {
  device: { name: string } | null;
  vehicle: { name: string } | null;
}

const EVENT_ICONS: Record<DeviceEventType, typeof Activity> = {
  IGNITION_ON: Power,
  IGNITION_OFF: PowerOff,
  MOVING: Play,
  STOPPED: Pause,
  IDLE: Pause,
  OVERSPEED: Gauge,
  GEOFENCE_ENTER: LogIn,
  GEOFENCE_EXIT: LogOut,
  DEVICE_ONLINE: Activity,
  DEVICE_OFFLINE: AlertOctagon,
  HARSH_ACCEL: Zap,
  HARSH_BRAKE: Zap,
  HARSH_CORNER: Zap,
  CRASH: AlertTriangle,
  TOWING: Truck,
  JAMMING: Radio,
  DRIVER_IDENTIFIED: User,
};

const EVENT_LABELS: Record<DeviceEventType, string> = {
  IGNITION_ON: "Ignition on",
  IGNITION_OFF: "Ignition off",
  MOVING: "Started moving",
  STOPPED: "Stopped",
  IDLE: "Idling",
  OVERSPEED: "Overspeed",
  GEOFENCE_ENTER: "Entered geofence",
  GEOFENCE_EXIT: "Exited geofence",
  DEVICE_ONLINE: "Device online",
  DEVICE_OFFLINE: "Device offline",
  HARSH_ACCEL: "Harsh acceleration",
  HARSH_BRAKE: "Harsh braking",
  HARSH_CORNER: "Harsh cornering",
  CRASH: "Crash detected",
  TOWING: "Possible towing",
  JAMMING: "GSM jamming",
  DRIVER_IDENTIFIED: "Driver identified",
};

const SEVERITY_STYLES: Record<string, string> = {
  info: "border-sky-500/25 bg-sky-500/10 text-sky-400",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  critical: "border-rose-500/25 bg-rose-500/10 text-rose-400",
};

export default function EventsPage() {
  const { currentOrg } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);

    let query = supabase
      .from("device_events")
      .select("*, device:gps_devices(name), vehicle:vehicles(name)")
      .eq("organization_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(150);

    if (typeFilter !== "all") query = query.eq("type", typeFilter);

    const { data, error } = await query;
    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setEvents((data ?? []) as unknown as EventRow[]);
  }, [currentOrg, typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Events"
        description={`${events.length} recent event${events.length === 1 ? "" : "s"}`}
      />

      <div className="mb-4">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full bg-card/60 sm:w-[220px]">
            <SelectValue placeholder="Event type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All event types</SelectItem>
            {(Object.keys(EVENT_LABELS) as DeviceEventType[]).map((type) => (
              <SelectItem key={type} value={type}>
                {EVENT_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={typeFilter !== "all" ? "No events match this filter" : "No events yet"}
          description="Ignition changes, overspeeding, geofence crossings and connectivity changes will appear here automatically as your devices report them."
        />
      ) : (
        <div className="space-y-2">
          {events.map((e) => {
            const Icon = EVENT_ICONS[e.type as DeviceEventType] ?? Activity;
            return (
              <div
                key={e.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-card/40 p-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">
                      {EVENT_LABELS[e.type as DeviceEventType] ?? e.type}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-medium",
                        SEVERITY_STYLES[e.severity] ?? SEVERITY_STYLES.info,
                      )}
                    >
                      {e.severity}
                    </Badge>
                  </div>
                  {e.message && (
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{e.message}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {e.vehicle?.name && <span>{e.vehicle.name}</span>}
                    {e.device?.name && <span>{e.device.name}</span>}
                    {e.latitude != null && e.longitude != null && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {e.latitude.toFixed(4)}, {e.longitude.toFixed(4)}
                      </span>
                    )}
                    <span>{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
