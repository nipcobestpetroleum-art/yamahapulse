import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  Cpu,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { ALERT_WORKFLOW_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { Alert, AlertStatus } from "@/types/database";

interface ActorProfile {
  first_name: string | null;
  last_name: string | null;
}

interface AlertRow extends Alert {
  device: { name: string } | null;
  vehicle: { name: string } | null;
  acknowledged_profile: ActorProfile | null;
  resolved_profile: ActorProfile | null;
}

const SEVERITY_STYLES: Record<string, string> = {
  info: "border-sky-500/25 bg-sky-500/10 text-sky-400",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  critical: "border-rose-500/25 bg-rose-500/10 text-rose-400",
};

const STATUS_STYLES: Record<AlertStatus, string> = {
  OPEN: "border-rose-500/25 bg-rose-500/10 text-rose-400",
  ACKNOWLEDGED: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  RESOLVED: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
};

function actorName(profile: ActorProfile | null): string {
  if (!profile) return "Team member";
  return [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Team member";
}

export default function AlertsPage() {
  const { currentOrg, currentRole, user } = useAuth();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [readFilter, setReadFilter] = useState("all");
  const [resolving, setResolving] = useState<AlertRow | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManage = hasAnyRole(currentRole, ALERT_WORKFLOW_ROLES);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);

    let query = supabase
      .from("alerts")
      .select(
        "*, device:gps_devices(name), vehicle:vehicles(name), acknowledged_profile:profiles!alerts_acknowledged_by_fkey(first_name, last_name), resolved_profile:profiles!alerts_resolved_by_fkey(first_name, last_name)",
      )
      .eq("organization_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (severityFilter !== "all") query = query.eq("severity", severityFilter);
    if (statusFilter === "active") query = query.in("status", ["OPEN", "ACKNOWLEDGED"]);
    else if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (readFilter === "unread") query = query.is("read_at", null);
    if (readFilter === "read") query = query.not("read_at", "is", null);

    const { data, error } = await query;
    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setAlerts((data ?? []) as unknown as AlertRow[]);
  }, [currentOrg, severityFilter, statusFilter, readFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      open: alerts.filter((a) => a.status === "OPEN").length,
      acknowledged: alerts.filter((a) => a.status === "ACKNOWLEDGED").length,
      resolved: alerts.filter((a) => a.status === "RESOLVED").length,
      unread: alerts.filter((a) => !a.read_at).length,
    }),
    [alerts],
  );

  const applyWorkflow = async (
    alert: AlertRow,
    status: AlertStatus,
    notes?: string,
  ) => {
    if (!currentOrg || !user || !canManage) return;
    setBusyId(alert.id);
    const now = new Date().toISOString();

    const payload =
      status === "ACKNOWLEDGED"
        ? {
            status,
            read_at: alert.read_at ?? now,
            acknowledged_at: now,
            acknowledged_by: user.id,
            resolved_at: null,
            resolved_by: null,
            resolution_notes: null,
          }
        : status === "RESOLVED"
          ? {
              status,
              read_at: alert.read_at ?? now,
              acknowledged_at: alert.acknowledged_at ?? now,
              acknowledged_by: alert.acknowledged_by ?? user.id,
              resolved_at: now,
              resolved_by: user.id,
              resolution_notes: notes?.trim() || null,
            }
          : {
              status,
              acknowledged_at: null,
              acknowledged_by: null,
              resolved_at: null,
              resolved_by: null,
              resolution_notes: null,
            };

    const { error } = await supabase.from("alerts").update(payload).eq("id", alert.id);
    setBusyId(null);
    if (error) {
      showError(error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user.id,
      action: status === "OPEN" ? "REOPEN" : status,
      entity: "alert",
      entityId: alert.id,
      oldData: { status: alert.status },
      newData: { status, resolution_notes: notes?.trim() || null },
    });

    showSuccess(
      status === "ACKNOWLEDGED"
        ? "Alert acknowledged"
        : status === "RESOLVED"
          ? "Alert resolved"
          : "Alert reopened",
    );
    setResolving(null);
    setResolutionNotes("");
    load();
  };

  const markRead = async (alert: AlertRow) => {
    if (!canManage) return;
    setBusyId(alert.id);
    const { error } = await supabase
      .from("alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("id", alert.id);
    setBusyId(null);
    if (error) showError(error.message);
    else load();
  };

  const markAllRead = async () => {
    if (!currentOrg || !canManage) return;
    const { error } = await supabase
      .from("alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("organization_id", currentOrg.id)
      .is("read_at", null);
    if (error) {
      showError(error.message);
      return;
    }
    showSuccess("All unread alerts marked as read");
    load();
  };

  return (
    <div>
      <PageHeader
        title="Alert Operations"
        description={`${counts.open} open · ${counts.acknowledged} acknowledged · ${counts.unread} unread in this view`}
        actions={
          canManage && counts.unread > 0 ? (
            <Button size="sm" variant="outline" className="border-border bg-card/60" onClick={markAllRead}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark all read
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-[repeat(3,180px)]">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="bg-card/60">
            <SelectValue placeholder="Workflow status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active alerts</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="bg-card/60">
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
          <SelectTrigger className="bg-card/60">
            <SelectValue placeholder="Read status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Read & unread</SelectItem>
            <SelectItem value="unread">Unread only</SelectItem>
            <SelectItem value="read">Read only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No alerts match these filters"
          description="Change the workflow, severity, or read filter to review other alerts."
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <div
              key={a.id}
              className={cn(
                "rounded-xl border border-border bg-card/40 p-4",
                !a.read_at && "border-primary/30 bg-primary/5",
                a.status === "RESOLVED" && "opacity-80",
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    a.status === "RESOLVED" ? "bg-emerald-500/10" : "bg-rose-500/10",
                  )}
                >
                  {a.status === "RESOLVED" ? (
                    <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-rose-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{a.message}</p>
                    <Badge
                      variant="outline"
                      className={cn("font-medium", SEVERITY_STYLES[a.severity] ?? SEVERITY_STYLES.info)}
                    >
                      {a.severity}
                    </Badge>
                    <Badge variant="outline" className={cn("font-medium", STATUS_STYLES[a.status])}>
                      {a.status.toLowerCase()}
                    </Badge>
                    {!a.read_at && (
                      <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {a.vehicle?.name && (
                      <span className="flex items-center gap-1">
                        <Cpu className="h-3 w-3" /> {a.vehicle.name}
                      </span>
                    )}
                    {a.device?.name && <span>{a.device.name}</span>}
                    <span>{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                    {a.latitude != null && a.longitude != null && (
                      <a
                        href={`https://maps.google.com/?q=${a.latitude},${a.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        View location
                      </a>
                    )}
                  </div>

                  {a.acknowledged_at && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Acknowledged by {actorName(a.acknowledged_profile)} · {format(new Date(a.acknowledged_at), "dd MMM yyyy, HH:mm")}
                    </p>
                  )}
                  {a.resolved_at && (
                    <div className="mt-2 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-2 text-xs">
                      <p className="font-medium text-emerald-400">
                        Resolved by {actorName(a.resolved_profile)} · {format(new Date(a.resolved_at), "dd MMM yyyy, HH:mm")}
                      </p>
                      {a.resolution_notes && (
                        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{a.resolution_notes}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {canManage && (
                <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border/50 pt-3">
                  {!a.read_at && (
                    <Button variant="ghost" size="sm" disabled={busyId === a.id} onClick={() => markRead(a)}>
                      Mark read
                    </Button>
                  )}
                  {a.status === "OPEN" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === a.id}
                      onClick={() => applyWorkflow(a, "ACKNOWLEDGED")}
                    >
                      {busyId === a.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                      Acknowledge
                    </Button>
                  )}
                  {a.status !== "RESOLVED" && (
                    <Button
                      size="sm"
                      disabled={busyId === a.id}
                      onClick={() => {
                        setResolving(a);
                        setResolutionNotes("");
                      }}
                    >
                      <CheckCheck className="mr-2 h-4 w-4" />
                      Resolve
                    </Button>
                  )}
                  {a.status === "RESOLVED" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === a.id}
                      onClick={() => applyWorkflow(a, "OPEN")}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reopen
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <AlertDialog
        open={!!resolving}
        onOpenChange={(open) => {
          if (!open) {
            setResolving(null);
            setResolutionNotes("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resolve this alert?</AlertDialogTitle>
            <AlertDialogDescription>
              Record what was checked or corrected. This creates an auditable resolution trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="resolution-notes">Resolution notes *</Label>
            <Textarea
              id="resolution-notes"
              rows={4}
              autoFocus
              placeholder="Example: Driver contacted; vehicle inspected and external power restored."
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!resolutionNotes.trim() || !resolving || busyId === resolving?.id}
              onClick={(event) => {
                event.preventDefault();
                if (resolving && resolutionNotes.trim()) {
                  applyWorkflow(resolving, "RESOLVED", resolutionNotes);
                }
              }}
            >
              {busyId === resolving?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Resolve alert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
