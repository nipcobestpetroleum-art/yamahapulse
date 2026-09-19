import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, HandCoins, Loader2, Plus, Send, Users } from "lucide-react";
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

type Affiliate = { id: string; name: string; affiliate_type: string; phone: string | null; email: string | null; referral_code: string; status: string; payment_method: string | null; payment_account: string | null };
type Driver = { id: string; name: string; phone: string | null };
type Sale = { id: string; sale_type: string; sale_price: number; currency: string; vehicle?: { name: string } | null; driver_id: string };
type Referral = { id: string; status: string; referred_at: string; source: string | null; affiliate?: { name: string; referral_code: string } | null; driver?: { name: string; phone: string | null } | null; sale?: { id: string; sale_price: number; vehicle?: { name: string } | null } | null };
type Commission = { id: string; amount: number; currency: string; status: string; earned_at: string; affiliate_id: string; affiliate?: { name: string } | null; referral_id: string };
type Payout = { id: string; amount: number; payment_method: string; payment_reference: string | null; paid_at: string; affiliate?: { name: string } | null };
const blankAffiliate = { name: "", affiliate_type: "INDIVIDUAL", phone: "", email: "", referral_code: "", payment_method: "", payment_account: "", tax_number: "", notes: "" };
const blankReferral = { affiliate_id: "", driver_id: "", sale_id: "", source: "", notes: "" };

export default function AffiliatesPage() {
  const { currentOrg, currentRole, user } = useAuth();
  const canWrite = hasAnyRole(currentRole, FINANCE_ROLES);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [affiliateOpen, setAffiliateOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [affiliateForm, setAffiliateForm] = useState(blankAffiliate);
  const [referralForm, setReferralForm] = useState(blankReferral);
  const [commissionForm, setCommissionForm] = useState({ referral_id: "", amount: "", currency: "KES" });
  const [payoutForm, setPayoutForm] = useState({ affiliate_id: "", amount: "", payment_method: "MOBILE_MONEY", payment_reference: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const [affiliateResult, driverResult, saleResult, referralResult, commissionResult, payoutResult] = await Promise.all([
      supabase.from("affiliates").select("*").eq("organization_id", currentOrg.id).order("name"),
      supabase.from("drivers").select("id,name,phone").eq("organization_id", currentOrg.id).order("name"),
      supabase.from("sales").select("id,sale_type,sale_price,currency,driver_id,vehicle:vehicles(name)").eq("organization_id", currentOrg.id).order("created_at", { ascending: false }),
      supabase.from("affiliate_referrals").select("*,affiliate:affiliates(name,referral_code),driver:drivers(name,phone),sale:sales(id,sale_price,vehicle:vehicles(name))").eq("organization_id", currentOrg.id).order("referred_at", { ascending: false }),
      supabase.from("affiliate_commissions").select("*,affiliate:affiliates(name)").eq("organization_id", currentOrg.id).order("earned_at", { ascending: false }),
      supabase.from("affiliate_payouts").select("*,affiliate:affiliates(name)").eq("organization_id", currentOrg.id).order("paid_at", { ascending: false }),
    ]);
    setLoading(false);
    if (affiliateResult.error) showError(affiliateResult.error.message); else setAffiliates((affiliateResult.data ?? []) as Affiliate[]);
    if (!driverResult.error) setDrivers((driverResult.data ?? []) as Driver[]);
    if (!saleResult.error) setSales((saleResult.data ?? []) as unknown as Sale[]);
    if (!referralResult.error) setReferrals((referralResult.data ?? []) as unknown as Referral[]);
    if (!commissionResult.error) setCommissions((commissionResult.data ?? []) as unknown as Commission[]);
    if (!payoutResult.error) setPayouts((payoutResult.data ?? []) as unknown as Payout[]);
  }, [currentOrg]);
  useEffect(() => { void load(); }, [load]);

  const pendingCommissions = useMemo(() => commissions.filter((commission) => commission.status === "APPROVED"), [commissions]);
  const updateAffiliate = (key: keyof typeof blankAffiliate, value: string) => setAffiliateForm((current) => ({ ...current, [key]: value }));
  const createAffiliate = async () => {
    if (!currentOrg || !canWrite || !affiliateForm.name.trim() || !affiliateForm.referral_code.trim()) { showError("Enter an affiliate name and referral code."); return; }
    setSaving(true);
    const { error } = await supabase.from("affiliates").insert({ ...affiliateForm, organization_id: currentOrg.id });
    setSaving(false);
    if (error) { showError(error.message); return; }
    setAffiliateOpen(false); setAffiliateForm(blankAffiliate); showSuccess("Affiliate registered"); await load();
  };
  const createReferral = async () => {
    if (!currentOrg || !canWrite || !referralForm.affiliate_id || !referralForm.driver_id) { showError("Select an affiliate and driver."); return; }
    setSaving(true);
    const { error } = await supabase.from("affiliate_referrals").insert({ ...referralForm, organization_id: currentOrg.id, sale_id: referralForm.sale_id || null, source: referralForm.source || null, notes: referralForm.notes || null });
    setSaving(false);
    if (error) { showError(error.message); return; }
    setReferralOpen(false); setReferralForm(blankReferral); showSuccess("Referral recorded"); await load();
  };
  const createCommission = async () => {
    const referral = referrals.find((item) => item.id === commissionForm.referral_id);
    if (!currentOrg || !canWrite || !referral || Number(commissionForm.amount) <= 0) { showError("Select a referral and enter a fixed commission amount."); return; }
    const raw = await supabase.from("affiliate_referrals").select("affiliate_id,sale_id").eq("id", commissionForm.referral_id).single();
    if (raw.error) { showError(raw.error.message); return; }
    setSaving(true);
    const { error } = await supabase.from("affiliate_commissions").insert({ organization_id: currentOrg.id, affiliate_id: raw.data.affiliate_id, referral_id: commissionForm.referral_id, sale_id: raw.data.sale_id, amount: Number(commissionForm.amount), currency: commissionForm.currency });
    setSaving(false);
    if (error) { showError(error.message); return; }
    await supabase.from("affiliate_referrals").update({ status: "CONVERTED" }).eq("id", commissionForm.referral_id);
    setCommissionOpen(false); setCommissionForm({ referral_id: "", amount: "", currency: "KES" }); showSuccess("Commission created"); await load();
  };
  const approveCommission = async (commission: Commission) => { const { error } = await supabase.from("affiliate_commissions").update({ status: "APPROVED", approved_at: new Date().toISOString(), approved_by: user?.id ?? null }).eq("id", commission.id); if (error) showError(error.message); else { showSuccess("Commission approved"); await load(); } };
  const payCommission = async () => {
    const amount = Number(payoutForm.amount);
    if (!currentOrg || !canWrite || !payoutForm.affiliate_id || amount <= 0) { showError("Select an affiliate and enter a valid payout amount."); return; }
    const { error } = await supabase.from("affiliate_payouts").insert({ ...payoutForm, organization_id: currentOrg.id, amount, paid_by: user?.id ?? null, payment_reference: payoutForm.payment_reference || null, notes: payoutForm.notes || null });
    if (error) { showError(error.message); return; }
    const approved = pendingCommissions.filter((commission) => commission.affiliate_id === payoutForm.affiliate_id);
    let remaining = amount;
    for (const commission of approved) { if (remaining <= 0) break; remaining -= Number(commission.amount); if (remaining >= 0) await supabase.from("affiliate_commissions").update({ status: "PAID", paid_at: new Date().toISOString() }).eq("id", commission.id); }
    setPayoutOpen(false); setPayoutForm({ affiliate_id: "", amount: "", payment_method: "MOBILE_MONEY", payment_reference: "", notes: "" }); showSuccess("Affiliate payout recorded"); await load();
  };

  return <div className="space-y-5"><PageHeader title="Affiliates & Commissions" description="Register referral partners, track driver conversions, approve fixed commissions, and record payouts." actions={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setReferralOpen(true)} disabled={!canWrite}><Send className="mr-2 h-4 w-4" />Record referral</Button><Button onClick={() => setAffiliateOpen(true)} disabled={!canWrite}><Plus className="mr-2 h-4 w-4" />Add affiliate</Button></div>} /><div className="grid gap-3 sm:grid-cols-4"><Stat label="Affiliates" value={affiliates.length} /><Stat label="Referrals" value={referrals.length} /><Stat label="Pending commissions" value={commissions.filter((item) => item.status === "PENDING").length} /><Stat label="Approved to pay" value={pendingCommissions.reduce((sum, item) => sum + Number(item.amount), 0).toLocaleString()} /></div><div className="grid gap-6 xl:grid-cols-2"><Card className="border-border bg-card/60"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-primary" />Affiliate partners</CardTitle></CardHeader><CardContent className="space-y-3">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : affiliates.map((affiliate) => <div key={affiliate.id} className="flex items-center justify-between rounded-xl border border-border bg-background/30 p-3"><div><p className="font-medium">{affiliate.name}</p><p className="text-xs text-muted-foreground">{affiliate.referral_code} · {affiliate.phone ?? affiliate.email ?? "No contact"}</p></div><Badge variant="outline">{affiliate.status}</Badge></div>)}{!loading && !affiliates.length && <p className="py-8 text-center text-sm text-muted-foreground">No affiliates registered yet.</p>}</CardContent></Card><Card className="border-border bg-card/60"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4 text-primary" />Referral pipeline</CardTitle><Button size="sm" variant="outline" onClick={() => setCommissionOpen(true)} disabled={!canWrite || !referrals.length}><HandCoins className="mr-2 h-4 w-4" />Create commission</Button></CardHeader><CardContent className="space-y-3">{referrals.slice(0, 8).map((referral) => <div key={referral.id} className="flex items-center justify-between rounded-xl border border-border bg-background/30 p-3"><div><p className="font-medium">{referral.driver?.name ?? "Driver"}</p><p className="text-xs text-muted-foreground">{referral.affiliate?.name ?? "Affiliate"} · {format(new Date(referral.referred_at), "dd MMM yyyy")}</p></div><Badge variant="outline">{referral.status}</Badge></div>)}{!referrals.length && <p className="py-8 text-center text-sm text-muted-foreground">No referrals recorded yet.</p>}</CardContent></Card></div><Card className="border-border bg-card/60"><CardHeader><CardTitle className="text-base">Commission register</CardTitle></CardHeader><CardContent className="space-y-3">{commissions.map((commission) => <div key={commission.id} className="flex flex-col gap-3 rounded-xl border border-border bg-background/30 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{commission.affiliate?.name ?? "Affiliate"} · {commission.currency} {Number(commission.amount).toLocaleString()}</p><p className="text-xs text-muted-foreground">Earned {format(new Date(commission.earned_at), "dd MMM yyyy")} · {commission.status}</p></div><div className="flex gap-2">{commission.status === "PENDING" && <Button size="sm" variant="outline" onClick={() => void approveCommission(commission)}><Check className="mr-2 h-4 w-4" />Approve</Button>}</div></div>)}{!commissions.length && <p className="py-8 text-center text-sm text-muted-foreground">No commissions created yet.</p>}</CardContent></Card><Card className="border-border bg-card/60"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Payout history</CardTitle><Button size="sm" onClick={() => setPayoutOpen(true)} disabled={!canWrite || !pendingCommissions.length}><HandCoins className="mr-2 h-4 w-4" />Record payout</Button></CardHeader><CardContent className="space-y-3">{payouts.map((payout) => <div key={payout.id} className="flex justify-between rounded-xl border border-border bg-background/30 p-4"><div><p className="font-medium">{payout.affiliate?.name ?? "Affiliate"} · {Number(payout.amount).toLocaleString()}</p><p className="text-xs text-muted-foreground">{payout.payment_method} · {payout.payment_reference ?? "No reference"}</p></div><p className="text-sm text-muted-foreground">{format(new Date(payout.paid_at), "dd MMM yyyy")}</p></div>)}{!payouts.length && <p className="py-8 text-center text-sm text-muted-foreground">No affiliate payouts yet.</p>}</CardContent></Card><AffiliateDialog open={affiliateOpen} onOpenChange={setAffiliateOpen} form={affiliateForm} update={updateAffiliate} saving={saving} onSave={() => void createAffiliate()} /><ReferralDialog open={referralOpen} onOpenChange={setReferralOpen} form={referralForm} setForm={setReferralForm} affiliates={affiliates} drivers={drivers} sales={sales} saving={saving} onSave={() => void createReferral()} /><CommissionDialog open={commissionOpen} onOpenChange={setCommissionOpen} form={commissionForm} setForm={setCommissionForm} referrals={referrals} saving={saving} onSave={() => void createCommission()} /><PayoutDialog open={payoutOpen} onOpenChange={setPayoutOpen} form={payoutForm} setForm={setPayoutForm} affiliates={affiliates} saving={saving} onSave={() => void payCommission()} /></div>;
}
function Stat({ label, value }: { label: string; value: string | number }) { return <Card className="border-border bg-card/60"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></CardContent></Card>; }
function AffiliateDialog({ open, onOpenChange, form, update, saving, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; form: typeof blankAffiliate; update: (key: keyof typeof blankAffiliate, value: string) => void; saving: boolean; onSave: () => void }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Register affiliate</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><Input className="sm:col-span-2" placeholder="Name / company" value={form.name} onChange={(e) => update("name", e.target.value)} /><Select value={form.affiliate_type} onValueChange={(v) => update("affiliate_type", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="INDIVIDUAL">Individual</SelectItem><SelectItem value="COMPANY">Company</SelectItem></SelectContent></Select><Input placeholder="Referral code" value={form.referral_code} onChange={(e) => update("referral_code", e.target.value.toUpperCase())} /><Input placeholder="Phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} /><Input placeholder="Email" value={form.email} onChange={(e) => update("email", e.target.value)} /><Input placeholder="Payment method" value={form.payment_method} onChange={(e) => update("payment_method", e.target.value)} /><Input placeholder="Payment account" value={form.payment_account} onChange={(e) => update("payment_account", e.target.value)} /><Input placeholder="Tax number" value={form.tax_number} onChange={(e) => update("tax_number", e.target.value)} /><Textarea className="sm:col-span-2" placeholder="Notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={onSave} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save affiliate</Button></DialogFooter></DialogContent></Dialog>; }
function ReferralDialog({ open, onOpenChange, form, setForm, affiliates, drivers, sales, saving, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; form: typeof blankReferral; setForm: React.Dispatch<React.SetStateAction<typeof blankReferral>>; affiliates: Affiliate[]; drivers: Driver[]; sales: Sale[]; saving: boolean; onSave: () => void }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Record referral</DialogTitle></DialogHeader><div className="space-y-3"><Select value={form.affiliate_id} onValueChange={(v) => setForm((c) => ({ ...c, affiliate_id: v }))}><SelectTrigger><SelectValue placeholder="Affiliate" /></SelectTrigger><SelectContent>{affiliates.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {a.referral_code}</SelectItem>)}</SelectContent></Select><Select value={form.driver_id} onValueChange={(v) => setForm((c) => ({ ...c, driver_id: v }))}><SelectTrigger><SelectValue placeholder="Driver" /></SelectTrigger><SelectContent>{drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} · {d.phone ?? "No phone"}</SelectItem>)}</SelectContent></Select><Select value={form.sale_id || "NONE"} onValueChange={(v) => setForm((c) => ({ ...c, sale_id: v === "NONE" ? "" : v }))}><SelectTrigger><SelectValue placeholder="Sale (optional)" /></SelectTrigger><SelectContent><SelectItem value="NONE">No sale yet</SelectItem>{sales.map((s) => <SelectItem key={s.id} value={s.id}>{s.vehicle?.name ?? "Bike"} · {s.currency} {Number(s.sale_price).toLocaleString()}</SelectItem>)}</SelectContent></Select><Input placeholder="Source / campaign" value={form.source} onChange={(e) => setForm((c) => ({ ...c, source: e.target.value }))} /><Textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={onSave} disabled={saving}>Save referral</Button></DialogFooter></DialogContent></Dialog>; }
function CommissionDialog({ open, onOpenChange, form, setForm, referrals, saving, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; form: { referral_id: string; amount: string; currency: string }; setForm: React.Dispatch<React.SetStateAction<{ referral_id: string; amount: string; currency: string }>>; referrals: Referral[]; saving: boolean; onSave: () => void }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Create fixed commission</DialogTitle></DialogHeader><div className="space-y-3"><Select value={form.referral_id} onValueChange={(v) => setForm((c) => ({ ...c, referral_id: v }))}><SelectTrigger><SelectValue placeholder="Referral" /></SelectTrigger><SelectContent>{referrals.filter((r) => r.status !== "CONVERTED").map((r) => <SelectItem key={r.id} value={r.id}>{r.affiliate?.name} → {r.driver?.name}</SelectItem>)}</SelectContent></Select><div className="grid grid-cols-2 gap-3"><Input type="number" min="0.01" placeholder="Fixed amount" value={form.amount} onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))} /><Input placeholder="Currency" value={form.currency} onChange={(e) => setForm((c) => ({ ...c, currency: e.target.value.toUpperCase() }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={onSave} disabled={saving}>Create commission</Button></DialogFooter></DialogContent></Dialog>; }
function PayoutDialog({ open, onOpenChange, form, setForm, affiliates, saving, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; form: { affiliate_id: string; amount: string; payment_method: string; payment_reference: string; notes: string }; setForm: React.Dispatch<React.SetStateAction<{ affiliate_id: string; amount: string; payment_method: string; payment_reference: string; notes: string }>>; affiliates: Affiliate[]; saving: boolean; onSave: () => void }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Record affiliate payout</DialogTitle></DialogHeader><div className="space-y-3"><Select value={form.affiliate_id} onValueChange={(v) => setForm((c) => ({ ...c, affiliate_id: v }))}><SelectTrigger><SelectValue placeholder="Affiliate" /></SelectTrigger><SelectContent>{affiliates.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><Input type="number" min="0.01" placeholder="Payout amount" value={form.amount} onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))} /><Input placeholder="Payment method" value={form.payment_method} onChange={(e) => setForm((c) => ({ ...c, payment_method: e.target.value }))} /><Input placeholder="Payment reference" value={form.payment_reference} onChange={(e) => setForm((c) => ({ ...c, payment_reference: e.target.value }))} /><Textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={onSave} disabled={saving}>Record payout</Button></DialogFooter></DialogContent></Dialog>; }
