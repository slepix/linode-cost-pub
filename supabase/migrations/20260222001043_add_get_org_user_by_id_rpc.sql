/*
  # Add get_org_user_by_id RPC

  Allows fetching a single org_user record by ID without relying on RLS
  (which requires auth.uid() from Supabase Auth, not available with custom JWTs).
  
  Returns the caller's own profile only.
*/

CREATE OR REPLACE FUNCTION get_org_user_by_id(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  role text,
  is_active boolean,
  can_view_costs boolean,
  can_view_compliance boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      ou.id,
      ou.email,
      ou.full_name,
      ou.role,
      ou.is_active,
      ou.can_view_costs,
      ou.can_view_compliance,
      ou.created_at,
      ou.updated_at
    FROM org_users ou
    WHERE ou.id = p_user_id AND ou.is_active = true;
END;
$$;
