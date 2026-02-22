import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'power_user' | 'auditor';

export interface OrgUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  can_view_costs: boolean;
  can_view_compliance: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthContextValue {
  session: Session | null;
  orgUser: OrgUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshOrgUser: () => Promise<void>;
  isAdmin: boolean;
  isPowerUser: boolean;
  isReadOnly: boolean;
  canViewCosts: boolean;
  canViewCompliance: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchOrgUser(userId: string): Promise<OrgUser | null> {
  try {
    const { data, error } = await supabase
      .rpc('get_org_user_by_id', { p_user_id: userId });
    if (error || !data) return null;
    const rows = Array.isArray(data) ? data : [data];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [orgUser, setOrgUser] = useState<OrgUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOrgUser = useCallback(async (s: Session) => {
    const u = await fetchOrgUser(s.user.id);
    setOrgUser(u);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) {
        loadOrgUser(s).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s) {
        (async () => {
          await loadOrgUser(s);
        })();
      } else {
        setOrgUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadOrgUser]);

  const refreshOrgUser = useCallback(async () => {
    if (session) await loadOrgUser(session);
  }, [session, loadOrgUser]);

  async function signIn(email: string, password: string): Promise<{ error: string | null }> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.toLowerCase().includes('invalid')) return { error: 'Invalid email or password.' };
      if (error.message.toLowerCase().includes('email not confirmed')) return { error: 'Please confirm your email before signing in.' };
      return { error: error.message };
    }
    if (data.session) {
      await loadOrgUser(data.session);
    }
    return { error: null };
  }

  async function signUp(email: string, password: string, fullName: string): Promise<{ error: string | null }> {
    if (password.length < 8) return { error: 'Password must be at least 8 characters.' };

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      if (error.message.toLowerCase().includes('already registered')) return { error: 'An account with that email already exists.' };
      return { error: error.message };
    }

    if (!data.session) {
      return { error: 'Account created — please check your email to confirm before signing in.' };
    }

    const { error: profileError } = await supabase.rpc('create_own_profile', {
      p_full_name: fullName,
      p_role: 'admin',
    });

    if (profileError) {
      return { error: profileError.message };
    }

    await loadOrgUser(data.session);

    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setOrgUser(null);
  }

  const isAdmin = orgUser?.role === 'admin';
  const isPowerUser = orgUser?.role === 'power_user';
  const isReadOnly = orgUser?.role === 'auditor';
  const canViewCosts = isAdmin || (orgUser?.can_view_costs ?? true);
  const canViewCompliance = isAdmin || (orgUser?.can_view_compliance ?? true);

  return (
    <AuthContext.Provider value={{
      session, orgUser, loading,
      signIn, signUp, signOut, refreshOrgUser,
      isAdmin, isPowerUser, isReadOnly,
      canViewCosts, canViewCompliance,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
