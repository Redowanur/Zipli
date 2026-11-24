"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, tokenStore, type User } from "./api";

type AuthState = {
  user: User | null; linkLimit: number; retentionDays: number; loading: boolean;
  signIn: (email: string, password: string, register?: boolean) => Promise<void>;
  signOut: () => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [linkLimit, setLimit] = useState(0);
  const [retentionDays, setRetention] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokenStore.get()) { setLoading(false); return; }
    api.me()
      .then((r) => { setUser(r.user); setLimit(r.link_limit); setRetention(r.retention_days); })
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string, register = false) => {
    const r = await (register ? api.register : api.login)(email, password);
    tokenStore.set(r.token);
    const me = await api.me();
    setUser(me.user); setLimit(me.link_limit); setRetention(me.retention_days);
  }, []);

  const signOut = useCallback(() => { tokenStore.clear(); setUser(null); }, []);

  const value = useMemo(() => ({ user, linkLimit, retentionDays, loading, signIn, signOut }), [user, linkLimit, retentionDays, loading, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
