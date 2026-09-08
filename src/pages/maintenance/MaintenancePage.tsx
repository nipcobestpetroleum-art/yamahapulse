import { useCallback, useEffect, useState } from "react";
import { format, isPast } from "date-fns";
import { MoreHorizontal, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { MaintenanceFormDialog } from "@/components/maintenance/maintenance-form-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { MAINTENANCE_DELETE_ROLES, MAINTENANCE_WRITE_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { MaintenanceSchedule, MaintenanceStatus } from "@/types/database";

const STATUS_STYLES: Record<MaintenanceStatus, string> = {
  SCHEDULED: "border-sky-500/25 bg-sky-500/10 text-sky-400",
  COMPLETED: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  OVERDUE: "border-rose-500/25 bg-rose-500/10 text-rose-400",
  CANCELLED: "border-slate-500/25 bg-slate-500/10 text-slate-400",
};

const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

export default function MaintenancePage() {
  const { currentOrg, currentRole, user } = useAuth();

  const [records, setRecords] = useState<MaintenanceSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceSchedule | null>(null);
  const [deleting, setDeleting] = useState<MaintenanceSchedule | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canWrite = hasAnyRole(currentRole, MAINTENANCE_WRITE_ROLES);
  const canDelete = hasAnyRole(currentRole, MAINTENANCE_DELETE_ROLES);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    let query = supabase
      .from("maintenance_schedules")
      .select("*, vehicle:vehicles(name, registration_number)")
      .eq("organization_id", currentOrg.id)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (statusFilter !== "all") query = query.eq("status", statusFilter);

    const { data, error } = await query;
    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }

    const rows = (data ?? []) as unknown as MaintenanceSchedule[];
    // Surface stale "scheduled" items whose due date has passed as overdue in the UI.
    setRecords(
      rows.map((r) =>
        r.status === "SCHEDULED" && r.due_date && isPast(new Date(r.due_date))
          ? { ...r, status: "OVERDUE" as MaintenanceStatus }
          : r,
      ),
    );
  }, [currentOrg, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleting || !currentOrg) return;
    setDeleteBusy(true);
    const { error } = await supabase.from("maintenance_schedules").delete().eq("id", deleting.id);
    setDeleteBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: "DELETE",
      entity: "maintenance_schedule",
      entityId: deleting.id,
      oldData: deleting,
    });
    showSuccess("Maintenance record deleted");
    setDeleting(null);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Maintenance"
        description={`${records.length} service record${records.length === 1 ? "" : "s"}`}
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
              Schedule maintenance
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full bg-card/60 sm:w-[190px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="SCHEDULED">Scheduled</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="OVERDUE">Overdue</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={statusFilter !== "all" ? "No records match this filter" : "No maintenance scheduled"}
          description="Plan service schedules to keep your fleet running reliably."
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
                Schedule maintenance
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Vehicle</TableHead>
                <TableHead className="hidden md:table-cell">Service</TableHead>
                <TableHead className="hidden lg:table-cell">Due</TableHead>
                <TableHead className="hidden lg:table-cell">Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.vehicle?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.vehicle?.registration_number ?? ""}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">{r.service_type}</span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {r.due_date ? format(new Date(r.due_date), "dd MMM yyyy") : "—"}
                      {r.due_odometer ? ` · ${r.due_odometer} km` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {r.cost != null ? `$${r.cost.toLocaleString()}` : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("font-medium", STATUS_STYLES[r.status])}>
                      {STATUS_LABELS[r.status]}
                    </Badge>
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

      <MaintenanceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        record={editing}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the maintenance record. This action is logged and cannot be
              undone.
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
