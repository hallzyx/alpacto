"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  demoLogin as apiDemoLogin,
  fetchMe,
  getStoredToken,
  producerSession as apiProducerSession,
  roleHomePath,
  setStoredToken,
} from "~~/lib/api";
import type { AuthUser, UserRole } from "~~/lib/types";

type ProducerSessionInput = {
  email: string;
  name: string;
  smartAccountAddress: string;
  authMethod: "google" | "email_otp" | "passkey";
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  demoLogin: (email: string) => Promise<AuthUser>;
  producerSession: (input: ProducerSessionInput) => Promise<AuthUser>;
  logout: () => void;
  refresh: () => Promise<void>;
  requireRole: (roles: UserRole | UserRole[]) => boolean;
  goHome: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((nextToken: string, nextUser: AuthUser) => {
    setStoredToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const refresh = useCallback(async () => {
    const stored = getStoredToken();
    if (!stored) {
      setToken(null);
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user: me } = await fetchMe(stored);
      setToken(stored);
      setUser(me);
    } catch {
      setStoredToken(null);
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const demoLogin = useCallback(
    async (email: string) => {
      const session = await apiDemoLogin(email);
      applySession(session.token, session.user);
      router.push(roleHomePath(session.user.role));
      return session.user;
    },
    [applySession, router],
  );

  const producerSession = useCallback(
    async (input: ProducerSessionInput) => {
      const session = await apiProducerSession(input);
      applySession(session.token, session.user);
      router.push(roleHomePath(session.user.role));
      return session.user;
    },
    [applySession, router],
  );

  const logout = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
    router.push("/");
  }, [router]);

  const requireRole = useCallback(
    (roles: UserRole | UserRole[]) => {
      if (!user) return false;
      const list = Array.isArray(roles) ? roles : [roles];
      return list.includes(user.role);
    },
    [user],
  );

  const goHome = useCallback(() => {
    if (!user) {
      router.push("/");
      return;
    }
    router.push(roleHomePath(user.role));
  }, [router, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      demoLogin,
      producerSession,
      logout,
      refresh,
      requireRole,
      goHome,
    }),
    [user, token, loading, demoLogin, producerSession, logout, refresh, requireRole, goHome],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
