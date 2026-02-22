/*
  # Fix RLS auth initialization plan and multiple permissive policies

  ## Changes

  ### org_users table
  - Drop all existing authenticated policies
  - Recreate with (select auth.uid()) for performance
  - Merge "Admins can view all profiles" + "Users can view own profile" into one SELECT policy
  - Merge "Admins can update any profile" + "Users can update own non-role fields" into one UPDATE policy

  ### user_account_access table
  - Drop all existing authenticated policies
  - Recreate with (select auth.uid()) for performance
  - Merge "Admins can view all access grants" + "Users can view own access grants" into one SELECT policy

  ## Why
  - Using auth.uid() directly causes re-evaluation per row (slow at scale)
  - Using (select auth.uid()) caches the value once per query
  - Multiple permissive policies for the same role/action are evaluated with OR,
    which is functionally correct but flagged as a potential confusion risk
*/

-- ── org_users: drop and recreate policies ────────────────────────────────────

DROP POLICY IF EXISTS "Admins can delete non-self profiles" ON public.org_users;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.org_users;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.org_users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.org_users;
DROP POLICY IF EXISTS "Users can update own non-role fields" ON public.org_users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.org_users;

CREATE POLICY "Users and admins can view profiles"
  ON public.org_users FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = id
    OR EXISTS (
      SELECT 1 FROM public.org_users ou2
      WHERE ou2.id = (select auth.uid())
        AND ou2.role = 'admin'
        AND ou2.is_active = true
    )
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
    OR EXISTS (
      SELECT 1 FROM public.org_users ou2
      WHERE ou2.id = (select auth.uid())
        AND ou2.role = 'admin'
        AND ou2.is_active = true
    )
  )
  WITH CHECK (
    (select auth.uid()) = id
    OR EXISTS (
      SELECT 1 FROM public.org_users ou2
      WHERE ou2.id = (select auth.uid())
        AND ou2.role = 'admin'
        AND ou2.is_active = true
    )
  );

CREATE POLICY "Admins can delete non-self profiles"
  ON public.org_users FOR DELETE
  TO authenticated
  USING (
    id <> (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.org_users ou2
      WHERE ou2.id = (select auth.uid())
        AND ou2.role = 'admin'
        AND ou2.is_active = true
    )
  );

-- ── user_account_access: drop and recreate policies ───────────────────────────

DROP POLICY IF EXISTS "Admins can grant access" ON public.user_account_access;
DROP POLICY IF EXISTS "Admins can revoke access" ON public.user_account_access;
DROP POLICY IF EXISTS "Admins can update access flags" ON public.user_account_access;
DROP POLICY IF EXISTS "Admins can view all access grants" ON public.user_account_access;
DROP POLICY IF EXISTS "Users can view own access grants" ON public.user_account_access;

CREATE POLICY "Users and admins can view access grants"
  ON public.user_account_access FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.org_users ou
      WHERE ou.id = (select auth.uid())
        AND ou.role = 'admin'
        AND ou.is_active = true
    )
  );

CREATE POLICY "Admins can grant access"
  ON public.user_account_access FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_users ou
      WHERE ou.id = (select auth.uid())
        AND ou.role = 'admin'
        AND ou.is_active = true
    )
  );

CREATE POLICY "Admins can update access flags"
  ON public.user_account_access FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_users ou
      WHERE ou.id = (select auth.uid())
        AND ou.role = 'admin'
        AND ou.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_users ou
      WHERE ou.id = (select auth.uid())
        AND ou.role = 'admin'
        AND ou.is_active = true
    )
  );

CREATE POLICY "Admins can revoke access"
  ON public.user_account_access FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_users ou
      WHERE ou.id = (select auth.uid())
        AND ou.role = 'admin'
        AND ou.is_active = true
    )
  );
