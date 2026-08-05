"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { Skeleton } from "./Skeleton";
import type { UserRole } from "~~/lib/types";

/** Gate a page by auth + optional role. Redirects to / or home when unauthorized. */
export function RequireAuth({ roles, children }: { roles?: UserRole | UserRole[]; children: React.ReactNode }) {
  const { user, loading, requireRole } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (roles && !requireRole(roles)) {
      router.replace("/login");
    }
  }, [loading, user, roles, requireRole, router]);

  if (loading || !user || (roles && !requireRole(roles))) {
    return <Skeleton rows={4} />;
  }

  return <>{children}</>;
}
