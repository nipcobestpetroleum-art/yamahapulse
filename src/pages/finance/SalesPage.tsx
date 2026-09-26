import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, addMonths, addWeeks, format } from "date-fns";
import { CheckCircle2, FileText, Loader2, Plus, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { FINANCE_ROLES, hasAnyRole } from "@/lib/roles";
import { showError, showSuccess } from "@/utils/toast";

type Vehicle = { id: string; name: string; registration_number: string; status: string };
type Driver = { id: string; name: string; phone: string | null; verification_status?: string };
type Sale = { id: string; sale_type: string; status: string; cash_price: number; sale_price: number; deposit_amount: number; financed_amount: number; currency: string; created_at: string; vehicle?: { name: string; registration_number: string } | null; driver?: { name: string; phone: string | null } | null; hire_purchase_contracts?: { duration_months: number; installment_frequency: string; installment_amount: number; ownership_status: string }[] };

const blankForm = { vehicle_id: "", driver_id: "", sale_type: "CASH", cash_price: "", sale_price: "", deposit_amount: "", duration_months: "12", installment_frequency: "MONTHLY", first_due_date: format(new Date(), "yyyy-MM-dd"), currency: "KES", notes: "" };

export default function SalesPage() {
  const { currentOrg, currentRole, user } = useAuth();
  const canWrite = hasAnyRole(currentRole, FINANCE_ROLES);
  const [sales, setSales] = useState<Sale[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blankForm);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const [salesResult, vehicleResult, driverResult] = await Promise.all([
      supabase.from("sales").select("*, vehicle:vehicles(name,registration_number), driver:drivers(name,phone), hire_purchase_contracts(duration_months,installment_frequency,installment_amount,ownership_status)").eq("organization_id", currentOrg.id).eq("sale_type", "CASH").order("created_at", { ascending: false }),
      supabase.from("vehicles").select("id,name,registration_number,status").eq("organization_id", currentOrg.id).order("name"),
      supabase.from("drivers").select("id,name,phone,verification_status").eq("organization_id", currentOrg.id).order("name"),
    ]);
    setLoading(false);
    if (salesResult.error) showError(salesResult.error.message); else setSales((salesResult.data ?? []) as unknown as Sale[]);
    if (!vehicleResult.error) setVehicles((vehicleResult.data ?? []) as Vehicle[]);
    if (!driverResult.error) setDrivers((driverResult.data ?? []) as Driver[]);
  }, [currentOrg]);

  useEffect(() => { void load(); }, [load]);

  const update = (key: keyof typeof blankForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const totals = useMemo(() => ({ active: sales.filter((sale) => ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE"].includes(sale.status)).length, cash: sales.length }), [sales]);
  

  const createSale = async () => {
    if (!currentOrg || !user || !canWrite) return;
    if (!form.vehicle_id || !form.driver_id || Number(form.sale_price) <= 0) { showError("Select a bike, driver, and valid sale price."); return; }
    if (Number(form.deposit_amount || 0) > Number(form.sale_price)) { showError("Deposit cannot exceed the sale price."); return; }
    setSaving(true);
    const sale = await supabase.from("sales").insert({ organization_id: currentOrg.id, vehicle_id: form.vehicle_id, driver_id: form.driver_id, sale_type: "CASH", status: "DRAFT", cash_price: Number(form.cash_price || form.sale_price), sale_price: Number(form.sale_price), deposit_amount: Number(form.deposit_amount || 0), financed_amount: 0, currency: form.currency, contract_start_date: form.first_due_date || null, notes: form.notes || null, created_by: user.id }).select("id").single();
    if (sale.error) { setSaving(false); showError(sale.error.message); return; }
    setSaving(false); setDialogOpen(false); setForm(blankForm); showSuccess("Sale recorded as a draft"); await load();
  };

  const approve = async (sale: Sale) => {
    const { error } = await supabase.from("sales").update({ status: "APPROVED", approved_by: user?.id ?? null, approved_at: new Date().toISOString() }).eq("id", sale.id);
    if (error) showError(error.message); else { showSuccess("Sale approved"); await load(); }
  };

  return <div className="space-y-5"><PageHeader title="Outright Bike Sales" description="Record completed outright motorcycle sales only. Hire-purchase applications are managed in Customer Financing Form." actions={<Button onClick={() => setDialogOpen(true)} disabled={!canWrite}><Plus className="mr-2 h-4 w-4" />Record sale</Button>} /><div className="grid gap-3 sm:grid-cols-3"><Stat label="Active records" value={totals.active} /><Stat label="Cash sales" value={totals.cash} /></div><Card className="overflow-hidden border-border bg-card/60"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShoppingCart className="h-4 w-4 text-primary" />Sales register</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-y border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Bike</th><th className="px-5 py-3">Driver</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Sale price</th><th className="px-5 py-3">Terms</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">Loading sales…</td></tr> : sales.length === 0 ? <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">No sales recorded yet.</td></tr> : sales.map((sale) => { const contract = sale.hire_purchase_contracts?.[0]; return <tr key={sale.id} className="border-b border-border/60 last:border-0"><td className="px-5 py-4"><p className="font-medium">{sale.vehicle?.name ?? "Unknown bike"}</p><p className="text-xs text-muted-foreground">{sale.vehicle?.registration_number ?? "—"}</p></td><td className="px-5 py-4"><p>{sale.driver?.name ?? "Unknown driver"}</p><p className="text-xs text-muted-foreground">{sale.driver?.phone ?? "—"}</p></td><td className="px-5 py-4"><Badge variant="outline">{sale.sale_type === "CASH" ? "Outright" : "Hire purchase"}</Badge></td><td className="px-5 py-4 font-semibold">{sale.currency} {Number(sale.sale_price).toLocaleString()}</td><td className="px-5 py-4 text-muted-foreground">{contract ? `${contract.duration_months} months · ${Number(contract.installment_amount).toLocaleString()} / ${contract.installment_frequency.toLowerCase()}` : "Full payment"}</td><td className="px-5 py-4"><Badge className={sale.status === "APPROVED" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}>{sale.status}</Badge></td><td className="px-5 py-4 text-right">{sale.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => void approve(sale)}><CheckCircle2 className="mr-2 h-4 w-4" />Approve</Button>}</td></tr>; })}</tbody></table></div></CardContent></Card><SaleDialog open={dialogOpen} onOpenChange={setDialogOpen} form={form} update={update} vehicles={vehicles} drivers={drivers} saving={saving} onSave={() => void createSale()} /></div>;
}

function Stat({ label, value }: { label: string; value: number }) { return <Card className="border-border bg-card/60"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></CardContent></Card>; }
function SaleDialog({ open, onOpenChange, form, update, vehicles, drivers, saving, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; form: typeof blankForm; update: (key: keyof typeof blankForm, value: string) => void; vehicles: Vehicle[]; drivers: Driver[]; saving: boolean; onSave: () => void }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Record a bike sale</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Bike *</Label><Select value={form.vehicle_id} onValueChange={(v) => update("vehicle_id", v)}><SelectTrigger><SelectValue placeholder="Select bike" /></SelectTrigger><SelectContent>{vehicles.map((vehicle) => <SelectItem key={vehicle.id} value={vehicle.id}>{vehicle.name} · {vehicle.registration_number}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Driver *</Label><Select value={form.driver_id} onValueChange={(v) => update("driver_id", v)}><SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger><SelectContent>{drivers.map((driver) => <SelectItem key={driver.id} value={driver.id}>{driver.name}{driver.verification_status === "VERIFIED" ? " · Verified" : " · Pending verification"}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Currency</Label><Input value={form.currency} onChange={(e) => update("currency", e.target.value.toUpperCase())} /></div><div className="space-y-2"><Label>Cash price</Label><Input type="number" min="0" value={form.cash_price} onChange={(e) => update("cash_price", e.target.value)} /></div><div className="space-y-2"><Label>Sale price *</Label><Input type="number" min="0" value={form.sale_price} onChange={(e) => update("sale_price", e.target.value)} /></div><div className="space-y-2"><Label>Deposit</Label><Input type="number" min="0" value={form.deposit_amount} onChange={(e) => update("deposit_amount", e.target.value)} /></div><Textarea className="sm:col-span-2" placeholder="Sale or contract notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={onSave} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create sale record</Button></DialogFooter></DialogContent></Dialog>; }
