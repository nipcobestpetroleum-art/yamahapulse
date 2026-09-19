import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Activity, CreditCard, FileKey2, FileText, Gauge, Link2, LockKeyhole, Plus, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
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
import { hasAnyRole, ADMIN_ROLES, FINANCE_ROLES } from "@/lib/roles";
import { showError, showSuccess } from "@/utils/toast";

type BillingEvent = { id: string; provider: string; event_type: string; status: string; received_at: string; error: string | null };
type Role = { id: string; name: string; description: string | null; created_at: string };
type Invoice = { id: string; invoice_number: string; customer_name: string; customer_email: string | null; amount: number; currency: string; status: string; due_date: string | null; issued_at: string | null; paid_at: string | null; notes: string | null };
type Wallet = { id: string; currency: string; balance: number; status: string };
type WalletTransaction = { id: string; transaction_type: string; amount: number; reference: string | null; description: string | null; created_at: string };
type Subscription = { id: string; plan: string; status: string; current_period_start: string; current_period_end: string | null; provider: string | null };

const moduleConfig: Record<string, { title: string; description: string; icon: typeof CreditCard }> = {
  "/finance/billing": { title: "Billing", description: "Review billing provider events and account billing health.", icon: CreditCard },
  "/finance/wallet": { title: "Wallet", description: "Manage the organization wallet and its transaction ledger.", icon: WalletCards },
  "/finance/invoices": { title: "Invoices", description: "Create, issue, and track organization invoices.", icon: FileText },
  "/finance/subscriptions": { title: "Subscriptions", description: "Manage the organization plan and billing period.", icon: Activity },
  "/admin/roles": { title: "Roles", description: "Review the platform role catalogue and access model.", icon: ShieldCheck },
  "/admin/api-keys": { title: "API Keys", description: "Secure API access is managed server-side and never exposed in the browser.", icon: FileKey2 },
  "/admin/integrations": { title: "Integrations", description: "Review connected platform services and integration readiness.", icon: Link2 },
};

export default function PlatformModulesPage() {
  const { pathname } = useLocation();
  const { currentOrg, currentRole, user } = useAuth();
  const config = moduleConfig[pathname] ?? moduleConfig["/finance/billing"];
  const Icon = config.icon;
  const canWriteFinance = hasAnyRole(currentRole, FINANCE_ROLES);
  const canAdmin = hasAnyRole(currentRole, ADMIN_ROLES);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ customer_name: "", customer_email: "", amount: "", currency: "KES", due_date: "", notes: "" });
  const [transactionForm, setTransactionForm] = useState({ transaction_type: "CREDIT", amount: "", reference: "", description: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    if (pathname === "/admin/roles") {
      const { data, error } = await supabase.from("roles").select("id,name,description,created_at").order("name");
      if (error) showError(error.message); else setRoles((data ?? []) as Role[]);
    } else if (pathname === "/finance/billing") {
      const { data, error } = await supabase.from("billing_events").select("id,provider,event_type,status,received_at,error").eq("organization_id", currentOrg.id).order("received_at", { ascending: false }).limit(50);
      if (error) showError(error.message); else setEvents((data ?? []) as BillingEvent[]);
    } else if (pathname === "/finance/invoices") {
      const { data, error } = await supabase.from("invoices").select("*").eq("organization_id", currentOrg.id).order("created_at", { ascending: false });
      if (error) showError(error.message); else setInvoices((data ?? []) as Invoice[]);
    } else if (pathname === "/finance/wallet") {
      let walletResult = await supabase.from("wallet_accounts").select("*").eq("organization_id", currentOrg.id).maybeSingle();
      if (!walletResult.data && !walletResult.error && canWriteFinance) walletResult = await supabase.from("wallet_accounts").insert({ organization_id: currentOrg.id }).select("*").single();
      const transactions = walletResult.data ? await supabase.from("wallet_transactions").select("*").eq("organization_id", currentOrg.id).eq("wallet_id", walletResult.data.id).order("created_at", { ascending: false }).limit(50) : { data: [], error: null };
      if (walletResult.error) showError(walletResult.error.message); else setWallet(walletResult.data as Wallet | null);
      if (transactions.error) showError(transactions.error.message); else setWalletTransactions((transactions.data ?? []) as WalletTransaction[]);
    } else if (pathname === "/finance/subscriptions") {
      const { data, error } = await supabase.from("subscriptions").select("*").eq("organization_id", currentOrg.id).maybeSingle();
      if (error) showError(error.message); else setSubscription(data as Subscription | null);
    }
    setLoading(false);
  }, [currentOrg, pathname, canWriteFinance]);

  useEffect(() => { void load(); }, [load]);

  const createInvoice = async () => {
    if (!currentOrg || !user || !canWriteFinance || !invoiceForm.customer_name.trim() || Number(invoiceForm.amount) <= 0) { showError("Enter a customer and valid invoice amount."); return; }
    setSaving(true);
    const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const { error } = await supabase.from("invoices").insert({ organization_id: currentOrg.id, invoice_number: invoiceNumber, customer_name: invoiceForm.customer_name.trim(), customer_email: invoiceForm.customer_email.trim() || null, amount: Number(invoiceForm.amount), currency: invoiceForm.currency.toUpperCase(), due_date: invoiceForm.due_date || null, notes: invoiceForm.notes.trim() || null, created_by: user.id });
    setSaving(false);
    if (error) { showError(error.message); return; }
    setInvoiceOpen(false); setInvoiceForm({ customer_name: "", customer_email: "", amount: "", currency: "KES", due_date: "", notes: "" }); showSuccess(`Invoice ${invoiceNumber} created`); await load();
  };

  const updateInvoiceStatus = async (invoice: Invoice, status: string) => {
    const updates = { status, issued_at: status === "ISSUED" ? new Date().toISOString() : invoice.issued_at, paid_at: status === "PAID" ? new Date().toISOString() : invoice.paid_at };
    const { error } = await supabase.from("invoices").update(updates).eq("id", invoice.id).eq("organization_id", currentOrg?.id ?? "");
    if (error) showError(error.message); else { showSuccess(`Invoice marked ${status.toLowerCase()}`); await load(); }
  };

  const recordTransaction = async () => {
    if (!currentOrg || !user || !wallet || !canWriteFinance || Number(transactionForm.amount) <= 0) { showError("Enter a valid wallet transaction amount."); return; }
    if (transactionForm.transaction_type === "DEBIT" && Number(wallet.balance) < Number(transactionForm.amount)) { showError("Wallet balance is insufficient for this debit."); return; }
    setSaving(true);
    const { error } = await supabase.from("wallet_transactions").insert({ organization_id: currentOrg.id, wallet_id: wallet.id, transaction_type: transactionForm.transaction_type, amount: Number(transactionForm.amount), reference: transactionForm.reference.trim() || null, description: transactionForm.description.trim() || null, created_by: user.id });
    if (!error) {
      const balance = Number(wallet.balance) + (transactionForm.transaction_type === "DEBIT" ? -Number(transactionForm.amount) : Number(transactionForm.amount));
      const updateResult = await supabase.from("wallet_accounts").update({ balance }).eq("id", wallet.id).eq("organization_id", currentOrg.id);
      if (updateResult.error) showError(updateResult.error.message);
    }
    setSaving(false);
    if (error) { showError(error.message); return; }
    setTransactionOpen(false); setTransactionForm({ transaction_type: "CREDIT", amount: "", reference: "", description: "" }); showSuccess("Wallet transaction recorded"); await load();
  };

  if ((pathname.startsWith("/finance") && !hasAnyRole(currentRole, FINANCE_ROLES)) || (pathname.startsWith("/admin") && !canAdmin)) return <Card><CardContent className="py-16 text-center text-muted-foreground">You do not have permission to view this module.</CardContent></Card>;
  return <div className="space-y-5"><PageHeader title={config.title} description={config.description} actions={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>} /><ModuleContent pathname={pathname} config={config} icon={Icon} loading={loading} events={events} roles={roles} invoices={invoices} wallet={wallet} walletTransactions={walletTransactions} subscription={subscription} canWriteFinance={canWriteFinance} canAdmin={canAdmin} onCreateInvoice={() => setInvoiceOpen(true)} onInvoiceStatus={updateInvoiceStatus} onCreateTransaction={() => setTransactionOpen(true)} /><InvoiceDialog open={invoiceOpen} onOpenChange={setInvoiceOpen} form={invoiceForm} setForm={setInvoiceForm} saving={saving} onSave={() => void createInvoice()} /><TransactionDialog open={transactionOpen} onOpenChange={setTransactionOpen} form={transactionForm} setForm={setTransactionForm} saving={saving} onSave={() => void recordTransaction()} /></div>;
}

function ModuleContent({ pathname, config, icon: Icon, loading, events, roles, invoices, wallet, walletTransactions, subscription, canWriteFinance, canAdmin, onCreateInvoice, onInvoiceStatus, onCreateTransaction }: { pathname: string; config: { title: string; description: string }; icon: typeof CreditCard; loading: boolean; events: BillingEvent[]; roles: Role[]; invoices: Invoice[]; wallet: Wallet | null; walletTransactions: WalletTransaction[]; subscription: Subscription | null; canWriteFinance: boolean; canAdmin: boolean; onCreateInvoice: () => void; onInvoiceStatus: (invoice: Invoice, status: string) => void; onCreateTransaction: () => void }) {
  if (pathname === "/admin/api-keys") return <Card className="border-border bg-card/60"><CardContent className="flex flex-col items-center gap-4 py-16 text-center"><LockKeyhole className="h-10 w-10 text-primary" /><div><h2 className="font-semibold">API keys are protected</h2><p className="mt-1 max-w-lg text-sm text-muted-foreground">Keys are intentionally managed through server-side secrets and are not stored or displayed in client-side application code.</p></div><Badge variant="outline">Server-managed access</Badge></CardContent></Card>;
  if (pathname === "/admin/integrations") return <div className="grid gap-4 md:grid-cols-2"><IntegrationCard name="Supabase" detail="Authentication, database, storage, and server functions" status="Connected" /><IntegrationCard name="Maps" detail="Map rendering and fleet location services" status="Configured server-side" /><IntegrationCard name="Email delivery" detail="Operational alerts and notification delivery" status="Configured server-side" /><IntegrationCard name="Billing provider" detail="Provider events are tracked in the billing event ledger" status="Event ledger ready" /></div>;
  if (pathname === "/admin/roles") return <Card className="border-border bg-card/60"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4 text-primary" />Role catalogue</CardTitle></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2">{loading ? <p className="text-sm text-muted-foreground">Loading roles…</p> : roles.map((role) => <div key={role.id} className="rounded-xl border border-border p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">{role.name}</p><Badge variant="outline">System role</Badge></div><p className="mt-1 text-sm text-muted-foreground">{role.description ?? "Access permissions are managed by organization administrators."}</p></div>)}</div></CardContent></Card>;
  if (pathname === "/finance/billing") return <BillingContent loading={loading} events={events} />;
  if (pathname === "/finance/invoices") return <InvoiceContent loading={loading} invoices={invoices} canWrite={canWriteFinance} onCreate={onCreateInvoice} onStatus={onInvoiceStatus} />;
  if (pathname === "/finance/wallet") return <WalletContent loading={loading} wallet={wallet} transactions={walletTransactions} canWrite={canWriteFinance} onCreate={onCreateTransaction} />;
  if (pathname === "/finance/subscriptions") return <SubscriptionContent subscription={subscription} canAdmin={canAdmin} />;
  return <Card className="border-border bg-card/60"><CardContent className="flex flex-col items-center gap-3 py-16 text-center"><Gauge className="h-10 w-10 text-primary" /><h2 className="font-semibold">{config.title} ready</h2><p className="max-w-md text-sm text-muted-foreground">This workspace is connected to the organization-scoped platform services.</p></CardContent></Card>;
}

function BillingContent({ loading, events }: { loading: boolean; events: BillingEvent[] }) { const counts = ["RECEIVED", "PROCESSED", "FAILED"].map((status) => ({ status, count: events.filter((event) => event.status === status).length })); return <><div className="grid gap-3 sm:grid-cols-3">{counts.map((item) => <Metric key={item.status} label={item.status} value={item.count} />)}</div><Card className="border-border bg-card/60"><CardHeader><CardTitle className="text-base">Billing event ledger</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-y border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Provider</th><th className="px-5 py-3">Event</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Received</th></tr></thead><tbody>{loading ? <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">Loading billing events…</td></tr> : events.length === 0 ? <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">No billing provider events recorded.</td></tr> : events.map((event) => <tr key={event.id} className="border-b border-border/60"><td className="px-5 py-3 font-medium">{event.provider}</td><td className="px-5 py-3">{event.event_type}</td><td className="px-5 py-3"><Badge variant="outline">{event.status}</Badge></td><td className="px-5 py-3 text-muted-foreground">{new Date(event.received_at).toLocaleString()}</td></tr>)}</tbody></table></div></CardContent></Card></>; }
function InvoiceContent({ loading, invoices, canWrite, onCreate, onStatus }: { loading: boolean; invoices: Invoice[]; canWrite: boolean; onCreate: () => void; onStatus: (invoice: Invoice, status: string) => void }) { return <Card className="border-border bg-card/60"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Invoice register</CardTitle><Button size="sm" onClick={onCreate} disabled={!canWrite}><Plus className="mr-2 h-4 w-4" />Create invoice</Button></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-y border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Invoice</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Due date</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">Loading invoices…</td></tr> : invoices.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">No invoices yet.</td></tr> : invoices.map((invoice) => <tr key={invoice.id} className="border-b border-border/60"><td className="px-5 py-4 font-mono text-xs">{invoice.invoice_number}</td><td className="px-5 py-4"><p className="font-medium">{invoice.customer_name}</p><p className="text-xs text-muted-foreground">{invoice.customer_email ?? "No email"}</p></td><td className="px-5 py-4 text-muted-foreground">{invoice.due_date ?? "—"}</td><td className="px-5 py-4 font-semibold">{invoice.currency} {Number(invoice.amount).toLocaleString()}</td><td className="px-5 py-4"><Badge variant="outline">{invoice.status}</Badge></td><td className="px-5 py-4 text-right">{invoice.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => onStatus(invoice, "ISSUED")}>Issue</Button>}{invoice.status === "ISSUED" && <Button size="sm" variant="outline" onClick={() => onStatus(invoice, "PAID")}>Mark paid</Button>}</td></tr>)}</tbody></table></div></CardContent></Card>; }
function WalletContent({ loading, wallet, transactions, canWrite, onCreate }: { loading: boolean; wallet: Wallet | null; transactions: WalletTransaction[]; canWrite: boolean; onCreate: () => void }) { return <><div className="grid gap-3 sm:grid-cols-3"><Metric label="Balance" value={`${wallet?.currency ?? "KES"} ${Number(wallet?.balance ?? 0).toLocaleString()}`} /><Metric label="Transactions" value={transactions.length} /><Metric label="Status" value={wallet?.status ?? "NOT OPEN"} /></div><Card className="border-border bg-card/60"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Wallet ledger</CardTitle><Button size="sm" onClick={onCreate} disabled={!canWrite || !wallet}><Plus className="mr-2 h-4 w-4" />Record transaction</Button></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="border-y border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Type</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Description</th><th className="px-5 py-3">Date</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">Loading wallet…</td></tr> : transactions.length === 0 ? <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">No wallet transactions yet.</td></tr> : transactions.map((transaction) => <tr key={transaction.id} className="border-b border-border/60"><td className="px-5 py-4"><Badge variant="outline">{transaction.transaction_type}</Badge></td><td className="px-5 py-4 font-semibold">{Number(transaction.amount).toLocaleString()}</td><td className="px-5 py-4">{transaction.reference ?? "—"}</td><td className="px-5 py-4 text-muted-foreground">{transaction.description ?? "—"}</td><td className="px-5 py-4 text-muted-foreground">{new Date(transaction.created_at).toLocaleString()}</td></tr>)}</tbody></table></div></CardContent></Card></>; }
function SubscriptionContent({ subscription, canAdmin }: { subscription: Subscription | null; canAdmin: boolean }) { return <Card className="border-border bg-card/60"><CardContent className="flex flex-col items-center gap-4 py-16 text-center"><Gauge className="h-10 w-10 text-primary" /><div><h2 className="font-semibold">{subscription?.plan ?? "TRIAL"} plan</h2><p className="mt-1 text-sm text-muted-foreground">Status: {subscription?.status ?? "Not configured"} · Period {subscription?.current_period_start ?? "—"} to {subscription?.current_period_end ?? "open"}</p></div><Badge variant="outline">{canAdmin ? "Administrator management" : "View only"}</Badge></CardContent></Card>; }
function Metric({ label, value }: { label: string; value: number | string }) { return <Card className="border-border bg-card/60"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></CardContent></Card>; }
function IntegrationCard({ name, detail, status }: { name: string; detail: string; status: string }) { return <Card className="border-border bg-card/60"><CardContent className="flex items-start gap-4 p-5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Link2 className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{name}</p><Badge variant="outline">{status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div></CardContent></Card>; }
function InvoiceDialog({ open, onOpenChange, form, setForm, saving, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; form: { customer_name: string; customer_email: string; amount: string; currency: string; due_date: string; notes: string }; setForm: React.Dispatch<React.SetStateAction<{ customer_name: string; customer_email: string; amount: string; currency: string; due_date: string; notes: string }>>; saving: boolean; onSave: () => void }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Create invoice</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>Customer name *</Label><Input value={form.customer_name} onChange={(e) => setForm((c) => ({ ...c, customer_name: e.target.value }))} /></div><Input type="email" placeholder="Customer email" value={form.customer_email} onChange={(e) => setForm((c) => ({ ...c, customer_email: e.target.value }))} /><Input type="number" min="0.01" placeholder="Amount" value={form.amount} onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))} /><Input placeholder="Currency" value={form.currency} onChange={(e) => setForm((c) => ({ ...c, currency: e.target.value.toUpperCase() }))} /><Input type="date" value={form.due_date} onChange={(e) => setForm((c) => ({ ...c, due_date: e.target.value }))} /><Textarea className="sm:col-span-2" placeholder="Notes" value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={onSave} disabled={saving}>Create invoice</Button></DialogFooter></DialogContent></Dialog>; }
function TransactionDialog({ open, onOpenChange, form, setForm, saving, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; form: { transaction_type: string; amount: string; reference: string; description: string }; setForm: React.Dispatch<React.SetStateAction<{ transaction_type: string; amount: string; reference: string; description: string }>>; saving: boolean; onSave: () => void }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Record wallet transaction</DialogTitle></DialogHeader><div className="space-y-3"><Select value={form.transaction_type} onValueChange={(v) => setForm((c) => ({ ...c, transaction_type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CREDIT">Credit</SelectItem><SelectItem value="DEBIT">Debit</SelectItem><SelectItem value="REFUND">Refund</SelectItem><SelectItem value="ADJUSTMENT">Adjustment</SelectItem></SelectContent></Select><Input type="number" min="0.01" placeholder="Amount" value={form.amount} onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))} /><Input placeholder="Reference" value={form.reference} onChange={(e) => setForm((c) => ({ ...c, reference: e.target.value }))} /><Textarea placeholder="Description" value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={onSave} disabled={saving}>Record transaction</Button></DialogFooter></DialogContent></Dialog>; }
