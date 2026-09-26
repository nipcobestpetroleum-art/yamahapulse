import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronRight, Eye, FileText, Loader2, LockKeyhole, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError, showSuccess } from "@/utils/toast";

type Installment = { id: string; installment_number: number; due_date: string; amount: number; paid_amount: number; status: string };
type Contract = { id: string; sale_id: string; duration_months: number; installment_frequency: string; total_payable: number; installment_amount: number; first_due_date: string; ownership_status: string; sale?: { sale_price: number; currency: string; vehicle?: { name: string; registration_number: string } | null; driver?: { name: string; phone: string | null } | null } | null; installments?: Installment[] };
type EditForm = { duration_months: string; installment_frequency: string; total_payable: string; installment_amount: string; first_due_date: string };

const blankEdit: EditForm = { duration_months: "", installment_frequency: "WEEKLY", total_payable: "", installment_amount: "", first_due_date: "" };

export default function ContractsPage() {
  const { currentOrg, user } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Contract | null>(null);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(blankEdit);
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);
  const [password, setPassword] = useState("");
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase.from("hire_purchase_contracts").select("*, sale:sales(sale_price,currency,vehicle:vehicles(name,registration_number),driver:drivers(name,phone)), installments(id,installment_number,due_date,amount,paid_amount,status)").eq("organization_id", currentOrg.id).order("created_at", { ascending: false });
    setLoading(false);
    if (error) showError(error.message); else setContracts((data ?? []) as unknown as Contract[]);
  }, [currentOrg]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const installments = contracts.flatMap((contract) => contract.installments ?? []);
    return { contracts: contracts.length, outstanding: installments.reduce((sum, item) => sum + Math.max(0, Number(item.amount) - Number(item.paid_amount)), 0), overdue: installments.filter((item) => item.status === "OVERDUE").length };
  }, [contracts]);

  const markOwnershipTransferred = async (contract: Contract) => {
    setUpdating(contract.id);
    const { error } = await supabase.from("hire_purchase_contracts").update({ ownership_status: "TRANSFERRED" }).eq("id", contract.id).eq("organization_id", currentOrg?.id ?? "");
    setUpdating(null);
    if (error) showError(error.message); else { showSuccess("Ownership marked as transferred"); await load(); }
  };

  const openEdit = (contract: Contract) => {
    setEditing(contract);
    setEditForm({ duration_months: String(contract.duration_months), installment_frequency: contract.installment_frequency, total_payable: String(contract.total_payable), installment_amount: String(contract.installment_amount), first_due_date: contract.first_due_date });
  };

  const saveEdit = async () => {
    if (!editing || !currentOrg) return;
    setProcessing(true);
    const { error } = await supabase.from("hire_purchase_contracts").update({ duration_months: Number(editForm.duration_months), installment_frequency: editForm.installment_frequency, total_payable: Number(editForm.total_payable), installment_amount: Number(editForm.installment_amount), first_due_date: editForm.first_due_date }).eq("id", editing.id).eq("organization_id", currentOrg.id);
    setProcessing(false);
    if (error) { showError(error.message); return; }
    setEditing(null); showSuccess("Hire-purchase contract updated"); await load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !currentOrg || !user?.email || !password) { showError("Enter your account password to delete this contract."); return; }
    setProcessing(true);
    const { error: passwordError } = await supabase.auth.signInWithPassword({ email: user.email, password });
    if (passwordError) { setProcessing(false); showError("Password verification failed. The contract was not deleted."); return; }
    const { error } = await supabase.from("hire_purchase_contracts").delete().eq("id", deleteTarget.id).eq("organization_id", currentOrg.id);
    setProcessing(false);
    if (error) { showError(error.message); return; }
    setContracts((current) => current.filter((contract) => contract.id !== deleteTarget.id));
    setDeleteTarget(null); setPassword(""); showSuccess("Hire-purchase contract deleted");
  };

  const field = (label: string, value: string, key: keyof EditForm, type = "text") => <div><Label className="text-xs text-muted-foreground">{label}</Label><Input type={type} value={editForm[key]} onChange={(event) => setEditForm((current) => ({ ...current, [key]: event.target.value }))} className="mt-1.5" /></div>;

  return <div className="space-y-5"><PageHeader title="Hire-Purchase Contracts" description="Review active agreements, monitor repayment schedules, and manage contract records." /><div className="grid gap-3 sm:grid-cols-3"><Stat label="Active contracts" value={totals.contracts.toString()} /><Stat label="Outstanding balance" value={totals.outstanding.toLocaleString()} /><Stat label="Overdue installments" value={totals.overdue.toString()} /></div><Card className="overflow-hidden border-border bg-card/60"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-primary" />Contract register</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-sm"><thead className="border-y border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Bike / driver</th><th className="px-5 py-3">Terms</th><th className="px-5 py-3">Total payable</th><th className="px-5 py-3">Progress</th><th className="px-5 py-3">Ownership</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading contracts…</td></tr> : contracts.length === 0 ? <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">No hire-purchase contracts recorded yet. Create one from Bike Sales.</td></tr> : contracts.map((contract) => { const items = contract.installments ?? []; const paid = items.reduce((sum, item) => sum + Number(item.paid_amount), 0); const complete = items.length > 0 && items.every((item) => item.status === "PAID"); const isOpen = expanded === contract.id; return <tr key={contract.id} className="border-b border-border/60 last:border-0 align-top"><td className="px-5 py-4"><p className="font-medium">{contract.sale?.vehicle?.name ?? "Unknown bike"}</p><p className="text-xs text-muted-foreground">{contract.sale?.vehicle?.registration_number ?? "—"}</p><p className="mt-2 text-xs">{contract.sale?.driver?.name ?? "Unknown driver"}</p><p className="text-xs text-muted-foreground">{contract.sale?.driver?.phone ?? "—"}</p></td><td className="px-5 py-4"><p className="font-medium">{contract.duration_months} months</p><p className="text-xs text-muted-foreground">{contract.installment_frequency.toLowerCase()} · {Number(contract.installment_amount).toLocaleString()} each</p><p className="mt-2 text-xs text-muted-foreground">First due {contract.first_due_date}</p></td><td className="px-5 py-4 font-semibold">{contract.sale?.currency ?? "KES"} {Number(contract.total_payable).toLocaleString()}</td><td className="px-5 py-4"><p className="font-medium">{contract.sale?.currency ?? "KES"} {paid.toLocaleString()} paid</p><p className="text-xs text-muted-foreground">{items.filter((item) => item.status === "PAID").length} of {items.length} installments</p></td><td className="px-5 py-4"><Badge className={contract.ownership_status === "TRANSFERRED" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}>{contract.ownership_status}</Badge>{complete && contract.ownership_status !== "TRANSFERRED" && <button className="mt-2 block text-xs font-medium text-primary hover:underline disabled:opacity-50" disabled={updating === contract.id} onClick={() => void markOwnershipTransferred(contract)}>{updating === contract.id ? "Updating…" : "Mark transferred"}</button>}</td><td className="px-5 py-4"><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setViewing(contract)}><Eye className="mr-1.5 h-3.5 w-3.5" />View</Button><Button variant="outline" size="sm" onClick={() => openEdit(contract)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button><Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(contract)}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete</Button><Button variant="ghost" size="sm" onClick={() => setExpanded(isOpen ? null : contract.id)}>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}Schedule</Button></div>{isOpen && <div className="absolute right-5 z-10 mt-2 w-[420px] rounded-xl border border-border bg-card p-3 text-left shadow-xl"><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><CalendarDays className="h-4 w-4 text-primary" />Repayment schedule</div><div className="max-h-72 overflow-y-auto">{items.map((item) => <div key={item.id} className="flex items-center justify-between border-b border-border/60 py-2 text-xs last:border-0"><span className="font-medium">#{item.installment_number} · {item.due_date}</span><span>{Number(item.paid_amount).toLocaleString()} / {Number(item.amount).toLocaleString()}</span><Badge variant="outline" className="text-[10px]">{item.status}</Badge></div>)}</div></div>}</td></tr>; })}</tbody></table></div></CardContent></Card>

    <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>View hire-purchase contract</DialogTitle><DialogDescription>Read-only contract summary and repayment status.</DialogDescription></DialogHeader>{viewing && <div className="grid gap-3 sm:grid-cols-2"><Detail label="Bike" value={viewing.sale?.vehicle?.name ?? "—"} /><Detail label="Registration" value={viewing.sale?.vehicle?.registration_number ?? "—"} /><Detail label="Driver" value={viewing.sale?.driver?.name ?? "—"} /><Detail label="Duration" value={`${viewing.duration_months} months`} /><Detail label="Frequency" value={viewing.installment_frequency} /><Detail label="Total payable" value={`${viewing.sale?.currency ?? "KES"} ${Number(viewing.total_payable).toLocaleString()}`} /><Detail label="Installment" value={Number(viewing.installment_amount).toLocaleString()} /><Detail label="First due" value={viewing.first_due_date} /><Detail label="Ownership" value={viewing.ownership_status} /><div className="rounded-xl border border-border p-3 sm:col-span-2"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Installments</p>{(viewing.installments ?? []).map((item) => <div key={item.id} className="flex justify-between border-b border-border/60 py-2 text-xs last:border-0"><span>#{item.installment_number} · {item.due_date}</span><span>{Number(item.paid_amount).toLocaleString()} / {Number(item.amount).toLocaleString()} · {item.status}</span></div>)}</div></div>}</DialogContent></Dialog>
    <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>Edit hire-purchase contract</DialogTitle><DialogDescription>Changes are protected by your organization permissions.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2">{field("Duration (months)", editForm.duration_months, "duration_months", "number")}{field("Frequency", editForm.installment_frequency, "installment_frequency")}{field("Total payable", editForm.total_payable, "total_payable", "number")}{field("Installment amount", editForm.installment_amount, "installment_amount", "number")}{field("First due date", editForm.first_due_date, "first_due_date", "date")}</div><DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={() => void saveEdit()} disabled={processing}>{processing ? "Saving…" : "Save changes"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !processing) { setDeleteTarget(null); setPassword(""); } }}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><LockKeyhole className="h-5 w-5" />Delete contract</DialogTitle><DialogDescription>This permanently deletes the contract and its repayment installments. Confirm your account password to continue.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="delete-contract-password">Account password</Label><Input id="delete-contract-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => { setDeleteTarget(null); setPassword(""); }} disabled={processing}>Cancel</Button><Button variant="destructive" onClick={() => void confirmDelete()} disabled={processing || !password}>{processing ? "Deleting…" : "Confirm delete"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-border bg-background/30 p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <Card className="border-border bg-card/60"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></CardContent></Card>; }
