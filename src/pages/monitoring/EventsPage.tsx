import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  DoorClosed,
  DoorOpen,
  Gauge,
  LogIn,
  LogOut,
  MapPin,
  Pause,
  BatteryWarning,
  ChevronLeft,
  ChevronRight,
  Play,
  Power,
  PowerOff,
  Radio,
  Satellite,
  Siren,
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
import { Button } from "@/components/ui/button";
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
  PANIC: Siren,
  DOOR_OPEN: DoorOpen,
  DOOR_CLOSE: DoorClosed,
  ALARM: Siren,
  POWER_CUT: PowerOff,
  POWER_RESTORED: Power,
  GPS_LOST: Satellite,
  GPS_RESTORED: Satellite,
  LOW_BATTERY: BatteryWarning,
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
  PANIC: "Panic/SOS button",
  DOOR_OPEN: "Door opened",
  DOOR_CLOSE: "Door closed",
  ALARM: "Alarm triggered",
  POWER_CUT: "External power lost",
  POWER_RESTORED: "External power restored",
  GPS_LOST: "GNSS fix lost",
  GPS_RESTORED: "GNSS fix restored",
  LOW_BATTERY: "Low device battery",
};

const PAGE_SIZE = 25;

const SEVERITY_STYLES: Record<string, string> = {
  info: "border-sky-500/25 bg-sky-500/10 text-sky-400",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  critical: "border-rose-500/25 bg-rose-500/10 text-rose-400",
};

export default function EventsPage() {
  const { currentOrg } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);

    let query = supabase
      .from("device_events")
      .select("*, device:gps_devices(name), vehicle:vehicles(name)", { count: "exact" })
      .eq("organization_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (typeFilter !== "all") query = query.eq("type", typeFilter);

    const { data, count, error } = await query;
    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setEvents((data ?? []) as unknown as EventRow[]);
    setTotal(count ?? 0);
  }, [currentOrg, typeFilter, page]);

  useEffect(() => {
    setPage(0);
  }, [typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Events"
        description={`${total.toLocaleString()} event${total === 1 ? "" : "s"} in this organization`}
        actions={
          total > 0 ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={loading || page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="whitespace-nowrap text-xs text-muted-foreground">Page {page + 1} of {pageCount}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={loading || page >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : undefined
        }
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
