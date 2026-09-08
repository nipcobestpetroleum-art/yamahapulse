import { useCallback, useEffect, useState } from "react";
import { Bell, MoreHorizontal, Pencil, Plus, Siren, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AlertRuleFormDialog } from "@/components/alerts/alert-rule-form-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { ALERT_RULE_DELETE_ROLES, ALERT_RULE_WRITE_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { AlertRule } from "@/types/database";

interface AlertRuleRow extends AlertRule {
  geofence: { name: string } | null;
}

const TYPE_LABELS: Record<string, string> = {
  OVERSPEED: "Speed limit exceeded",
  IDLE: "Excessive idling",
  GEOFENCE_ENTER: "Enters geofence",
  GEOFENCE_EXIT: "Exits geofence",
  DEVICE_OFFLINE: "Device offline",
  IGNITION_ON: "Ignition on",
  IGNITION_OFF: "Ignition off",
};

const SEVERITY_STYLES: Record<string, string> = {
  info: "border-sky-500/25 bg-sky-500/10 text-sky-400",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  critical: "border-rose-500/25 bg-rose-500/10 text-rose-400",
};

export default function AlertRulesPage() {
  const { currentOrg, currentRole, user } = useAuth();

  const [rules, setRules] = useState<AlertRuleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [deleting, setDeleting] = useState<AlertRule | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canWrite = hasAnyRole(currentRole, ALERT_RULE_WRITE_ROLES);
  const canDelete = hasAnyRole(currentRole, ALERT_RULE_DELETE_ROLES);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("alert_rules")
      .select("*, geofence:geofences(name)")
      .eq("organization_id", currentOrg.id)
      .order("created_at", { ascending: false });

    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setRules((data ?? []) as unknown as AlertRuleRow[]);
  }, [currentOrg]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleEnabled = async (rule: AlertRuleRow) => {
    const { error } = await supabase
      .from("alert_rules")
      .update({ enabled: !rule.enabled })
      .eq("id", rule.id);
    if (error) {
      showError(error.message);
      return;
    }
    load();
  };

  const handleDelete = async () => {
    if (!deleting || !currentOrg) return;
    setDeleteBusy(true);
    const { error } = await supabase.from("alert_rules").delete().eq("id", deleting.id);
    setDeleteBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: "DELETE",
      entity: "alert_rule",
      entityId: deleting.id,
      oldData: deleting,
    });
    showSuccess(`${deleting.name} deleted`);
    setDeleting(null);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Alert Rules"
        description={`${rules.length} rule${rules.length === 1 ? "" : "s"} configured`}
        actions={
          canWrite ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create rule
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Siren}
          title="No alert rules yet"
          description="Create rules to automatically get alerted on speeding, geofence breaches, and more."
          action={
            canWrite ? (
              <Button
                size="sm"
                className="mt-2"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create rule
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Rule</TableHead>
                <TableHead className="hidden md:table-cell">Condition</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="truncate text-sm font-medium">{r.name}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {TYPE_LABELS[r.type] ?? r.type}
                      {r.type === "OVERSPEED" && r.speed_limit ? ` (${r.speed_limit} km/h)` : ""}
                      {r.type === "IDLE" && r.idle_minutes ? ` (${r.idle_minutes} min)` : ""}
                      {r.geofence?.name ? ` · ${r.geofence.name}` : ""}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("font-medium", SEVERITY_STYLES[r.severity] ?? SEVERITY_STYLES.info)}
                    >
                      {r.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={r.enabled}
                      onCheckedChange={() => toggleEnabled(r)}
                      disabled={!canWrite}
                    />
                  </TableCell>
                  <TableCell>
                    {(canWrite || canDelete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canWrite && (
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(r);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleting(r)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertRuleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        rule={editing}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the alert rule. This action is logged and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
