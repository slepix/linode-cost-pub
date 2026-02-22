/*
  # Fix admin RPC functions to accept explicit caller_id

  The custom JWT is not signed with the Supabase JWT secret, so
  request.jwt.claims never contains our user's sub. Instead, pass
  p_caller_id explicitly and look up the caller's role in org_users.

  1. Modified functions
     - admin_create_user: now takes p_caller_id uuid parameter
     - admin_delete_user: now takes p_caller_id uuid parameter
     - admin_change_password: now takes p_caller_id uuid parameter
*/

CREATE OR REPLACE FUNCTION admin_create_user(
  p_caller_id uuid,
  p_email text,
  p_full_name text,
  p_password text,
  p_role text DEFAULT 'auditor'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role text;
  v_new_id uuid;
  v_hash text;
  v_resolved_role text;
BEGIN
  SELECT role INTO v_caller_role
  FROM org_users
  WHERE id = p_caller_id AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF length(p_password) < 8 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  IF EXISTS (SELECT 1 FROM org_users WHERE email = lower(p_email)) THEN
    RAISE EXCEPTION 'email_taken';
  END IF;

  v_resolved_role := CASE WHEN p_role IN ('power_user', 'auditor') THEN p_role ELSE 'auditor' END;
  v_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
  v_new_id := gen_random_uuid();

  INSERT INTO org_users (id, email, full_name, role, is_active, password_hash)
  VALUES (v_new_id, lower(p_email), p_full_name, v_resolved_role, true, v_hash);

  RETURN jsonb_build_object('user_id', v_new_id, 'email', lower(p_email), 'role', v_resolved_role);
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete_user(
  p_caller_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role
  FROM org_users
  WHERE id = p_caller_id AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_id = p_caller_id THEN
    RAISE EXCEPTION 'cannot_delete_self';
  END IF;

  DELETE FROM org_users WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_change_password(
  p_caller_id uuid,
  p_user_id uuid,
  p_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role text;
  v_hash text;
BEGIN
  SELECT role INTO v_caller_role
  FROM org_users
  WHERE id = p_caller_id AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF length(p_password) < 8 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  v_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));

  UPDATE org_users SET password_hash = v_hash, updated_at = now() WHERE id = p_user_id;
END;
$$;
