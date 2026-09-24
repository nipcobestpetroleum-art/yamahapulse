import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { LatestPosition } from "@/types/database";

function samePositions(
  a: Record<string, LatestPosition>,
  b: Record<string, LatestPosition>,
): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    const x = a[key];
    const y = b[key];
    if (!y) return false;
    if (x.recorded_at !== y.recorded_at || x.updated_at !== y.updated_at) return false;
    if (x.latitude !== y.latitude || x.longitude !== y.longitude) return false;
  }
  return true;
}

interface UseLivePositionsResult {
  positionsByDeviceId: Record<string, LatestPosition>;
  loading: boolean;
  error: string | null;
  realtimeStatus: "CONNECTING" | "CONNECTED" | "DEGRADED";
  refetch: () => Promise<void>;
}

export function useLivePositions(organizationId: string | null): UseLivePositionsResult {
  const [positionsByDeviceId, setPositionsByDeviceId] = useState<Record<string, LatestPosition>>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"CONNECTING" | "CONNECTED" | "DEGRADED">("CONNECTING");

  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const hasLoadedRef = useRef(false);

  const fetchLatest = useCallback(async () => {
    if (!organizationId) return;
    // Only show the loading state on the very first fetch; background polling
    // refreshes silently so pages do not flash/refresh every few seconds.
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("latest_positions")
      .select("*")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false });

    if (!hasLoadedRef.current) setLoading(false);

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    const map: Record<string, LatestPosition> = {};
    (data ?? []).forEach((p) => {
      map[p.device_id] = p as unknown as LatestPosition;
    });
    setPositionsByDeviceId((prev) => {
      // Skip the state update when nothing changed to avoid needless re-renders.
      if (hasLoadedRef.current && samePositions(prev, map)) return prev;
      hasLoadedRef.current = true;
      return map;
    });
  }, [organizationId]);

  useEffect(() => {
    fetchLatest();
    const refreshTimer = window.setInterval(() => {
      void fetchLatest();
    }, 5000);
    return () => window.clearInterval(refreshTimer);
  }, [fetchLatest]);

  useEffect(() => {
    if (!organizationId) return;
    setRealtimeStatus("CONNECTING");

    // Teardown old channel if org changes / re-mount
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    const channel = supabase
      .channel(`latest_positions_org_${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "latest_positions",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const next = payload.new as Partial<LatestPosition> | null;
          if (!next?.device_id || !next.recorded_at) return;
          setPositionsByDeviceId((prev) => {
            const current = prev[next.device_id];
            if (current && new Date(next.recorded_at!).getTime() <= new Date(current.recorded_at).getTime()) return prev;
            return { ...prev, [next.device_id]: next as LatestPosition };
          });
        },
      );

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setRealtimeStatus("CONNECTED");
        void fetchLatest();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setRealtimeStatus("DEGRADED");
      } else {
        setRealtimeStatus("CONNECTING");
      }
    });

    realtimeChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
    };
  }, [organizationId]);

  return useMemo(
    () => ({ positionsByDeviceId, loading, error, realtimeStatus, refetch: fetchLatest }),
    [positionsByDeviceId, loading, error, realtimeStatus, fetchLatest],
  );
}