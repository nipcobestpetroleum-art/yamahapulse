import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Organization, Profile, RoleName } from "@/types/database";

export interface Membership {
  organization: Organization;
  role: RoleName;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  memberships: Membership[];
  currentOrg: Organization | null;
  currentRole: RoleName | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  setCurrentOrg: (organizationId: string) => void;
  refreshMemberships: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const ORG_STORAGE_KEY = "yamahapulse.currentOrg";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(
    () => localStorage.getItem(ORG_STORAGE_KEY),
  );
  const [loading, setLoading] = useState(true);

  const loadForUser = useCallback(async (user: User) => {
    const [profileRes, membershipRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("user_roles")
        .select("roles(name), organizations(*)")
        .eq("user_id", user.id),
    ]);

    if (profileRes.data) setProfile(profileRes.data as Profile);

    const rows = (membershipRes.data ?? []) as unknown as {
      roles: { name: RoleName } | null;
      organizations: Organization | null;
    }[];

    const list: Membership[] = rows
      .filter((r) => r.organizations && r.roles)
      .map((r) => ({ organization: r.organizations as Organization, role: r.roles!.name }));

    setMemberships(list);
    setCurrentOrgId((prev) => {
      if (prev && list.some((m) => m.organization.id === prev)) return prev;
      const next = list[0]?.organization.id ?? null;
      if (next) localStorage.setItem(ORG_STORAGE_KEY, next);
      else localStorage.removeItem(ORG_STORAGE_KEY);
      return next;
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) await loadForUser(data.session.user);
      if (mounted) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      // Defer async Supabase calls to avoid deadlocking the auth callback.
      setTimeout(async () => {
        if (newSession?.user) {
          await loadForUser(newSession.user);
        } else {
          setProfile(null);
          setMemberships([]);
          setCurrentOrgId(null);
          localStorage.removeItem(ORG_STORAGE_KEY);
        }
        if (mounted) setLoading(false);
      }, 0);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadForUser]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      // Wait until profile + organization memberships are loaded so the router
      // can send the user to their dashboard instead of onboarding.
      if (data.user) await loadForUser(data.user);
      return { error: null };
    },
    [loadForUser],
  );

  const signUp = useCallback(
    async (email: string, password: string, firstName: string, lastName: string) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { first_name: firstName, last_name: lastName } },
      });
      return { error: error?.message ?? null, needsConfirmation: !data.session };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const setCurrentOrg = useCallback((organizationId: string) => {
    setCurrentOrgId(organizationId);
    localStorage.setItem(ORG_STORAGE_KEY, organizationId);
  }, []);

  const refreshMemberships = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await loadForUser(user);
  }, [loadForUser]);

  const value = useMemo<AuthContextValue>(() => {
    const currentMembership =
      memberships.find((m) => m.organization.id === currentOrgId) ?? null;
    return {
      session,
      user: session?.user ?? null,
      profile,
      memberships,
      currentOrg: currentMembership?.organization ?? null,
      currentRole: currentMembership?.role ?? null,
      loading,
      signIn,
      signUp,
      signOut,
      setCurrentOrg,
      refreshMemberships,
    };
  }, [session, profile, memberships, currentOrgId, loading, signIn, signUp, signOut, setCurrentOrg, refreshMemberships]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}