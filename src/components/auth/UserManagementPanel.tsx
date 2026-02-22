import { useState, useEffect, useCallback } from 'react';
import {
  Users, Shield, Eye, Zap, ChevronDown, ChevronUp,
  Check, X, ToggleLeft, ToggleRight, AlertCircle, RefreshCw, UserPlus, Lock, Mail, User, Trash2, KeyRound,
  DollarSign, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import type { UserRole, OrgUser } from '../../lib/auth';
import {
  getOrgUsers, updateOrgUserRole, updateOrgUserActive,
  getUserAccountGrants, grantAccountAccess, revokeAccountAccess, inviteUser,
  deleteUser, changeUserPassword, updateAccountAccessFlags,
} from '../../lib/userApi';
import type { UserAccountGrant } from '../../lib/userApi';
import { getAccounts } from '../../lib/api';
import type { LinodeAccount } from '../../types';

const ROLE_META: Record<UserRole, { label: string; description: string; color: string; bg: string; icon: typeof Shield }> = {
  admin: {
    label: 'Admin',
    description: 'Full access to all accounts and user management',
    color: 'text-red-700 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    icon: Shield,
  },
  power_user: {
    label: 'Power User',
    description: 'Read/write access to assigned accounts',
    color: 'text-blue-700 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    icon: Zap,
  },
  auditor: {
    label: 'Auditor',
    description: 'Read-only access to assigned accounts',
    color: 'text-gray-600 dark:text-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700',
    icon: Eye,
  },
};

interface UserRowProps {
  user: OrgUser;
  allAccounts: LinodeAccount[];
  currentUserId: string;
  onRefresh: () => void;
  onDelete: (userId: string) => void;
}

function UserRow({ user, allAccounts, currentUserId, onRefresh, onDelete }: UserRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [grants, setGrants] = useState<UserAccountGrant[]>([]);
  const [loadingGrants, setLoadingGrants] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelf = user.id === currentUserId;
  const meta = ROLE_META[user.role];
  const RoleIcon = meta.icon;

  const loadGrants = useCallback(async () => {
    setLoadingGrants(true);
    try {
      const g = await getUserAccountGrants(user.id);
      setGrants(g);
    } catch {
      setError('Failed to load account access');
    } finally {
      setLoadingGrants(false);
    }
  }, [user.id]);

  useEffect(() => {
    if (expanded) loadGrants();
  }, [expanded, loadGrants]);

  async function handleRoleChange(role: UserRole) {
    if (isSelf) return;
    setSavingRole(true);
    setError(null);
    try {
      await updateOrgUserRole(user.id, role);
      onRefresh();
    } catch {
      setError('Failed to update role');
    } finally {
      setSavingRole(false);
    }
  }

  async function handleToggleActive() {
    if (isSelf) return;
    setTogglingActive(true);
    setError(null);
    try {
      await updateOrgUserActive(user.id, !user.is_active);
      onRefresh();
    } catch {
      setError('Failed to update user status');
    } finally {
      setTogglingActive(false);
    }
  }

  async function handleDeleteUser() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeletingUser(true);
    setError(null);
    try {
      await deleteUser(user.id);
      onDelete(user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
      setConfirmDelete(false);
    } finally {
      setDeletingUser(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setChangingPassword(true);
    setError(null);
    setPasswordSuccess(false);
    try {
      await changeUserPassword(user.id, newPassword);
      setPasswordSuccess(true);
      setNewPassword('');
      setShowPasswordForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleToggleFlag(accountId: string, flag: 'can_view_costs' | 'can_view_compliance') {
    if (isSelf) return;
    const grant = grants.find(g => g.account_id === accountId);
    if (!grant) return;
    const next = grants.map(g =>
      g.account_id === accountId ? { ...g, [flag]: !g[flag] } : g
    );
    setGrants(next);
    try {
      await updateAccountAccessFlags(user.id, accountId, { [flag]: !grant[flag] });
    } catch {
      setError('Failed to update permissions');
      loadGrants();
    }
  }

  async function handleToggleAccount(accountId: string) {
    setError(null);
    const grant = grants.find(g => g.account_id === accountId);
    if (grant) {
      setGrants(prev => prev.filter(g => g.account_id !== accountId));
      try {
        await revokeAccountAccess(user.id, accountId);
      } catch {
        setError('Failed to revoke access');
        loadGrants();
      }
    } else {
      const optimistic: UserAccountGrant = {
        id: '',
        user_id: user.id,
        account_id: accountId,
        granted_by: null,
        granted_at: new Date().toISOString(),
        can_view_costs: true,
        can_view_compliance: true,
      };
      setGrants(prev => [...prev, optimistic]);
      try {
        await grantAccountAccess(user.id, accountId);
        loadGrants();
      } catch {
        setError('Failed to grant access');
        loadGrants();
      }
    }
  }

  return (
    <div className={`rounded-xl border transition-all ${user.is_active ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900' : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 opacity-60'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
            {(user.full_name || user.email).charAt(0).toUpperCase()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {user.full_name || '—'}
            </p>
            {isSelf && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                You
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
        </div>

        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${meta.bg} ${meta.color}`}>
          <RoleIcon size={11} />
          {meta.label}
        </div>

        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle size={13} />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Role</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(ROLE_META) as [UserRole, typeof ROLE_META[UserRole]][]).map(([role, rm]) => {
                const Icon = rm.icon;
                const active = user.role === role;
                return (
                  <button
                    key={role}
                    type="button"
                    disabled={isSelf || savingRole}
                    onClick={() => handleRoleChange(role)}
                    className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-lg border text-left transition-all ${
                      active
                        ? `${rm.bg} ${rm.color}`
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon size={11} />
                      <span className="text-xs font-semibold">{rm.label}</span>
                      {active && <Check size={10} />}
                    </div>
                    <span className="text-[10px] leading-tight opacity-70">{rm.description}</span>
                  </button>
                );
              })}
            </div>
            {isSelf && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500">You cannot change your own role.</p>
            )}
          </div>

          {user.role !== 'admin' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Account Access</p>
                {loadingGrants && <RefreshCw size={11} className="animate-spin text-gray-400" />}
              </div>
              {allAccounts.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">No Linode accounts configured yet.</p>
              ) : (
                <div className="space-y-2">
                  {allAccounts.map(account => {
                    const grant = grants.find(g => g.account_id === account.id);
                    const granted = !!grant;
                    return (
                      <div key={account.id} className={`rounded-lg border transition-all ${granted ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50' : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30'}`}>
                        <div className="flex items-center gap-2.5 px-3 py-2">
                          <button
                            type="button"
                            onClick={() => handleToggleAccount(account.id)}
                            className={`flex-shrink-0 transition-colors ${granted ? 'text-blue-600 dark:text-blue-400' : 'text-gray-300 dark:text-gray-600'}`}
                          >
                            {granted ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                          </button>
                          <span className={`text-xs font-medium flex-1 ${granted ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
                            {account.name}
                          </span>
                        </div>
                        {granted && (
                          <div className="flex items-center gap-3 px-3 pb-2.5 pl-10">
                            {([
                              { flag: 'can_view_costs' as const, label: 'Costs', Icon: DollarSign },
                              { flag: 'can_view_compliance' as const, label: 'Compliance', Icon: ShieldCheck },
                            ]).map(({ flag, label, Icon }) => {
                              const enabled = grant[flag] ?? true;
                              return (
                                <button
                                  key={flag}
                                  type="button"
                                  disabled={isSelf}
                                  onClick={() => handleToggleFlag(account.id, flag)}
                                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                    enabled
                                      ? 'border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                                  }`}
                                  title={enabled ? `Revoke ${label} access` : `Grant ${label} access`}
                                >
                                  <Icon size={10} />
                                  {label}
                                  {enabled ? <Check size={9} className="text-blue-500 dark:text-blue-400" /> : <X size={9} className="text-gray-400" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {user.role === 'admin' && (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">
              Admins have access to all accounts automatically.
            </p>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Account Status</p>
            <button
              type="button"
              disabled={isSelf || togglingActive}
              onClick={handleToggleActive}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                user.is_active
                  ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-red-300 dark:hover:border-red-700 hover:text-red-600 dark:hover:text-red-400'
                  : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30'
              }`}
            >
              {user.is_active ? <><X size={11} /> Deactivate</> : <><Check size={11} /> Activate</>}
            </button>
          </div>

          {!isSelf && (
            <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Admin Actions</p>

              {showPasswordForm ? (
                <form onSubmit={handleChangePassword} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Lock size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="New password (min 8 chars)"
                      required
                      minLength={8}
                      className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={changingPassword}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg transition-colors"
                  >
                    {changingPassword ? <RefreshCw size={10} className="animate-spin" /> : <Check size={10} />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowPasswordForm(false); setNewPassword(''); }}
                    className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  {passwordSuccess && (
                    <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <Check size={11} /> Password changed
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => { setShowPasswordForm(true); setPasswordSuccess(false); }}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                  >
                    <KeyRound size={11} /> Change Password
                  </button>
                  {confirmDelete ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-red-600 dark:text-red-400 font-medium">Confirm delete?</span>
                      <button
                        type="button"
                        disabled={deletingUser}
                        onClick={handleDeleteUser}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-lg transition-colors"
                      >
                        {deletingUser ? <RefreshCw size={10} className="animate-spin" /> : <Trash2 size={10} />}
                        Yes, Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleDeleteUser}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-red-300 dark:hover:border-red-700 hover:text-red-600 dark:hover:text-red-400 transition-all"
                    >
                      <Trash2 size={11} /> Delete User
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AddUserFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

function AddUserForm({ onSuccess, onCancel }: AddUserFormProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'power_user' | 'auditor'>('auditor');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await inviteUser(email.trim(), password, fullName.trim(), role);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 p-4 space-y-3">
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <UserPlus size={14} className="text-blue-600 dark:text-blue-400" />
        Add New User
      </p>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Full Name</label>
          <div className="relative">
            <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Jane Smith"
              required
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
          <div className="relative">
            <Mail size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="jane@example.com"
              required
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Temporary Password
        </label>
        <div className="relative">
          <Lock size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            minLength={8}
            className="w-full pl-8 pr-9 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {showPassword
              ? <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              : <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            }
          </button>
        </div>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
          Share this password with the user. They can change it after signing in.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Role</label>
        <div className="grid grid-cols-2 gap-2">
          {(['power_user', 'auditor'] as const).map(r => {
            const rm = ROLE_META[r];
            const Icon = rm.icon;
            const active = role === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-lg border text-left transition-all ${
                  active
                    ? `${rm.bg} ${rm.color}`
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon size={11} />
                  <span className="text-xs font-semibold">{rm.label}</span>
                  {active && <Check size={10} />}
                </div>
                <span className="text-[10px] leading-tight opacity-70">{rm.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {loading ? <RefreshCw size={11} className="animate-spin" /> : <UserPlus size={11} />}
          {loading ? 'Creating…' : 'Create User'}
        </button>
      </div>
    </form>
  );
}

interface UserManagementPanelProps {
  onClose: () => void;
}

export function UserManagementPanel({ onClose }: UserManagementPanelProps) {
  const { orgUser } = useAuth();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [accounts, setAccounts] = useState<LinodeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, a] = await Promise.all([getOrgUsers(), getAccounts()]);
      setUsers(u);
      setAccounts(a);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!orgUser) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Users size={18} className="text-gray-600 dark:text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-gray-50">User Management</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">
              {users.length} {users.length === 1 ? 'user' : 'users'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                showAddForm
                  ? 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                  : 'bg-blue-600 hover:bg-blue-700 border-blue-600 text-white'
              }`}
            >
              <UserPlus size={12} />
              Add User
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2.5">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {showAddForm && (
            <AddUserForm
              onSuccess={() => { setShowAddForm(false); load(); }}
              onCancel={() => setShowAddForm(false)}
            />
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={20} className="animate-spin text-gray-400" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">No users found.</p>
          ) : (
            users.map(u => (
              <UserRow
                key={u.id}
                user={u}
                allAccounts={accounts}
                currentUserId={orgUser.id}
                onRefresh={load}
                onDelete={(id) => setUsers(prev => prev.filter(x => x.id !== id))}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
