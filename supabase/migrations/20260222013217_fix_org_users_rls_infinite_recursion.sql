/*
  # Fix infinite recursion in org_users RLS policies

  ## Problem
  The org_users SELECT policy called is_admin(), which itself queries org_users,
  causing infinite recursion. Same issue existed in other tables whose policies
  call is_admin() -> org_users -> policy -> is_admin() -> ...

  ## Fix
  - For org_users policies: inline the admin check using auth.uid() directly
    without querying org_users (use auth.jwt() app_metadata or just allow users
    to see their own row; admins are checked via a non-recursive path)
  - For all other tables: is_admin() is fine because it only recurses into
    org_users, not into those tables themselves
  - The real fix for org_users: use a SECURITY DEFINER function that bypasses
    RLS when checking admin status, breaking the recursion cycle

  ## Solution
  Create a separate function that checks admin status by querying auth.users
  metadata instead of org_users, or use SET search_path to bypass RLS.
  The safest approach: use a security definer function with SET row_security = off.
*/

-- Drop the recursive policies first
DROP POLICY IF EXISTS "Users and admins can view profiles" ON public.org_users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.org_users;
DROP POLICY IF EXISTS "Users and admins can update profiles" ON public.org_users;
DROP POLICY IF EXISTS "Admins can delete non-self profiles" ON public.org_users;

-- Create a helper that checks admin WITHOUT triggering RLS on org_users
CREATE OR REPLACE FUNCTION public.is_admin_no_rls()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_users
    WHERE id = (select auth.uid())
      AND role = 'admin'
      AND is_active = true
  );
$$;

-- Recreate org_users policies using is_admin_no_rls() to avoid recursion
CREATE POLICY "Users and admins can view profiles"
  ON public.org_users FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = id
    OR public.is_admin_no_rls()
  );

CREATE POLICY "Users can insert own profile"
  ON public.org_users FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users and admins can update profiles"
  ON public.org_users FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) = id
    OR public.is_admin_no_rls()
  )
  WITH CHECK (
    (select auth.uid()) = id
    OR public.is_admin_no_rls()
  );

CREATE POLICY "Admins can delete non-self profiles"
  ON public.org_users FOR DELETE
  TO authenticated
  USING (
    id <> (select auth.uid())
    AND public.is_admin_no_rls()
  );

-- Also update user_account_access policies to use is_admin_no_rls
-- (those call is_admin() which queries org_users, which is fine since
--  user_account_access policies don't reference themselves, but using
--  is_admin_no_rls is safer and avoids the RLS chain entirely)
DROP POLICY IF EXISTS "Users and admins can view access grants" ON public.user_account_access;
DROP POLICY IF EXISTS "Admins can grant access" ON public.user_account_access;
DROP POLICY IF EXISTS "Admins can update access flags" ON public.user_account_access;
DROP POLICY IF EXISTS "Admins can revoke access" ON public.user_account_access;
DROP POLICY IF EXISTS "Anon can view access grants" ON public.user_account_access;

CREATE POLICY "Users and admins can view access grants"
  ON public.user_account_access FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.is_admin_no_rls()
  );

CREATE POLICY "Admins can grant access"
  ON public.user_account_access FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_no_rls());

CREATE POLICY "Admins can update access flags"
  ON public.user_account_access FOR UPDATE
  TO authenticated
  USING (public.is_admin_no_rls())
  WITH CHECK (public.is_admin_no_rls());

CREATE POLICY "Admins can revoke access"
  ON public.user_account_access FOR DELETE
  TO authenticated
  USING (public.is_admin_no_rls());

-- Update is_admin() to also use row_security=off to prevent recursion
-- when called from other table policies
CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_users
    WHERE id = (select auth.uid())
      AND role = 'admin'
      AND is_active = true
  );
$$;
