import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PasswordInput } from "@/components/password-input";
import { PasswordStrength } from "@/components/password-strength";
import { TwoFactorCard } from "@/components/auth/two-factor-card";
import { PageHeader } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { ROLE_LABELS } from "@/lib/roles";
import { showError, showSuccess } from "@/utils/toast";

export default function ProfilePage() {
  const { user, profile, currentRole, refreshMemberships } = useAuth();
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [requestingErasure, setRequestingErasure] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    setFirstName(profile?.first_name ?? "");
    setLastName(profile?.last_name ?? "");
    setPhone(profile?.phone ?? "");
    setAvatarUrl(profile?.avatar_url ?? "");
  }, [profile]);

  const initials =
    ((firstName?.[0] ?? user?.email?.[0] ?? "U") + (lastName?.[0] ?? "")).toUpperCase();

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      })
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) {
      showError(error.message);
      return;
    }
    await refreshMemberships();
    showSuccess("Profile updated");
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 10) {
      showError("Password must be at least 10 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showError("Passwords do not match.");
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      showError(error.message);
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    showSuccess("Password updated");
  };

  const handleAccountErasure = async () => {
    setRequestingErasure(true);
    const { data, error } = await supabase.rpc("request_account_erasure");
    setRequestingErasure(false);
    if (error) {
      showError(error.message);
      return;
    }
    showSuccess(data ? "Account erasure request recorded" : "Account erasure request submitted");
  };

  return (
    <div>
      <PageHeader title="My Profile" description="Manage your personal details and security" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border bg-card/60 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Personal details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border border-border">
                  <AvatarImage src={avatarUrl || undefined} alt={firstName} />
                  <AvatarFallback className="bg-primary/15 text-lg font-semibold text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <Label htmlFor="pf-avatar">Avatar URL</Label>
                  <Input
                    id="pf-avatar"
                    placeholder="https://…"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pf-first">First name</Label>
                  <Input
                    id="pf-first"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pf-last">Last name</Label>
                  <Input
                    id="pf-last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pf-email">Email</Label>
                  <Input id="pf-email" value={user?.email ?? ""} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pf-phone">Phone</Label>
                  <Input
                    id="pf-phone"
                    placeholder="+1 555 000 0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <Button type="submit" disabled={savingProfile}>
                {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border bg-card/60">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Role</span>
                <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {currentRole ? ROLE_LABELS[currentRole] : "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          <TwoFactorCard />

          <Card className="border-border bg-card/60">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Change password</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pf-new-password">New password</Label>
                  <PasswordInput
                    id="pf-new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <PasswordStrength password={newPassword} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pf-confirm-password">Confirm password</Label>
                  <PasswordInput
                    id="pf-confirm-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={changingPassword || !newPassword} className="w-full">
                  {changingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update password
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-destructive">Account data request</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Request account-level erasure separately from organization deletion. Any active organization memberships must be transferred or removed first.
              </p>
              <Button type="button" variant="outline" onClick={() => void handleAccountErasure()} disabled={requestingErasure} className="w-full">
                {requestingErasure && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Request account erasure
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
