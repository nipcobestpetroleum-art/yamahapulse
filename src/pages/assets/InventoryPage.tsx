import { useCallback, useEffect, useState } from "react";
import { MoreHorizontal, Package, Pencil, Plus, Trash2 } from "lucide-react";
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
import { InventoryFormDialog } from "@/components/assets/inventory-form-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { TECH_DELETE_ROLES, TECH_WRITE_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { InventoryItem } from "@/types/database";

export default function InventoryPage() {
  const { currentOrg, currentRole, user } = useAuth();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canWrite = hasAnyRole(currentRole, TECH_WRITE_ROLES);
  const canDelete = hasAnyRole(currentRole, TECH_DELETE_ROLES);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name");

    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setItems((data ?? []) as unknown as InventoryItem[]);
  }, [currentOrg]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleting || !currentOrg) return;
    setDeleteBusy(true);
    const { error } = await supabase.from("inventory_items").delete().eq("id", deleting.id);
    setDeleteBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: "DELETE",
      entity: "inventory_item",
      entityId: deleting.id,
      oldData: deleting,
    });
    showSuccess("Item removed");
    setDeleting(null);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Inventory"
        description={`${items.length} item${items.length === 1 ? "" : "s"} tracked`}
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
              Add item
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
      ) : items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No inventory items yet"
          description="Track spare parts and equipment stock levels with reorder alerts."
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
                Add item
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Item</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => {
                const low = i.reorder_level != null && i.quantity <= i.reorder_level;
                return (
                  <TableRow key={i.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{i.name}</p>
                        <p className="text-xs text-muted-foreground">{i.sku ?? ""}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">{i.category ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-medium",
                          low
                            ? "border-rose-500/25 bg-rose-500/10 text-rose-400"
                            : "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
                        )}
                      >
                        {i.quantity} {i.unit}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground">{i.location ?? "—"}</span>
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

      <InventoryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        item={editing}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the inventory record. This action is logged and cannot be
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
