import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { callRpcAnon, supabase } from './supabase';

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

interface AuthSession {
  token: string;
  user_id: string;
  email: string;
  role: UserRole;
  full_name: string;
}

interface AuthContextValue {
  session: AuthSession | null;
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

const SESSION_KEY = 'lccm_auth';

const AuthContext = createContext<AuthContextValue | null>(null);

function saveSession(data: AuthSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.token || !parsed?.user_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

async function fetchOrgUser(userId: string): Promise<OrgUser | null> {
  try {
    const { data, error } = await supabase.rpc('get_org_user_by_id', { p_user_id: userId });
    if (error || !data) return null;
    const rows = Array.isArray(data) ? data : [data];
    return (rows[0] as OrgUser) ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [orgUser, setOrgUser] = useState<OrgUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOrgUser = useCallback(async (s: AuthSession) => {
    const u = await fetchOrgUser(s.user_id);
    setOrgUser(u);
  }, []);

  useEffect(() => {
    const s = loadSession();
    if (s) {
      setSession(s);
      loadOrgUser(s).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [loadOrgUser]);

  const refreshOrgUser = useCallback(async () => {
    if (session) await loadOrgUser(session);
  }, [session, loadOrgUser]);

  async function signIn(email: string, password: string): Promise<{ error: string | null }> {
    const { data, error } = await callRpcAnon('auth_login', {
      p_email: email.trim(),
      p_password: password,
    });

    if (error) {
      if (error.message.includes('invalid_credentials')) return { error: 'Invalid email or password.' };
      return { error: error.message };
    }

    const result = data as { token: string; user_id: string; role: string; full_name: string; email: string };
    const newSession: AuthSession = {
      token: result.token,
      user_id: result.user_id,
      email: result.email,
      role: result.role as UserRole,
      full_name: result.full_name,
    };

    saveSession(newSession);
    setSession(newSession);
    await loadOrgUser(newSession);

    return { error: null };
  }

  async function signUp(email: string, password: string, fullName: string): Promise<{ error: string | null }> {
    if (password.length < 8) return { error: 'Password must be at least 8 characters.' };

    const { data, error } = await callRpcAnon('auth_register', {
      p_email: email.trim(),
      p_fullname: fullName.trim(),
      p_password: password,
    });

    if (error) {
      if (error.message.includes('registration_closed')) return { error: 'Registration is closed. Contact an administrator.' };
      if (error.message.includes('email_taken')) return { error: 'An account with that email already exists.' };
      if (error.message.includes('password_too_short')) return { error: 'Password must be at least 8 characters.' };
      return { error: error.message };
    }

    const result = data as { token: string; user_id: string; role: string; full_name: string; email: string };
    const newSession: AuthSession = {
      token: result.token,
      user_id: result.user_id,
      email: result.email,
      role: result.role as UserRole,
      full_name: result.full_name,
    };

    saveSession(newSession);
    setSession(newSession);
    await loadOrgUser(newSession);

    return { error: null };
  }

  async function signOut() {
    clearSession();
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
