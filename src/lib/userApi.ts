import type { OrgUser, UserRole } from './auth';
import type { LinodeAccount } from '../types';
import { supabase } from './supabase';

async function rpc<T>(fnName: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fnName, body);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function isRegistrationOpen(): Promise<boolean> {
  try {
    const data = await rpc<boolean>('registration_open', {});
    return data === true;
  } catch {
    return false;
  }
}

export async function inviteUser(
  email: string,
  password: string,
  fullName: string,
  role: 'power_user' | 'auditor' = 'auditor'
): Promise<void> {
  try {
    await rpc('admin_create_user', {
      p_email: email.trim(),
      p_full_name: fullName.trim(),
      p_password: password,
      p_role: role,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create user';
    if (msg.includes('forbidden')) throw new Error('Only admins can create users');
    if (msg.includes('email_taken')) throw new Error('A user with this email already exists');
    if (msg.includes('password_too_short')) throw new Error('Password must be at least 8 characters');
    throw new Error(msg);
  }
}

export async function getOrgUsers(): Promise<OrgUser[]> {
  return rpc<OrgUser[]>('admin_list_users', {});
}

export async function updateOrgUserRole(userId: string, role: UserRole): Promise<void> {
  await rpc('admin_update_user_role', { p_user_id: userId, p_role: role });
}

export async function updateOrgUserActive(userId: string, isActive: boolean): Promise<void> {
  await rpc('admin_update_user_active', { p_user_id: userId, p_is_active: isActive });
}

export async function updateOrgUserFeatureFlags(
  userId: string,
  flags: { can_view_costs?: boolean; can_view_compliance?: boolean }
): Promise<void> {
  await rpc('admin_update_user_feature_flags', {
    p_user_id: userId,
    p_can_view_costs: flags.can_view_costs ?? null,
    p_can_view_compliance: flags.can_view_compliance ?? null,
  });
}

export interface UserAccountGrant {
  id: string;
  user_id: string;
  account_id: string;
  granted_by: string | null;
  granted_at: string;
  can_view_costs: boolean;
  can_view_compliance: boolean;
}

export async function getUserAccountGrants(userId: string): Promise<UserAccountGrant[]> {
  return rpc<UserAccountGrant[]>('admin_get_user_account_grants', { p_user_id: userId });
}

export async function updateAccountAccessFlags(
  userId: string,
  accountId: string,
  flags: { can_view_costs?: boolean; can_view_compliance?: boolean }
): Promise<void> {
  await rpc('admin_update_account_access_flags', {
    p_user_id: userId,
    p_account_id: accountId,
    p_can_view_costs: flags.can_view_costs ?? null,
    p_can_view_compliance: flags.can_view_compliance ?? null,
  });
}

export async function grantAccountAccess(userId: string, accountId: string): Promise<void> {
  await rpc('admin_grant_account_access', { p_user_id: userId, p_account_id: accountId });
}

export async function deleteUser(userId: string): Promise<void> {
  try {
    await rpc('admin_delete_user', { p_user_id: userId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete user';
    if (msg.includes('cannot_delete_self')) throw new Error('You cannot delete your own account');
    if (msg.includes('forbidden')) throw new Error('Only admins can delete users');
    throw new Error(msg);
  }
}

export async function changeUserPassword(userId: string, password: string): Promise<void> {
  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  try {
    await rpc('admin_change_password', { p_user_id: userId, p_password: password });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to change password';
    if (msg.includes('forbidden')) throw new Error('Only admins can change passwords');
    if (msg.includes('password_too_short')) throw new Error('Password must be at least 8 characters');
    throw new Error(msg);
  }
}

export async function revokeAccountAccess(userId: string, accountId: string): Promise<void> {
  await rpc('admin_revoke_account_access', { p_user_id: userId, p_account_id: accountId });
}

export interface AccessibleAccount extends LinodeAccount {
  can_view_costs: boolean;
  can_view_compliance: boolean;
}

export async function getAccessibleAccounts(_userId: string, _role: UserRole): Promise<AccessibleAccount[]> {
  return rpc<AccessibleAccount[]>('get_accessible_accounts', {});
}
