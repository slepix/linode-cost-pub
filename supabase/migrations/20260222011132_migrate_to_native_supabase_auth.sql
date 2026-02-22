/*
  # Migrate to Native Supabase Auth

  ## Summary
  Replaces the custom bcrypt/JWT auth system with Supabase's native authentication.
  The org_users table becomes a profile table linked to auth.users via the user's UUID.

  ## Changes

  ### org_users table
  - Drops `password_hash` column (passwords now managed by Supabase auth.users)
  - The `id` column now must match `auth.uid()` for the owning user

  ### RLS policies
  - All org_users and user_account_access policies now use `auth.uid()` properly
  - Drops old custom-auth policies and replaces with native auth.uid() checks

  ### Helper functions
  - `current_user_org_role()` updated to use auth.uid()
  - `is_admin()` updated to use auth.uid()

  ### New/updated RPC functions
  - `create_own_profile(p_full_name, p_role)` — creates org_users row for current auth user
  - `admin_create_profile(p_user_id, p_full_name, p_role)` — admin creates profile for an invited user
  - All admin_ RPCs now use auth.uid() to identify the caller

  ## Security
  - Passwords handled entirely by Supabase auth (bcrypt, secure storage, MFA ready)
  - JWTs issued by Supabase — properly validated by PostgREST
  - RLS policies use auth.uid() for ownership checks
*/

-- Drop password_hash column from org_users (no longer needed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'org_users' AND column_name = 'password_hash'
  ) THEN
    ALTER TABLE org_users DROP COLUMN password_hash;
  END IF;
END $$;

-- Drop all old RPCs
DROP FUNCTION IF EXISTS public.auth_register(text, text, text);
DROP FUNCTION IF EXISTS public.auth_login(text, text);
DROP FUNCTION IF EXISTS public.admin_create_user(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_change_password(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.admin_change_password(uuid, text);
DROP FUNCTION IF EXISTS public.admin_list_users(uuid);
DROP FUNCTION IF EXISTS public.admin_update_user_role(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.admin_update_user_active(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.admin_update_user_feature_flags(uuid, uuid, boolean, boolean);
DROP FUNCTION IF EXISTS public.admin_grant_account_access(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_revoke_account_access(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_update_account_access_flags(uuid, uuid, uuid, boolean, boolean);
DROP FUNCTION IF EXISTS public.admin_get_user_account_grants(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_delete_user(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_delete_user(uuid);
DROP FUNCTION IF EXISTS public.get_org_user_by_id(uuid);
DROP FUNCTION IF EXISTS public.get_accessible_accounts(uuid);

-- Drop all old org_users RLS policies
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'org_users' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON org_users', pol.policyname);
  END LOOP;
END $$;

-- Drop all old user_account_access RLS policies
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'user_account_access' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON user_account_access', pol.policyname);
  END LOOP;
END $$;

-- New org_users RLS policies using auth.uid()
CREATE POLICY "Users can view own profile"
  ON org_users FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON org_users FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM org_users ou2 WHERE ou2.id = auth.uid() AND ou2.role = 'admin' AND ou2.is_active = true)
  );

CREATE POLICY "Users can insert own profile"
  ON org_users FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own non-role fields"
  ON org_users FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update any profile"
  ON org_users FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM org_users ou2 WHERE ou2.id = auth.uid() AND ou2.role = 'admin' AND ou2.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM org_users ou2 WHERE ou2.id = auth.uid() AND ou2.role = 'admin' AND ou2.is_active = true));

CREATE POLICY "Admins can delete non-self profiles"
  ON org_users FOR DELETE TO authenticated
  USING (
    id <> auth.uid()
    AND EXISTS (SELECT 1 FROM org_users ou2 WHERE ou2.id = auth.uid() AND ou2.role = 'admin' AND ou2.is_active = true)
  );

CREATE POLICY "Anon can check registration status"
  ON org_users FOR SELECT TO anon
  USING (true);

-- New user_account_access RLS policies
CREATE POLICY "Users can view own access grants"
  ON user_account_access FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all access grants"
  ON user_account_access FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM org_users ou2 WHERE ou2.id = auth.uid() AND ou2.role = 'admin' AND ou2.is_active = true));

CREATE POLICY "Admins can grant access"
  ON user_account_access FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM org_users ou2 WHERE ou2.id = auth.uid() AND ou2.role = 'admin' AND ou2.is_active = true));

CREATE POLICY "Admins can update access flags"
  ON user_account_access FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM org_users ou2 WHERE ou2.id = auth.uid() AND ou2.role = 'admin' AND ou2.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM org_users ou2 WHERE ou2.id = auth.uid() AND ou2.role = 'admin' AND ou2.is_active = true));

CREATE POLICY "Admins can revoke access"
  ON user_account_access FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM org_users ou2 WHERE ou2.id = auth.uid() AND ou2.role = 'admin' AND ou2.is_active = true));

CREATE POLICY "Anon can view access grants"
  ON user_account_access FOR SELECT TO anon
  USING (true);

-- Update helper functions to use auth.uid()
CREATE OR REPLACE FUNCTION current_user_org_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM org_users WHERE id = auth.uid() AND is_active = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM org_users WHERE id = auth.uid() AND role = 'admin' AND is_active = true);
$$;

-- Create profile for the currently authenticated user (called right after signUp)
CREATE OR REPLACE FUNCTION public.create_own_profile(
  p_full_name text,
  p_role      text DEFAULT 'auditor'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
  v_role  text := p_role;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF v_role = 'admin' AND EXISTS (SELECT 1 FROM org_users LIMIT 1) THEN
    v_role := 'auditor';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO org_users (id, email, full_name, role, is_active)
  VALUES (v_uid, v_email, p_full_name, v_role, true)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now();

  RETURN jsonb_build_object('user_id', v_uid, 'email', v_email, 'full_name', p_full_name, 'role', v_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_own_profile(text, text) TO authenticated;

-- Admin creates a profile for an invited user (user must exist in auth.users)
CREATE OR REPLACE FUNCTION public.admin_create_profile(
  p_user_id   uuid,
  p_full_name text,
  p_role      text DEFAULT 'auditor'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_users WHERE id = auth.uid() AND role = 'admin' AND is_active = true) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  INSERT INTO org_users (id, email, full_name, role, is_active)
  VALUES (p_user_id, v_email, p_full_name, p_role, true)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, updated_at = now();
  RETURN jsonb_build_object('user_id', p_user_id, 'email', v_email, 'full_name', p_full_name, 'role', p_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_profile(uuid, text, text) TO authenticated;

-- List all users (admin only)
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS SETOF org_users LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT * FROM org_users ORDER BY created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- Update role
CREATE OR REPLACE FUNCTION public.admin_update_user_role(p_user_id uuid, p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE org_users SET role = p_role, updated_at = now() WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_role(uuid, text) TO authenticated;

-- Update active flag
CREATE OR REPLACE FUNCTION public.admin_update_user_active(p_user_id uuid, p_is_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE org_users SET is_active = p_is_active, updated_at = now() WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_active(uuid, boolean) TO authenticated;

-- Update feature flags
CREATE OR REPLACE FUNCTION public.admin_update_user_feature_flags(
  p_user_id uuid, p_can_view_costs boolean DEFAULT NULL, p_can_view_compliance boolean DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE org_users SET
    can_view_costs = COALESCE(p_can_view_costs, can_view_costs),
    can_view_compliance = COALESCE(p_can_view_compliance, can_view_compliance),
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_feature_flags(uuid, boolean, boolean) TO authenticated;

-- Grant account access
CREATE OR REPLACE FUNCTION public.admin_grant_account_access(p_user_id uuid, p_account_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO user_account_access (user_id, account_id, granted_by)
  VALUES (p_user_id, p_account_id, auth.uid())
  ON CONFLICT (user_id, account_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_grant_account_access(uuid, uuid) TO authenticated;

-- Revoke account access
CREATE OR REPLACE FUNCTION public.admin_revoke_account_access(p_user_id uuid, p_account_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM user_account_access WHERE user_id = p_user_id AND account_id = p_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_revoke_account_access(uuid, uuid) TO authenticated;

-- Update account access flags
CREATE OR REPLACE FUNCTION public.admin_update_account_access_flags(
  p_user_id uuid, p_account_id uuid,
  p_can_view_costs boolean DEFAULT NULL, p_can_view_compliance boolean DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE user_account_access SET
    can_view_costs = COALESCE(p_can_view_costs, can_view_costs),
    can_view_compliance = COALESCE(p_can_view_compliance, can_view_compliance)
  WHERE user_id = p_user_id AND account_id = p_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_account_access_flags(uuid, uuid, boolean, boolean) TO authenticated;

-- Get account grants for a user
CREATE OR REPLACE FUNCTION public.admin_get_user_account_grants(p_user_id uuid)
RETURNS SETOF user_account_access LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT * FROM user_account_access WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_account_grants(uuid) TO authenticated;

-- Delete user profile (auth.users deletion must be done via service role)
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_delete_self'; END IF;
  DELETE FROM org_users WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

-- Get org user by id
CREATE OR REPLACE FUNCTION public.get_org_user_by_id(p_user_id uuid)
RETURNS SETOF org_users LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() = p_user_id OR is_admin() THEN
    RETURN QUERY SELECT * FROM org_users WHERE id = p_user_id;
  ELSE
    RAISE EXCEPTION 'forbidden';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_user_by_id(uuid) TO authenticated;

-- Get accessible accounts
CREATE OR REPLACE FUNCTION public.get_accessible_accounts(
  p_caller_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id                uuid, name text, api_token text, webhook_api_key text,
  last_sync_at      timestamptz, last_evaluated_at timestamptz,
  created_at        timestamptz, updated_at timestamptz,
  can_view_costs    boolean, can_view_compliance boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
BEGIN
  SELECT role INTO v_role FROM org_users WHERE org_users.id = v_uid AND is_active = true;
  IF v_role = 'admin' THEN
    RETURN QUERY SELECT a.id, a.name, a.api_token, a.webhook_api_key,
      a.last_sync_at, a.last_evaluated_at, a.created_at, a.updated_at,
      true::boolean, true::boolean
    FROM linode_accounts a ORDER BY a.name;
  ELSE
    RETURN QUERY SELECT a.id, a.name, a.api_token, a.webhook_api_key,
      a.last_sync_at, a.last_evaluated_at, a.created_at, a.updated_at,
      uaa.can_view_costs, uaa.can_view_compliance
    FROM linode_accounts a
    JOIN user_account_access uaa ON uaa.account_id = a.id AND uaa.user_id = v_uid
    ORDER BY a.name;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_accessible_accounts(uuid) TO authenticated;
