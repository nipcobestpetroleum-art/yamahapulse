import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, FileText, Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError } from "@/utils/toast";

type Installment = { id: string; installment_number: number; due_date: string; amount: number; paid_amount: number; status: string; paid_at?: string | null; notes?: string | null };
type Contract = { id: string; duration_months: number; installment_frequency: string; total_payable: number; installment_amount: number; first_due_date: string; ownership_status: string; sale?: { sale_price: number; currency: string; vehicle?: { name: string; registration_number: string } | null; driver?: { name: string; phone: string | null } | null } | null; installments?: Installment[] };

export default function ContractDetailPage() {
  const { contractId } = useParams<{ contractId: string }>();
  const { currentOrg } = useAuth();
  const navigate = useNavigate();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg || !contractId) return;
    supabase.from("hire_purchase_contracts").select("*, sale:sales(sale_price,currency,vehicle:vehicles(name,registration_number),driver:drivers(name,phone)), installments(id,installment_number,due_date,amount,paid_amount,status,paid_at,notes)").eq("organization_id", currentOrg.id).eq("id", contractId).maybeSingle().then(({ data, error }) => {
      setLoading(false);
      if (error) { showError(error.message); return; }
      setContract(data as unknown as Contract | null);
    });
  }, [currentOrg, contractId]);

  if (loading) return <div className="space-y-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /><div className="text-sm text-muted-foreground">Loading contract…</div></div>;
  if (!contract) return <div className="space-y-4"><Button variant="outline" onClick={() => navigate("/finance/contracts")}><ArrowLeft className="mr-2 h-4 w-4" />Back to contracts</Button><Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Contract not found or no longer available.</CardContent></Card></div>;

  const installments = contract.installments ?? [];
  const paid = installments.reduce((sum, item) => sum + Number(item.paid_amount), 0);
  const outstanding = installments.reduce((sum, item) => sum + Math.max(0, Number(item.amount) - Number(item.paid_amount)), 0);
  return <div className="space-y-5"><PageHeader title="Hire-Purchase Contract" description={`${contract.sale?.vehicle?.name ?? "Unknown bike"} · ${contract.sale?.driver?.name ?? "Unknown driver"}`} actions={<Button variant="outline" onClick={() => navigate("/finance/contracts")}><ArrowLeft className="mr-2 h-4 w-4" />Back to contracts</Button>} /><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary"><FileText className="mr-2 h-4 w-4" />Contract detail</Badge><Badge className={contract.ownership_status === "TRANSFERRED" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}>{contract.ownership_status}</Badge></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Detail label="Bike" value={contract.sale?.vehicle?.name ?? "—"} /><Detail label="Registration" value={contract.sale?.vehicle?.registration_number ?? "—"} /><Detail label="Driver" value={contract.sale?.driver?.name ?? "—"} /><Detail label="Driver phone" value={contract.sale?.driver?.phone ?? "—"} /><Detail label="Duration" value={`${contract.duration_months} months`} /><Detail label="Frequency" value={contract.installment_frequency} /><Detail label="Total payable" value={`${contract.sale?.currency ?? "KES"} ${Number(contract.total_payable).toLocaleString()}`} /><Detail label="Installment" value={Number(contract.installment_amount).toLocaleString()} /><Detail label="First due date" value={contract.first_due_date} /><Detail label="Paid" value={Number(paid).toLocaleString()} /><Detail label="Outstanding" value={Number(outstanding).toLocaleString()} /><Detail label="Installments" value={`${installments.filter((item) => item.status === "PAID").length} of ${installments.length} paid`} /></div><Card className="border-border bg-card/60"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-primary" />Repayment schedule</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-y border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">#</th><th className="px-5 py-3">Due date</th><th className="px-5 py-3">Amount due</th><th className="px-5 py-3">Amount paid</th><th className="px-5 py-3">Balance</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Notes</th></tr></thead><tbody>{installments.map((item) => <tr key={item.id} className="border-b border-border/60"><td className="px-5 py-3 font-semibold">{item.installment_number}</td><td className="px-5 py-3">{item.due_date}</td><td className="px-5 py-3">{Number(item.amount).toLocaleString()}</td><td className="px-5 py-3">{Number(item.paid_amount).toLocaleString()}</td><td className="px-5 py-3">{Math.max(0, Number(item.amount) - Number(item.paid_amount)).toLocaleString()}</td><td className="px-5 py-3"><Badge variant="outline">{item.status}</Badge></td><td className="px-5 py-3 text-muted-foreground">{item.notes ?? "—"}</td></tr>)}</tbody></table></div></CardContent></Card></div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <Card className="border-border bg-card/60"><CardContent className="p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></CardContent></Card>; }
