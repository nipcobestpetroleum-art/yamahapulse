import { useCallback, useEffect, useMemo, useState } from "react";
import { addMonths, format, isSameMonth, startOfMonth, subMonths } from "date-fns";
import { CalendarClock, PiggyBank, RefreshCw, Scale, TrendingUp, Wallet } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError } from "@/utils/toast";

const ACQUISITION_CATEGORY = "vehicle purchase";

type SaleRow = { id: string; vehicle_id: string; driver_id: string; sale_type: string; status: string; sale_price: number; deposit_amount: number; currency: string; created_at: string; vehicle?: { name: string; registration_number: string } | null; driver?: { name: string } | null };
type PaymentRow = { id: string; sale_id: string; amount: number; paid_at: string; status: string };
type ExpenseRow = { id: string; vehicle_id: string | null; amount: number; tax_amount: number; category: string; expense_date: string; status: string };

type BikeRow = { vehicleId: string; name: string; registration: string; drivers: string[]; saleValue: number; collected: number; costPrice: number; operating: number; totalCost: number; progress: number | null; remaining: number; profit: number; statuses: string[] };

const CATEGORY_COLORS = ["#34d399", "#38bdf8", "#fbbf24", "#fb7185", "#a78bfa", "#f97316", "#2dd4bf", "#f472b6"];

export default function FinanceDashboardPage() {
  const { currentOrg } = useAuth();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowMonths, setWindowMonths] = useState("12");

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const [salesResult, paymentsResult, expensesResult] = await Promise.all([
      supabase.from("sales").select("id,vehicle_id,driver_id,sale_type,status,sale_price,deposit_amount,currency,created_at,vehicle:vehicles(name,registration_number),driver:drivers(name)").eq("organization_id", currentOrg.id).order("created_at", { ascending: false }),
      supabase.from("payments").select("id,sale_id,amount,paid_at,status").eq("organization_id", currentOrg.id),
      supabase.from("expenses").select("id,vehicle_id,amount,tax_amount,category,expense_date,status").eq("organization_id", currentOrg.id),
    ]);
    setLoading(false);
    if (salesResult.error) showError(salesResult.error.message); else setSales((salesResult.data ?? []) as unknown as SaleRow[]);
    if (paymentsResult.error) showError(paymentsResult.error.message); else setPayments((paymentsResult.data ?? []) as PaymentRow[]);
    if (expensesResult.error) showError(expensesResult.error.message); else setExpenses((expensesResult.data ?? []) as ExpenseRow[]);
  }, [currentOrg]);

  useEffect(() => { void load(); }, [load]);

  const currency = sales[0]?.currency ?? "KES";
  const money = (value: number) => Math.round(value).toLocaleString();

  const approved = useMemo(() => expenses.filter((expense) => expense.status === "APPROVED"), [expenses]);
  const postedPayments = useMemo(() => payments.filter((payment) => payment.status === "POSTED"), [payments]);
  const isAcquisition = (category: string) => category.trim().toLowerCase() === ACQUISITION_CATEGORY;

  const totals = useMemo(() => {
    let acquisition = 0;
    let operating = 0;
    for (const expense of approved) {
      const value = Number(expense.amount) + Number(expense.tax_amount);
      if (isAcquisition(expense.category)) acquisition += value; else operating += value;
    }
    const revenue = postedPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const totalCosts = acquisition + operating;
    return { acquisition, operating, revenue, totalCosts, net: revenue - totalCosts, remaining: Math.max(0, totalCosts - revenue), progress: totalCosts > 0 ? (revenue / totalCosts) * 100 : 0 };
  }, [approved, postedPayments]);

  const bikes = useMemo(() => {
    const map = new Map<string, BikeRow>();
    const saleToVehicle = new Map<string, string>();
    for (const sale of sales) {
      saleToVehicle.set(sale.id, sale.vehicle_id);
      const existing = map.get(sale.vehicle_id);
      if (existing) { existing.saleValue += Number(sale.sale_price); existing.drivers.push(sale.driver?.name ?? "—"); existing.statuses.push(sale.status); continue; }
      map.set(sale.vehicle_id, { vehicleId: sale.vehicle_id, name: sale.vehicle?.name ?? "Unknown bike", registration: sale.vehicle?.registration_number ?? "—", drivers: [sale.driver?.name ?? "—"], saleValue: Number(sale.sale_price), collected: 0, costPrice: 0, operating: 0, totalCost: 0, progress: null, remaining: 0, profit: 0, statuses: [sale.status] });
    }
    for (const expense of approved) {
      if (!expense.vehicle_id) continue;
      const bike = map.get(expense.vehicle_id);
      if (!bike) continue;
      const value = Number(expense.amount) + Number(expense.tax_amount);
      if (isAcquisition(expense.category)) bike.costPrice += value; else bike.operating += value;
    }
    for (const payment of postedPayments) {
      const bike = map.get(saleToVehicle.get(payment.sale_id) ?? "");
      if (bike) bike.collected += Number(payment.amount);
    }
    const rows = [...map.values()];
    for (const row of rows) {
      row.totalCost = row.costPrice + row.operating;
      row.remaining = Math.max(0, row.totalCost - row.collected);
      row.profit = row.collected - row.totalCost;
      row.progress = row.totalCost > 0 ? Math.min(100, (row.collected / row.totalCost) * 100) : null;
    }
    return rows.sort((a, b) => (a.progress === null ? 1 : b.progress === null ? -1 : a.progress - b.progress));
  }, [sales, approved, postedPayments]);

  const trend = useMemo(() => {
    const count = Number(windowMonths);
    const months = Array.from({ length: count }, (_, index) => startOfMonth(subMonths(new Date(), count - 1 - index)));
    let cumulative = 0;
    return months.map((month) => {
      const revenue = postedPayments.filter((payment) => isSameMonth(new Date(payment.paid_at), month)).reduce((sum, payment) => sum + Number(payment.amount), 0);
      const spend = approved.filter((expense) => isSameMonth(new Date(`${expense.expense_date}T12:00:00`), month)).reduce((sum, expense) => sum + Number(expense.amount) + Number(expense.tax_amount), 0);
      cumulative += revenue - spend;
      return { label: format(month, "MMM yy"), revenue, expenses: spend, cumulative };
    });
  }, [postedPayments, approved, windowMonths]);

  const projection = useMemo(() => {
    const recent = trend.slice(-3);
    const avg = recent.length ? recent.reduce((sum, month) => sum + month.revenue, 0) / recent.length : 0;
    if (totals.remaining <= 0) return { avg, months: 0, date: null as Date | null };
    if (avg <= 0) return { avg, months: null as number | null, date: null };
    const months = Math.ceil(totals.remaining / avg);
    return { avg, months, date: addMonths(new Date(), months) };
  }, [trend, totals.remaining]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const expense of approved) map.set(expense.category, (map.get(expense.category) ?? 0) + Number(expense.amount) + Number(expense.tax_amount));
    return [...map.entries()].map(([name, total], index) => ({ name, total, color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] })).sort((a, b) => b.total - a.total);
  }, [approved]);

  const brokenEvenCount = bikes.filter((bike) => bike.progress !== null && bike.progress >= 100).length;
  const hasData = sales.length > 0 || payments.length > 0 || expenses.length > 0;

  if (loading) return <div className="space-y-5"><Skeleton className="h-9 w-64 rounded-xl" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-28 rounded-2xl" />)}</div><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div>;

  return <div className="space-y-5">
    <PageHeader title="Finance Dashboard" description="Monitor portfolio break-even, collections, and profitability across your bike fleet." actions={<div className="flex flex-wrap gap-2"><Select value={windowMonths} onValueChange={setWindowMonths}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="6">Last 6 months</SelectItem><SelectItem value="12">Last 12 months</SelectItem></SelectContent></Select><Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>} />
    {!hasData ? <Card className="border-dashed border-border bg-card/60"><CardContent className="flex flex-col items-center gap-3 py-16 text-center"><div className="rounded-full bg-primary/10 p-4"><Scale className="h-7 w-7 text-primary" /></div><h3 className="text-lg font-semibold">No finance data yet</h3><p className="max-w-md text-sm text-muted-foreground">Record each bike&apos;s cost price as an expense with category <Badge variant="outline">Vehicle Purchase</Badge> linked to the bike, then record sales and collect payments — break-even and profit will appear here automatically.</p></CardContent></Card> : <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={Wallet} tone="emerald" label="Revenue collected" value={`${currency} ${money(totals.revenue)}`} hint={`${postedPayments.length} posted payments`} />
      <Kpi icon={PiggyBank} tone="sky" label="Bike investment" value={`${currency} ${money(totals.acquisition)}`} hint="Vehicle Purchase expenses" />
      <Kpi icon={TrendingUp} tone="amber" label="Operating expenses" value={`${currency} ${money(totals.operating)}`} hint="Approved, incl. fleet-wide" />
      <Kpi icon={Scale} tone={totals.net >= 0 ? "emerald" : "rose"} label={totals.net >= 0 ? "Net profit" : "Net loss"} value={`${currency} ${money(Math.abs(totals.net))}`} hint={`Collected − ${money(totals.totalCosts)} total costs`} />
    </div>
    <div className="grid gap-3 lg:grid-cols-3">
      <Card className="border-border bg-card/60 lg:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Scale className="h-4 w-4 text-primary" />Portfolio break-even</CardTitle></CardHeader><CardContent className="space-y-5">
        <div>
          <div className="flex flex-wrap items-end justify-between gap-2"><p className="text-sm text-muted-foreground">Collected {money(totals.revenue)} of {money(totals.totalCosts)} total costs</p><p className="text-3xl font-bold">{totals.totalCosts > 0 ? `${Math.round(totals.progress)}%` : "—"}</p></div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-all ${totals.progress >= 100 ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${Math.min(100, Math.max(2, totals.progress))}%` }} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniStat label="Remaining to break even" value={totals.remaining > 0 ? `${currency} ${money(totals.remaining)}` : "Broken even ✓"} />
          <MiniStat label="Avg monthly collections" value={`${currency} ${money(projection.avg)}`} hint="Last 3 months" />
          <MiniStat label="Projected break-even" value={totals.remaining <= 0 ? "Achieved" : projection.date ? format(projection.date, "MMM yyyy") : "Needs collections"} hint={totals.remaining > 0 && projection.months ? `≈ ${projection.months} month${projection.months > 1 ? "s" : ""} at current pace` : undefined} icon={CalendarClock} />
        </div>
        <p className="text-xs text-muted-foreground">{brokenEvenCount} of {bikes.length} sold bike{bikes.length === 1 ? "" : "s"} fully broken even · fleet-wide expenses are included in total costs.</p>
      </CardContent></Card>
      <Card className="border-border bg-card/60"><CardHeader><CardTitle className="text-base">Cost breakdown</CardTitle></CardHeader><CardContent className="space-y-3">{categoryBreakdown.length ? categoryBreakdown.map((item) => <div key={item.name} className="space-y-1.5"><div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span><span className="font-semibold">{money(item.total)}</span></div><div className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${totals.totalCosts > 0 ? (item.total / totals.totalCosts) * 100 : 0}%`, backgroundColor: item.color }} /></div></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No approved expenses yet.</p>}</CardContent></Card>
    </div>
    <Card className="border-border bg-card/60"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-primary" />Collections vs expenses</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={280}><ComposedChart data={trend}><CartesianGrid strokeDasharray="3 3" stroke="#334155" /><XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} /><YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(value: number) => (Math.abs(value) >= 1000 ? `${Math.round(value / 1000)}k` : String(value))} /><Tooltip contentStyle={{ backgroundColor: "rgba(15,23,42,0.95)", border: "1px solid #334155", borderRadius: 12, color: "#e2e8f0" }} formatter={(value: number | string, name: string) => [`${currency} ${Number(value).toLocaleString()}`, name]} /><Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} /><Bar dataKey="revenue" name="Collections" fill="#34d399" radius={[4, 4, 0, 0]} /><Bar dataKey="expenses" name="Expenses" fill="#fb7185" radius={[4, 4, 0, 0]} /><Line dataKey="cumulative" name="Cumulative net" stroke="#38bdf8" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></CardContent></Card>
    <Card className="overflow-hidden border-border bg-card/60"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Scale className="h-4 w-4 text-primary" />Break-even by bike</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="border-y border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Bike</th><th className="px-5 py-3">Driver</th><th className="px-5 py-3">Sale value</th><th className="px-5 py-3">Cost price</th><th className="px-5 py-3">Operating cost</th><th className="px-5 py-3">Total cost</th><th className="px-5 py-3">Collected</th><th className="px-5 py-3">Break-even</th><th className="px-5 py-3">Profit</th></tr></thead><tbody>{bikes.length ? bikes.map((bike) => <tr key={bike.vehicleId} className="border-b border-border/60 last:border-0"><td className="px-5 py-4"><p className="font-medium">{bike.name}</p><p className="text-xs text-muted-foreground">{bike.registration}</p></td><td className="px-5 py-4 text-muted-foreground">{[...new Set(bike.drivers)].join(", ")}</td><td className="px-5 py-4">{money(bike.saleValue)}</td><td className="px-5 py-4">{bike.costPrice > 0 ? money(bike.costPrice) : <span className="text-xs text-muted-foreground">Not recorded</span>}</td><td className="px-5 py-4 text-muted-foreground">{money(bike.operating)}</td><td className="px-5 py-4 font-semibold">{money(bike.totalCost)}</td><td className="px-5 py-4">{money(bike.collected)}</td><td className="px-5 py-4">{bike.progress === null ? <Badge variant="outline">No cost data</Badge> : <div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${bike.progress >= 100 ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${Math.max(3, bike.progress)}%` }} /></div><span className="text-xs font-medium">{Math.round(bike.progress)}%</span>{bike.progress >= 100 && <Badge className="bg-emerald-500/15 text-emerald-300">Broken even</Badge>}</div>}</td><td className={`px-5 py-4 font-semibold ${bike.profit > 0 ? "text-emerald-400" : bike.profit < 0 ? "text-muted-foreground" : ""}`}>{bike.totalCost > 0 && bike.profit !== 0 ? (bike.profit > 0 ? "+" : "") + money(bike.profit) : "—"}</td></tr>) : <tr><td colSpan={9} className="px-5 py-12 text-center text-muted-foreground">No sales recorded yet — record bike sales to start tracking break-even.</td></tr>}</tbody></table></div></CardContent></Card>
    </>}
  </div>;
}

function Kpi({ icon: Icon, tone, label, value, hint }: { icon: typeof Wallet; tone: "emerald" | "sky" | "amber" | "rose"; label: string; value: string; hint: string }) {
  const tones = { emerald: "bg-emerald-500/15 text-emerald-300", sky: "bg-sky-500/15 text-sky-300", amber: "bg-amber-500/15 text-amber-300", rose: "bg-rose-500/15 text-rose-300" };
  return <Card className="border-border bg-card/60"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div><span className={`rounded-full p-2.5 ${tones[tone]}`}><Icon className="h-5 w-5" /></span></div></CardContent></Card>;
}

function MiniStat({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon?: typeof CalendarClock }) {
  return <div className="rounded-xl border border-border bg-background/40 p-3.5"><div className="flex items-center gap-1.5 text-xs text-muted-foreground">{Icon && <Icon className="h-3.5 w-3.5" />}{label}</div><div className="mt-1.5 font-semibold">{value}</div>{hint && <div className="text-xs text-muted-foreground">{hint}</div>}</div>;
}
