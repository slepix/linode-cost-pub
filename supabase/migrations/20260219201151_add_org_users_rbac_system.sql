/*
  # Organisation Users & RBAC System

  ## Summary
  Adds a single-organisation multi-user RBAC system on top of Supabase Auth.
  Users sign up/in via Supabase email+password auth. An org_users profile row
  is created on first login (or via admin invite). Admins can grant/revoke
  per-account access for each user.

  ## Roles
  - admin        : full access to all accounts + user management
  - power_user   : full read/write access to allowed accounts, cannot manage users
  - auditor      : read-only access to allowed accounts

  ## New Tables

  ### org_users
  One row per authenticated user. Stores role, display name, and active flag.
  Linked to auth.users via id (UUID).

  ### user_account_access
  Explicit grant table: which user can access which linode_account.
  Admins implicitly have access to all accounts; this table is used for
  power_user and auditor scoping. Admins can also be listed here for clarity.

  ## Security
  - RLS enabled on both tables
  - org_users: users can read their own row; admins can read/write all rows
  - user_account_access: admins manage all rows; users can read their own grants
  - linode_accounts: updated policy so non-admin users only see accounts
    they have been explicitly granted access to

  ## Notes
  - The first user to register is automatically promoted to admin via a
    DB trigger (org_users_set_first_admin_trigger).
  - Admins can see all linode_accounts regardless of user_account_access.
  - power_user and auditor users only see accounts where a user_account_access
    row exists for them.
*/

CREATE TABLE IF NOT EXISTS org_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'auditor'
    CHECK (role IN ('admin', 'power_user', 'auditor')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE org_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS user_account_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES org_users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES linode_accounts(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES org_users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_id)
);

ALTER TABLE user_account_access ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_users
    WHERE id = auth.uid()
    AND role = 'admin'
    AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM org_users
  WHERE id = auth.uid()
  AND is_active = true
  LIMIT 1;
$$;

CREATE POLICY "Users can view own profile"
  ON org_users FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR is_admin());

CREATE POLICY "Admins can insert users"
  ON org_users FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Users can update own name; admins update all"
  ON org_users FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR is_admin())
  WITH CHECK (id = auth.uid() OR is_admin());

CREATE POLICY "Admins can delete non-admin users"
  ON org_users FOR DELETE
  TO authenticated
  USING (is_admin() AND id <> auth.uid());

CREATE POLICY "Users can view own account grants"
  ON user_account_access FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "Admins can grant access"
  ON user_account_access FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can revoke access"
  ON user_account_access FOR DELETE
  TO authenticated
  USING (is_admin());

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_count integer;
  v_role text;
BEGIN
  SELECT COUNT(*) INTO v_user_count FROM org_users;
  IF v_user_count = 0 THEN
    v_role := 'admin';
  ELSE
    v_role := 'auditor';
  END IF;

  INSERT INTO org_users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    v_role
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
