import { useCallback, useEffect, useState } from "react";
import { Camera as CameraIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { CameraStreamPlayer } from "@/components/video/camera-stream-player";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { showError } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { Camera, CameraStatus } from "@/types/database";

const STATUS_STYLES: Record<CameraStatus, string> = {
  ACTIVE: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  INACTIVE: "border-slate-500/25 bg-slate-500/10 text-slate-400",
  OFFLINE: "border-rose-500/25 bg-rose-500/10 text-rose-400",
};

export default function LiveVideoPage() {
  const { currentOrg } = useAuth();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("cameras")
      .select("*, vehicle:vehicles(name, registration_number)")
      .eq("organization_id", currentOrg.id)
      .order("name");

    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setCameras((data ?? []) as unknown as Camera[]);
  }, [currentOrg]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Live Video"
        description="Live streams from cameras registered under Video Telematics"
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-xl" />
          ))}
        </div>
      ) : cameras.length === 0 ? (
        <EmptyState
          icon={CameraIcon}
          title="No cameras to display"
          description="Register cameras with a live stream URL from the Cameras page to view them here."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cameras.map((c) => (
            <Card key={c.id} className="border-border bg-card/40">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="min-w-0">
                  <CardTitle className="truncate text-sm font-semibold">{c.name}</CardTitle>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.vehicle?.name ?? "Unassigned"} · {c.direction}
                  </p>
                </div>
                <Badge variant="outline" className={cn("shrink-0 font-medium", STATUS_STYLES[c.status])}>
                  {c.status}
                </Badge>
              </CardHeader>
              <CardContent>
                <CameraStreamPlayer camera={c} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
