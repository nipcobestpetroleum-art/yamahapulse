import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { showError, showSuccess } from "@/utils/toast";

interface TotpFactorInfo {
  id: string;
  friendly_name?: string | null;
  created_at?: string;
}

interface EnrollmentDraft {
  factorId: string;
  challengeId: string;
  qrDataUrl: string;
  secret: string;
}

/**
 * TOTP two-factor management: enrollment (QR + verification), status, removal.
 * Enforcing the second factor at sign-in is handled on the Login page.
 */
export function TwoFactorCard() {
  const [factors, setFactors] = useState<TotpFactorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<EnrollmentDraft | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const loadFactors = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setFactors((data?.totp ?? []) as unknown as TotpFactorInfo[]);
  }, []);

  useEffect(() => {
    loadFactors();
  }, [loadFactors]);

  const startEnrollment = async () => {
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator app",
    });
    if (error) {
      setBusy(false);
      showError(error.message);
      return;
    }
    const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: data.id });
    if (!challenge) {
      setBusy(false);
      showError("Could not start verification. Try again.");
      return;
    }
    const qrDataUrl = await QRCode.toDataURL(data.totp.qr_code, { width: 180, margin: 1 });
    setBusy(false);
    setDraft({
      factorId: data.id,
      challengeId: challenge.id,
      qrDataUrl,
      secret: data.totp.secret,
    });
    setCode("");
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.verify({
      factorId: draft.factorId,
      challengeId: draft.challengeId,
      code: code.trim(),
    });
    setBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    setDraft(null);
    setCode("");
    showSuccess("Two-factor authentication enabled");
    await loadFactors();
  };

  const removeFactor = async (factorId: string) => {
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    showSuccess("Two-factor authentication removed");
    await loadFactors();
  };

  const cancelEnrollment = () => {
    if (draft) void supabase.auth.mfa.unenroll({ factorId: draft.factorId });
    setDraft(null);
    setCode("");
  };

  return (
    <Card className="border-border bg-card/60">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Two-factor authentication</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : draft ? (
          <form onSubmit={verifyCode} className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              <img
                src={draft.qrDataUrl}
                alt="Authenticator QR code"
                className="rounded-lg border border-border bg-white p-2"
              />
              <p className="text-center text-xs text-muted-foreground">
                Scan with your authenticator app (Google Authenticator, 1Password, Authy…),
                then enter the 6-digit code to confirm.
              </p>
              <p className="rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-xs break-all">
                {draft.secret}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mfa-code">Verification code</Label>
              <Input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={busy || code.length !== 6}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify &amp; enable
              </Button>
              <Button type="button" variant="outline" onClick={cancelEnrollment} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        ) : factors.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                Enabled
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 border-border text-destructive hover:bg-destructive/10"
                onClick={() => removeFactor(factors[0].id)}
                disabled={busy}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Remove
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              You will be asked for a code from your authenticator app at each sign-in.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Add a second factor (TOTP authenticator app) to protect your account beyond your
              password.
            </p>
            <Button type="button" variant="outline" className="w-full" onClick={startEnrollment} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enable two-factor authentication
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
