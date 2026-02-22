/*
  # Add get_accessible_accounts RPC

  Since the app uses custom JWTs (not Supabase Auth), auth.uid() is always NULL,
  causing all RLS-protected table queries to return empty results for non-admin users.
  
  This SECURITY DEFINER RPC accepts an explicit caller ID and returns the accounts
  accessible to that user, along with their per-account feature flags.

  1. New functions
     - get_accessible_accounts(p_caller_id): returns accounts with can_view_costs and
       can_view_compliance flags based on the caller's role and account grants
*/

CREATE OR REPLACE FUNCTION get_accessible_accounts(p_caller_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  created_at timestamptz,
  updated_at timestamptz,
  last_sync_at timestamptz,
  can_view_costs boolean,
  can_view_compliance boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_active boolean;
BEGIN
  SELECT role, is_active INTO v_role, v_is_active
  FROM org_users WHERE id = p_caller_id;

  IF v_role IS NULL OR NOT v_is_active THEN
    RETURN;
  END IF;

  IF v_role = 'admin' THEN
    RETURN QUERY
      SELECT
        la.id,
        la.name,
        la.created_at,
        la.updated_at,
        la.last_sync_at,
        true::boolean AS can_view_costs,
        true::boolean AS can_view_compliance
      FROM linode_accounts la
      ORDER BY la.name;
  ELSE
    RETURN QUERY
      SELECT
        la.id,
        la.name,
        la.created_at,
        la.updated_at,
        la.last_sync_at,
        uaa.can_view_costs,
        uaa.can_view_compliance
      FROM linode_accounts la
      JOIN user_account_access uaa ON uaa.account_id = la.id AND uaa.user_id = p_caller_id
      ORDER BY la.name;
  END IF;
END;
$$;
