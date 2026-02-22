/*
  # Add admin RPCs for org user management

  Since our custom JWT is not Supabase-issued, RLS policies using
  request.jwt.claims cannot work. Instead, expose SECURITY DEFINER RPCs
  that accept an explicit p_caller_id and verify the caller's admin role
  directly from the database.

  1. New functions
     - admin_list_users(p_caller_id): returns all org_users
     - admin_update_user_role(p_caller_id, p_user_id, p_role): update role
     - admin_update_user_active(p_caller_id, p_user_id, p_is_active): toggle active
     - admin_grant_account_access(p_caller_id, p_user_id, p_account_id): grant
     - admin_revoke_account_access(p_caller_id, p_user_id, p_account_id): revoke
     - admin_update_account_access_flags(p_caller_id, p_user_id, p_account_id, p_can_view_costs, p_can_view_compliance)
     - admin_get_user_account_grants(p_caller_id, p_user_id): list grants for a user
     - admin_update_user_feature_flags(p_caller_id, p_user_id, p_can_view_costs, p_can_view_compliance)
*/

CREATE OR REPLACE FUNCTION admin_list_users(p_caller_id uuid)
RETURNS SETOF org_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM org_users WHERE id = p_caller_id AND is_active = true;
  IF v_role IS NULL OR v_role <> 'admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT * FROM org_users ORDER BY created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION admin_update_user_role(p_caller_id uuid, p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM org_users WHERE id = p_caller_id AND is_active = true;
  IF v_role IS NULL OR v_role <> 'admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_user_id = p_caller_id THEN
    RAISE EXCEPTION 'cannot_change_own_role';
  END IF;
  UPDATE org_users SET role = p_role, updated_at = now() WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_update_user_active(p_caller_id uuid, p_user_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM org_users WHERE id = p_caller_id AND is_active = true;
  IF v_role IS NULL OR v_role <> 'admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE org_users SET is_active = p_is_active, updated_at = now() WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_get_user_account_grants(p_caller_id uuid, p_user_id uuid)
RETURNS SETOF user_account_access
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM org_users WHERE id = p_caller_id AND is_active = true;
  IF v_role IS NULL OR v_role <> 'admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT * FROM user_account_access WHERE user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_grant_account_access(p_caller_id uuid, p_user_id uuid, p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM org_users WHERE id = p_caller_id AND is_active = true;
  IF v_role IS NULL OR v_role <> 'admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO user_account_access (user_id, account_id, granted_by)
  VALUES (p_user_id, p_account_id, p_caller_id)
  ON CONFLICT (user_id, account_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION admin_revoke_account_access(p_caller_id uuid, p_user_id uuid, p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM org_users WHERE id = p_caller_id AND is_active = true;
  IF v_role IS NULL OR v_role <> 'admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM user_account_access WHERE user_id = p_user_id AND account_id = p_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_update_account_access_flags(
  p_caller_id uuid,
  p_user_id uuid,
  p_account_id uuid,
  p_can_view_costs boolean DEFAULT NULL,
  p_can_view_compliance boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM org_users WHERE id = p_caller_id AND is_active = true;
  IF v_role IS NULL OR v_role <> 'admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE user_account_access
  SET
    can_view_costs = COALESCE(p_can_view_costs, can_view_costs),
    can_view_compliance = COALESCE(p_can_view_compliance, can_view_compliance)
  WHERE user_id = p_user_id AND account_id = p_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_update_user_feature_flags(
  p_caller_id uuid,
  p_user_id uuid,
  p_can_view_costs boolean DEFAULT NULL,
  p_can_view_compliance boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM org_users WHERE id = p_caller_id AND is_active = true;
  IF v_role IS NULL OR v_role <> 'admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE org_users
  SET
    can_view_costs = COALESCE(p_can_view_costs, can_view_costs),
    can_view_compliance = COALESCE(p_can_view_compliance, can_view_compliance),
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;
