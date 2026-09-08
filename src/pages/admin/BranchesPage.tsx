import { useCallback, useEffect, useState } from "react";
import { Building, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { BranchFormDialog } from "@/components/branches/branch-form-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { ADMIN_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import type { Branch } from "@/types/database";

export default function BranchesPage() {
  const { currentOrg, currentRole, user } = useAuth();
  const canWrite = hasAnyRole(currentRole, ADMIN_ROLES);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [deleting, setDeleting] = useState<Branch | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("created_at", { ascending: true });

    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setBranches((data ?? []) as unknown as Branch[]);
  }, [currentOrg]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleting || !currentOrg) return;
    setDeleteBusy(true);
    const { error } = await supabase.from("branches").delete().eq("id", deleting.id);
    setDeleteBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: "DELETE",
      entity: "branch",
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
        title="Branches"
        description={`${branches.length} branch${branches.length === 1 ? "" : "es"} in ${currentOrg?.name ?? "your organization"}`}
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
              Add branch
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : branches.length === 0 ? (
        <EmptyState
          icon={Building}
          title="No branches yet"
          description="Add branches to organize vehicles and fleets across locations."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Branch</TableHead>
                <TableHead className="hidden md:table-cell">Location</TableHead>
                <TableHead className="hidden lg:table-cell">Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Building className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{b.name}</p>
                        {b.code && <p className="text-xs text-muted-foreground">{b.code}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {[b.city, b.country].filter(Boolean).join(", ") || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {b.phone ?? b.email ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        b.is_active
                          ? "border-emerald-500/25 bg-emerald-500/10 font-medium text-emerald-400"
                          : "border-slate-500/25 bg-slate-500/10 font-medium text-slate-400"
                      }
                    >
                      {b.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {canWrite && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(b);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleting(b)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
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

      <BranchFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        branch={editing}
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
              Vehicles and fleets linked to this branch will be unlinked, not deleted. This action
              is logged and cannot be undone.
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
