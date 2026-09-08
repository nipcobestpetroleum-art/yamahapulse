import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { FUEL_SENSOR_WRITE_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import type { FuelCalibrationPoint, FuelSensor } from "@/types/database";

export default function FuelCalibrationPage() {
  const { currentOrg, currentRole, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const canWrite = hasAnyRole(currentRole, FUEL_SENSOR_WRITE_ROLES);

  const [sensors, setSensors] = useState<FuelSensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sensorId, setSensorId] = useState("");
  const [points, setPoints] = useState<FuelCalibrationPoint[]>([]);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("fuel_sensors")
      .select("*, vehicle:vehicles(name, registration_number)")
      .eq("organization_id", currentOrg.id)
      .order("created_at", { ascending: false });

    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    const rows = (data ?? []) as unknown as FuelSensor[];
    setSensors(rows);

    const preselect = searchParams.get("sensor");
    if (preselect && rows.some((s) => s.id === preselect)) {
      setSensorId(preselect);
    } else if (rows.length > 0 && !sensorId) {
      setSensorId(rows[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedSensor = useMemo(
    () => sensors.find((s) => s.id === sensorId) ?? null,
    [sensors, sensorId],
  );

  useEffect(() => {
    setPoints(selectedSensor?.calibration_points ?? []);
  }, [selectedSensor]);

  const handleSelectSensor = (id: string) => {
    setSensorId(id);
    setSearchParams({ sensor: id }, { replace: true });
  };

  const updatePoint = (index: number, key: "raw" | "liters", value: string) => {
    setPoints((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [key]: Number(value) || 0 } : p)),
    );
  };

  const addPoint = () => {
    setPoints((prev) => [...prev, { raw: 0, liters: 0 }]);
  };

  const removePoint = (index: number) => {
    setPoints((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!selectedSensor || !currentOrg) return;
    setSaving(true);
    const sorted = [...points].sort((a, b) => a.raw - b.raw);
    const { error } = await supabase
      .from("fuel_sensors")
      .update({ calibration_points: sorted })
      .eq("id", selectedSensor.id);
    setSaving(false);

    if (error) {
      showError(error.message);
      return;
    }

    await logAudit({
      organizationId: currentOrg.id,
      userId: user?.id ?? null,
      action: "UPDATE",
      entity: "fuel_sensor",
      entityId: selectedSensor.id,
      oldData: { calibration_points: selectedSensor.calibration_points },
      newData: { calibration_points: sorted },
    });

    showSuccess("Calibration saved");
    setPoints(sorted);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Fuel Calibration"
        description="Map raw sensor readings to actual liters so fuel levels display accurately."
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : sensors.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="No fuel sensors to calibrate"
          description="Add a fuel sensor first from the Fuel Sensors page."
        />
      ) : (
        <div className="space-y-4">
          <Card className="border-border bg-card/60">
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label>Sensor</Label>
                <Select value={sensorId} onValueChange={handleSelectSensor}>
                  <SelectTrigger className="bg-card/60 sm:w-[320px]">
                    <SelectValue placeholder="Select sensor" />
                  </SelectTrigger>
                  <SelectContent>
                    {sensors.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.vehicle?.name ?? "Unknown vehicle"} · {s.sensor_type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {selectedSensor && (
            <Card className="border-border bg-card/40">
              <CardContent className="space-y-4 pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Calibration curve</p>
                    <p className="text-xs text-muted-foreground">
                      Add raw sensor values (voltage, resistance, or ADC units) paired with the
                      actual fuel level in liters, from empty to full.
                    </p>
                  </div>
                  {canWrite && (
                    <Button size="sm" variant="outline" onClick={addPoint}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add point
                    </Button>
                  )}
                </div>

                {points.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                    No calibration points yet. Add at least two (empty and full).
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground">
                      <span>Raw value</span>
                      <span>Liters</span>
                      <span />
                    </div>
                    {points.map((p, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={p.raw}
                          disabled={!canWrite}
                          onChange={(e) => updatePoint(i, "raw", e.target.value)}
                        />
                        <Input
                          type="number"
                          step="0.1"
                          value={p.liters}
                          disabled={!canWrite}
                          onChange={(e) => updatePoint(i, "liters", e.target.value)}
                        />
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-destructive"
                            onClick={() => removePoint(i)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {canWrite && (
                  <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={saving}>
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save calibration
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
