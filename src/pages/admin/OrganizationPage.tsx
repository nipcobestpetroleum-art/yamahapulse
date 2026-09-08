import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  const { currentOrg, currentRole, refreshMemberships } = useAuth();
  const canEdit = hasAnyRole(currentRole, ADMIN_ROLES);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("UTC");

  useEffect(() => {
    if (!currentOrg) return;
    setName(currentOrg.name ?? "");
    setIndustry(currentOrg.industry ?? "");
    setEmail(currentOrg.email ?? "");
    setPhone(currentOrg.phone ?? "");
    setAddress(currentOrg.address ?? "");
    setCountry(currentOrg.country ?? "");
    setTimezone(currentOrg.timezone ?? "UTC");
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
