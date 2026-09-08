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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import type { InventoryItem } from "@/types/database";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem | null;
  onSaved: () => void;
}

export function InventoryFormDialog({ open, onOpenChange, item, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [unit, setUnit] = useState("pcs");
  const [reorderLevel, setReorderLevel] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setSku(item?.sku ?? "");
    setCategory(item?.category ?? "");
    setQuantity(item?.quantity?.toString() ?? "0");
    setUnit(item?.unit ?? "pcs");
    setReorderLevel(item?.reorder_level?.toString() ?? "");
    setLocation(item?.location ?? "");
    setNotes(item?.notes ?? "");
  }, [open, item]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !name.trim()) return;
    setSaving(true);

    const payload = {
      name: name.trim(),
      sku: sku.trim() || null,
      category: category.trim() || null,
      quantity: parseFloat(quantity) || 0,
      unit: unit.trim() || "pcs",
      reorder_level: reorderLevel ? parseFloat(reorderLevel) : null,
      location: location.trim() || null,
      notes: notes.trim() || null,
    };

    const res = item
      ? await supabase.from("inventory_items").update(payload).eq("id", item.id)
      : await supabase
          .from("inventory_items")
          .insert({ ...payload, organization_id: currentOrg.id });

    setSaving(false);

    if (res.error) {
      showError(res.error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: item ? "UPDATE" : "CREATE",
      entity: "inventory_item",
      entityId: item?.id ?? null,
      oldData: item ?? undefined,
      newData: payload,
    });

    showSuccess(item ? "Item updated" : "Item added");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{item ? "Edit item" : "Add item"}</DialogTitle>
          <DialogDescription>
            Track spare parts and equipment stock levels across your organization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="inv-name">Name *</Label>
              <Input
                id="inv-name"
                required
                placeholder="e.g. Brake pads (front)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-sku">SKU</Label>
              <Input id="inv-sku" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-category">Category</Label>
              <Input
                id="inv-category"
                placeholder="e.g. Brakes"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-qty">Quantity</Label>
              <Input
                id="inv-qty"
                type="number"
                min="0"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-unit">Unit</Label>
              <Input
                id="inv-unit"
                placeholder="pcs"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-reorder">Reorder level</Label>
              <Input
                id="inv-reorder"
                type="number"
                min="0"
                step="0.01"
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-location">Location</Label>
              <Input
                id="inv-location"
                placeholder="e.g. Main warehouse"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inv-notes">Notes</Label>
            <Textarea
              id="inv-notes"
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
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {item ? "Save changes" : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
