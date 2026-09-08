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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import type { DocumentType, Vehicle, VehicleDocument } from "@/types/database";

const DOC_TYPES: DocumentType[] = [
  "INSURANCE",
  "REGISTRATION",
  "PERMIT",
  "INSPECTION_CERTIFICATE",
  "OTHER",
];
const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  INSURANCE: "Insurance",
  REGISTRATION: "Registration",
  PERMIT: "Permit",
  INSPECTION_CERTIFICATE: "Inspection certificate",
  OTHER: "Other",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: VehicleDocument | null;
  onSaved: () => void;
}

export function DocumentFormDialog({ open, onOpenChange, document, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [saving, setSaving] = useState(false);

  const [vehicleId, setVehicleId] = useState("");
  const [docType, setDocType] = useState<DocumentType>("INSURANCE");
  const [title, setTitle] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !currentOrg) return;
    supabase
      .from("vehicles")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(({ data }) => setVehicles((data ?? []) as unknown as Vehicle[]));

    setVehicleId(document?.vehicle_id ?? "");
    setDocType(document?.doc_type ?? "INSURANCE");
    setTitle(document?.title ?? "");
    setFileUrl(document?.file_url ?? "");
    setExpiryDate(document?.expiry_date?.slice(0, 10) ?? "");
    setNotes(document?.notes ?? "");
  }, [open, document, currentOrg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !vehicleId || !title.trim()) return;
    setSaving(true);

    const payload = {
      vehicle_id: vehicleId,
      doc_type: docType,
      title: title.trim(),
      file_url: fileUrl.trim() || null,
      expiry_date: expiryDate || null,
      notes: notes.trim() || null,
    };

    const res = document
      ? await supabase.from("vehicle_documents").update(payload).eq("id", document.id)
      : await supabase
          .from("vehicle_documents")
          .insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: document ? "UPDATE" : "CREATE",
      entity: "vehicle_document",
      entityId: document?.id ?? null,
      oldData: document ?? undefined,
      newData: payload,
    });

    showSuccess(document ? "Document updated" : "Document added");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{document ? "Edit document" : "Add document"}</DialogTitle>
          <DialogDescription>
            Track vehicle documents and get ahead of renewal deadlines.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Vehicle *</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} · {v.registration_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DOC_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-title">Title *</Label>
            <Input
              id="doc-title"
              required
              placeholder="e.g. Third-party insurance 2026"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="doc-url">File URL</Label>
              <Input
                id="doc-url"
                type="url"
                placeholder="https://…"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-expiry">Expiry date</Label>
              <Input
                id="doc-expiry"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-notes">Notes</Label>
            <Textarea
              id="doc-notes"
              rows={2}
              placeholder="Optional notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !vehicleId || !title.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {document ? "Save changes" : "Add document"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
