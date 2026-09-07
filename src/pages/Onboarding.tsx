import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Loader2, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FullScreenLoader } from "@/components/auth/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError, showSuccess } from "@/utils/toast";

const INDUSTRIES = [
  "Logistics & Transport",
  "Construction",
  "Oil & Gas",
  "Public Transit",
  "Delivery & Courier",
  "Rental & Leasing",
  "Agriculture",
  "Mining",
  "Utilities",
  "Other",
];

const COUNTRIES = [
  "United States",
  "United Kingdom",
  "United Arab Emirates",
  "Saudi Arabia",
  "India",
  "Germany",
  "South Africa",
  "Kenya",
  "Nigeria",
  "Brazil",
  "Australia",
  "Singapore",
  "Canada",
  "France",
];

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

export default function Onboarding() {
  const { memberships, refreshMemberships } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [submitting, setSubmitting] = useState(false);

  // Users who already belong to an organization should never see onboarding —
  // send them to their organization's dashboard instead.
  useEffect(() => {
    if (memberships.length > 0 && !submitting) {
      navigate("/dashboard", { replace: true });
    }
  }, [memberships, submitting, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.rpc("create_organization", {
      p_name: name.trim(),
      p_industry: industry || null,
      p_country: country || null,
      p_timezone: timezone,
    });
    if (error) {
      setSubmitting(false);
      showError(error.message);
      return;
    }
    await refreshMemberships();
    setSubmitting(false);
    showSuccess("Organization created. Welcome to YamahaPulse!");
    navigate("/dashboard", { replace: true });
  };

  if (memberships.length > 0) return <FullScreenLoader />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
            <Radar className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Set up your organization</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a workspace to start managing your fleet. You will be its administrator.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/20 sm:p-8"
        >
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
            <Building2 className="h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              A default <span className="font-medium text-foreground">Headquarters</span> branch is
              created automatically.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-name">Organization name</Label>
            <Input
              id="org-name"
              required
              placeholder="e.g. Falcon Logistics Ltd"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-background/60"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger className="bg-background/60">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((i) => (
                    <SelectItem key={i} value={i}>
                      {i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger className="bg-background/60">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="bg-background/60">
                <SelectValue placeholder="Select timezone" />
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

          <Button type="submit" className="w-full" disabled={submitting || !name.trim()}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create organization
          </Button>
        </form>
      </div>
    </div>
  );
}