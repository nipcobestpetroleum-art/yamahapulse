import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, Download, Loader2, Plus, Receipt } from "lucide-react";
import { format } from "date-fns";
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

type Sale = { id: string; sale_type: string; sale_price: number; currency: string; driver_id: string; vehicle?: { name: string; registration_number: string } | null; driver?: { name: string; phone: string | null } | null; hire_purchase_contracts?: { id: string; installment_amount: number; duration_months: number }[] };
type Payment = { id: string; amount: number; payment_method: string; reference: string | null; receipt_number: string; paid_at: string; status: string; reconciliation_status: string; currency?: string; sale?: { vehicle?: { name: string }; driver?: { name: string } } | null };
type Installment = { id: string; installment_number: number; due_date: string; amount: number; paid_amount: number; status: string };
const blankForm = { sale_id: "", amount: "", payment_method: "CASH", reference: "", paid_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"), notes: "" };

export default function PaymentsPage() {
  const { currentOrg, currentRole, user } = useAuth();
  const canWrite = hasAnyRole(currentRole, FINANCE_ROLES);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blankForm);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const [paymentResult, salesResult] = await Promise.all([
      supabase.from("payments").select("*, sale:sales(vehicle:vehicles(name),driver:drivers(name))").eq("organization_id", currentOrg.id).order("paid_at", { ascending: false }),
      supabase.from("sales").select("id,sale_type,sale_price,currency,driver_id,vehicle:vehicles(name,registration_number),driver:drivers(name,phone),hire_purchase_contracts(id,installment_amount,duration_months)").eq("organization_id", currentOrg.id).in("status", ["APPROVED", "ACTIVE", "DRAFT"]).order("created_at", { ascending: false }),
    ]);
    setLoading(false);
    if (paymentResult.error) showError(paymentResult.error.message); else setPayments((paymentResult.data ?? []) as unknown as Payment[]);
    if (salesResult.error) showError(salesResult.error.message); else setSales((salesResult.data ?? []) as unknown as Sale[]);
  }, [currentOrg]);
  useEffect(() => { void load(); }, [load]);

  const selectedSale = useMemo(() => sales.find((sale) => sale.id === form.sale_id) ?? null, [sales, form.sale_id]);
  const totals = useMemo(() => ({ collected: payments.filter((payment) => payment.status === "POSTED").reduce((sum, payment) => sum + Number(payment.amount), 0), pending: payments.filter((payment) => payment.reconciliation_status !== "RECONCILED").length, count: payments.length }), [payments]);
  const update = (key: keyof typeof blankForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const recordPayment = async () => {
    if (!currentOrg || !user || !canWrite || !selectedSale || Number(form.amount) <= 0) { showError("Select a sale and enter a valid payment amount."); return; }
    setSaving(true);
    const receiptNumber = `RCPT-${format(new Date(), "yyyyMMddHHmmss")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const payment = await supabase.from("payments").insert({ organization_id: currentOrg.id, sale_id: selectedSale.id, contract_id: selectedSale.hire_purchase_contracts?.[0]?.id ?? null, driver_id: selectedSale.driver_id, amount: Number(form.amount), payment_method: form.payment_method, reference: form.reference.trim() || null, receipt_number: receiptNumber, paid_at: new Date(form.paid_at).toISOString(), received_by: user.id, notes: form.notes.trim() || null }).select("id").single();
    if (payment.error) { setSaving(false); showError(payment.error.message); return; }
    if (selectedSale.hire_purchase_contracts?.[0]) {
      const { data: installments } = await supabase.from("installments").select("id,installment_number,due_date,amount,paid_amount,status").eq("organization_id", currentOrg.id).eq("contract_id", selectedSale.hire_purchase_contracts[0].id).in("status", ["PENDING", "PARTIAL", "OVERDUE"]).order("installment_number");
      let remaining = Number(form.amount);
      for (const installment of (installments ?? []) as Installment[]) {
        if (remaining <= 0) break;
        const outstanding = Math.max(0, Number(installment.amount) - Number(installment.paid_amount));
        const allocation = Math.min(remaining, outstanding);
        if (allocation <= 0) continue;
        await supabase.from("payment_allocations").insert({ organization_id: currentOrg.id, payment_id: payment.data.id, installment_id: installment.id, amount: allocation });
        await supabase.from("installments").update({ paid_amount: Number(installment.paid_amount) + allocation, status: allocation >= outstanding ? "PAID" : "PARTIAL", paid_at: allocation >= outstanding ? new Date().toISOString() : null }).eq("id", installment.id);
        remaining -= allocation;
      }
    }
    setSaving(false); setDialogOpen(false); setForm(blankForm); showSuccess(`Payment recorded · ${receiptNumber}`); await load();
  };

  const reconcile = async (payment: Payment) => {
    const { error } = await supabase.from("payments").update({ reconciliation_status: "RECONCILED" }).eq("id", payment.id);
    if (error) showError(error.message); else { showSuccess("Payment reconciled"); await load(); }
  };

  return <div className="space-y-5"><PageHeader title="Payments & Reconciliation" description="Record collections, allocate hire-purchase payments, and reconcile the ledger." actions={<div className="flex gap-2"><Button variant="outline" size="sm" disabled={!payments.length}><Download className="mr-2 h-4 w-4" />Export</Button><Button onClick={() => setDialogOpen(true)} disabled={!canWrite}><Plus className="mr-2 h-4 w-4" />Record payment</Button></div>} /><div className="grid gap-3 sm:grid-cols-3"><Stat label="Posted collection" value={totals.collected.toLocaleString()} /><Stat label="Unreconciled" value={totals.pending.toString()} /><Stat label="Payment records" value={totals.count.toString()} /></div><Card className="overflow-hidden border-border bg-card/60"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Receipt className="h-4 w-4 text-primary" />Payment ledger</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-y border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Receipt</th><th className="px-5 py-3">Bike / driver</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Method</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Reconciliation</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">Loading payments…</td></tr> : payments.length === 0 ? <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">No payments recorded yet.</td></tr> : payments.map((payment) => <tr key={payment.id} className="border-b border-border/60 last:border-0"><td className="px-5 py-4 font-mono text-xs">{payment.receipt_number}</td><td className="px-5 py-4"><p>{payment.sale?.vehicle?.name ?? "Sale"}</p><p className="text-xs text-muted-foreground">{payment.sale?.driver?.name ?? "Driver"}</p></td><td className="px-5 py-4 text-muted-foreground">{format(new Date(payment.paid_at), "dd MMM yyyy, HH:mm")}</td><td className="px-5 py-4"><Badge variant="outline">{payment.payment_method.replace("_", " ")}</Badge></td><td className="px-5 py-4 font-semibold">{Number(payment.amount).toLocaleString()}</td><td className="px-5 py-4"><Badge className={payment.reconciliation_status === "RECONCILED" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}>{payment.reconciliation_status}</Badge></td><td className="px-5 py-4 text-right">{payment.reconciliation_status !== "RECONCILED" && <Button size="sm" variant="outline" onClick={() => void reconcile(payment)}><CheckCircle2 className="mr-2 h-4 w-4" />Reconcile</Button>}</td></tr>)}</tbody></table></div></CardContent></Card><PaymentDialog open={dialogOpen} onOpenChange={setDialogOpen} form={form} update={update} sales={sales} selectedSale={selectedSale} saving={saving} onSave={() => void recordPayment()} /></div>;
}

function Stat({ label, value }: { label: string; value: string }) { return <Card className="border-border bg-card/60"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></CardContent></Card>; }
function PaymentDialog({ open, onOpenChange, form, update, sales, selectedSale, saving, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; form: typeof blankForm; update: (key: keyof typeof blankForm, value: string) => void; sales: Sale[]; selectedSale: Sale | null; saving: boolean; onSave: () => void }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" />Record payment</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>Sale / contract *</Label><Select value={form.sale_id} onValueChange={(v) => update("sale_id", v)}><SelectTrigger><SelectValue placeholder="Select sale" /></SelectTrigger><SelectContent>{sales.map((sale) => <SelectItem key={sale.id} value={sale.id}>{sale.vehicle?.name ?? "Bike"} · {sale.driver?.name ?? "Driver"} · {sale.currency} {Number(sale.sale_price).toLocaleString()}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Amount *</Label><Input type="number" min="0.01" value={form.amount} onChange={(e) => update("amount", e.target.value)} /></div><div className="space-y-2"><Label>Payment method</Label><Select value={form.payment_method} onValueChange={(v) => update("payment_method", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CASH">Cash</SelectItem><SelectItem value="MOBILE_MONEY">Mobile money</SelectItem><SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem><SelectItem value="CARD">Card</SelectItem><SelectItem value="ONLINE">Online</SelectItem><SelectItem value="OTHER">Other</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Paid at</Label><Input type="datetime-local" value={form.paid_at} onChange={(e) => update("paid_at", e.target.value)} /></div><div className="space-y-2"><Label>Reference</Label><Input placeholder="Transaction or receipt reference" value={form.reference} onChange={(e) => update("reference", e.target.value)} /></div>{selectedSale?.hire_purchase_contracts?.[0] && <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm sm:col-span-2"><p className="text-muted-foreground">Hire-purchase payment</p><p className="mt-1">The payment will be automatically allocated to the oldest outstanding installment.</p></div>}<Textarea className="sm:col-span-2" placeholder="Notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={onSave} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Post payment</Button></DialogFooter></DialogContent></Dialog>; }
