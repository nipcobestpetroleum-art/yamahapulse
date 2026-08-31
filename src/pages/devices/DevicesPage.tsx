import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Cpu,
  Link2,
  Link2Off,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
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
import { DeviceStatusBadge } from "@/components/status-badge";
import { DeviceFormDialog } from "@/components/devices/device-form-dialog";
import { AssignDeviceDialog } from "@/components/devices/assign-device-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useDebounce } from "@/hooks/use-debounce";
import { DEVICE_DELETE_ROLES, DEVICE_WRITE_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import type { GpsDevice } from "@/types/database";

const PAGE_SIZE = 12;

interface DeviceRow extends GpsDevice {
  vehicle_id: string | null;
  vehicle_name: string | null;
}

export default function DevicesPage() {
  const { currentOrg, currentRole, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GpsDevice | null>(null);
  const [assigning, setAssigning] = useState<GpsDevice | null>(null);
  const [deleting, setDeleting] = useState<GpsDevice | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const debouncedSearch = useDebounce(search);
  const canWrite = hasAnyRole(currentRole, DEVICE_WRITE_ROLES);
  const canDelete = hasAnyRole(currentRole, DEVICE_DELETE_ROLES);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);

    let query = supabase
      .from("gps_devices")
      .select("*, device_model:device_models(*)", { count: "exact" })
      .eq("organization_id", currentOrg.id)
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().replace(/[,%]/g, "");
      query = query.or(`name.ilike.%${q}%,imei.ilike.%${q}%`);
    }

    const from = (page - 1) * PAGE_SIZE;
    const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);

    if (error) {
      setLoading(false);
      showError(error.message);
      return;
    }

    const rows = (data ?? []) as unknown as GpsDevice[];
    const ids = rows.map((r) => r.id);

    const vehicleByDevice = new Map<string, { id: string; name: string }>();
    if (ids.length > 0) {
      const { data: assignments } = await supabase
        .from("device_assignments")
        .select("device_id, vehicle:vehicles(id, name)")
        .eq("organization_id", currentOrg.id)
        .in("device_id", ids)
        .is("unassigned_at", null);
      type Row = { device_id: string; vehicle: { id: string; name: string } | null };
      ((assignments ?? []) as unknown as Row[]).forEach((a) => {
        if (a.vehicle) vehicleByDevice.set(a.device_id, a.vehicle);
      });
    }

    setDevices(
      rows.map((d) => ({
        ...d,
        vehicle_id: vehicleByDevice.get(d.id)?.id ?? null,
        vehicle_name: vehicleByDevice.get(d.id)?.name ?? null,
      })),
    );
    setTotal(count ?? 0);
    setLoading(false);
  }, [currentOrg, statusFilter, debouncedSearch, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    if (searchParams.get("new") === "1" && canWrite) {
      setEditing(null);
      setFormOpen(true);
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, canWrite]);

  const handleUnassign = async (device: DeviceRow) => {
    if (!currentOrg) return;
    const { error: assignError } = await supabase
      .from("device_assignments")
      .update({ unassigned_at: new Date().toISOString() })
      .eq("device_id", device.id)
      .is("unassigned_at", null);
    const { error } = await supabase
      .from("gps_devices")
      .update({ status: "IN_STOCK" })
      .eq("id", device.id);
    if (assignError || error) {
      showError((assignError ?? error)!.message);
      return;
    }
    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: "UNASSIGN",
      entity: "gps_device",
      entityId: device.id,
      oldData: { vehicle_id: device.vehicle_id },
    });
    showSuccess(`Device unassigned from ${device.vehicle_name}`);
    load();
  };

  const handleDelete = async () => {
    if (!deleting || !currentOrg) return;
    setDeleteBusy(true);
    const { error } = await supabase.from("gps_devices").delete().eq("id", deleting.id);
    setDeleteBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: "DELETE",
      entity: "gps_device",
      entityId: deleting.id,
      oldData: deleting,
    });
    showSuccess(`Device ${deleting.imei} deleted`);
    setDeleting(null);
    load();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="GPS Devices"
        description={`${total} device${total === 1 ? "" : "s"} in inventory`}
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
              Register device
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name or IMEI…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-card/60 pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full bg-card/60 sm:w-[170px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="IN_STOCK">In Stock</SelectItem>
            <SelectItem value="ASSIGNED">Assigned</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
            <SelectItem value="FAULTY">Faulty</SelectItem>
            <SelectItem value="RETIRED">Retired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title={search || statusFilter !== "all" ? "No devices match your filters" : "No devices registered"}
          description={
            search || statusFilter !== "all"
              ? "Try adjusting your search or status filter."
              : "Register GPS trackers here, then assign them to vehicles."
          }
          action={
            canWrite && !search && statusFilter === "all" ? (
              <Button
                size="sm"
                className="mt-2"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Register device
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card/40">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Device</TableHead>
                  <TableHead className="hidden md:table-cell">Model</TableHead>
                  <TableHead className="hidden lg:table-cell">Protocol</TableHead>
                  <TableHead className="hidden md:table-cell">Vehicle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden xl:table-cell">Added</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Cpu className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{d.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{d.imei}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {d.device_model
                          ? `${d.device_model.manufacturer} ${d.device_model.model}`
                          : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="font-mono text-xs text-muted-foreground">
                        {d.device_model?.protocol ?? d.protocol ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {d.vehicle_name ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DeviceStatusBadge status={d.status} />
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(d.created_at), "dd MMM yyyy")}
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
                            {canWrite && !d.vehicle_id && (
                              <DropdownMenuItem onClick={() => setAssigning(d)}>
                                <Link2 className="mr-2 h-4 w-4" />
                                Assign to vehicle
                              </DropdownMenuItem>
                            )}
                            {canWrite && d.vehicle_id && (
                              <DropdownMenuItem onClick={() => handleUnassign(d)}>
                                <Link2Off className="mr-2 h-4 w-4" />
                                Unassign from {d.vehicle_name}
                              </DropdownMenuItem>
                            )}
                            {canWrite && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditing(d);
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
                                onClick={() => setDeleting(d)}
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

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <DeviceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        device={editing}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <AssignDeviceDialog
        device={assigning}
        onClose={() => setAssigning(null)}
        onAssigned={() => {
          setAssigning(null);
          load();
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the device and its assignment history. This action is
              logged and cannot be undone.
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