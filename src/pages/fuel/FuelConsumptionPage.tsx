import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError } from "@/utils/toast";
import type { FuelTransaction } from "@/types/database";

const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

interface VehicleSummary {
  vehicleId: string;
  vehicleName: string;
  registration: string;
  totalLiters: number;
  totalCost: number;
  refuelCount: number;
}

export default function FuelConsumptionPage() {
  const { currentOrg } = useAuth();
  const [days, setDays] = useState("30");
  const [transactions, setTransactions] = useState<FuelTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("fuel_transactions")
      .select("*, vehicle:vehicles(name, registration_number)")
      .eq("organization_id", currentOrg.id)
      .eq("type", "REFUEL")
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: false });

    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setTransactions((data ?? []) as unknown as FuelTransaction[]);
  }, [currentOrg, days]);

  useEffect(() => {
    load();
  }, [load]);

  const summaries = useMemo<VehicleSummary[]>(() => {
    const map = new Map<string, VehicleSummary>();
    for (const t of transactions) {
      const existing = map.get(t.vehicle_id) ?? {
        vehicleId: t.vehicle_id,
        vehicleName: t.vehicle?.name ?? "Unknown",
        registration: t.vehicle?.registration_number ?? "",
        totalLiters: 0,
        totalCost: 0,
        refuelCount: 0,
      };
      existing.totalLiters += t.liters;
      existing.totalCost += t.cost ?? 0;
      existing.refuelCount += 1;
      map.set(t.vehicle_id, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.totalLiters - a.totalLiters);
  }, [transactions]);

  const chartData = summaries.map((s) => ({
    name: s.vehicleName,
    liters: Math.round(s.totalLiters * 10) / 10,
  }));

  const totals = summaries.reduce(
    (acc, s) => ({ liters: acc.liters + s.totalLiters, cost: acc.cost + s.totalCost }),
    { liters: 0, cost: 0 },
  );

  return (
    <div>
      <PageHeader
        title="Fuel Consumption"
        description="Fuel volume and cost by vehicle over the selected period"
        actions={
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[160px] bg-card/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : summaries.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No refuel data in this period"
          description="Log fuel transactions to see consumption trends per vehicle."
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="border-border bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Total fuel volume</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{Math.round(totals.liters * 10) / 10} L</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Total fuel cost</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">₦{totals.cost.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-card/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Liters by vehicle</CardTitle>
            </CardHeader>
            <CardContent className="h-[280px] pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="liters" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="overflow-hidden rounded-xl border border-border bg-card/40">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Refuels</TableHead>
                  <TableHead>Total liters</TableHead>
                  <TableHead>Total cost</TableHead>
                  <TableHead className="hidden md:table-cell">Avg cost/liter</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((s) => (
                  <TableRow key={s.vehicleId}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{s.vehicleName}</p>
                        <p className="text-xs text-muted-foreground">{s.registration}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{s.refuelCount}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {Math.round(s.totalLiters * 10) / 10} L
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        ₦{s.totalCost.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {s.totalLiters > 0
                          ? `₦${Math.round(s.totalCost / s.totalLiters).toLocaleString()}`
                          : "—"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
