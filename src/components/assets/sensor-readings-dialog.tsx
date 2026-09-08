import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/utils/toast";
import { Activity } from "lucide-react";
import type { AssetSensor, SensorReading } from "@/types/database";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sensor: AssetSensor | null;
}

export function SensorReadingsDialog({ open, onOpenChange, sensor }: Props) {
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !sensor) return;
    setLoading(true);
    supabase
      .from("sensor_readings")
      .select("*")
      .eq("sensor_id", sensor.id)
      .order("recorded_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        setLoading(false);
        if (error) {
          showError(error.message);
          return;
        }
        setReadings(((data ?? []) as unknown as SensorReading[]).reverse());
      });
  }, [open, sensor]);

  const chartData = readings.map((r) => ({
    time: format(new Date(r.recorded_at), "HH:mm"),
    value: r.value,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{sensor?.name} readings</DialogTitle>
          <DialogDescription>
            Last {readings.length} readings{sensor?.unit ? ` (${sensor.unit})` : ""}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : readings.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No readings yet"
            description="Readings will appear here once the linked device reports sensor telemetry."
          />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit={sensor?.unit ?? ""} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
