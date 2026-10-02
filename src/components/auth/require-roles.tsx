import { Navigate, Outlet } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/contexts/auth-context";
import { FULL_ACCESS_ROLES, hasAnyRole } from "@/lib/roles";
import type { RoleName } from "@/types/database";

/**
 * Guards routes so asset-scoped VIEWER accounts cannot reach staff-only areas
 * (Administration, Finance, Assets, Video Telematics) even by typing the URL.
 * Used either as a wrapper around a page or as a pathless layout route.
 */
export function RequireRoles({
  roles = FULL_ACCESS_ROLES,
  children,
}: {
  roles?: RoleName[];
  children?: ReactNode;
}) {
  const { currentRole, loading } = useAuth();
  if (loading) return null;
  if (!hasAnyRole(currentRole, roles)) return <Navigate to="/dashboard" replace />;
  return <>{children ?? <Outlet />}</>;
}
