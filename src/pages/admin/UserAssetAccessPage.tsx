import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Plus, Trash2, UserRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError, showSuccess } from "@/utils/toast";

interface Member { userId: string; email: string | null; firstName: string | null; lastName: string | null; }
interface AssetPair { deviceId: string; vehicleId: string; deviceName: string; vehicleName: string; imei: string; }
interface AccessRow extends AssetPair { id: string; userId: string; }

const FUNCTIONS_URL = "https://glwinxaanstczuubxqqg.supabase.co/functions/v1/org-users";

export default function UserAssetAccessPage() {
  const { currentOrg, user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [pairs, setPairs] = useState<AssetPair[]>([]);
  const [access, setAccess] = useState<AccessRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedPair, setSelectedPair] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const callUsers = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(FUNCTIONS_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ action: "list", organizationId: currentOrg?.id }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to load users");
    return data.members as Member[];
  }, [currentOrg]);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const [memberRows, assignmentResult, accessResult] = await Promise.all([
        callUsers(),
        supabase.from("device_assignments").select("device_id,vehicle_id,device:gps_devices!device_assignments_device_id_fkey(id,name,imei),vehicle:vehicles!device_assignments_vehicle_id_fkey(id,name)").eq("organization_id", currentOrg.id).is("unassigned_at", null),
        supabase.from("user_asset_access").select("id,user_id,device_id,vehicle_id").eq("organization_id", currentOrg.id),
      ]);
      if (assignmentResult.error) throw assignmentResult.error;
      if (accessResult.error) throw accessResult.error;
      const assignedRows = (assignmentResult.data ?? []) as unknown as { device_id: string; vehicle_id: string; device: { id: string; name: string; imei: string } | null; vehicle: { id: string; name: string } | null }[];
      const mappedPairs = assignedRows.filter((row) => row.device && row.vehicle).map((row) => ({ deviceId: row.device!.id, vehicleId: row.vehicle!.id, deviceName: row.device!.name, vehicleName: row.vehicle!.name, imei: row.device!.imei }));
      const pairMap = new Map(mappedPairs.map((pair) => [`${pair.deviceId}:${pair.vehicleId}`, pair]));
      const mappedAccess = ((accessResult.data ?? []) as { id: string; user_id: string; device_id: string; vehicle_id: string }[]).map((row) => ({ id: row.id, userId: row.user_id, ...(pairMap.get(`${row.device_id}:${row.vehicle_id}`) ?? { deviceId: row.device_id, vehicleId: row.vehicle_id, deviceName: "Unknown tracker", vehicleName: "Unknown vehicle", imei: "—" }) }));
      setMembers(memberRows ?? []);
      setPairs(mappedPairs);
      setAccess(mappedAccess);
      if (!selectedUserId && memberRows?.[0]) setSelectedUserId(memberRows[0].userId);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to load asset access");
    } finally {
      setLoading(false);
    }
  }, [callUsers, currentOrg, selectedUserId]);

  useEffect(() => { void load(); }, [load]);

  const selectedMember = members.find((member) => member.userId === selectedUserId);
  const userAccess = useMemo(() => access.filter((row) => row.userId === selectedUserId), [access, selectedUserId]);
  const availablePairs = pairs.filter((pair) => !userAccess.some((row) => row.deviceId === pair.deviceId && row.vehicleId === pair.vehicleId));

  const assignPair = async () => {
    if (!currentOrg || !user || !selectedUserId || !selectedPair) return;
    const pair = pairs.find((candidate) => `${candidate.deviceId}:${candidate.vehicleId}` === selectedPair);
    if (!pair) return;
    setSaving(true);
    const { error } = await supabase.from("user_asset_access").insert({ organization_id: currentOrg.id, user_id: selectedUserId, device_id: pair.deviceId, vehicle_id: pair.vehicleId, assigned_by: user.id });
    setSaving(false);
    if (error) { showError(error.message); return; }
    setSelectedPair("");
    showSuccess("Tracker and vehicle assigned to the user");
    await load();
  };

  const removePair = async (row: AccessRow) => {
    const { error } = await supabase.from("user_asset_access").delete().eq("id", row.id);
    if (error) { showError(error.message); return; }
    setAccess((current) => current.filter((item) => item.id !== row.id));
    showSuccess("Asset access removed");
  };

  return <div className="space-y-5"><PageHeader title="User asset access" description="Assign multiple tracker and vehicle pairs. Assigned users only see these assets and their alerts." actions={<Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary"><Link2 className="mr-2 h-3.5 w-3.5" />Asset-scoped access</Badge>} />
    {loading ? <div className="space-y-3"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div> : members.length === 0 ? <EmptyState icon={UserRound} title="No organization users" description="Invite a user before assigning fleet assets." /> : <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <Card className="border-border bg-card/60"><CardHeader><CardTitle className="text-sm">Select user</CardTitle></CardHeader><CardContent><Select value={selectedUserId} onValueChange={(value) => { setSelectedUserId(value); setSelectedPair(""); }}><SelectTrigger><SelectValue placeholder="Choose a user" /></SelectTrigger><SelectContent>{members.map((member) => <SelectItem key={member.userId} value={member.userId}>{[member.firstName, member.lastName].filter(Boolean).join(" ") || member.email || member.userId}</SelectItem>)}</SelectContent></Select>{selectedMember?.email && <p className="mt-3 truncate text-xs text-muted-foreground">{selectedMember.email}</p>}</CardContent></Card>
      <div className="space-y-5"><Card className="border-border bg-card/60"><CardHeader><CardTitle className="text-sm">Assign tracker and vehicle</CardTitle></CardHeader><CardContent className="flex flex-col gap-3 sm:flex-row"><Select value={selectedPair} onValueChange={setSelectedPair}><SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder={availablePairs.length ? "Choose an active tracker/vehicle pair" : "No unassigned pairs available"} /></SelectTrigger><SelectContent>{availablePairs.map((pair) => <SelectItem key={`${pair.deviceId}:${pair.vehicleId}`} value={`${pair.deviceId}:${pair.vehicleId}`}>{pair.vehicleName} · {pair.deviceName} · {pair.imei}</SelectItem>)}</SelectContent></Select><Button onClick={() => void assignPair()} disabled={saving || !selectedPair}><Plus className="mr-2 h-4 w-4" />Assign</Button></CardContent></Card>
        <Card className="border-border bg-card/60"><CardHeader><CardTitle className="text-sm">Assigned assets {selectedMember ? `for ${selectedMember.firstName || selectedMember.email || "user"}` : ""}</CardTitle></CardHeader><CardContent>{userAccess.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">This user has no tracker/vehicle access yet.</p> : <div className="space-y-2">{userAccess.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/35 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{row.vehicleName}</p><p className="truncate text-xs text-muted-foreground">{row.deviceName} · IMEI {row.imei}</p></div><Button variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive" onClick={() => void removePair(row)} aria-label={`Remove ${row.vehicleName}`}><Trash2 className="h-4 w-4" /></Button></div>)}</div>}</CardContent></Card>
      </div></div>}
  </div>;
}
