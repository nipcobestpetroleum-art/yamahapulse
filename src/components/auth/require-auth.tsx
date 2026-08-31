import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Radar } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
        <Radar className="h-6 w-6 animate-pulse text-primary" />
      </div>
      <p className="text-sm text-muted-foreground">Loading YamahaPulse…</p>
    </div>
  );
}

interface RequireAuthProps {
  children: ReactNode;
  allowWithoutOrg?: boolean;
}

export function RequireAuth({ children, allowWithoutOrg = false }: RequireAuthProps) {
  const { session, memberships, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!allowWithoutOrg && memberships.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}