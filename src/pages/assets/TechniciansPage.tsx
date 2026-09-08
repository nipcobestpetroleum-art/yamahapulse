import { useCallback, useEffect, useState } from "react";
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
import { TechnicianFormDialog } from "@/components/assets/technician-form-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { MANAGER_DELETE_ROLES, MANAGER_WRITE_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { Technician } from "@/types/database";

export default function TechniciansPage() {
  const { currentOrg, currentRole, user } = useAuth();

  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Technician | null>(null);
  const [deleting, setDeleting] = useState<Technician | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canWrite = hasAnyRole(currentRole, MANAGER_WRITE_ROLES);
  const canDelete = hasAnyRole(currentRole, MANAGER_DELETE_ROLES);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("technicians")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name");

    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setTechnicians((data ?? []) as unknown as Technician[]);
  }, [currentOrg]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleting || !currentOrg) return;
    setDeleteBusy(true);
    const { error } = await supabase.from("technicians").delete().eq("id", deleting.id);
    setDeleteBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: "DELETE",
      entity: "technician",
      entityId: deleting.id,
      oldData: deleting,
    });
    showSuccess("Technician removed");
    setDeleting(null);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Technicians"
        description={`${technicians.length} technician${technicians.length === 1 ? "" : "s"} registered`}
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
              Add technician
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
      ) : technicians.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No technicians yet"
          description="Add maintenance staff to assign inspections and service work."
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
                Add technician
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Contact</TableHead>
                <TableHead className="hidden lg:table-cell">Specialty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {technicians.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <p className="text-sm font-medium">{t.name}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <p className="text-sm text-muted-foreground">{t.phone ?? ""}</p>
                    <p className="text-xs text-muted-foreground">{t.email ?? ""}</p>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">{t.specialty ?? "—"}</span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-medium",
                        t.is_active
                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                          : "border-slate-500/25 bg-slate-500/10 text-slate-400",
                      )}
                    >
                      {t.is_active ? "Active" : "Inactive"}
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

      <TechnicianFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        technician={editing}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this technician?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the technician record. This action is logged and cannot
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
