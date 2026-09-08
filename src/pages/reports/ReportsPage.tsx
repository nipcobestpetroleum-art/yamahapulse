import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { FileBarChart, FileDown, FileText, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError } from "@/utils/toast";
import { downloadCsv, timestampSlug, type CsvRow } from "@/lib/export";
import { downloadPdfTable } from "@/lib/pdf";
import { computeDriverScores, DRIVER_EVENT_TYPES } from "@/lib/driver-score";
import { formatDuration, tripDurationMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DeviceEvent, Driver, MaintenanceSchedule, Trip } from "@/types/database";

type ReportType = "trips" | "drivers" | "events" | "maintenance";

const REPORTS: Record<ReportType, { label: string; description: string }> = {
  trips: {
    label: "Trip report",
    description: "Every trip recorded in the period — vehicle, driver, distance, duration and status.",
  },
  drivers: {
    label: "Driver behaviour report",
    description: "Safety scores per driver from overspeeding, harsh driving, idling and crash events.",
  },
  events: {
    label: "Telemetry events report",
    description: "All device events in the period, with severity and location.",
  },
  maintenance: {
    label: "Maintenance report",
    description: "Services due in the period, including costs and auto-generated entries.",
  },
};

interface ReportResult {
  columns: string[];
  rows: CsvRow[];
  summary: { label: string; value: string }[];
  pdfSubtitle: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIsoDate(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const { currentOrg } = useAuth();
  const [reportType, setReportType] = useState<ReportType>("trips");
  const [from, setFrom] = useState(daysAgoIsoDate(30));
  const [to, setTo] = useState(todayIsoDate());
  const [severityFilter, setSeverityFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    setResult(null);

    const fromIso = `${from}T00:00:00`;
    const toIso = `${to}T23:59:59.999`;

    try {
      let report: ReportResult;
      if (reportType === "trips") report = await fetchTripReport(currentOrg.id, fromIso, toIso);
      else if (reportType === "drivers") report = await fetchDriverReport(currentOrg.id, fromIso, toIso);
      else if (reportType === "events")
        report = await fetchEventsReport(currentOrg.id, fromIso, toIso, severityFilter);
      else report = await fetchMaintenanceReport(currentOrg.id, from, to);
      setResult(report);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setLoading(false);
    }
  }, [currentOrg, reportType, from, to, severityFilter]);

  useEffect(() => {
    if (currentOrg) load();
  }, [currentOrg, load]);

  const filenameBase = `${reportType}-report-${from}_to_${to}`;

  const exportCsv = () => {
    if (!result) return;
    downloadCsv(`${filenameBase}-${timestampSlug()}.csv`, result.columns, result.rows);
  };

  const exportPdf = () => {
    if (!result) return;
    downloadPdfTable({
      title: REPORTS[reportType].label,
      subtitle: result.pdfSubtitle,
      orgName: currentOrg?.name,
      filename: filenameBase,
      head: result.columns,
      body: result.rows,
    });
  };

  const previewRows = useMemo(() => result?.rows.slice(0, 50) ?? [], [result]);

  return (
    <div>
      <PageHeader
        title="Fleet Reports"
        description="Generate and export period reports for trips, driver safety, events and maintenance"
      />

      <Card className="border-border bg-card/60">
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[240px_1fr_auto] lg:items-end">
          <div className="space-y-2">
            <Label>Report type</Label>
            <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
              <SelectTrigger className="bg-card/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(REPORTS) as ReportType[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {REPORTS[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{REPORTS[reportType].description}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(2,minmax(0,1fr))_auto] lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="report-from">From</Label>
              <Input
                id="report-from"
                type="date"
                className="bg-card/60"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-to">To</Label>
              <Input
                id="report-to"
                type="date"
                className="bg-card/60"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="flex gap-1.5">
              {[
                { label: "7d", days: 7 },
                { label: "30d", days: 30 },
                { label: "90d", days: 90 },
              ].map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 border-border bg-card/60"
                  onClick={() => {
                    setFrom(daysAgoIsoDate(p.days));
                    setTo(todayIsoDate());
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={load} disabled={loading || !currentOrg} className="min-w-[110px]">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : !result ? (
        <div className="mt-6">
          <EmptyState
            icon={FileBarChart}
            title="No report generated yet"
            description="Pick a report type and period, then press Generate to preview the data before exporting."
          />
        </div>
      ) : result.rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={FileText}
            title="No data in this period"
            description="Try widening the date range — the report only includes records that fall inside it."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {result.summary.map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-border bg-card/60 px-3.5 py-2"
              >
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
                <p className="text-sm font-bold tracking-tight">{s.value}</p>
              </div>
            ))}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" className="border-border bg-card/60" onClick={exportCsv}>
                <FileDown className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button size="sm" onClick={exportPdf}>
                <FileText className="mr-2 h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card/40">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {result.columns.map((c) => (
                    <TableHead key={c} className="whitespace-nowrap">
                      {c}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => (
                      <TableCell
                        key={j}
                        className={cn(
                          "whitespace-nowrap text-sm",
                          j === 0 && "font-medium",
                          String(cell) === "critical" && "text-rose-400",
                          String(cell) === "warning" && "text-amber-400",
                          String(cell) === "info" && "text-sky-400",
                        )}
                      >
                        {cell === null || cell === undefined || cell === "" ? "—" : String(cell)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {result.rows.length > previewRows.length && (
            <p className="text-xs text-muted-foreground">
              Showing first {previewRows.length} of {result.rows.length} rows — exports include every row.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

async function fetchTripReport(orgId: string, fromIso: string, toIso: string): Promise<ReportResult> {
  const { data, error } = await supabase
    .from("trips")
    .select("*, vehicle:vehicles(name, registration_number), driver:drivers(name)")
    .eq("organization_id", orgId)
    .gte("start_time", fromIso)
    .lte("start_time", toIso)
    .order("start_time", { ascending: false })
    .limit(5000);
  if (error) throw error;
  const trips = (data ?? []) as unknown as Trip[];

  const rows: CsvRow[] = trips.map((t) => [
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

  const totalDistance = trips.reduce((sum, t) => sum + (t.distance_km ?? 0), 0);
  const completed = trips.filter((t) => t.status === "COMPLETED").length;

  return {
    columns: [
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
    ],
    rows,
    summary: [
      { label: "Trips", value: String(trips.length) },
      { label: "Completed", value: String(completed) },
      { label: "Total distance", value: `${totalDistance.toFixed(1)} km` },
      { label: "Avg distance", value: trips.length ? `${(totalDistance / trips.length).toFixed(1)} km` : "0 km" },
    ],
    pdfSubtitle: `${trips.length} trips`,
  };
}

async function fetchDriverReport(orgId: string, fromIso: string, toIso: string): Promise<ReportResult> {
  const [{ data: driverData, error: driverError }, { data: eventData, error: eventError }] =
    await Promise.all([
      supabase
        .from("drivers")
        .select("*, vehicle:vehicles(name, registration_number)")
        .eq("organization_id", orgId)
        .not("vehicle_id", "is", null),
      supabase
        .from("device_events")
        .select("*")
        .eq("organization_id", orgId)
        .in("type", DRIVER_EVENT_TYPES as unknown as string[])
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .limit(5000),
    ]);
  if (driverError) throw driverError;
  if (eventError) throw eventError;

  const scores = computeDriverScores(
    (driverData ?? []) as unknown as Driver[],
    (eventData ?? []) as unknown as DeviceEvent[],
  );

  const rows: CsvRow[] = scores.map((s) => [
    s.driver.name,
    s.driver.phone ?? "",
    s.driver.license_number ?? "",
    s.driver.vehicle?.name ?? "",
    s.overspeedCount,
    s.harshAccelCount,
    s.harshBrakeCount,
    s.harshCornerCount,
    s.crashCount,
    s.idleCount,
    s.totalEvents,
    s.score,
  ]);

  const avgScore = scores.length
    ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
    : 0;
  const totalEvents = scores.reduce((sum, s) => sum + s.totalEvents, 0);

  return {
    columns: [
      "Driver",
      "Phone",
      "License",
      "Vehicle",
      "Overspeed",
      "Harsh accel",
      "Harsh brake",
      "Harsh corner",
      "Crashes",
      "Idle",
      "Total events",
      "Score /100",
    ],
    rows,
    summary: [
      { label: "Drivers scored", value: String(scores.length) },
      { label: "Avg safety score", value: `${avgScore}/100` },
      { label: "Total events", value: String(totalEvents) },
    ],
    pdfSubtitle: `${scores.length} drivers scored`,
  };
}

async function fetchEventsReport(
  orgId: string,
  fromIso: string,
  toIso: string,
  severity: string,
): Promise<ReportResult> {
  let query = supabase
    .from("device_events")
    .select("*, vehicle:vehicles(name)")
    .eq("organization_id", orgId)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (severity !== "all") query = query.eq("severity", severity);

  const { data, error } = await query;
  if (error) throw error;
  const events = (data ?? []) as unknown as (DeviceEvent & { vehicle?: { name: string } | null })[];

  const rows: CsvRow[] = events.map((e) => [
    format(new Date(e.created_at), "dd MMM yyyy HH:mm"),
    e.type,
    e.severity,
    e.vehicle?.name ?? "—",
    e.message ?? "",
    e.speed ?? "",
    e.latitude ?? "",
    e.longitude ?? "",
  ]);

  const countSeverity = (s: string) => events.filter((e) => e.severity === s).length;

  return {
    columns: ["Time", "Type", "Severity", "Vehicle", "Message", "Speed (km/h)", "Latitude", "Longitude"],
    rows,
    summary: [
      { label: "Events", value: String(events.length) },
      { label: "Critical", value: String(countSeverity("critical")) },
      { label: "Warning", value: String(countSeverity("warning")) },
      { label: "Info", value: String(countSeverity("info")) },
    ],
    pdfSubtitle: `${events.length} events${severity !== "all" ? ` (${severity})` : ""}`,
  };
}

async function fetchMaintenanceReport(orgId: string, fromDate: string, toDate: string): Promise<ReportResult> {
  const { data, error } = await supabase
    .from("maintenance_schedules")
    .select("*, vehicle:vehicles(name, registration_number)")
    .eq("organization_id", orgId)
    .gte("due_date", fromDate)
    .lte("due_date", toDate)
    .order("due_date", { ascending: true })
    .limit(5000);
  if (error) throw error;
  const records = (data ?? []) as unknown as MaintenanceSchedule[];

  const rows: CsvRow[] = records.map((r) => [
    r.vehicle?.name ?? "—",
    r.vehicle?.registration_number ?? "",
    r.service_type,
    r.status,
    r.due_date ?? "",
    r.due_odometer ?? "",
    r.due_engine_hours ?? "",
    r.completed_at ? format(new Date(r.completed_at), "dd MMM yyyy") : "",
    r.cost ?? "",
    r.auto_generated ? "Yes" : "No",
    r.notes ?? "",
  ]);

  const countStatus = (s: string) => records.filter((r) => r.status === s).length;
  const totalCost = records.reduce((sum, r) => sum + (r.cost ?? 0), 0);

  return {
    columns: [
      "Vehicle",
      "Registration",
      "Service",
      "Status",
      "Due date",
      "Due odometer (km)",
      "Due engine hrs",
      "Completed",
      "Cost",
      "Auto-generated",
      "Notes",
    ],
    rows,
    summary: [
      { label: "Records", value: String(records.length) },
      { label: "Scheduled", value: String(countStatus("SCHEDULED")) },
      { label: "Overdue", value: String(countStatus("OVERDUE")) },
      { label: "Completed", value: String(countStatus("COMPLETED")) },
      { label: "Total cost", value: `$${totalCost.toLocaleString()}` },
    ],
    pdfSubtitle: `${records.length} maintenance records due ${fromDate} → ${toDate}`,
  };
}
