import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Activity, CreditCard, FileKey2, FileText, Gauge, Link2, LockKeyhole, Plus, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { hasAnyRole, ADMIN_ROLES, FINANCE_ROLES } from "@/lib/roles";
import { showError } from "@/utils/toast";

type BillingEvent = { id: string; provider: string; event_type: string; status: string; received_at: string; error: string | null };
type Role = { id: string; name: string; description: string | null; created_at: string };

const moduleConfig: Record<string, { title: string; description: string; icon: typeof CreditCard }> = {
  "/finance/billing": { title: "Billing", description: "Review billing provider events and account billing health.", icon: CreditCard },
  "/finance/wallet": { title: "Wallet", description: "Monitor collected funds and current account balance.", icon: WalletCards },
  "/finance/invoices": { title: "Invoices", description: "Review payment activity and invoice-ready records.", icon: FileText },
  "/finance/subscriptions": { title: "Subscriptions", description: "View the organization plan and subscription status.", icon: Activity },
  "/admin/roles": { title: "Roles", description: "Review the platform role catalogue and access model.", icon: ShieldCheck },
  "/admin/api-keys": { title: "API Keys", description: "Secure API access is managed server-side and never exposed in the browser.", icon: FileKey2 },
  "/admin/integrations": { title: "Integrations", description: "Review connected platform services and integration readiness.", icon: Link2 },
};

export default function PlatformModulesPage() {
  const { pathname } = useLocation();
  const { currentOrg, currentRole } = useAuth();
  const config = moduleConfig[pathname] ?? moduleConfig["/finance/billing"];
  const Icon = config.icon;
  const canViewFinance = hasAnyRole(currentRole, FINANCE_ROLES);
  const canViewAdmin = hasAnyRole(currentRole, ADMIN_ROLES);
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [metrics, setMetrics] = useState({ payments: 0, expenses: 0, paymentTotal: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    if (pathname === "/admin/roles") {
      const { data, error } = await supabase.from("roles").select("id,name,description,created_at").order("name");
      if (error) showError(error.message); else setRoles((data ?? []) as Role[]);
    } else if (pathname === "/finance/billing") {
      const { data, error } = await supabase.from("billing_events").select("id,provider,event_type,status,received_at,error").eq("organization_id", currentOrg.id).order("received_at", { ascending: false }).limit(50);
      if (error) showError(error.message); else setEvents((data ?? []) as BillingEvent[]);
    } else if (["/finance/wallet", "/finance/invoices"].includes(pathname)) {
      const [payments, expenses] = await Promise.all([
        supabase.from("payments").select("amount", { count: "exact" }).eq("organization_id", currentOrg.id),
        supabase.from("expenses").select("amount", { count: "exact" }).eq("organization_id", currentOrg.id),
      ]);
      if (payments.error) showError(payments.error.message);
      if (expenses.error) showError(expenses.error.message);
      setMetrics({ payments: payments.count ?? 0, expenses: expenses.count ?? 0, paymentTotal: (payments.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0) });
    }
    setLoading(false);
  }, [currentOrg, pathname]);

  useEffect(() => { void load(); }, [load]);

  const billingSummary = useMemo(() => ({ received: events.filter((event) => event.status === "RECEIVED").length, processed: events.filter((event) => event.status === "PROCESSED").length, failed: events.filter((event) => event.status === "FAILED").length }), [events]);

  if ((pathname.startsWith("/finance") && !canViewFinance) || (pathname.startsWith("/admin") && !canViewAdmin)) return <Card><CardContent className="py-16 text-center text-muted-foreground">You do not have permission to view this module.</CardContent></Card>;

  return <div className="space-y-5"><PageHeader title={config.title} description={config.description} actions={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>} /><ModuleContent pathname={pathname} config={config} icon={Icon} loading={loading} events={events} billingSummary={billingSummary} roles={roles} metrics={metrics} organizationPlan={currentOrg?.plan ?? "TRIAL"} /></div>;
}

function ModuleContent({ pathname, config, icon: Icon, loading, events, billingSummary, roles, metrics, organizationPlan }: { pathname: string; config: { title: string; description: string }; icon: typeof CreditCard; loading: boolean; events: BillingEvent[]; billingSummary: { received: number; processed: number; failed: number }; roles: Role[]; metrics: { payments: number; expenses: number; paymentTotal: number }; organizationPlan: string }) {
  if (pathname === "/admin/api-keys") return <Card className="border-border bg-card/60"><CardContent className="flex flex-col items-center gap-4 py-16 text-center"><LockKeyhole className="h-10 w-10 text-primary" /><div><h2 className="font-semibold">API keys are protected</h2><p className="mt-1 max-w-lg text-sm text-muted-foreground">Keys are intentionally managed through server-side secrets and are not stored or displayed in client-side application code.</p></div><Badge variant="outline">Server-managed access</Badge></CardContent></Card>;
  if (pathname === "/admin/integrations") return <div className="grid gap-4 md:grid-cols-2"><IntegrationCard name="Supabase" detail="Authentication, database, storage, and server functions" status="Connected" /><IntegrationCard name="Maps" detail="Map rendering and fleet location services" status="Configured server-side" /><IntegrationCard name="Email delivery" detail="Operational alerts and notification delivery" status="Configured server-side" /><IntegrationCard name="Billing provider" detail="Provider events are tracked in the billing event ledger" status="Event ledger ready" /></div>;
  if (pathname === "/admin/roles") return <Card className="border-border bg-card/60"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4 text-primary" />Role catalogue</CardTitle></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2">{loading ? <p className="text-sm text-muted-foreground">Loading roles…</p> : roles.map((role) => <div key={role.id} className="rounded-xl border border-border p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">{role.name}</p><Badge variant="outline">System role</Badge></div><p className="mt-1 text-sm text-muted-foreground">{role.description ?? "Access permissions are managed by organization administrators."}</p></div>)}</div></CardContent></Card>;
  if (pathname === "/finance/billing") return <><div className="grid gap-3 sm:grid-cols-3"><Metric label="Received" value={billingSummary.received} /><Metric label="Processed" value={billingSummary.processed} /><Metric label="Failed" value={billingSummary.failed} /></div><Card className="border-border bg-card/60"><CardHeader><CardTitle className="text-base">Billing event ledger</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-y border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Provider</th><th className="px-5 py-3">Event</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Received</th></tr></thead><tbody>{loading ? <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">Loading billing events…</td></tr> : events.length === 0 ? <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">No billing provider events recorded.</td></tr> : events.map((event) => <tr key={event.id} className="border-b border-border/60"><td className="px-5 py-3 font-medium">{event.provider}</td><td className="px-5 py-3">{event.event_type}</td><td className="px-5 py-3"><Badge variant="outline">{event.status}</Badge></td><td className="px-5 py-3 text-muted-foreground">{new Date(event.received_at).toLocaleString()}</td></tr>)}</tbody></table></div></CardContent></Card></>;
  if (pathname === "/finance/subscriptions") return <Card className="border-border bg-card/60"><CardContent className="flex flex-col items-center gap-3 py-16 text-center"><Gauge className="h-10 w-10 text-primary" /><h2 className="font-semibold">{organizationPlan} plan</h2><p className="max-w-md text-sm text-muted-foreground">Your organization is currently on the {organizationPlan.toLowerCase()} plan. Plan entitlements and usage are managed from Organization settings.</p></CardContent></Card>;
  return <><div className="grid gap-3 sm:grid-cols-3"><Metric label="Payments recorded" value={metrics.payments} /><Metric label="Collected value" value={metrics.paymentTotal.toLocaleString()} /><Metric label="Expense records" value={metrics.expenses} /></div><Card className="border-border bg-card/60"><CardContent className="flex flex-col items-center gap-3 py-16 text-center"><Icon className="h-10 w-10 text-primary" /><h2 className="font-semibold">{config.title} workspace</h2><p className="max-w-md text-sm text-muted-foreground">Use the existing Payments, Expenses, and Reports workspaces to create and reconcile records. This view provides a live organization-scoped summary.</p><Button variant="outline" onClick={() => window.location.assign(pathname === "/finance/wallet" ? "/finance/payments" : "/reports")}><Plus className="mr-2 h-4 w-4" />Open workspace</Button></CardContent></Card></>;
}

function Metric({ label, value }: { label: string; value: number | string }) { return <Card className="border-border bg-card/60"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></CardContent></Card>; }
function IntegrationCard({ name, detail, status }: { name: string; detail: string; status: string }) { return <Card className="border-border bg-card/60"><CardContent className="flex items-start gap-4 p-5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Link2 className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{name}</p><Badge variant="outline">{status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div></CardContent></Card>; }
