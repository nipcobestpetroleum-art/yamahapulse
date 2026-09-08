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
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import type { Technician } from "@/types/database";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  technician: Technician | null;
  onSaved: () => void;
}

export function TechnicianFormDialog({ open, onOpenChange, technician, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(technician?.name ?? "");
    setPhone(technician?.phone ?? "");
    setEmail(technician?.email ?? "");
    setSpecialty(technician?.specialty ?? "");
    setIsActive(technician?.is_active ?? true);
  }, [open, technician]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !name.trim()) return;
    setSaving(true);

    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      specialty: specialty.trim() || null,
      is_active: isActive,
    };

    const res = technician
      ? await supabase.from("technicians").update(payload).eq("id", technician.id)
      : await supabase.from("technicians").insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: technician ? "UPDATE" : "CREATE",
      entity: "technician",
      entityId: technician?.id ?? null,
      oldData: technician ?? undefined,
      newData: payload,
    });

    showSuccess(technician ? "Technician updated" : "Technician added");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{technician ? "Edit technician" : "Add technician"}</DialogTitle>
          <DialogDescription>
            Register maintenance staff who perform inspections and repairs.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tech-name">Name *</Label>
            <Input
              id="tech-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tech-phone">Phone</Label>
              <Input id="tech-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tech-email">Email</Label>
              <Input
                id="tech-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tech-specialty">Specialty</Label>
            <Input
              id="tech-specialty"
              placeholder="e.g. Engine & transmission"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3">
            <Label htmlFor="tech-active" className="text-sm">
              Active
            </Label>
            <Switch id="tech-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {technician ? "Save changes" : "Add technician"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
