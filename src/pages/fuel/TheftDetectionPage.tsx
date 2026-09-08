import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { CheckCheck, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { FUEL_TRANSACTION_WRITE_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { FuelTransaction } from "@/types/database";

export default function TheftDetectionPage() {
  const { currentOrg, currentRole, user } = useAuth();
  const canWrite = hasAnyRole(currentRole, FUEL_TRANSACTION_WRITE_ROLES);

  const [incidents, setIncidents] = useState<FuelTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewFilter, setReviewFilter] = useState("unreviewed");

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    let query = supabase
      .from("fuel_transactions")
      .select("*, vehicle:vehicles(name, registration_number)")
      .eq("organization_id", currentOrg.id)
      .in("type", ["THEFT", "DRAIN"])
      .order("recorded_at", { ascending: false })
      .limit(150);

    if (reviewFilter === "unreviewed") query = query.eq("reviewed", false);
    if (reviewFilter === "reviewed") query = query.eq("reviewed", true);

    const { data, error } = await query;
    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setIncidents((data ?? []) as unknown as FuelTransaction[]);
  }, [currentOrg, reviewFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const markReviewed = async (incident: FuelTransaction) => {
    const { error } = await supabase
      .from("fuel_transactions")
      .update({ reviewed: true })
      .eq("id", incident.id);
    if (error) {
      showError(error.message);
      return;
    }
    if (currentOrg) {
      await logAudit({
        organizationId: currentOrg.id,
        userId: user?.id ?? null,
        action: "UPDATE",
        entity: "fuel_transaction",
        entityId: incident.id,
        oldData: { reviewed: false },
        newData: { reviewed: true },
      });
    }
    showSuccess("Marked as reviewed");
    load();
  };

  return (
    <div>
      <PageHeader
        title="Theft Detection"
        description={`${incidents.length} incident${incidents.length === 1 ? "" : "s"} found`}
      />

      <div className="mb-4">
        <Select value={reviewFilter} onValueChange={setReviewFilter}>
          <SelectTrigger className="w-full bg-card/60 sm:w-[190px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unreviewed">Unreviewed</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : incidents.length === 0 ? (
        <EmptyState
          icon={Siren}
          title="No fuel loss incidents"
          description="Sudden fuel drains and unexplained losses logged as 'Drain' or 'Theft' transactions will appear here for review."
        />
      ) : (
        <div className="space-y-2">
          {incidents.map((i) => (
            <div
              key={i.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border border-border bg-card/40 p-4",
                !i.reviewed && i.type === "THEFT" && "border-rose-500/30 bg-rose-500/5",
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Siren className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">
                    {i.vehicle?.name ?? "Unknown vehicle"} lost {i.liters} L
                  </p>
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-medium",
                      i.type === "THEFT"
                        ? "border-rose-500/25 bg-rose-500/10 text-rose-400"
                        : "border-amber-500/25 bg-amber-500/10 text-amber-400",
                    )}
                  >
                    {i.type}
                  </Badge>
                  {i.reviewed && (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                    >
                      Reviewed
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{i.vehicle?.registration_number ?? ""}</span>
                  {i.location && <span>{i.location}</span>}
                  <span>{format(new Date(i.recorded_at), "dd MMM yyyy, HH:mm")}</span>
                </div>
                {i.notes && <p className="mt-1 text-sm text-muted-foreground">{i.notes}</p>}
              </div>
              {canWrite && !i.reviewed && (
                <Button variant="ghost" size="sm" onClick={() => markReviewed(i)}>
                  <CheckCheck className="mr-2 h-4 w-4" />
                  Mark reviewed
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
