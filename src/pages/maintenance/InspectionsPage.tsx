import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ClipboardCheck, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { InspectionFormDialog } from "@/components/maintenance/inspection-form-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { TECH_DELETE_ROLES, TECH_WRITE_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { InspectionStatus, VehicleInspection } from "@/types/database";

const STATUS_STYLES: Record<InspectionStatus, string> = {
  PASS: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  NEEDS_ATTENTION: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  FAIL: "border-rose-500/25 bg-rose-500/10 text-rose-400",
};

export default function InspectionsPage() {
  const { currentOrg, currentRole, user } = useAuth();

  const [inspections, setInspections] = useState<VehicleInspection[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleInspection | null>(null);
  const [deleting, setDeleting] = useState<VehicleInspection | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canWrite = hasAnyRole(currentRole, TECH_WRITE_ROLES);
  const canDelete = hasAnyRole(currentRole, TECH_DELETE_ROLES);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("vehicle_inspections")
      .select("*, vehicle:vehicles(name, registration_number), technician:technicians(name)")
      .eq("organization_id", currentOrg.id)
      .order("inspected_at", { ascending: false })
      .limit(150);

    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setInspections((data ?? []) as unknown as VehicleInspection[]);
  }, [currentOrg]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleting || !currentOrg) return;
    setDeleteBusy(true);
    const { error } = await supabase.from("vehicle_inspections").delete().eq("id", deleting.id);
    setDeleteBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: "DELETE",
      entity: "vehicle_inspection",
      entityId: deleting.id,
      oldData: deleting,
    });
    showSuccess("Inspection deleted");
    setDeleting(null);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Vehicle Inspection"
        description={`${inspections.length} inspection${inspections.length === 1 ? "" : "s"} recorded`}
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
              Record inspection
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : inspections.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No inspections yet"
          description="Record vehicle inspections to track roadworthiness and safety compliance."
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
                Record inspection
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
                <TableHead className="hidden md:table-cell">Technician</TableHead>
                <TableHead className="hidden lg:table-cell">Checklist</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden xl:table-cell">Inspected</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {inspections.map((i) => {
                const passedCount = i.checklist.filter((c) => c.passed).length;
                return (
                  <TableRow key={i.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{i.vehicle?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {i.vehicle?.registration_number ?? ""}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {i.technician?.name ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {passedCount}/{i.checklist.length} passed
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("font-medium", STATUS_STYLES[i.overall_status])}
                      >
                        {i.overall_status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(i.inspected_at), "dd MMM yyyy, HH:mm")}
                      </span>
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
                                  setEditing(i);
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
                                onClick={() => setDeleting(i)}
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
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <InspectionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        inspection={editing}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this inspection?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the inspection record. This action is logged and cannot
              be undone.
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
