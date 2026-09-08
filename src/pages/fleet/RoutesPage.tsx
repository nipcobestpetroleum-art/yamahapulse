import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { MoreHorizontal, Navigation, Pencil, Plus, Trash2 } from "lucide-react";
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
import { RouteFormDialog } from "@/components/routes/route-form-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { ROUTE_DELETE_ROLES, ROUTE_WRITE_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { FleetRoute } from "@/types/database";

export default function RoutesPage() {
  const { currentOrg, currentRole, user } = useAuth();

  const [routes, setRoutes] = useState<FleetRoute[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FleetRoute | null>(null);
  const [deleting, setDeleting] = useState<FleetRoute | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canWrite = hasAnyRole(currentRole, ROUTE_WRITE_ROLES);
  const canDelete = hasAnyRole(currentRole, ROUTE_DELETE_ROLES);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("routes")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("created_at", { ascending: false });

    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setRoutes((data ?? []) as unknown as FleetRoute[]);
  }, [currentOrg]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleting || !currentOrg) return;
    setDeleteBusy(true);
    const { error } = await supabase.from("routes").delete().eq("id", deleting.id);
    setDeleteBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: "DELETE",
      entity: "route",
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
        title="Routes"
        description={`${routes.length} route${routes.length === 1 ? "" : "s"} planned`}
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
              Create route
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
      ) : routes.length === 0 ? (
        <EmptyState
          icon={Navigation}
          title="No routes yet"
          description="Plan reusable routes by plotting waypoints on the map, then assign them to trips and dispatch."
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
                Create route
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Route</TableHead>
                <TableHead className="hidden md:table-cell">Waypoints</TableHead>
                <TableHead className="hidden lg:table-cell">Distance</TableHead>
                <TableHead className="hidden lg:table-cell">Est. duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden xl:table-cell">Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {routes.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Navigation className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.name}</p>
                        {r.description && (
                          <p className="truncate text-xs text-muted-foreground">
                            {r.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {r.waypoints.length} point{r.waypoints.length === 1 ? "" : "s"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {r.distance_km != null ? `${r.distance_km} km` : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {r.estimated_duration_minutes != null
                        ? `${r.estimated_duration_minutes} min`
                        : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-medium",
                        r.is_active
                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                          : "border-slate-500/25 bg-slate-500/10 text-slate-400",
                      )}
                    >
                      {r.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(r.created_at), "dd MMM yyyy")}
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

      <RouteFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        route={editing}
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
              This permanently removes the route. This action is logged and cannot be undone.
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
