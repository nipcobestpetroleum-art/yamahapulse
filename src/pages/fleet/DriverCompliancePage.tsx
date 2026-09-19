import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, Loader2, Plus, ShieldCheck, Upload, UserRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { DRIVER_WRITE_ROLES, hasAnyRole } from "@/lib/roles";
import { showError, showSuccess } from "@/utils/toast";
import type { Driver } from "@/types/database";

interface Guarantor { id: string; name: string; phone: string | null; email: string | null; national_id: string | null; relationship: string | null; status: string; }
interface DriverLink { guarantor_id: string; relationship: string | null; liability_amount: number | null; status: string; guarantor: Guarantor | null; }
interface DriverDocument { id: string; document_type: string; document_number: string | null; file_name: string | null; file_path: string | null; expires_at: string | null; verification_status: string; }

const emptyProfile = { name: "", phone: "", email: "", national_id: "", license_number: "", date_of_birth: "", gender: "", address: "", city: "", country: "", employment_status: "", employer_name: "", emergency_contact_name: "", emergency_contact_phone: "", emergency_contact_relationship: "", next_of_kin_name: "", next_of_kin_phone: "", next_of_kin_relationship: "", notes: "" };

export default function DriverCompliancePage() {
  const { currentOrg, currentRole, user } = useAuth();
  const canWrite = hasAnyRole(currentRole, DRIVER_WRITE_ROLES);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState(emptyProfile);
  const [links, setLinks] = useState<DriverLink[]>([]);
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guarantorSaving, setGuarantorSaving] = useState(false);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [guarantor, setGuarantor] = useState({ name: "", phone: "", email: "", national_id: "", relationship: "", address: "", employer_name: "" });
  const [documentType, setDocumentType] = useState("National ID / Passport");
  const [documentNumber, setDocumentNumber] = useState("");
  const [documentExpiry, setDocumentExpiry] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const selected = useMemo(() => drivers.find((driver) => driver.id === selectedId) ?? null, [drivers, selectedId]);

  const loadDrivers = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase.from("drivers").select("*").eq("organization_id", currentOrg.id).order("name");
    setLoading(false);
    if (error) { showError(error.message); return; }
    const next = (data ?? []) as Driver[];
    setDrivers(next);
    if (!selectedId && next[0]) setSelectedId(next[0].id);
  }, [currentOrg, selectedId]);

  const loadCompliance = useCallback(async () => {
    if (!currentOrg || !selectedId) return;
    const [linkResult, documentResult] = await Promise.all([
      supabase.from("driver_guarantors").select("guarantor_id,relationship,liability_amount,status,guarantor:guarantors(id,name,phone,email,national_id,relationship,status)").eq("organization_id", currentOrg.id).eq("driver_id", selectedId),
      supabase.from("driver_documents").select("id,document_type,document_number,file_name,file_path,expires_at,verification_status").eq("organization_id", currentOrg.id).eq("driver_id", selectedId).order("created_at", { ascending: false }),
    ]);
    if (linkResult.error) showError(linkResult.error.message);
    if (documentResult.error) showError(documentResult.error.message);
    setLinks((linkResult.data ?? []) as unknown as DriverLink[]);
    setDocuments((documentResult.data ?? []) as DriverDocument[]);
  }, [currentOrg, selectedId]);

  useEffect(() => { void loadDrivers(); }, [loadDrivers]);
  useEffect(() => {
    if (!selected) return;
    setProfile({ ...emptyProfile, ...Object.fromEntries(Object.keys(emptyProfile).map((key) => [key, String((selected as unknown as Record<string, unknown>)[key] ?? "")])) } as typeof emptyProfile);
    void loadCompliance();
  }, [selected, loadCompliance]);

  const updateProfile = (key: keyof typeof emptyProfile, value: string) => setProfile((current) => ({ ...current, [key]: value }));

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentOrg || !canWrite || !profile.name.trim()) return;
    setSaving(true);
    const payload = Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, value.trim() || null]));
    const result = selected ? await supabase.from("drivers").update(payload).eq("id", selected.id) : await supabase.from("drivers").insert({ ...payload, organization_id: currentOrg.id });
    setSaving(false);
    if (result.error) { showError(result.error.message); return; }
    showSuccess(selected ? "Driver profile updated" : "Driver registered");
    await loadDrivers();
  };

  const verifyDriver = async () => {
    if (!selected || !currentOrg || !canWrite) return;
    const { error } = await supabase.from("drivers").update({ verification_status: "VERIFIED", verified_at: new Date().toISOString(), verified_by: user?.id ?? null }).eq("id", selected.id);
    if (error) { showError(error.message); return; }
    showSuccess("Driver verified");
    await loadDrivers();
  };

  const addGuarantor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentOrg || !selected || !canWrite || !guarantor.name.trim()) return;
    setGuarantorSaving(true);
    const created = await supabase.from("guarantors").insert({ ...guarantor, organization_id: currentOrg.id }).select("id").single();
    if (created.error) { setGuarantorSaving(false); showError(created.error.message); return; }
    const link = await supabase.from("driver_guarantors").insert({ organization_id: currentOrg.id, driver_id: selected.id, guarantor_id: created.data.id, relationship: guarantor.relationship || null });
    setGuarantorSaving(false);
    if (link.error) { showError(link.error.message); return; }
    setGuarantor({ name: "", phone: "", email: "", national_id: "", relationship: "", address: "", employer_name: "" });
    showSuccess("Guarantor added");
    await loadCompliance();
  };

  const uploadDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentOrg || !selected || !canWrite || !documentFile) return;
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedTypes.includes(documentFile.type) || documentFile.size > 10 * 1024 * 1024) {
      showError("Upload a PDF, JPG, or PNG file up to 10 MB.");
      return;
    }
    setDocumentSaving(true);
    const safeName = documentFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${currentOrg.id}/${selected.id}/${crypto.randomUUID()}-${safeName}`;
    const upload = await supabase.storage.from("driver-documents").upload(path, documentFile, { contentType: documentFile.type, upsert: false });
    if (upload.error) { setDocumentSaving(false); showError(upload.error.message); return; }
    const saved = await supabase.from("driver_documents").insert({ organization_id: currentOrg.id, driver_id: selected.id, document_type: documentType, document_number: documentNumber.trim() || null, file_path: path, file_name: documentFile.name, mime_type: documentFile.type || null, expires_at: documentExpiry || null }).select("id").single();
    setDocumentSaving(false);
    if (saved.error) { showError(saved.error.message); return; }
    setDocumentFile(null); setDocumentNumber(""); setDocumentExpiry("");
    showSuccess("Document uploaded");
    await loadCompliance();
  };

  const verifyDocument = async (id: string) => {
    if (!canWrite || !user) return;
    const { error } = await supabase.from("driver_documents").update({ verification_status: "VERIFIED", verified_at: new Date().toISOString(), verified_by: user.id }).eq("id", id);
    if (error) showError(error.message); else { showSuccess("Document verified"); await loadCompliance(); }
  };

  return <div className="space-y-6">
    <PageHeader title="Driver Compliance" description="Register drivers, verify identity, manage guarantors, and secure personal documents." actions={<Button onClick={() => { setSelectedId(null); setProfile(emptyProfile); }}><Plus className="mr-2 h-4 w-4" />New driver</Button>} />
    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      <Card className="border-border bg-card/60"><CardHeader><CardTitle className="text-base">Drivers <span className="text-muted-foreground">({drivers.length})</span></CardTitle></CardHeader><CardContent className="space-y-2">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : drivers.map((driver) => <button key={driver.id} type="button" onClick={() => setSelectedId(driver.id)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors ${selectedId === driver.id ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/60"}`}><div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-sm font-medium">{driver.name}</p><p className="text-xs text-muted-foreground">{driver.phone ?? "No phone"}</p></div><Badge variant="outline" className="ml-auto text-[10px]">{driver.verification_status ?? "PENDING"}</Badge></button>)}</CardContent></Card>
      <div className="space-y-6">
        <Card className="border-border bg-card/60"><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />Personal profile</CardTitle><p className="mt-1 text-sm text-muted-foreground">{selected ? "Keep identity and contact information current." : "Create a verified driver record."}</p></div>{selected && <Button variant="outline" size="sm" onClick={verifyDriver} disabled={!canWrite || selected.verification_status === "VERIFIED"}><CheckCircle2 className="mr-2 h-4 w-4" />{selected.verification_status === "VERIFIED" ? "Verified" : "Verify driver"}</Button>}</CardHeader><CardContent><form onSubmit={saveProfile} className="space-y-5"><div className="grid gap-4 md:grid-cols-3">{([['name','Full name'],['phone','Phone'],['email','Email'],['national_id','National ID / Passport'],['license_number','License number'],['date_of_birth','Date of birth'],['gender','Gender'],['address','Address'],['city','City'],['country','Country'],['employment_status','Employment status'],['employer_name','Employer'] ] as [keyof typeof emptyProfile,string][]).map(([key,label]) => <div key={key} className="space-y-2"><Label>{label}{key === "name" ? " *" : ""}</Label><Input type={key === "email" ? "email" : key === "date_of_birth" ? "date" : "text"} value={profile[key]} onChange={(event) => updateProfile(key, event.target.value)} required={key === "name"} /></div>)}</div><Separator /><div className="grid gap-4 md:grid-cols-3">{([['emergency_contact_name','Emergency contact'],['emergency_contact_phone','Emergency phone'],['emergency_contact_relationship','Emergency relationship'],['next_of_kin_name','Next of kin'],['next_of_kin_phone','Next-of-kin phone'],['next_of_kin_relationship','Next-of-kin relationship'] ] as [keyof typeof emptyProfile,string][]).map(([key,label]) => <div key={key} className="space-y-2"><Label>{label}</Label><Input value={profile[key]} onChange={(event) => updateProfile(key, event.target.value)} /></div>)}</div><div className="space-y-2"><Label>Internal notes</Label><Textarea value={profile.notes} onChange={(event) => updateProfile("notes", event.target.value)} rows={3} /></div><Button type="submit" disabled={!canWrite || saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{selected ? "Save profile" : "Register driver"}</Button></form></CardContent></Card>
        {selected && <div className="grid gap-6 lg:grid-cols-2"><Card className="border-border bg-card/60"><CardHeader><CardTitle className="text-base">Guarantors</CardTitle></CardHeader><CardContent className="space-y-4">{links.map((link) => <div key={link.guarantor_id} className="rounded-xl border border-border bg-background/40 p-3"><div className="flex justify-between"><div><p className="font-medium">{link.guarantor?.name ?? "Unknown guarantor"}</p><p className="text-sm text-muted-foreground">{link.guarantor?.phone ?? "No phone"} · {link.relationship ?? "Relationship not set"}</p></div><Badge variant="outline">{link.status}</Badge></div></div>)}<Separator /><form onSubmit={addGuarantor} className="space-y-3">{([['name','Full name'],['phone','Phone'],['email','Email'],['national_id','National ID'],['relationship','Relationship'],['address','Address'],['employer_name','Employer'] ] as [keyof typeof guarantor,string][]).map(([key,label]) => <Input key={key} placeholder={label} value={guarantor[key]} onChange={(event) => setGuarantor((current) => ({ ...current, [key]: event.target.value }))} required={key === "name"} />)}<Button type="submit" variant="outline" disabled={!canWrite || guarantorSaving}>{guarantorSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Plus className="mr-2 h-4 w-4" />Add guarantor</Button></form></CardContent></Card>
          <Card className="border-border bg-card/60"><CardHeader><CardTitle className="text-base">Personal documents</CardTitle></CardHeader><CardContent className="space-y-4">{documents.map((document) => <div key={document.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3"><FileText className="h-5 w-5 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{document.document_type}</p><p className="text-xs text-muted-foreground">{document.file_name ?? "Document"} · {document.verification_status}</p></div>{document.verification_status !== "VERIFIED" && <Button size="sm" variant="ghost" onClick={() => verifyDocument(document.id)} disabled={!canWrite}>Verify</Button>}</div>)}<Separator /><form onSubmit={uploadDocument} className="space-y-3"><Input placeholder="Document type" value={documentType} onChange={(event) => setDocumentType(event.target.value)} required /><Input placeholder="Document number (optional)" value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} /><Input type="date" value={documentExpiry} onChange={(event) => setDocumentExpiry(event.target.value)} /><Input type="file" accept="image/*,.pdf" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} required /><Button type="submit" variant="outline" disabled={!canWrite || documentSaving || !documentFile}>{documentSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Upload className="mr-2 h-4 w-4" />Upload document</Button></form></CardContent></Card></div>}
      </div>
    </div>
  </div>;
}
