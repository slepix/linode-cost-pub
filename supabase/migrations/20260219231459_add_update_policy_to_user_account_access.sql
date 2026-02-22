/*
  # Add UPDATE policy for user_account_access

  ## Summary
  The user_account_access table was missing an UPDATE policy, which meant
  admins could not save per-account feature flag changes (can_view_costs,
  can_view_compliance). Updates were silently blocked by RLS with no error.

  ## Changes
  - Adds UPDATE policy on user_account_access restricted to admins
*/

CREATE POLICY "Admins can update account access flags"
  ON user_account_access
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
