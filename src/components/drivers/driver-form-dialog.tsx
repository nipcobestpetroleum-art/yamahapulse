import { useEffect, useState } from "react";
import { Loader2, Upload } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import type { Driver, DriverStatus, Vehicle } from "@/types/database";

const STATUSES: DriverStatus[] = ["ACTIVE", "INACTIVE", "SUSPENDED"];
const STATUS_LABELS: Record<DriverStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  SUSPENDED: "Suspended",
};

const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT Abuja", "Gombe",
  "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
  "Taraba", "Yobe", "Zamfara",
];

const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_FILE_MB = 10;

function splitName(name: string | null | undefined): { first: string; middle: string; last: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", middle: "", last: "" };
  if (parts.length === 1) return { first: parts[0], middle: "", last: "" };
  return { first: parts[0], middle: parts.slice(1, -1).join(" "), last: parts[parts.length - 1] };
}

function validUpload(file: File | null): boolean {
  if (!file) return true;
  if (!ALLOWED_TYPES.includes(file.type) || file.size > MAX_FILE_MB * 1024 * 1024) {
    showError(`Upload must be a JPG, PNG, or PDF up to ${MAX_FILE_MB} MB.`);
    return false;
  }
  return true;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: Driver | null;
  onSaved: () => void;
}

export function DriverFormDialog({ open, onOpenChange, driver, onSaved }: Props) {
  const { currentOrg, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [ibuttonId, setIbuttonId] = useState("");
  const [okadaNumber, setOkadaNumber] = useState("");
  const [nin, setNin] = useState("");
  const [bvn, setBvn] = useState("");
  const [stateOfOrigin, setStateOfOrigin] = useState("");
  const [homeTown, setHomeTown] = useState("");
  const [localGovernment, setLocalGovernment] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [status, setStatus] = useState<DriverStatus>("ACTIVE");
  const [notes, setNotes] = useState("");

  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open || !currentOrg) return;
    supabase
      .from("vehicles")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("name")
      .then(({ data }) => setVehicles((data ?? []) as unknown as Vehicle[]));

    const fallback = splitName(driver?.name);
    setFirstName(driver?.first_name ?? fallback.first);
    setMiddleName(driver?.middle_name ?? fallback.middle);
    setLastName(driver?.last_name ?? fallback.last);
    setPhone(driver?.phone ?? "");
    setEmail(driver?.email ?? "");
    setLicenseNumber(driver?.license_number ?? "");
    setIbuttonId(driver?.ibutton_id ?? "");
    setOkadaNumber(driver?.okada_number ?? "");
    setNin(driver?.nin ?? "");
    setBvn(driver?.bvn ?? "");
    setStateOfOrigin(driver?.state_of_origin ?? "");
    setHomeTown(driver?.home_town ?? "");
    setLocalGovernment(driver?.local_government ?? "");
    setVehicleId(driver?.vehicle_id ?? "");
    setStatus(driver?.status ?? "ACTIVE");
    setNotes(driver?.notes ?? "");
    setPassportFile(null);
    setPictureFile(null);
    setSignatureFile(null);
  }, [open, driver, currentOrg]);

  async function uploadFile(driverId: string, file: File | null, label: string): Promise<string | null> {
    if (!file || !currentOrg) return null;
    if (!validUpload(file)) throw new Error(`${label} is not a valid file`);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${currentOrg.id}/${driverId}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from("driver-documents").upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(`${label} upload failed: ${error.message}`);
    return path;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    if (!firstName.trim() || !lastName.trim()) {
      showError("Enter at least the first and last name.");
      return;
    }
    if (!validUpload(passportFile) || !validUpload(pictureFile) || !validUpload(signatureFile)) return;
    setSaving(true);

    try {
      const fullName = [firstName.trim(), middleName.trim(), lastName.trim()].filter(Boolean).join(" ");
      const payload = {
        name: fullName,
        first_name: firstName.trim(),
        middle_name: middleName.trim() || null,
        last_name: lastName.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        license_number: licenseNumber.trim() || null,
        ibutton_id: ibuttonId.trim() || null,
        okada_number: okadaNumber.trim() || null,
        nin: nin.trim() || null,
        bvn: bvn.trim() || null,
        state_of_origin: stateOfOrigin || null,
        home_town: homeTown.trim() || null,
        local_government: localGovernment.trim() || null,
        vehicle_id: vehicleId || null,
        status,
        notes: notes.trim() || null,
      };

      let savedId = driver?.id ?? null;
      if (driver) {
        const { error } = await supabase.from("drivers").update(payload).eq("id", driver.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("drivers")
          .insert({ ...payload, organization_id: currentOrg.id })
          .select("id")
          .single();
        if (error) throw error;
        savedId = data.id;
      }
      if (!savedId) throw new Error("Could not resolve the driver record");

      const uploads: Record<string, string | null> = {};
      const passportPath = await uploadFile(savedId, passportFile, "Passport photograph");
      if (passportPath) uploads.passport_photo_path = passportPath;
      const picturePath = await uploadFile(savedId, pictureFile, "Driver picture");
      if (picturePath) uploads.driver_picture_path = picturePath;
      const signaturePath = await uploadFile(savedId, signatureFile, "Signature");
      if (signaturePath) uploads.signature_path = signaturePath;
      if (Object.keys(uploads).length > 0) {
        const { error: uploadError } = await supabase.from("drivers").update(uploads).eq("id", savedId);
        if (uploadError) throw uploadError;
      }

      await logAudit({
        organizationId: currentOrg.id,
        userId: user?.id ?? null,
        action: driver ? "UPDATE" : "CREATE",
        entity: "driver",
        entityId: savedId,
        oldData: driver ?? undefined,
        newData: { ...payload, ...uploads },
      });

      showSuccess(driver ? "Driver updated" : "Driver added");
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      showError(
        message.includes("ibutton")
          ? "That iButton ID is already assigned to another driver."
          : message.includes("drivers_vehicle_unique")
            ? "That vehicle already has a driver assigned."
            : message,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{driver ? "Edit driver" : "Add driver"}</DialogTitle>
          <DialogDescription>
            {driver
              ? "Update this driver's details."
              : "Register a new driver in your fleet, including identity documents."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dr-first">First name *</Label>
              <Input id="dr-first" required placeholder="e.g. Chinedu" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dr-middle">Middle name</Label>
              <Input id="dr-middle" placeholder="Optional" value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dr-last">Last name *</Label>
              <Input id="dr-last" required placeholder="e.g. Okafor" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dr-phone">Phone</Label>
              <Input id="dr-phone" placeholder="+234 800 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dr-email">Email</Label>
              <Input id="dr-email" type="email" placeholder="driver@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dr-license">License number</Label>
              <Input id="dr-license" placeholder="Optional" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dr-ibutton">iButton ID</Label>
              <Input id="dr-ibutton" placeholder="Scan tag or enter ID" value={ibuttonId} onChange={(e) => setIbuttonId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dr-okada">Okada number</Label>
              <Input id="dr-okada" placeholder="e.g. 11" value={okadaNumber} onChange={(e) => setOkadaNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dr-nin">NIN</Label>
              <Input id="dr-nin" inputMode="numeric" maxLength={11} placeholder="11-digit NIN" value={nin} onChange={(e) => setNin(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="dr-bvn">BVN</Label>
              <Input id="dr-bvn" inputMode="numeric" maxLength={11} placeholder="11-digit BVN" value={bvn} onChange={(e) => setBvn(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>

          <Separator />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Origin</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>State of origin</Label>
              <Select value={stateOfOrigin} onValueChange={setStateOfOrigin}>
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {NIGERIAN_STATES.map((state) => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dr-hometown">Home town</Label>
              <Input id="dr-hometown" placeholder="e.g. Abakaliki" value={homeTown} onChange={(e) => setHomeTown(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dr-lga">Local govt of origin</Label>
              <Input id="dr-lga" placeholder="e.g. Izzi" value={localGovernment} onChange={(e) => setLocalGovernment(e.target.value)} />
            </div>
          </div>

          <Separator />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity documents (JPG, PNG or PDF · max 10 MB)</p>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="dr-passport">Passport photograph</Label>
              <Input id="dr-passport" type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setPassportFile(e.target.files?.[0] ?? null)} />
              {!passportFile && driver?.passport_photo_path && <p className="text-xs text-emerald-500">Passport already on file — uploading replaces it.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dr-picture">Picture of driver</Label>
              <Input id="dr-picture" type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setPictureFile(e.target.files?.[0] ?? null)} />
              {!pictureFile && driver?.driver_picture_path && <p className="text-xs text-emerald-500">Driver picture already on file — uploading replaces it.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dr-signature">Signature</Label>
              <Input id="dr-signature" type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setSignatureFile(e.target.files?.[0] ?? null)} />
              {!signatureFile && driver?.signature_path && <p className="text-xs text-emerald-500">Signature already on file — uploading replaces it.</p>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Assigned vehicle</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder="No vehicle" />
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
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as DriverStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dr-notes">Notes</Label>
            <Textarea id="dr-notes" rows={2} placeholder="Optional notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !firstName.trim() || !lastName.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {driver ? "Save changes" : "Add driver"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
