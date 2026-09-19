import { useCallback, useEffect, useMemo, useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { ClipboardList, Handshake, Loader2, MessageSquare, Plus } from "lucide-react";
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

type Arrear = { id: string; organization_id: string; contract_id: string; installment_number: number; due_date: string; amount: number; paid_amount: number; status: string; contract?: { sale?: { id: string; driver?: { id: string; name: string; phone: string | null } | null; vehicle?: { name: string; registration_number: string } | null } | null } | null };
type PromisePay = { id: string; promised_date: string; promised_amount: number; status: string; driver?: { name: string } | null; notes: string | null };
const blankAction = { action_type: "CALL", outcome: "", notes: "" };
const blankPromise = { promised_date: format(new Date(), "yyyy-MM-dd"), promised_amount: "", notes: "" };

export default function CollectionsPage() {
  const { currentOrg, currentRole, user } = useAuth();
  const canWrite = hasAnyRole(currentRole, FINANCE_ROLES);
  const [arrears, setArrears] = useState<Arrear[]>([]);
  const [promises, setPromises] = useState<PromisePay[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Arrear | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [promiseOpen, setPromiseOpen] = useState(false);
  const [action, setAction] = useState(blankAction);
  const [promise, setPromise] = useState(blankPromise);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const [installmentResult, promiseResult] = await Promise.all([
      supabase.from("installments").select("*,contract:hire_purchase_contracts(id,sale:sales(id,driver:drivers(id,name,phone),vehicle:vehicles(name,registration_number)))").eq("organization_id", currentOrg.id).neq("status", "PAID").order("due_date"),
      supabase.from("promise_to_pay").select("*,driver:drivers(name)").eq("organization_id", currentOrg.id).eq("status", "OPEN").order("promised_date"),
    ]);
    setLoading(false);
    if (installmentResult.error) showError(installmentResult.error.message); else {
      const today = format(new Date(), "yyyy-MM-dd");
      const rows = (installmentResult.data ?? []) as unknown as Arrear[];
      for (const row of rows) if (row.due_date < today && row.status !== "OVERDUE") await supabase.from("installments").update({ status: "OVERDUE" }).eq("id", row.id);
      setArrears(rows.map((row) => row.due_date < today && row.status !== "PAID" ? { ...row, status: "OVERDUE" } : row));
    }
    if (promiseResult.error) showError(promiseResult.error.message); else setPromises((promiseResult.data ?? []) as unknown as PromisePay[]);
  }, [currentOrg]);
  useEffect(() => { void load(); }, [load]);

  const overdue = useMemo(() => arrears.filter((row) => row.status === "OVERDUE"), [arrears]);
  const outstanding = useMemo(() => arrears.reduce((sum, row) => sum + Math.max(0, Number(row.amount) - Number(row.paid_amount)), 0), [arrears]);
  const openAction = (row: Arrear, promiseMode = false) => { setSelected(row); if (promiseMode) setPromiseOpen(true); else setActionOpen(true); };
  const saveAction = async () => {
    if (!currentOrg || !selected || !user || !canWrite) return;
    setSaving(true);
    const sale = selected.contract?.sale;
    const { error } = await supabase.from("collection_actions").insert({ organization_id: currentOrg.id, installment_id: selected.id, sale_id: sale?.id ?? null, driver_id: sale?.driver?.id ?? null, action_type: action.action_type, outcome: action.outcome || null, notes: action.notes || null, created_by: user.id });
    setSaving(false);
    if (error) showError(error.message); else { setActionOpen(false); setAction(blankAction); showSuccess("Collection action recorded"); }
  };
  const savePromise = async () => {
    if (!currentOrg || !selected || !user || !canWrite || Number(promise.promised_amount) <= 0) { showError("Enter a valid promise amount."); return; }
    const sale = selected.contract?.sale;
    setSaving(true);
    const { error } = await supabase.from("promise_to_pay").insert({ organization_id: currentOrg.id, installment_id: selected.id, sale_id: sale?.id ?? null, driver_id: sale?.driver?.id ?? null, promised_date: promise.promised_date, promised_amount: Number(promise.promised_amount), notes: promise.notes || null, created_by: user.id });
    setSaving(false);
    if (error) showError(error.message); else { setPromiseOpen(false); setPromise(blankPromise); showSuccess("Promise to pay recorded"); await load(); }
  };
  const completePromise = async (item: PromisePay) => { const { error } = await supabase.from("promise_to_pay").update({ status: "COMPLETED", completed_at: new Date().toISOString() }).eq("id", item.id); if (error) showError(error.message); else { showSuccess("Promise marked complete"); await load(); } };

  return <div className="space-y-5"><PageHeader title="Collections & Arrears" description="Prioritize overdue installments, record collection activity, and track promises to pay." /><div className="grid gap-3 sm:grid-cols-3"><Stat label="Overdue installments" value={overdue.length.toString()} /><Stat label="Outstanding balance" value={outstanding.toLocaleString()} /><Stat label="Open promises" value={promises.length.toString()} /></div><div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]"><Card className="overflow-hidden border-border bg-card/60"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4 text-primary" />Arrears queue</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-y border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Driver / bike</th><th className="px-5 py-3">Due</th><th className="px-5 py-3">Outstanding</th><th className="px-5 py-3">Age</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">Loading arrears…</td></tr> : overdue.length === 0 ? <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">No overdue installments.</td></tr> : overdue.map((row) => { const sale = row.contract?.sale; const balance = Math.max(0, Number(row.amount) - Number(row.paid_amount)); const age = Math.max(0, differenceInCalendarDays(new Date(), new Date(`${row.due_date}T12:00:00`))); return <tr key={row.id} className="border-b border-border/60 last:border-0"><td className="px-5 py-4"><p className="font-medium">{sale?.driver?.name ?? "Unknown driver"}</p><p className="text-xs text-muted-foreground">{sale?.vehicle?.name ?? "Bike"} · installment {row.installment_number}</p></td><td className="px-5 py-4 text-muted-foreground">{format(new Date(`${row.due_date}T12:00:00`), "dd MMM yyyy")}</td><td className="px-5 py-4 font-semibold">{balance.toLocaleString()}</td><td className="px-5 py-4"><Badge className="bg-rose-500/15 text-rose-300">{age} days</Badge></td><td className="px-5 py-4 text-right"><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" title="Record contact" onClick={() => openAction(row)}><MessageSquare className="h-4 w-4 text-sky-400" /></Button><Button size="sm" variant="outline" onClick={() => openAction(row, true)}><Handshake className="mr-2 h-4 w-4" />Promise</Button></div></td></tr>; })}</tbody></table></div></CardContent></Card><Card className="border-border bg-card/60"><CardHeader><CardTitle className="text-base">Promise to pay</CardTitle></CardHeader><CardContent className="space-y-3">{promises.map((item) => <div key={item.id} className="rounded-xl border border-border bg-background/30 p-3"><div className="flex justify-between gap-3"><div><p className="font-medium">{item.driver?.name ?? "Driver"}</p><p className="text-sm text-muted-foreground">{Number(item.promised_amount).toLocaleString()} due {format(new Date(`${item.promised_date}T12:00:00`), "dd MMM yyyy")}</p></div><Button size="sm" variant="outline" onClick={() => void completePromise(item)}>Complete</Button></div>{item.notes && <p className="mt-2 text-xs text-muted-foreground">{item.notes}</p>}</div>)}{!promises.length && <p className="py-8 text-center text-sm text-muted-foreground">No open promises.</p>}</CardContent></Card></div><ActionDialog open={actionOpen} onOpenChange={setActionOpen} action={action} setAction={setAction} saving={saving} onSave={() => void saveAction()} /><PromiseDialog open={promiseOpen} onOpenChange={setPromiseOpen} promise={promise} setPromise={setPromise} saving={saving} onSave={() => void savePromise()} /></div>;
}
function Stat({ label, value }: { label: string; value: string }) { return <Card className="border-border bg-card/60"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></CardContent></Card>; }
function ActionDialog({ open, onOpenChange, action, setAction, saving, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; action: typeof blankAction; setAction: React.Dispatch<React.SetStateAction<typeof blankAction>>; saving: boolean; onSave: () => void }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Record collection action</DialogTitle></DialogHeader><div className="space-y-3"><Select value={action.action_type} onValueChange={(v) => setAction((c) => ({ ...c, action_type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CALL">Phone call</SelectItem><SelectItem value="SMS">SMS</SelectItem><SelectItem value="EMAIL">Email</SelectItem><SelectItem value="NOTICE">Formal notice</SelectItem><SelectItem value="VISIT">Field visit</SelectItem><SelectItem value="OTHER">Other</SelectItem></SelectContent></Select><Input placeholder="Outcome" value={action.outcome} onChange={(e) => setAction((c) => ({ ...c, outcome: e.target.value }))} /><Textarea placeholder="Collection notes" value={action.notes} onChange={(e) => setAction((c) => ({ ...c, notes: e.target.value }))} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={onSave} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save action</Button></DialogFooter></DialogContent></Dialog>; }
function PromiseDialog({ open, onOpenChange, promise, setPromise, saving, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; promise: typeof blankPromise; setPromise: React.Dispatch<React.SetStateAction<typeof blankPromise>>; saving: boolean; onSave: () => void }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Promise to pay</DialogTitle></DialogHeader><div className="space-y-3"><div className="space-y-2"><Label>Promised date</Label><Input type="date" value={promise.promised_date} onChange={(e) => setPromise((c) => ({ ...c, promised_date: e.target.value }))} /></div><div className="space-y-2"><Label>Promised amount</Label><Input type="number" min="0.01" value={promise.promised_amount} onChange={(e) => setPromise((c) => ({ ...c, promised_amount: e.target.value }))} /></div><Textarea placeholder="Promise notes" value={promise.notes} onChange={(e) => setPromise((c) => ({ ...c, notes: e.target.value }))} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={onSave} disabled={saving}>Save promise</Button></DialogFooter></DialogContent></Dialog>; }
