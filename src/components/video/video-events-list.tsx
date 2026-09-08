import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { CheckCheck, Film, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { MANAGER_WRITE_ROLES, hasAnyRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import type { VideoEvent, VideoEventCategory } from "@/types/database";

const SEVERITY_STYLES: Record<string, string> = {
  info: "border-sky-500/25 bg-sky-500/10 text-sky-400",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  critical: "border-rose-500/25 bg-rose-500/10 text-rose-400",
};

interface Props {
  category: VideoEventCategory;
  emptyTitle: string;
  emptyDescription: string;
}

export function VideoEventsList({ category, emptyTitle, emptyDescription }: Props) {
  const { currentOrg, currentRole, user } = useAuth();
  const canWrite = hasAnyRole(currentRole, MANAGER_WRITE_ROLES);

  const [events, setEvents] = useState<VideoEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("video_events")
      .select("*, vehicle:vehicles(name), camera:cameras(name)")
      .eq("organization_id", currentOrg.id)
      .eq("category", category)
      .order("created_at", { ascending: false })
      .limit(150);

    setLoading(false);
    if (error) {
      showError(error.message);
      return;
    }
    setEvents((data ?? []) as unknown as VideoEvent[]);
  }, [currentOrg, category]);

  useEffect(() => {
    load();
  }, [load]);

  const markReviewed = async (event: VideoEvent) => {
    const { error } = await supabase
      .from("video_events")
      .update({ reviewed: true })
      .eq("id", event.id);
    if (error) {
      showError(error.message);
      return;
    }
    if (currentOrg) {
      await logAudit({
        organizationId: currentOrg.id,
        userId: user?.id ?? null,
        action: "UPDATE",
        entity: "video_event",
        entityId: event.id,
        oldData: { reviewed: false },
        newData: { reviewed: true },
      });
    }
    showSuccess("Marked as reviewed");
    load();
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return <EmptyState icon={Film} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-2">
      {events.map((e) => (
        <div
          key={e.id}
          className="flex items-start gap-3 rounded-xl border border-border bg-card/40 p-4"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <PlayCircle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{e.type.replace(/_/g, " ")}</p>
              <Badge
                variant="outline"
                className={cn("font-medium", SEVERITY_STYLES[e.severity] ?? SEVERITY_STYLES.info)}
              >
                {e.severity}
              </Badge>
              {e.reviewed && (
                <Badge
                  variant="outline"
                  className="border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                >
                  Reviewed
                </Badge>
              )}
            </div>
            {e.message && <p className="mt-0.5 text-sm text-muted-foreground">{e.message}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {e.vehicle?.name && <span>{e.vehicle.name}</span>}
              {e.camera?.name && <span>{e.camera.name}</span>}
              {e.clip_url && (
                <a href={e.clip_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  View clip
                </a>
              )}
              <span>{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
            </div>
          </div>
          {canWrite && !e.reviewed && (
            <Button variant="ghost" size="sm" onClick={() => markReviewed(e)}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark reviewed
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
