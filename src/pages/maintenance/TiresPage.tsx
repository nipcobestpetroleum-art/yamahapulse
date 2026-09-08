import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Disc3, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { TireFormDialog } from "@/components/maintenance/tire-form-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { TECH_DELETE_ROLES, TECH_WRITE_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { TirePosition, TireStatus, VehicleTire } from "@/types/database";

const POSITION_LABELS: Record<TirePosition, string> = {
  FRONT_LEFT: "Front left",
  FRONT_RIGHT: "Front right",
  REAR_LEFT: "Rear left",
  REAR_RIGHT: "Rear right",
  SPARE: "Spare",
};

const STATUS_STYLES: Record<TireStatus, string> = {
  GOOD: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  WORN: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  NEEDS_REPLACEMENT: "border-rose-500/25 bg-rose-500/10 text-rose-400",
};

export default function TiresPage() {
  const { currentOrg, currentRole, user } = useAuth();

  const [tires, setTires] = useState<VehicleTire[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleTire | null>(null);
  const [deleting, setDeleting] = useState<VehicleTire | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canWrite = hasAnyRole(currentRole, TECH_WRITE_ROLES);
  const canDelete = hasAnyRole(currentRole, TECH_DELETE_ROLES);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("vehicle_tires")
      .select("*, vehicle:vehicles(name, registration_number)")
      .eq("organization_id", currentOrg.id)
      .order("created_at", { ascending: false });

    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setTires((data ?? []) as unknown as VehicleTire[]);
  }, [currentOrg]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleting || !currentOrg) return;
    setDeleteBusy(true);
    const { error } = await supabase.from("vehicle_tires").delete().eq("id", deleting.id);
    setDeleteBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: "DELETE",
      entity: "vehicle_tire",
      entityId: deleting.id,
      oldData: deleting,
    });
    showSuccess("Tire record removed");
    setDeleting(null);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Tires"
        description={`${tires.length} tire${tires.length === 1 ? "" : "s"} tracked`}
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
              Add tire
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
      ) : tires.length === 0 ? (
        <EmptyState
          icon={Disc3}
          title="No tires tracked yet"
          description="Add tires to each vehicle to monitor tread depth and replacement schedules."
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
                Add tire
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
                <TableHead className="hidden md:table-cell">Position</TableHead>
                <TableHead className="hidden lg:table-cell">Brand / size</TableHead>
                <TableHead className="hidden lg:table-cell">Tread depth</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden xl:table-cell">Installed</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tires.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.vehicle?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.vehicle?.registration_number ?? ""}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {POSITION_LABELS[t.position]}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {[t.brand, t.size].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {t.tread_depth_mm != null ? `${t.tread_depth_mm} mm` : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("font-medium", STATUS_STYLES[t.status])}>
                      {t.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {t.installed_at ? format(new Date(t.installed_at), "dd MMM yyyy") : "—"}
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
                                setEditing(t);
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
                              onClick={() => setDeleting(t)}
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

      <TireFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        tire={editing}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this tire record?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the tire record. This action is logged and cannot be
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
