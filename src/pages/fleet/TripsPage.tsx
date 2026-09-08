import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import {
  FileDown,
  FileText,
  MapPin,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Route as RouteIcon,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { TripFormDialog } from "@/components/trips/trip-form-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { TRIP_DELETE_ROLES, TRIP_WRITE_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { downloadCsv, timestampSlug } from "@/lib/export";
import { downloadPdfTable } from "@/lib/pdf";
import { formatDuration, tripDurationMinutes } from "@/lib/format";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { Trip, TripStatus, Vehicle } from "@/types/database";

const STATUS_STYLES: Record<TripStatus, string> = {
  SCHEDULED: "border-sky-500/25 bg-sky-500/10 text-sky-400",
  IN_PROGRESS: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  COMPLETED: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  CANCELLED: "border-rose-500/25 bg-rose-500/10 text-rose-400",
};

const STATUS_LABELS: Record<TripStatus, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const PERIODS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

export default function TripsPage() {
  const { currentOrg, currentRole, user } = useAuth();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("30");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Trip | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [deleting, setDeleting] = useState<Trip | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canWrite = hasAnyRole(currentRole, TRIP_WRITE_ROLES);
  const canDelete = hasAnyRole(currentRole, TRIP_DELETE_ROLES);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    let query = supabase
      .from("trips")
      .select("*, vehicle:vehicles(name, registration_number), driver:drivers(name)")
      .eq("organization_id", currentOrg.id)
      .order("start_time", { ascending: false })
      .limit(500);

    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (vehicleFilter !== "all") query = query.eq("vehicle_id", vehicleFilter);
    if (periodFilter !== "all") {
      const since = new Date(Date.now() - Number(periodFilter) * 86_400_000).toISOString();
      query = query.gte("start_time", since);
    }
    if (search.trim()) {
      query = query.or(
        `start_location.ilike.%${search.trim()}%,end_location.ilike.%${search.trim()}%`,
      );
    }

    const { data, error } = await query;
    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setTrips((data ?? []) as unknown as Trip[]);
  }, [currentOrg, statusFilter, vehicleFilter, periodFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!currentOrg) return;
    supabase
      .from("vehicles")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(({ data }) => setVehicles((data ?? []) as unknown as Vehicle[]));
  }, [currentOrg]);

  const stats = useMemo(() => {
    const totalDistance = trips.reduce((sum, t) => sum + (t.distance_km ?? 0), 0);
    const totalMinutes = trips.reduce(
      (sum, t) => sum + (tripDurationMinutes(t.start_time, t.end_time) ?? 0),
      0,
    );
    return {
      count: trips.length,
      totalDistance,
      totalMinutes,
      avgDistance: trips.length ? totalDistance / trips.length : 0,
    };
  }, [trips]);

  const handleDelete = async () => {
    if (!deleting || !currentOrg) return;
    setDeleteBusy(true);
    const { error } = await supabase.from("trips").delete().eq("id", deleting.id);
    setDeleteBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: "DELETE",
      entity: "trip",
      entityId: deleting.id,
      oldData: deleting,
    });
    showSuccess("Trip deleted");
    setDeleting(null);
    load();
  };

  const exportRows = () =>
    trips.map((t) => [
      t.vehicle?.name ?? "—",
      t.vehicle?.registration_number ?? "",
      t.driver?.name ?? "—",
      t.status,
      t.start_time ? format(new Date(t.start_time), "dd MMM yyyy HH:mm") : "",
      t.end_time ? format(new Date(t.end_time), "dd MMM yyyy HH:mm") : "",
      formatDuration(tripDurationMinutes(t.start_time, t.end_time) ?? 0),
      t.distance_km ?? "",
      t.start_location ?? "",
      t.end_location ?? "",
      t.notes ?? "",
    ]);

  const exportColumns = [
    "Vehicle",
    "Registration",
    "Driver",
    "Status",
    "Start",
    "End",
    "Duration",
    "Distance (km)",
    "Start location",
    "End location",
    "Notes",
  ];

  return (
    <div>
      <PageHeader
        title="Trip History"
        description={`${stats.count} trip${stats.count === 1 ? "" : "s"} · ${stats.totalDistance.toFixed(1)} km total`}
        actions={
          <div className="flex gap-2">
            {trips.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border bg-card/60"
                  onClick={() => downloadCsv(`trips-${timestampSlug()}.csv`, exportColumns, exportRows())}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border bg-card/60"
                  onClick={() =>
                    downloadPdfTable({
                      title: "Trip History",
                      subtitle: `${stats.count} trips · ${stats.totalDistance.toFixed(1)} km · ${formatDuration(stats.totalMinutes)}`,
                      orgName: currentOrg?.name,
                      filename: `trips-${timestampSlug()}`,
                      head: exportColumns,
                      body: exportRows(),
                    })
                  }
                >
                  <FileText className="mr-2 h-4 w-4" />
                  PDF
                </Button>
              </>
            )}
            {canWrite && (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Log trip
              </Button>
            )}
          </div>
        }
      />

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Trips", value: String(stats.count) },
          { label: "Total distance", value: `${stats.totalDistance.toFixed(1)} km` },
          { label: "Total duration", value: formatDuration(stats.totalMinutes) },
          { label: "Avg distance", value: `${stats.avgDistance.toFixed(1)} km` },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-border bg-card/60 p-5">
            <p className="text-[13px] text-muted-foreground">{kpi.label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search start or end location…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full bg-card/60 sm:w-[170px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="SCHEDULED">Scheduled</SelectItem>
            <SelectItem value="IN_PROGRESS">In progress</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
          <SelectTrigger className="w-full bg-card/60 sm:w-[190px]">
            <SelectValue placeholder="Vehicle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vehicles</SelectItem>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-full bg-card/60 sm:w-[170px]">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.days} value={String(p.days)}>
                {p.label}
              </SelectItem>
            ))}
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : trips.length === 0 ? (
          <EmptyState
            icon={RouteIcon}
            title="No trips match these filters"
            description="Try widening the period or clearing filters — or log a trip manually."
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
                  Log trip
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
                  <TableHead className="hidden md:table-cell">Driver</TableHead>
                  <TableHead className="hidden lg:table-cell">Route</TableHead>
                  <TableHead className="hidden lg:table-cell">Distance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden xl:table-cell">Start</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {trips.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(t)}
                  >
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{t.vehicle?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.vehicle?.registration_number ?? ""}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">{t.driver?.name ?? "—"}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {t.start_location || t.end_location
                          ? `${t.start_location ?? "?"} → ${t.end_location ?? "?"}`
                          : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {t.distance_km != null ? `${t.distance_km} km` : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-medium", STATUS_STYLES[t.status])}>
                        {STATUS_LABELS[t.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(t.start_time), "dd MMM yyyy, HH:mm")}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
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
      </div>

      {/* Trip detail sheet */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <RouteIcon className="h-5 w-5 text-primary" />
                  {selected.vehicle?.name ?? "Trip"}
                </SheetTitle>
                <SheetDescription>
                  {selected.vehicle?.registration_number} ·{" "}
                  {format(new Date(selected.start_time), "dd MMM yyyy, HH:mm")}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-8">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("font-medium", STATUS_STYLES[selected.status])}>
                    {STATUS_LABELS[selected.status]}
                  </Badge>
                  {selected.driver?.name && (
                    <Badge variant="outline" className="border-border font-medium">
                      {selected.driver.name}
                    </Badge>
                  )}
                </div>

                <div className="space-y-3 rounded-xl border border-border bg-card/60 p-4 text-sm">
                  {[
                    {
                      label: "Start",
                      value: `${format(new Date(selected.start_time), "dd MMM yyyy, HH:mm")}${selected.start_location ? ` · ${selected.start_location}` : ""}`,
                    },
                    {
                      label: "End",
                      value: selected.end_time
                        ? `${format(new Date(selected.end_time), "dd MMM yyyy, HH:mm")}${selected.end_location ? ` · ${selected.end_location}` : ""}`
                        : "In progress",
                    },
                    {
                      label: "Duration",
                      value: formatDuration(tripDurationMinutes(selected.start_time, selected.end_time) ?? 0),
                    },
                    {
                      label: "Distance",
                      value: selected.distance_km != null ? `${selected.distance_km} km` : "—",
                    },
                  ].map((row) => (
                    <div key={row.label} className="flex items-start justify-between gap-4">
                      <span className="shrink-0 text-muted-foreground">{row.label}</span>
                      <span className="text-right font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>

                {selected.notes && (
                  <div className="rounded-xl border border-border bg-card/60 p-4 text-sm">
                    <p className="mb-1 text-xs text-muted-foreground">Notes</p>
                    <p className="whitespace-pre-wrap">{selected.notes}</p>
                  </div>
                )}

                <Link to={`/monitoring/playback?from=${encodeURIComponent(selected.start_time)}&to=${encodeURIComponent(selected.end_time ?? new Date().toISOString())}`}>
                  <Button className="w-full">
                    <Play className="mr-2 h-4 w-4" />
                    Replay this trip on the map
                  </Button>
                </Link>
                <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  Playback uses the vehicle&apos;s GPS history for this period
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <TripFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        trip={editing}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this trip?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the trip record. This action is logged and cannot be
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
