import { useCallback, useEffect, useState } from "react";
import { Building2, ExternalLink, RefreshCw, Router } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { ADMIN_ROLES, hasAnyRole } from "@/lib/roles";
import { showError } from "@/utils/toast";

type Organization = { id: string; name: string; slug: string; plan: string; country: string | null; created_at: string };

export default function OrganizationsOverviewPage() {
  const { currentRole, setCurrentOrg } = useAuth();
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [trackerCounts, setTrackerCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [organizationsResult, devicesResult] = await Promise.all([
      supabase.from("organizations").select("id,name,slug,plan,country,created_at").order("name"),
      supabase.from("gps_devices").select("organization_id"),
    ]);
    setLoading(false);
    if (organizationsResult.error) showError(organizationsResult.error.message); else setOrganizations((organizationsResult.data ?? []) as Organization[]);
    if (devicesResult.error) showError(devicesResult.error.message); else {
      const counts: Record<string, number> = {};
      for (const device of devicesResult.data ?? []) counts[device.organization_id] = (counts[device.organization_id] ?? 0) + 1;
      setTrackerCounts(counts);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!hasAnyRole(currentRole, ADMIN_ROLES)) return <Card><CardContent className="py-16 text-center text-muted-foreground">You do not have permission to view all organizations.</CardContent></Card>;

  return <div className="space-y-5"><PageHeader title="All Organizations" description="Super-admin overview of organizations, tracker counts, and organization workspaces." actions={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>} /><div className="grid gap-3 sm:grid-cols-3"><Metric label="Organizations" value={organizations.length} /><Metric label="Trackers" value={Object.values(trackerCounts).reduce((sum, count) => sum + count, 0)} /><Metric label="Active plans" value={organizations.filter((organization) => organization.plan !== "CANCELED").length} /></div><Card className="border-border bg-card/60"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4 text-primary" />Organization directory</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-y border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Organization</th><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Trackers</th><th className="px-5 py-3">Country</th><th className="px-5 py-3 text-right">Access</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">Loading organizations…</td></tr> : organizations.length === 0 ? <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">No organizations found.</td></tr> : organizations.map((organization) => <tr key={organization.id} className="border-b border-border/60 last:border-0"><td className="px-5 py-4"><p className="font-medium">{organization.name}</p><p className="text-xs text-muted-foreground">{organization.slug}</p></td><td className="px-5 py-4"><Badge variant="outline">{organization.plan}</Badge></td><td className="px-5 py-4"><span className="inline-flex items-center gap-2 font-semibold"><Router className="h-4 w-4 text-primary" />{trackerCounts[organization.id] ?? 0}</span></td><td className="px-5 py-4 text-muted-foreground">{organization.country ?? "—"}</td><td className="px-5 py-4 text-right"><Button size="sm" variant="outline" onClick={() => { setCurrentOrg(organization.id); navigate("/dashboard"); }}><ExternalLink className="mr-2 h-4 w-4" />Open workspace</Button></td></tr>)}</tbody></table></div></CardContent></Card></div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <Card className="border-border bg-card/60"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></CardContent></Card>; }
