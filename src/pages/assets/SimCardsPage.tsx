import { useCallback, useEffect, useState } from "react";
import { format, isPast } from "date-fns";
import { MoreHorizontal, Pencil, Plus, Signal, Trash2 } from "lucide-react";
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
import { SimCardFormDialog } from "@/components/assets/sim-card-form-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { TECH_DELETE_ROLES, TECH_WRITE_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { SimCard, SimCardStatus } from "@/types/database";

const STATUS_STYLES: Record<SimCardStatus, string> = {
  ACTIVE: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  SUSPENDED: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  INACTIVE: "border-slate-500/25 bg-slate-500/10 text-slate-400",
};

export default function SimCardsPage() {
  const { currentOrg, currentRole, user } = useAuth();

  const [simCards, setSimCards] = useState<SimCard[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SimCard | null>(null);
  const [deleting, setDeleting] = useState<SimCard | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canWrite = hasAnyRole(currentRole, TECH_WRITE_ROLES);
  const canDelete = hasAnyRole(currentRole, TECH_DELETE_ROLES);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("sim_cards")
      .select("*, device:gps_devices(name, imei)")
      .eq("organization_id", currentOrg.id)
      .order("created_at", { ascending: false });

    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setSimCards((data ?? []) as unknown as SimCard[]);
  }, [currentOrg]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleting || !currentOrg) return;
    setDeleteBusy(true);
    const { error } = await supabase.from("sim_cards").delete().eq("id", deleting.id);
    setDeleteBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: "DELETE",
      entity: "sim_card",
      entityId: deleting.id,
      oldData: deleting,
    });
    showSuccess("SIM card removed");
    setDeleting(null);
    load();
  };

  return (
    <div>
      <PageHeader
        title="SIM Cards"
        description={`${simCards.length} SIM${simCards.length === 1 ? "" : "s"} tracked`}
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
              Add SIM card
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
      ) : simCards.length === 0 ? (
        <EmptyState
          icon={Signal}
          title="No SIM cards yet"
          description="Track SIM cards used in GPS trackers and cameras, including data plans and expiry."
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
                Add SIM card
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>ICCID</TableHead>
                <TableHead className="hidden md:table-cell">Device</TableHead>
                <TableHead className="hidden lg:table-cell">Carrier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden xl:table-cell">Expiry</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {simCards.map((s) => {
                const expired = s.expiry_date && isPast(new Date(s.expiry_date));
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-medium">{s.iccid}</p>
                        <p className="text-xs text-muted-foreground">{s.phone_number ?? ""}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {s.device?.name ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground">{s.carrier ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-medium", STATUS_STYLES[s.status])}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <span className={cn("text-sm", expired ? "text-rose-400" : "text-muted-foreground")}>
                        {s.expiry_date ? format(new Date(s.expiry_date), "dd MMM yyyy") : "—"}
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
                                  setEditing(s);
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
                                onClick={() => setDeleting(s)}
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

      <SimCardFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        simCard={editing}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this SIM card?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the SIM card record. This action is logged and cannot be
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
