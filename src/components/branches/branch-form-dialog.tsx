import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import type { Branch } from "@/types/database";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch: Branch | null;
  onSaved: () => void;
}

export function BranchFormDialog({ open, onOpenChange, branch, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(branch?.name ?? "");
    setCode(branch?.code ?? "");
    setAddress(branch?.address ?? "");
    setCity(branch?.city ?? "");
    setCountry(branch?.country ?? "");
    setPhone(branch?.phone ?? "");
    setEmail(branch?.email ?? "");
  }, [open, branch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    setSaving(true);

    const payload = {
      name: name.trim(),
      code: code.trim() || null,
      address: address.trim() || null,
      city: city.trim() || null,
      country: country.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
    };

    const res = branch
      ? await supabase.from("branches").update(payload).eq("id", branch.id)
      : await supabase.from("branches").insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: branch ? "UPDATE" : "CREATE",
      entity: "branch",
      entityId: branch?.id ?? null,
      oldData: branch ?? undefined,
      newData: payload,
    });

    showSuccess(branch ? "Branch updated" : "Branch created");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{branch ? "Edit branch" : "Add branch"}</DialogTitle>
          <DialogDescription>
            {branch ? "Update this branch's details." : "Create a new branch or depot location."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="br-name">Name *</Label>
              <Input
                id="br-name"
                required
                placeholder="e.g. Lagos Depot"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="br-code">Code</Label>
              <Input id="br-code" placeholder="LOS" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="br-address">Address</Label>
              <Input id="br-address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="br-city">City</Label>
              <Input id="br-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="br-country">Country</Label>
              <Input id="br-country" value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="br-phone">Phone</Label>
              <Input id="br-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="br-email">Email</Label>
              <Input id="br-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {branch ? "Save changes" : "Add branch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
