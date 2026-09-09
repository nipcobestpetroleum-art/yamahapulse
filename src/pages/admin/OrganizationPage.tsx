import { useEffect, useState } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { hasAnyRole, ADMIN_ROLES } from "@/lib/roles";
import { showError, showSuccess } from "@/utils/toast";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Australia/Sydney",
];

export default function OrganizationPage() {
  const { currentOrg, currentRole, refreshMemberships, signOut } = useAuth();
  const canEdit = hasAnyRole(currentRole, ADMIN_ROLES);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [alertEmails, setAlertEmails] = useState("");
  const [entitlements, setEntitlements] = useState<{
    limits: Record<string, number>;
    usage: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    if (!currentOrg) return;
    setName(currentOrg.name ?? "");
    setIndustry(currentOrg.industry ?? "");
    setEmail(currentOrg.email ?? "");
    setPhone(currentOrg.phone ?? "");
    setAddress(currentOrg.address ?? "");
    setCountry(currentOrg.country ?? "");
    setTimezone(currentOrg.timezone ?? "UTC");
    setAlertEmails((currentOrg.alert_emails ?? []).join(", "));
    void supabase
      .rpc("organization_entitlements", { p_organization_id: currentOrg.id })
      .then(({ data }) => setEntitlements(data as typeof entitlements));
  }, [currentOrg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    setSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({
        name: name.trim(),
        industry: industry.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        country: country.trim() || null,
        timezone,
        alert_emails: alertEmails
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean),
      })
      .eq("id", currentOrg.id);
    setSaving(false);
    if (error) {
      showError(error.message);
      return;
    }
    await refreshMemberships();
    showSuccess("Organization updated");
  };

  const handleExport = async () => {
    if (!currentOrg) return;
    setExporting(true);
    const { data: created, error: createError } = await supabase.functions.invoke("privacy-export", {
      body: { action: "create", organizationId: currentOrg.id },
    });
    if (createError) {
      setExporting(false);
      showError(createError.message);
      return;
    }

    const requestId = (created as { requestId: string }).requestId;
    showSuccess("Export queued. Preparing a secure download…");
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const { data: status, error: statusError } = await supabase.functions.invoke("privacy-export", {
        body: { action: "status", requestId },
      });
      if (statusError) continue;
      const metadata = (status as { status: string; metadata?: { signed_url?: string } }).metadata;
      if ((status as { status: string }).status === "FAILED") {
        setExporting(false);
        showError("The export could not be prepared");
        return;
      }
      if (metadata?.signed_url) {
        const anchor = document.createElement("a");
        anchor.href = metadata.signed_url;
        anchor.download = `${currentOrg.slug}-data-export-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.target = "_blank";
        anchor.click();
        setExporting(false);
        showSuccess("Secure organization export downloaded");
        return;
      }
    }
    setExporting(false);
    showError("The export is still preparing. Check the privacy request status shortly.");
  };

  const handleDelete = async () => {
    if (!currentOrg || confirmation !== currentOrg.name) return;
    setDeleting(true);
    const { error } = await supabase.rpc("delete_organization_data", {
      p_organization_id: currentOrg.id,
      p_confirmation: confirmation,
    });
    setDeleting(false);
    if (error) {
      showError(error.message);
      return;
    }
    showSuccess("Organization deleted");
    await signOut();
  };

  return (
    <div>
      <PageHeader
        title="Organization"
        description="Manage your organization's profile and preferences"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border bg-card/60 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="org-name">Organization name *</Label>
                  <Input
                    id="org-name"
                    required
                    disabled={!canEdit}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-industry">Industry</Label>
                  <Input
                    id="org-industry"
                    disabled={!canEdit}
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-country">Country</Label>
                  <Input
                    id="org-country"
                    disabled={!canEdit}
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-email">Contact email</Label>
                  <Input
                    id="org-email"
                    type="email"
                    disabled={!canEdit}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-phone">Phone</Label>
                  <Input
                    id="org-phone"
                    disabled={!canEdit}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="org-address">Address</Label>
                  <Input
                    id="org-address"
                    disabled={!canEdit}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone} disabled={!canEdit}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="org-alert-emails">Critical alert email recipients</Label>
                  <Input
                    id="org-alert-emails"
                    placeholder="ops@example.com, manager@example.com"
                    disabled={!canEdit}
                    value={alertEmails}
                    onChange={(e) => setAlertEmails(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated emails notified for crashes, panic alerts, tampering and other
                    critical events.
                  </p>
                </div>
              </div>

              {canEdit && (
                <Button type="submit" disabled={saving || !name.trim()}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current plan</span>
              <Badge variant="outline" className="font-medium">
                {currentOrg?.plan ?? "TRIAL"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Workspace slug</span>
              <span className="font-mono text-xs text-muted-foreground">{currentOrg?.slug}</span>
            </div>
            {entitlements && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Usage</p>
                {(["devices", "vehicles", "users"] as const).map((resource) => (
                  <div key={resource} className="flex items-center justify-between text-xs">
                    <span className="capitalize text-muted-foreground">{resource}</span>
                    <span className="tabular-nums">
                      {entitlements.usage[resource]} / {entitlements.limits[resource]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Privacy and data controls</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Export organization data</p>
              <p className="text-xs text-muted-foreground">
                Downloads the organization profile, users, fleet records, alerts, events, retained telemetry, and audit data for the last 180 days.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={handleExport} disabled={!canEdit || exporting}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export data
            </Button>
          </CardContent>
        </Card>

        <Card className="border-destructive/30 bg-destructive/5 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-destructive">Danger zone</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Delete this organization</p>
              <p className="text-xs text-muted-foreground">
                Permanently deletes the organization and its fleet data. This cannot be undone.
              </p>
            </div>
            <AlertDialog onOpenChange={(open) => !open && setConfirmation("")}>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" disabled={!canEdit}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete organization
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {currentOrg?.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes vehicles, devices, telemetry, alerts, users’ organization memberships, and operational records. Type the exact organization name to continue.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder={currentOrg?.name}
                  autoComplete="off"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      void handleDelete();
                    }}
                    disabled={deleting || confirmation !== currentOrg?.name}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Permanently delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
