import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { JOB_WRITE_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import type { Driver, Job, JobStatus, Vehicle } from "@/types/database";

const COLUMNS: { status: JobStatus; label: string; next: JobStatus | null; nextLabel: string }[] = [
  { status: "PENDING", label: "Pending", next: "DISPATCHED", nextLabel: "Dispatch" },
  { status: "DISPATCHED", label: "Dispatched", next: "IN_PROGRESS", nextLabel: "Start" },
  { status: "IN_PROGRESS", label: "In progress", next: "COMPLETED", nextLabel: "Complete" },
];

export default function DispatchPage() {
  const { currentOrg, currentRole, user } = useAuth();
  const canWrite = hasAnyRole(currentRole, JOB_WRITE_ROLES);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const [{ data: jobsData, error }, { data: vehicleData }, { data: driverData }] =
      await Promise.all([
        supabase
          .from("jobs")
          .select("*, vehicle:vehicles(name, registration_number), driver:drivers(name)")
          .eq("organization_id", currentOrg.id)
          .in("status", ["PENDING", "DISPATCHED", "IN_PROGRESS"])
          .order("created_at", { ascending: true }),
        supabase.from("vehicles").select("*").eq("organization_id", currentOrg.id).order("name"),
        supabase.from("drivers").select("*").eq("organization_id", currentOrg.id).order("name"),
      ]);

    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setJobs((jobsData ?? []) as unknown as Job[]);
    setVehicles((vehicleData ?? []) as unknown as Vehicle[]);
    setDrivers((driverData ?? []) as unknown as Driver[]);
  }, [currentOrg]);

  useEffect(() => {
    load();
  }, [load]);

  const assign = async (job: Job, field: "vehicle_id" | "driver_id", value: string) => {
    const { error } = await supabase
      .from("jobs")
      .update({ [field]: value || null })
      .eq("id", job.id);
    if (error) {
      showError(error.message);
      return;
    }
    load();
  };

  const advance = async (job: Job, next: JobStatus) => {
    if (!currentOrg) return;
    const payload: Record<string, unknown> = { status: next };
    if (next === "COMPLETED") payload.completed_at = new Date().toISOString();

    const { error } = await supabase.from("jobs").update(payload).eq("id", job.id);
    if (error) {
      showError(error.message);
      return;
    }
    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: "UPDATE",
      entity: "job",
      entityId: job.id,
      oldData: { status: job.status },
      newData: { status: next },
    });
    showSuccess(`Job moved to ${next.replace("_", " ").toLowerCase()}`);
    load();
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Dispatch" description="Assign vehicles and drivers, then move jobs forward" />
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Dispatch" description="Assign vehicles and drivers, then move jobs forward" />

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const columnJobs = jobs.filter((j) => j.status === col.status);
          return (
            <Card key={col.status} className="border-border bg-card/40">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm font-semibold">
                  {col.label}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {columnJobs.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {columnJobs.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">No jobs here</p>
                ) : (
                  columnJobs.map((j) => (
                    <div
                      key={j.id}
                      className="space-y-2 rounded-lg border border-border bg-background/40 p-3"
                    >
                      <p className="text-sm font-medium">{j.title}</p>
                      {canWrite ? (
                        <div className="grid grid-cols-1 gap-2">
                          <Select
                            value={j.vehicle_id ?? ""}
                            onValueChange={(v) => assign(j, "vehicle_id", v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Assign vehicle" />
                            </SelectTrigger>
                            <SelectContent>
                              {vehicles.map((v) => (
                                <SelectItem key={v.id} value={v.id}>
                                  {v.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={j.driver_id ?? ""}
                            onValueChange={(v) => assign(j, "driver_id", v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Assign driver" />
                            </SelectTrigger>
                            <SelectContent>
                              {drivers.map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                  {d.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {j.vehicle?.name ?? "No vehicle"} · {j.driver?.name ?? "No driver"}
                        </p>
                      )}
                      {canWrite && col.next && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => advance(j, col.next!)}
                        >
                          {col.nextLabel}
                          <ArrowRight className="ml-2 h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {jobs.length === 0 && (
        <div className="mt-4">
          <EmptyState
            icon={Radar}
            title="No active jobs to dispatch"
            description="Create jobs from the Jobs page, then dispatch and track them here."
          />
        </div>
      )}
    </div>
  );
}
