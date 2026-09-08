import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Bell, CheckCheck, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { Alert } from "@/types/database";

interface AlertRow extends Alert {
  device: { name: string } | null;
  vehicle: { name: string } | null;
}

const SEVERITY_STYLES: Record<string, string> = {
  info: "border-sky-500/25 bg-sky-500/10 text-sky-400",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  critical: "border-rose-500/25 bg-rose-500/10 text-rose-400",
};

export default function AlertsPage() {
  const { currentOrg } = useAuth();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [readFilter, setReadFilter] = useState("unread");

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);

    let query = supabase
      .from("alerts")
      .select("*, device:gps_devices(name), vehicle:vehicles(name)")
      .eq("organization_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (severityFilter !== "all") query = query.eq("severity", severityFilter);
    if (readFilter === "unread") query = query.is("read_at", null);
    if (readFilter === "read") query = query.not("read_at", "is", null);

    const { data, error } = await query;
    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setAlerts((data ?? []) as unknown as AlertRow[]);
  }, [currentOrg, severityFilter, readFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (alert: AlertRow) => {
    const { error } = await supabase
      .from("alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("id", alert.id);
    if (error) {
      showError(error.message);
      return;
    }
    load();
  };

  const markAllRead = async () => {
    if (!currentOrg) return;
    const { error } = await supabase
      .from("alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("organization_id", currentOrg.id)
      .is("read_at", null);
    if (error) {
      showError(error.message);
      return;
    }
    showSuccess("All alerts marked as read");
    load();
  };

  const unreadCount = alerts.filter((a) => !a.read_at).length;

  return (
    <div>
      <PageHeader
        title="Alerts"
        description={`${unreadCount} unread alert${unreadCount === 1 ? "" : "s"}`}
        actions={
          unreadCount > 0 ? (
            <Button size="sm" variant="outline" onClick={markAllRead}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark all read
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-full bg-card/60 sm:w-[170px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Select value={readFilter} onValueChange={setReadFilter}>
          <SelectTrigger className="w-full bg-card/60 sm:w-[170px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unread">Unread</SelectItem>
            <SelectItem value="read">Read</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No alerts"
          description="You're all caught up. New alerts from your alert rules will appear here."
        />
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div
              key={a.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border border-border bg-card/40 p-4",
                !a.read_at && "border-primary/30 bg-primary/5",
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{a.message}</p>
                  <Badge
                    variant="outline"
                    className={cn("font-medium", SEVERITY_STYLES[a.severity] ?? SEVERITY_STYLES.info)}
                  >
                    {a.severity}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {a.vehicle?.name && (
                    <span className="flex items-center gap-1">
                      <Cpu className="h-3 w-3" /> {a.vehicle.name}
                    </span>
                  )}
                  {a.device?.name && <span>{a.device.name}</span>}
                  <span>{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                </div>
              </div>
              {!a.read_at && (
                <Button variant="ghost" size="sm" onClick={() => markRead(a)}>
                  Mark read
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
